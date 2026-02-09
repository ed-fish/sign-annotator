import { create } from 'zustand';
import { temporal } from 'zundo';
import type { Marker, AnnotationSpan, ElanDisplayTier, ElanDisplaySpan } from '../types/annotation';
import { generateId } from '../utils/id-generator';
import { clamp } from '../utils/time';

interface AnnotationState {
  markers: Marker[];
  spans: AnnotationSpan[];
  selectedMarkerId: string | null;
  /** When non-null, an unconfirmed marker is waiting for a type key */
  pendingMarkerId: string | null;
  selectedSpanId: string | null;
  editingSpanId: string | null;

  // Imported ELAN data (read-only, not part of undo history)
  elanTiers: ElanDisplayTier[];
  elanSpans: ElanDisplaySpan[];
  showElanAnnotations: boolean;

  // Marker operations
  placeMarker: (time: number, tierId: string, videoId: string) => string;
  confirmMarker: (markerId: string, typeId: string) => void;
  cancelPendingMarker: () => void;
  removeMarker: (id: string) => void;
  nudgeMarker: (id: string, deltaMs: number, maxMs: number) => void;
  selectMarker: (id: string | null) => void;
  selectNextMarker: (videoId: string, currentTime: number) => void;
  selectPrevMarker: (videoId: string, currentTime: number) => void;
  updateMarkerTime: (id: string, time: number) => void;
  updateMarkerTier: (id: string, tierId: string) => void;
  reclassifyMarker: (id: string, newTypeId: string) => void;
  updateMarkerValue: (id: string, value: string) => void;

  // Span operations
  addSpan: (span: Omit<AnnotationSpan, 'id'>) => void;
  removeSpan: (id: string) => void;
  updateSpanGloss: (id: string, gloss: string) => void;
  selectSpan: (id: string | null) => void;
  setEditingSpan: (id: string | null) => void;
  /** Merge two adjacent spans: keep the earlier span, absorb the later, combine glosses */
  mergeSpans: (keepSpanId: string, removeSpanId: string) => boolean;
  /** Remove or trim spans that overlap the given time range on the same tier+video */
  clearOverlappingSpans: (startMs: number, endMs: number, tierId: string, videoId: string) => void;

  // Bulk operations
  setMarkers: (markers: Marker[]) => void;
  setSpans: (spans: AnnotationSpan[]) => void;
  clearVideoAnnotations: (videoId: string) => void;

  // ELAN operations
  setElanData: (tiers: ElanDisplayTier[], spans: ElanDisplaySpan[]) => void;
  clearElanData: () => void;
  toggleShowElan: () => void;

  // Queries
  getVideoMarkers: (videoId: string) => Marker[];
  getVideoSpans: (videoId: string) => AnnotationSpan[];
  getTierMarkers: (tierId: string, videoId: string) => Marker[];
}

