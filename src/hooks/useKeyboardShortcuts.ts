import { useEffect, useCallback, useRef } from 'react';
import { useAnnotationStore } from '../stores/annotation-store';
import { useVideoStore } from '../stores/video-store';
import { useProjectStore } from '../stores/project-store';
import { useSettingsStore } from '../stores/settings-store';
import { useUiStore } from '../stores/ui-store';
import { secToMs } from '../utils/time';
import { UNCONFIRMED_COLOR } from '../constants/annotation-types';
import { triggerManualSave } from './useAutoSave';
import type { ShortcutBinding } from '../types/shortcuts';
import type { MarkerType, AnnotationSpan } from '../types/annotation';

/** State for an active hold-mode annotation (key held down to mark duration) */
interface HoldState {
  key: string;
  startMarkerId: string;
  typeId: string;
  tierId: string;
  videoId: string;
  /** If extending an existing span, store its ID so finalizeHold moves the marker instead of creating new */
  existingSpanId?: string;
}

/** Check whether a keyboard event matches a shortcut binding */
function matchesShortcut(e: KeyboardEvent, binding: ShortcutBinding): boolean {
  const key = e.key.toLowerCase();
  const ctrl = e.ctrlKey || e.metaKey;
  return key === binding.key.toLowerCase()
    && ctrl === (binding.ctrl ?? false)
    && e.shiftKey === (binding.shift ?? false)
    && e.altKey === (binding.alt ?? false);
}

/** Find a shortcut binding by its action name */
function findShortcut(shortcuts: ShortcutBinding[], action: string): ShortcutBinding | undefined {
  return shortcuts.find((s) => s.action === action);
}

/** Check if a marker type ID represents an "end" type */
function isEndType(typeId: string, markerTypes: MarkerType[]): boolean {
  if (typeId.endsWith('-end')) return true;
  const mt = markerTypes.find((t) => t.id === typeId);
  return mt?.name.toLowerCase().includes('end') ?? false;
}

/** Find the paired "start" type ID for a given "end" type */
function findPairedStartType(endTypeId: string, markerTypes: MarkerType[]): string | null {
  // Try ID pattern: sign-end → sign-start
  if (endTypeId.endsWith('-end')) {
    const startId = endTypeId.replace(/-end$/, '-start');
    if (markerTypes.find((mt) => mt.id === startId)) return startId;
  }
  // Fallback: find any type with "start" in the name
  const startType = markerTypes.find((mt) => mt.name.toLowerCase().includes('start'));
  return startType?.id ?? null;
}

/**
 * When a quick tap confirms a marker as an "end" type, auto-pair it:
 *   - If there's an unmatched start marker before it → create a span
 *   - If there's a previous span → extend it to this position
 *   - If the tier is empty → create start marker at 0 + span
 */
function handleEndMarkerPairing(
  hold: HoldState,
  annStore: ReturnType<typeof useAnnotationStore.getState>,
  settings: ReturnType<typeof useSettingsStore.getState>,
  uiStore: ReturnType<typeof useUiStore.getState>
) {
  if (!isEndType(hold.typeId, settings.markerTypes)) return;

  const marker = annStore.markers.find((m) => m.id === hold.startMarkerId);
  if (!marker) return;

  // Collect existing span marker IDs for this tier+video
  const tierSpans = annStore.spans.filter(
    (sp) => sp.tierId === marker.tierId && sp.videoId === marker.videoId
  );
  const spannedStartIds = new Set(tierSpans.map((sp) => sp.startMarkerId));
  const spannedEndIds = new Set(tierSpans.map((sp) => sp.endMarkerId));

  // All confirmed markers on this tier, sorted by time
  const tierMarkers = annStore.markers
    .filter((m) => m.videoId === marker.videoId && m.tierId === marker.tierId && m.confirmed && m.id !== marker.id)
    .sort((a, b) => a.time - b.time);

  // 1) Look for an unmatched start marker before this end marker
  const unmatchedStart = tierMarkers
    .filter((m) => m.time <= marker.time && !spannedStartIds.has(m.id) && !isEndType(m.typeId, settings.markerTypes))
    .pop();

  if (unmatchedStart) {
    annStore.addSpan({
      startMarkerId: unmatchedStart.id,
      endMarkerId: marker.id,
      tierId: marker.tierId,
      videoId: marker.videoId,
      gloss: '',
    });
    const newSpans = useAnnotationStore.getState().spans;
    const newSpan = newSpans.find((sp) => sp.startMarkerId === unmatchedStart.id && sp.endMarkerId === marker.id);
    if (newSpan) annStore.selectSpan(newSpan.id);
    uiStore.addToast('Auto-paired with previous start marker', 'success');
    return;
  }

  // 2) No unmatched start — look for a previous span to extend
  const previousEnds = tierMarkers
    .filter((m) => m.time <= marker.time && spannedEndIds.has(m.id))
    .sort((a, b) => b.time - a.time);

  if (previousEnds.length > 0) {
    const prevEnd = previousEnds[0];
    // Move the previous end marker to this new position and remove the new marker
    annStore.updateMarkerTime(prevEnd.id, marker.time);
    annStore.removeMarker(marker.id);
    uiStore.addToast('Extended previous span', 'info');
    return;
  }

  // 3) No markers on this tier at all → create start at 0 + span
  if (tierMarkers.length === 0) {
    const pairedStartTypeId = findPairedStartType(hold.typeId, settings.markerTypes);
    const startId = annStore.placeMarker(0, marker.tierId, marker.videoId);
    if (pairedStartTypeId) {
      annStore.confirmMarker(startId, pairedStartTypeId);
    }
    annStore.addSpan({
      startMarkerId: startId,
      endMarkerId: marker.id,
      tierId: marker.tierId,
      videoId: marker.videoId,
      gloss: '',
    });
    const newSpans = useAnnotationStore.getState().spans;
    const newSpan = newSpans.find((sp) => sp.startMarkerId === startId && sp.endMarkerId === marker.id);
    if (newSpan) annStore.selectSpan(newSpan.id);
    uiStore.addToast('Created span from start', 'success');
  }
}

export function useKeyboardShortcuts() {
  // Hold-mode ref: tracks the currently held key for real-time span annotation
  const holdRef = useRef<HoldState | null>(null);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Don't capture when typing in inputs
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      return;
    }

    // Don't capture when a dialog is open
    if (useUiStore.getState().activeDialog) return;

    const { key, ctrlKey, shiftKey, altKey, metaKey } = e;
    const ctrl = ctrlKey || metaKey;
    const annStore = useAnnotationStore.getState();
    const vidStore = useVideoStore.getState();
    const projStore = useProjectStore.getState();
    const settings = useSettingsStore.getState();
    const uiStore = useUiStore.getState();
    const shortcuts = settings.shortcuts;

    const pendingId = annStore.pendingMarkerId;
    const hasPending = pendingId !== null;
    const selectedId = annStore.selectedMarkerId;
    const currentVideoId = projStore.currentVideoId;
    const duration = vidStore.duration;
    const durationMs = secToMs(duration);

    // ---- Ctrl combos (undo / redo / save) ----
    const undoBinding = findShortcut(shortcuts, 'undo');
    if (undoBinding && matchesShortcut(e, undoBinding)) {
      e.preventDefault();
      useAnnotationStore.temporal.getState().undo();
      return;
    }
    const redoBinding = findShortcut(shortcuts, 'redo');
    if (redoBinding && matchesShortcut(e, redoBinding)) {
      e.preventDefault();
      useAnnotationStore.temporal.getState().redo();
      return;
    }
    const saveBinding = findShortcut(shortcuts, 'save');
    if (saveBinding && matchesShortcut(e, saveBinding)) {
      e.preventDefault();
      triggerManualSave();
      uiStore.addToast('Saved', 'success');
      return;
    }

    // ---- Navigation: next / prev video ----
    const nextVideoBinding = findShortcut(shortcuts, 'next-video');
    if (nextVideoBinding && matchesShortcut(e, nextVideoBinding)) {
      e.preventDefault();
      if (hasPending) annStore.cancelPendingMarker();
      projStore.nextVideo();
      return;
    }
    const prevVideoBinding = findShortcut(shortcuts, 'prev-video');
    if (prevVideoBinding && matchesShortcut(e, prevVideoBinding)) {
      e.preventDefault();
      if (hasPending) annStore.cancelPendingMarker();
      projStore.prevVideo();
      return;
    }

    // ---- Tier cycling ----
    const cycleTierBinding = findShortcut(shortcuts, 'cycle-active-tier');
    if (cycleTierBinding && matchesShortcut(e, cycleTierBinding)) {
      e.preventDefault();
      settings.cycleActiveTier();
      const newSettings = useSettingsStore.getState();
      const newTier = newSettings.tiers.find((t) => t.id === newSettings.activeTierId);

      // If pending marker exists, move it to the new active tier
      if (pendingId && newTier && newTier.visible && !newTier.locked) {
        annStore.updateMarkerTier(pendingId, newTier.id);
      }

      if (newTier) {
        uiStore.addToast(`Active: ${newTier.name}`, 'info');
      }
      return;
    }

    // ---- Arrow keys with modifiers (nudge markers) ----
    if (hasPending || selectedId) {
      const markerId = hasPending ? pendingId : selectedId!;
      let nudgeDelta: number | null = null;
      if (shiftKey && key === 'ArrowRight') nudgeDelta = 10;
      else if (shiftKey && key === 'ArrowLeft') nudgeDelta = -10;
      else if (altKey && key === 'ArrowRight') nudgeDelta = 1;
      else if (altKey && key === 'ArrowLeft') nudgeDelta = -1;

      if (nudgeDelta !== null) {
        e.preventDefault();
        annStore.nudgeMarker(markerId, nudgeDelta, durationMs);
        // Sync video playhead to the marker's new position
        const updatedMarker = useAnnotationStore.getState().markers.find((m) => m.id === markerId);
        if (updatedMarker) vidStore.seek(updatedMarker.time / 1000);
        return;
      }
    }

    // ---- Plain arrow keys: nudge pending marker or seek ----
    if (key === 'ArrowRight' && !ctrl && !shiftKey && !altKey) {
      e.preventDefault();
      if (hasPending) {
        annStore.nudgeMarker(pendingId, 10, durationMs);
        const updatedMarker = useAnnotationStore.getState().markers.find((m) => m.id === pendingId);
        if (updatedMarker) vidStore.seek(updatedMarker.time / 1000);
      } else {
        vidStore.seekRelative(1);
      }
      return;
    }
    if (key === 'ArrowLeft' && !ctrl && !shiftKey && !altKey) {
      e.preventDefault();
      if (hasPending) {
        annStore.nudgeMarker(pendingId, -10, durationMs);
        const updatedMarker = useAnnotationStore.getState().markers.find((m) => m.id === pendingId);
        if (updatedMarker) vidStore.seek(updatedMarker.time / 1000);
      } else {
        vidStore.seekRelative(-1);
      }
      return;
    }

    // ---- If hold mode is active, ignore repeat events for the held key ----
    if (e.repeat && holdRef.current && key.toLowerCase() === holdRef.current.key) {
      e.preventDefault();
      return;
    }

    // ---- Hold mode: hold a type key to mark sign duration as a span ----
    // Works in two scenarios:
    //   A) Video playing, type key pressed → place confirmed start marker, keep playing
    //   B) Pending marker exists (e.g. from Space) → confirm as start, resume video
    // In both cases, releasing the key places the end marker + creates the span.
    if (!e.repeat && !ctrl && !shiftKey && !altKey && currentVideoId) {
      // Find the matching marker type on the active tier
      const activeTier = settings.tiers.find(
        (t) => t.id === settings.activeTierId && t.visible && !t.locked
      );

      if (activeTier) {
        const allowedTypeIds = new Set(activeTier.markerTypes ?? []);
        const markerType = settings.markerTypes.find(
          (mt) => mt.key === key.toLowerCase() && allowedTypeIds.has(mt.id)
        );

        if (markerType) {
          // Also check the pending marker's tier if one exists
          let pendingTierMatch = true;
          if (hasPending) {
            const pendingMarker = annStore.markers.find((m) => m.id === pendingId);
            const pendingTier = settings.tiers.find((t) => t.id === pendingMarker?.tierId);
            const pendingAllowed = new Set(pendingTier?.markerTypes ?? []);
            pendingTierMatch = pendingAllowed.has(markerType.id);
          }

          if (pendingTierMatch) {
            // Scenario C: selected span with unconfirmed markers (e.g. drawn area)
            // → confirm both markers, play from span start, hold to extend
            const selSpanId = annStore.selectedSpanId;
            const selSpan = selSpanId ? annStore.spans.find((sp) => sp.id === selSpanId) : null;
            if (selSpan) {
              const spanStart = annStore.markers.find((m) => m.id === selSpan.startMarkerId);
              const spanEnd = annStore.markers.find((m) => m.id === selSpan.endMarkerId);
              if (spanStart && spanEnd && (!spanStart.confirmed || !spanEnd.confirmed)) {
                e.preventDefault();
                // Confirm start marker with pressed type
                if (!spanStart.confirmed) {
                  annStore.confirmMarker(spanStart.id, markerType.id);
                }
                // Confirm end marker with paired end type (e.g. sign-start → sign-end)
                let endTypeId = markerType.id;
                if (markerType.id.endsWith('-start')) {
                  const pairedEnd = settings.markerTypes.find(
                    (mt) => mt.id === markerType.id.replace(/-start$/, '-end')
                  );
                  if (pairedEnd) endTypeId = pairedEnd.id;
                }
                if (!spanEnd.confirmed) {
                  annStore.confirmMarker(spanEnd.id, endTypeId);
                }
                uiStore.showFlash(markerType.color);
                // Play from span start
                vidStore.seek(spanStart.time / 1000);
                if (!vidStore.isPlaying) vidStore.setPlaying(true);
                // Hold mode: extend from end marker on release
                holdRef.current = {
                  key: key.toLowerCase(),
                  startMarkerId: spanEnd.id,
                  typeId: endTypeId,
                  tierId: selSpan.tierId,
                  videoId: currentVideoId,
                  existingSpanId: selSpan.id,
                };
                uiStore.setActiveHold({
                  startMarkerId: spanEnd.id,
                  startTimeMs: spanEnd.time,
                  tierId: selSpan.tierId,
                  color: markerType.color,
                });
                return;
              }
            }

            // Scenario D: end-type key held while playing — extend previous span
            if (vidStore.isPlaying && !hasPending && isEndType(markerType.id, settings.markerTypes)) {
              const tierSpans = annStore.spans.filter(
                (sp: AnnotationSpan) => sp.tierId === activeTier.id && sp.videoId === currentVideoId
              );
              // Find the latest span by end marker time
              let latestSpan: AnnotationSpan | null = null;
              let latestEndTime = -1;
              for (const sp of tierSpans) {
                const endM = annStore.markers.find((m) => m.id === sp.endMarkerId);
                if (endM && endM.time > latestEndTime) {
                  latestEndTime = endM.time;
                  latestSpan = sp;
                }
              }

              if (latestSpan) {
                e.preventDefault();
                const endMarkerId = latestSpan.endMarkerId;
                const endMarker = annStore.markers.find((m) => m.id === endMarkerId);
                if (endMarker) {
                  const currentTimeMs = secToMs(vidStore.currentTime);
                  // Move end marker to current position
                  annStore.updateMarkerTime(endMarkerId, currentTimeMs);
                  uiStore.showFlash(markerType.color);
                  holdRef.current = {
                    key: key.toLowerCase(),
                    startMarkerId: endMarkerId,
                    typeId: markerType.id,
                    tierId: activeTier.id,
                    videoId: currentVideoId,
                    existingSpanId: latestSpan.id,
                  };
                  uiStore.setActiveHold({
                    startMarkerId: latestSpan.startMarkerId,
                    startTimeMs: annStore.markers.find((m) => m.id === latestSpan!.startMarkerId)?.time ?? 0,
                    tierId: activeTier.id,
                    color: markerType.color,
                  });
                  return;
                }
              } else {
                // No span on tier — create start at 0, end at current, make span, enter hold
                e.preventDefault();
                const currentTimeMs = secToMs(vidStore.currentTime);
                const pairedStartTypeId = findPairedStartType(markerType.id, settings.markerTypes);
                const startId = annStore.placeMarker(0, activeTier.id, currentVideoId);
                if (pairedStartTypeId) {
                  annStore.confirmMarker(startId, pairedStartTypeId);
                } else {
                  annStore.confirmMarker(startId, markerType.id);
                }
                const endId = annStore.placeMarker(currentTimeMs, activeTier.id, currentVideoId);
                annStore.confirmMarker(endId, markerType.id);
                annStore.addSpan({
                  startMarkerId: startId,
                  endMarkerId: endId,
                  tierId: activeTier.id,
                  videoId: currentVideoId,
                  gloss: '',
                });
                const newSpans = useAnnotationStore.getState().spans;
                const newSpan = newSpans.find(
                  (sp) => sp.startMarkerId === startId && sp.endMarkerId === endId
                );
                uiStore.showFlash(markerType.color);
                holdRef.current = {
                  key: key.toLowerCase(),
                  startMarkerId: endId,
                  typeId: markerType.id,
                  tierId: activeTier.id,
                  videoId: currentVideoId,
                  existingSpanId: newSpan?.id,
                };
                uiStore.setActiveHold({
                  startMarkerId: startId,
                  startTimeMs: 0,
                  tierId: activeTier.id,
                  color: markerType.color,
                });
                return;
              }
            }

            // Scenario B: pending marker exists — confirm it as start, resume video, begin hold
            if (hasPending) {
              e.preventDefault();
              const pendingMarker = annStore.markers.find((m) => m.id === pendingId);
              const pendingTimeMs = pendingMarker?.time ?? 0;
              const currentTimeMs = secToMs(vidStore.currentTime);
              // If video is playing and playhead has moved past the pending marker,
              // snap the marker to the current position so the hold starts from here
              if (vidStore.isPlaying && currentTimeMs > pendingTimeMs) {
                annStore.updateMarkerTime(pendingId, currentTimeMs);
              }
              const startTimeMs = (vidStore.isPlaying && currentTimeMs > pendingTimeMs)
                ? currentTimeMs
                : pendingTimeMs;
              annStore.confirmMarker(pendingId, markerType.id);
              uiStore.showFlash(markerType.color);
              if (!vidStore.isPlaying) vidStore.setPlaying(true);
              holdRef.current = {
                key: key.toLowerCase(),
                startMarkerId: pendingId,
                typeId: markerType.id,
                tierId: pendingMarker?.tierId ?? activeTier.id,
                videoId: currentVideoId,
              };
              uiStore.setActiveHold({
                startMarkerId: pendingId,
                startTimeMs,
                tierId: pendingMarker?.tierId ?? activeTier.id,
                color: markerType.color,
              });
              return;
            }

            // Scenario A: no pending marker, video playing — place confirmed start, keep playing
            if (vidStore.isPlaying) {
              e.preventDefault();
              const timeMs = secToMs(vidStore.currentTime);
              const startId = annStore.placeMarker(timeMs, activeTier.id, currentVideoId);
              annStore.confirmMarker(startId, markerType.id);
              uiStore.showFlash(markerType.color);
              holdRef.current = {
                key: key.toLowerCase(),
                startMarkerId: startId,
                typeId: markerType.id,
                tierId: activeTier.id,
                videoId: currentVideoId,
              };
              uiStore.setActiveHold({
                startMarkerId: startId,
                startTimeMs: timeMs,
                tierId: activeTier.id,
                color: markerType.color,
              });
              return;
            }

            // Video paused, no pending marker — reclassify selected or just a tap (no hold)
            // Fall through to reclassify logic below
          }
        }
      }
    }

    // ---- When a pending marker exists and key was NOT captured by hold mode ----
    // (This handles Escape and non-type keys on pending markers)
    if (hasPending && !ctrl && !altKey) {
      // Escape cancels
      if (key === 'Escape') {
        e.preventDefault();
        annStore.cancelPendingMarker();
        return;
      }
    }

    // ---- Reclassify a selected confirmed marker (only when video is paused) ----
    if (!hasPending && selectedId && !vidStore.isPlaying && !ctrl && !altKey) {
      const selectedMarker = annStore.markers.find((m) => m.id === selectedId);
      if (selectedMarker && selectedMarker.confirmed) {
        const selectedTier = settings.tiers.find((t) => t.id === selectedMarker.tierId);
        const allowedTypeIds = new Set(selectedTier?.markerTypes ?? []);
        const markerType = settings.markerTypes.find(
          (mt) => mt.key === key.toLowerCase() && allowedTypeIds.has(mt.id)
        );
        if (markerType && markerType.id !== selectedMarker.typeId) {
          e.preventDefault();
          annStore.reclassifyMarker(selectedId, markerType.id);
          uiStore.showFlash(markerType.color);
          uiStore.addToast(`Reclassified → ${markerType.name}`, 'info');
          return;
        }
      }
    }

    // ---- 'g' key: create span (gloss) from selected marker to next on same tier ----
    if (key === 'g' && !ctrl && !shiftKey && !altKey && !hasPending && selectedId && currentVideoId) {
      const selectedMarker = annStore.markers.find((m) => m.id === selectedId);
      if (selectedMarker && selectedMarker.confirmed) {
        // Find the next confirmed marker on the same tier, chronologically after the selected marker
        const tierMarkers = annStore.markers
          .filter(
            (m) =>
              m.id !== selectedId &&
              m.tierId === selectedMarker.tierId &&
              m.videoId === selectedMarker.videoId &&
              m.confirmed &&
              m.time > selectedMarker.time
          )
          .sort((a, b) => a.time - b.time);

        if (tierMarkers.length > 0) {
          const nextMarker = tierMarkers[0];
          // Check if a span already exists between these two markers
          const existingSpan = annStore.spans.find(
            (sp) =>
              sp.startMarkerId === selectedId && sp.endMarkerId === nextMarker.id
          );
          if (existingSpan) {
            // Select the existing span for editing instead
            annStore.selectSpan(existingSpan.id);
            annStore.setEditingSpan(existingSpan.id);
            uiStore.addToast('Span already exists — editing gloss', 'info');
          } else {
            e.preventDefault();
            annStore.addSpan({
              startMarkerId: selectedId,
              endMarkerId: nextMarker.id,
              tierId: selectedMarker.tierId,
              videoId: selectedMarker.videoId,
              gloss: '',
            });
            // Find the newly created span and start editing it
            const newSpans = useAnnotationStore.getState().spans;
            const newSpan = newSpans.find(
              (sp) =>
                sp.startMarkerId === selectedId && sp.endMarkerId === nextMarker.id
            );
            if (newSpan) {
              annStore.selectSpan(newSpan.id);
              annStore.setEditingSpan(newSpan.id);
            }
            uiStore.addToast('Span created — type gloss', 'success');
          }
        } else {
          e.preventDefault();
          uiStore.addToast('No next marker on this tier to create span', 'info');
        }
        return;
      }
    }

    // ---- Space: context-dependent play/pause + marker placement ----
    if (key === ' ' && !ctrl && !shiftKey && !altKey) {
      e.preventDefault();
      if (vidStore.isPlaying && currentVideoId) {
        // Playing → pause and place marker (like Enter)
        vidStore.setPlaying(false);
        if (hasPending) annStore.cancelPendingMarker();
        const timeMs = secToMs(vidStore.currentTime);
        const activeTier = settings.tiers.find(
          (t) => t.id === settings.activeTierId && t.visible && !t.locked
        );
        if (activeTier) {
          annStore.placeMarker(timeMs, activeTier.id, currentVideoId);
          uiStore.showFlash(UNCONFIRMED_COLOR);
        }
      } else {
        // Paused → play
        vidStore.setPlaying(true);
      }
      return;
    }

    // ---- Mark done (Ctrl+Enter) ----
    if (key === 'Enter' && ctrl && !shiftKey && !altKey) {
      e.preventDefault();
      projStore.markCurrentDone();
      uiStore.addToast('Video marked as done', 'success');
      return;
    }

    // ---- Enter: place marker at current time on active tier ----
    if (key === 'Enter' && !ctrl && !shiftKey && !altKey) {
      e.preventDefault();
      if (!currentVideoId) return;
      // If already have a pending marker, cancel it first
      if (hasPending) {
        annStore.cancelPendingMarker();
      }
      // Place unconfirmed marker at current time on active tier
      const timeMs = secToMs(vidStore.currentTime);
      const activeTier = settings.tiers.find(
        (t) => t.id === settings.activeTierId && t.visible && !t.locked
      );
      if (activeTier) {
        // Pause on marker placement so user can nudge
        if (vidStore.isPlaying) {
          vidStore.setPlaying(false);
        }
        annStore.placeMarker(timeMs, activeTier.id, currentVideoId);
        uiStore.showFlash(UNCONFIRMED_COLOR);
      }
      return;
    }

    // ---- Frame stepping ----
    if (key === '.' && !ctrl) {
      e.preventDefault();
      vidStore.frameStep(1);
      return;
    }
    if (key === ',' && !ctrl) {
      e.preventDefault();
      vidStore.frameStep(-1);
      return;
    }

    // ---- Speed ----
    if (key === ']') {
      e.preventDefault();
      vidStore.cycleSpeed(1);
      return;
    }
    if (key === '[') {
      e.preventDefault();
      vidStore.cycleSpeed(-1);
      return;
    }

    // ---- n / Shift+N: select markers and seek video to them ----
    if (key === 'n' && !ctrl && !altKey && !shiftKey && !hasPending && currentVideoId) {
      e.preventDefault();
      annStore.selectNextMarker(currentVideoId, vidStore.currentTime);
      const newSelectedId = useAnnotationStore.getState().selectedMarkerId;
      if (newSelectedId) {
        const marker = useAnnotationStore.getState().markers.find((m) => m.id === newSelectedId);
        if (marker) vidStore.seek(marker.time / 1000);
      }
      return;
    }
    if (key === 'N' && shiftKey && !ctrl && !altKey && !hasPending && currentVideoId) {
      e.preventDefault();
      annStore.selectPrevMarker(currentVideoId, vidStore.currentTime);
      const newSelectedId = useAnnotationStore.getState().selectedMarkerId;
      if (newSelectedId) {
        const marker = useAnnotationStore.getState().markers.find((m) => m.id === newSelectedId);
        if (marker) vidStore.seek(marker.time / 1000);
      }
      return;
    }

    // ---- Delete with undo toast (markers and spans) ----
    if ((key === 'Delete' || key === 'Backspace') && !ctrl) {
      // Delete selected span + its start and end markers
      const selectedSpanId = annStore.selectedSpanId;
      if (selectedSpanId) {
        e.preventDefault();
        const span = annStore.spans.find((sp) => sp.id === selectedSpanId);
        if (span) {
          const startMarker = annStore.markers.find((m) => m.id === span.startMarkerId);
          const endMarker = annStore.markers.find((m) => m.id === span.endMarkerId);
          const startLabel = startMarker ? (startMarker.time / 1000).toFixed(3) : '?';
          const endLabel = endMarker ? (endMarker.time / 1000).toFixed(3) : '?';
          // Remove span first, then both markers
          annStore.removeSpan(selectedSpanId);
          if (span.startMarkerId) annStore.removeMarker(span.startMarkerId);
          if (span.endMarkerId) annStore.removeMarker(span.endMarkerId);
          uiStore.addToast(
            `Deleted span + markers ${startLabel}s → ${endLabel}s`,
            'info',
            { label: 'Undo', callback: () => {
              // Undo all three operations (span removal + 2 marker removals)
              const temporal = useAnnotationStore.temporal.getState();
              temporal.undo(); temporal.undo(); temporal.undo();
            }}
          );
        }
        return;
      }
      // Delete selected marker
      if (selectedId) {
        e.preventDefault();
        const marker = annStore.markers.find((m) => m.id === selectedId);
        annStore.removeMarker(selectedId);
        if (marker) {
          const typeName = settings.markerTypes.find((mt) => mt.id === marker.typeId)?.name ?? 'Marker';
          uiStore.addToast(
            `Deleted ${typeName} at ${(marker.time / 1000).toFixed(3)}s`,
            'info',
            { label: 'Undo', callback: () => useAnnotationStore.temporal.getState().undo() }
          );
        }
        return;
      }
    }

    // ---- Loop (Shift+L) ----
    if (key === 'L' && shiftKey && !ctrl && !altKey && !hasPending) {
      e.preventDefault();
      vidStore.toggleLoop();
      return;
    }

    // ---- Home / End: seek to start / end ----
    if (key === 'Home' && !ctrl && !shiftKey && !altKey) {
      e.preventDefault();
      vidStore.seek(0);
      return;
    }
    if (key === 'End' && !ctrl && !shiftKey && !altKey) {
      e.preventDefault();
      vidStore.seek(duration);
      return;
    }

    // ---- Ctrl+B: toggle sidebar ----
    if (key === 'b' && ctrl && !shiftKey && !altKey) {
      e.preventDefault();
      uiStore.toggleSidebar();
      return;
    }

    // ---- '?' key: toggle keyboard shortcuts overlay ----
    if (key === '?' && !ctrl && !altKey) {
      e.preventDefault();
      uiStore.setShortcutOverlayOpen(!uiStore.shortcutOverlayOpen);
      return;
    }
  }, []);

  /** Finalize an active hold: place end marker, create span, show toast */
  const finalizeHold = useCallback(() => {
    const hold = holdRef.current;
    if (!hold) return;
    holdRef.current = null;
    useUiStore.getState().setActiveHold(null);

    const annStore = useAnnotationStore.getState();
    const vidStore = useVideoStore.getState();
    const uiStore = useUiStore.getState();
    const settings = useSettingsStore.getState();

    const endTimeMs = secToMs(vidStore.currentTime);
    const endMarker = annStore.markers.find((m) => m.id === hold.startMarkerId);
    if (!endMarker) return;

    // --- Extending an existing span (Scenario C): move the end marker ---
    if (hold.existingSpanId) {
      // Only move if playhead is past the end marker (i.e. user extended)
      if (endTimeMs > endMarker.time + 20) {
        annStore.updateMarkerTime(hold.startMarkerId, endTimeMs);
      }
      // Re-select the span
      annStore.selectSpan(hold.existingSpanId);
      const existingSpan = annStore.spans.find((sp) => sp.id === hold.existingSpanId);
      if (existingSpan) {
        const startM = annStore.markers.find((m) => m.id === existingSpan.startMarkerId);
        const endM = annStore.markers.find((m) => m.id === existingSpan.endMarkerId);
        if (startM && endM) {
          const durationMs = Math.abs(endM.time - startM.time);
          const durationLabel = durationMs < 1000
            ? `${durationMs}ms`
            : `${(durationMs / 1000).toFixed(2)}s`;
          const markerType = settings.markerTypes.find((mt) => mt.id === hold.typeId);
          uiStore.addToast(`${markerType?.name ?? 'Span'} — ${durationLabel}`, 'success');
        }
      }
      return;
    }

    // --- Normal hold (Scenario A/B): create new end marker + span ---

    // Quick tap (hold < 20ms): check if the confirmed marker is an end type → auto-pair
    if (Math.abs(endTimeMs - endMarker.time) < 20) {
      handleEndMarkerPairing(hold, annStore, settings, uiStore);
      return;
    }

    // Determine end marker type: if start type ID ends with "-start", use matching "-end" type
    let endTypeId = hold.typeId;
    const startType = settings.markerTypes.find((mt) => mt.id === hold.typeId);
    if (startType && startType.id.endsWith('-start')) {
      const endSuffix = startType.id.replace(/-start$/, '-end');
      const tierAllowed = new Set(
        settings.tiers.find((t) => t.id === hold.tierId)?.markerTypes ?? []
      );
      const endType = settings.markerTypes.find(
        (mt) => mt.id === endSuffix && tierAllowed.has(mt.id)
      );
      if (endType) endTypeId = endType.id;
    }

    const endId = annStore.placeMarker(endTimeMs, hold.tierId, hold.videoId);
    annStore.confirmMarker(endId, endTypeId);

    // Ensure chronological order
    const [spanStartId, spanEndId] = endMarker.time <= endTimeMs
      ? [hold.startMarkerId, endId]
      : [endId, hold.startMarkerId];

    // Remove or trim any existing spans that overlap the new hold range
    const holdStartMs = Math.min(endMarker.time, endTimeMs);
    const holdEndMs = Math.max(endMarker.time, endTimeMs);
    annStore.clearOverlappingSpans(holdStartMs, holdEndMs, hold.tierId, hold.videoId);

    annStore.addSpan({
      startMarkerId: spanStartId,
      endMarkerId: spanEndId,
      tierId: hold.tierId,
      videoId: hold.videoId,
      gloss: '',
    });

    const updatedState = useAnnotationStore.getState();
    const newSpan = updatedState.spans.find(
      (sp) => sp.startMarkerId === spanStartId && sp.endMarkerId === spanEndId
    );
    if (newSpan) {
      annStore.selectSpan(newSpan.id);
    }

    const markerType = settings.markerTypes.find((mt) => mt.id === hold.typeId);
    const typeName = markerType?.name ?? 'Segment';
    const durationMs = Math.abs(endTimeMs - endMarker.time);
    const durationLabel = durationMs < 1000
      ? `${durationMs}ms`
      : `${(durationMs / 1000).toFixed(2)}s`;
    uiStore.addToast(`${typeName} — ${durationLabel}`, 'success');
  }, []);

  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    const hold = holdRef.current;
    if (!hold || e.key.toLowerCase() !== hold.key) return;
    e.preventDefault();
    finalizeHold();
  }, [finalizeHold]);

  // Auto-finalize hold if video pauses or ends while key is held
  useEffect(() => {
    const unsub = useVideoStore.subscribe((state, prev) => {
      if (!holdRef.current) return;
      // Video stopped playing (user paused, reached end, etc.)
      if (!state.isPlaying && prev.isPlaying) {
        finalizeHold();
      }
    });
    return () => unsub();
  }, [finalizeHold]);

  // Cancel hold if video is switched while key is held
  useEffect(() => {
    const unsub = useProjectStore.subscribe((state, prev) => {
      if (!holdRef.current) return;
      if (state.currentVideoId !== prev.currentVideoId) {
        holdRef.current = null;
        useUiStore.getState().setActiveHold(null);
      }
    });
    return () => unsub();
  }, []);

  // Sync pending marker to video position when user scrubs/seeks
  useEffect(() => {
    const unsub = useVideoStore.subscribe((state, prev) => {
      if (state.currentTime === prev.currentTime) return;
      const annState = useAnnotationStore.getState();
      const pendingId = annState.pendingMarkerId;
      if (!pendingId) return;
      const timeMs = Math.round(state.currentTime * 1000);
      annState.updateMarkerTime(pendingId, timeMs);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [handleKeyDown, handleKeyUp]);
}