export const useAnnotationStore = create<AnnotationState>()(
  temporal(
    (set, get) => ({
      markers: [],
      spans: [],
      selectedMarkerId: null,
      pendingMarkerId: null,
      selectedSpanId: null,
      editingSpanId: null,
      elanTiers: [],
      elanSpans: [],
      showElanAnnotations: true,

      placeMarker: (time, tierId, videoId) => {
        const id = generateId('m');
        const marker: Marker = {
          id,
          time,
          typeId: '', // unconfirmed — no type yet
          tierId,
          videoId,
          confirmed: false,
        };
        set((s) => ({
          markers: [...s.markers, marker],
          selectedMarkerId: id,
          pendingMarkerId: id,
        }));
        return id;
      },

      confirmMarker: (markerId, typeId) => {
        const state = get();
        const marker = state.markers.find((m) => m.id === markerId);
        if (!marker) return;

        // If the new marker falls inside an existing span on the same tier+video,
        // snap that span's end marker to the new marker's time (trim the span).
        let snapEndMarkerId: string | null = null;
        for (const span of state.spans) {
          if (span.tierId !== marker.tierId || span.videoId !== marker.videoId) continue;
          const startM = state.markers.find((m) => m.id === span.startMarkerId);
          const endM = state.markers.find((m) => m.id === span.endMarkerId);
          if (!startM || !endM) continue;
          const spanStart = Math.min(startM.time, endM.time);
          const spanEnd = Math.max(startM.time, endM.time);
          if (marker.time > spanStart && marker.time < spanEnd) {
            snapEndMarkerId = span.endMarkerId;
            break;
          }
        }

        set((s) => ({
          markers: s.markers.map((m) => {
            if (m.id === markerId) return { ...m, typeId, confirmed: true };
            // Snap the overlapping span's end marker to the new marker's time,
            // preserving its original type.
            if (snapEndMarkerId && m.id === snapEndMarkerId) return { ...m, time: marker.time };
            return m;
          }),
          pendingMarkerId: s.pendingMarkerId === markerId ? null : s.pendingMarkerId,
        }));
      },

      cancelPendingMarker: () => {
        const { pendingMarkerId } = get();
        if (pendingMarkerId) {
          set((s) => ({
            markers: s.markers.filter((m) => m.id !== pendingMarkerId),
            pendingMarkerId: null,
            selectedMarkerId: s.selectedMarkerId === pendingMarkerId ? null : s.selectedMarkerId,
          }));
        }
      },

      removeMarker: (id) =>
        set((s) => ({
          markers: s.markers.filter((m) => m.id !== id),
          selectedMarkerId: s.selectedMarkerId === id ? null : s.selectedMarkerId,
          pendingMarkerId: s.pendingMarkerId === id ? null : s.pendingMarkerId,
          spans: s.spans.filter((sp) => sp.startMarkerId !== id && sp.endMarkerId !== id),
        })),

      nudgeMarker: (id, deltaMs, maxMs) =>
        set((s) => ({
          markers: s.markers.map((m) =>
            m.id === id ? { ...m, time: clamp(m.time + deltaMs, 0, maxMs) } : m
          ),
        })),

      selectMarker: (id) => set({ selectedMarkerId: id, ...(id ? { selectedSpanId: null, editingSpanId: null } : {}) }),

      selectNextMarker: (videoId, currentTime) => {
        const markers = get()
          .markers.filter((m) => m.videoId === videoId && m.confirmed)
          .sort((a, b) => a.time - b.time);
        const currentMs = currentTime * 1000;
        const next = markers.find((m) => m.time > currentMs + 1);
        if (next) set({ selectedMarkerId: next.id });
        else if (markers.length > 0) set({ selectedMarkerId: markers[0].id });
      },

      selectPrevMarker: (videoId, currentTime) => {
        const markers = get()
          .markers.filter((m) => m.videoId === videoId && m.confirmed)
          .sort((a, b) => b.time - a.time);
        const currentMs = currentTime * 1000;
        const prev = markers.find((m) => m.time < currentMs - 1);
        if (prev) set({ selectedMarkerId: prev.id });
        else if (markers.length > 0) set({ selectedMarkerId: markers[0].id });
      },

      updateMarkerTime: (id, time) =>
        set((s) => ({
          markers: s.markers.map((m) => (m.id === id ? { ...m, time } : m)),
        })),

      updateMarkerTier: (id, tierId) =>
        set((s) => ({
          markers: s.markers.map((m) => (m.id === id ? { ...m, tierId } : m)),
        })),

      reclassifyMarker: (id, newTypeId) =>
        set((s) => ({
          markers: s.markers.map((m) =>
            m.id === id && m.confirmed ? { ...m, typeId: newTypeId } : m
          ),
        })),

      updateMarkerValue: (id, value) =>
        set((s) => ({
          markers: s.markers.map((m) =>
            m.id === id ? { ...m, value } : m
          ),
        })),

      addSpan: (span) => {
        const state = get();
        // Resolve times for the new span
        const newStart = state.markers.find((m) => m.id === span.startMarkerId);
        const newEnd = state.markers.find((m) => m.id === span.endMarkerId);
        if (!newStart || !newEnd) return;
        const newStartMs = Math.min(newStart.time, newEnd.time);
        const newEndMs = Math.max(newStart.time, newEnd.time);

        // Prevent overlapping spans on the same tier+video
        const overlapping = state.spans.some((existing) => {
          if (existing.tierId !== span.tierId || existing.videoId !== span.videoId) return false;
          const existStart = state.markers.find((m) => m.id === existing.startMarkerId);
          const existEnd = state.markers.find((m) => m.id === existing.endMarkerId);
          if (!existStart || !existEnd) return false;
          const existStartMs = Math.min(existStart.time, existEnd.time);
          const existEndMs = Math.max(existStart.time, existEnd.time);
          return newStartMs < existEndMs && existStartMs < newEndMs;
        });
        if (overlapping) return;

        set((s) => ({ spans: [...s.spans, { ...span, id: generateId('sp') }] }));
      },

      removeSpan: (id) =>
        set((s) => ({ spans: s.spans.filter((sp) => sp.id !== id) })),

      updateSpanGloss: (id, gloss) =>
        set((s) => ({
          spans: s.spans.map((sp) => (sp.id === id ? { ...sp, gloss } : sp)),
        })),

      selectSpan: (id) => set({ selectedSpanId: id, editingSpanId: null, ...(id ? { selectedMarkerId: null } : {}) }),
      setEditingSpan: (id) => set({ editingSpanId: id }),

      mergeSpans: (keepSpanId, removeSpanId) => {
        const state = get();
        const keepSpan = state.spans.find((sp) => sp.id === keepSpanId);
        const removeSpan = state.spans.find((sp) => sp.id === removeSpanId);
        if (!keepSpan || !removeSpan) return false;
        if (keepSpan.tierId !== removeSpan.tierId || keepSpan.videoId !== removeSpan.videoId) return false;

        const keepStart = state.markers.find((m) => m.id === keepSpan.startMarkerId);
        const keepEnd = state.markers.find((m) => m.id === keepSpan.endMarkerId);
        const removeStart = state.markers.find((m) => m.id === removeSpan.startMarkerId);
        const removeEnd = state.markers.find((m) => m.id === removeSpan.endMarkerId);
        if (!keepStart || !keepEnd || !removeStart || !removeEnd) return false;

        // Determine chronological order
        const keepStartMs = Math.min(keepStart.time, keepEnd.time);
        const keepEndMs = Math.max(keepStart.time, keepEnd.time);
        const removeStartMs = Math.min(removeStart.time, removeEnd.time);
        const removeEndMs = Math.max(removeStart.time, removeEnd.time);

        // Merged range
        const mergedStartMs = Math.min(keepStartMs, removeStartMs);
        const mergedEndMs = Math.max(keepEndMs, removeEndMs);

        // Safety: reject if merged result would overlap a third span
        const overlapsThird = state.spans.some((sp) => {
          if (sp.id === keepSpanId || sp.id === removeSpanId) return false;
          if (sp.tierId !== keepSpan.tierId || sp.videoId !== keepSpan.videoId) return false;
          const s = state.markers.find((m) => m.id === sp.startMarkerId);
          const e = state.markers.find((m) => m.id === sp.endMarkerId);
          if (!s || !e) return false;
          const sMs = Math.min(s.time, e.time);
          const eMs = Math.max(s.time, e.time);
          return mergedStartMs < eMs && sMs < mergedEndMs;
        });
        if (overlapsThird) return false;

        // Figure out which markers to keep (outermost) and which to remove (intermediate)
        const isKeepFirst = keepStartMs <= removeStartMs;
        const finalStartMarkerId = isKeepFirst ? keepSpan.startMarkerId : removeSpan.startMarkerId;
        const finalEndMarkerId = isKeepFirst ? removeSpan.endMarkerId : keepSpan.endMarkerId;
        const removeMarkerIds = new Set([
          isKeepFirst ? keepSpan.endMarkerId : removeSpan.endMarkerId,
          isKeepFirst ? removeSpan.startMarkerId : keepSpan.startMarkerId,
        ]);
        // Don't remove a marker that is also used as the final start/end
        removeMarkerIds.delete(finalStartMarkerId);
        removeMarkerIds.delete(finalEndMarkerId);

        // Combine glosses
        const glossParts = [keepSpan.gloss, removeSpan.gloss].filter(Boolean);
        const combinedGloss = glossParts.join(' + ');

        set((s) => ({
          markers: s.markers.filter((m) => !removeMarkerIds.has(m.id)),
          spans: s.spans
            .filter((sp) => sp.id !== removeSpanId)
            .map((sp) =>
              sp.id === keepSpanId
                ? { ...sp, startMarkerId: finalStartMarkerId, endMarkerId: finalEndMarkerId, gloss: combinedGloss }
                : sp
            ),
          selectedSpanId: keepSpanId,
          selectedMarkerId: null,
        }));
        return true;
      },

      clearOverlappingSpans: (startMs, endMs, tierId, videoId) => {
        const state = get();
        const removeSpanIds = new Set<string>();
        const removeMarkerIds = new Set<string>();
        const markerTimeUpdates = new Map<string, number>();

        for (const span of state.spans) {
          if (span.tierId !== tierId || span.videoId !== videoId) continue;
          const sM = state.markers.find((m) => m.id === span.startMarkerId);
          const eM = state.markers.find((m) => m.id === span.endMarkerId);
          if (!sM || !eM) continue;
          const sTime = Math.min(sM.time, eM.time);
          const eTime = Math.max(sM.time, eM.time);

          // No overlap
          if (sTime >= endMs || eTime <= startMs) continue;

          if (sTime >= startMs && eTime <= endMs) {
            // Completely contained → remove span + its markers
            removeSpanIds.add(span.id);
            removeMarkerIds.add(span.startMarkerId);
            removeMarkerIds.add(span.endMarkerId);
          } else if (sTime < startMs && eTime > endMs) {
            // Existing span fully contains the new range → trim end to new start
            const endMarkerId = sM.time <= eM.time ? span.endMarkerId : span.startMarkerId;
            markerTimeUpdates.set(endMarkerId, startMs);
          } else if (sTime < startMs) {
            // Starts before, ends inside → trim end to new start
            const endMarkerId = sM.time <= eM.time ? span.endMarkerId : span.startMarkerId;
            markerTimeUpdates.set(endMarkerId, startMs);
          } else {
            // Starts inside, ends after → trim start to new end
            const startMarkerId = sM.time <= eM.time ? span.startMarkerId : span.endMarkerId;
            markerTimeUpdates.set(startMarkerId, endMs);
          }
        }

        if (removeSpanIds.size === 0 && markerTimeUpdates.size === 0) return;

        set((s) => ({
          markers: s.markers
            .filter((m) => !removeMarkerIds.has(m.id))
            .map((m) => markerTimeUpdates.has(m.id) ? { ...m, time: markerTimeUpdates.get(m.id)! } : m),
          spans: s.spans.filter((sp) => !removeSpanIds.has(sp.id)),
        }));
      },

      setMarkers: (markers) => set({ markers }),
      setSpans: (spans) => set({ spans }),
      clearVideoAnnotations: (videoId) =>
        set((s) => ({
          markers: s.markers.filter((m) => m.videoId !== videoId),
          spans: s.spans.filter((sp) => sp.videoId !== videoId),
        })),

      setElanData: (tiers, spans) => set({ elanTiers: tiers, elanSpans: spans }),
      clearElanData: () => set({ elanTiers: [], elanSpans: [] }),
      toggleShowElan: () => set((s) => ({ showElanAnnotations: !s.showElanAnnotations })),

      getVideoMarkers: (videoId) => get().markers.filter((m) => m.videoId === videoId),
      getVideoSpans: (videoId) => get().spans.filter((sp) => sp.videoId === videoId),
      getTierMarkers: (tierId, videoId) =>
        get().markers.filter((m) => m.tierId === tierId && m.videoId === videoId),
    }),
    {
      limit: 100,
      partialize: (state) => {
        const { markers, spans } = state;
        return { markers, spans } as AnnotationState;
      },
      handleSet: (handleSet) => (state) => {
        handleSet(state);
        // Clean up orphaned refs after undo/redo
        const current = useAnnotationStore.getState();
        const ids = new Set(current.markers.map((m) => m.id));
        const updates: Partial<AnnotationState> = {};
        if (current.pendingMarkerId && !ids.has(current.pendingMarkerId)) updates.pendingMarkerId = null;
        if (current.selectedMarkerId && !ids.has(current.selectedMarkerId)) updates.selectedMarkerId = null;
        if (Object.keys(updates).length > 0) useAnnotationStore.setState(updates);
      },
    }
  )
);
