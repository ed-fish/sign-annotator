import { useState, useMemo, useRef, useEffect } from 'react';
import { useAnnotationStore } from '../../stores/annotation-store';
import { useSettingsStore } from '../../stores/settings-store';
import { useProjectStore } from '../../stores/project-store';
import { useVideoStore } from '../../stores/video-store';
import { useUiStore } from '../../stores/ui-store';
import { formatTime, msToSec } from '../../utils/time';

/** Inline text editor for gloss and marker values */
function InlineEdit({
  value,
  placeholder,
  onSave,
  autoFocus,
}: {
  value: string;
  placeholder: string;
  onSave: (v: string) => void;
  autoFocus?: boolean;
}) {
  const [editing, setEditing] = useState(autoFocus ?? false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) setEditing(true);
  }, [autoFocus]);

  useEffect(() => {
    if (editing) {
      setDraft(value);
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing, value]);

  if (!editing) {
    return (
      <span
        onClick={(e) => {
          e.stopPropagation();
          setEditing(true);
        }}
        className={`cursor-text hover:bg-surface-3 px-1 rounded ${
          value ? 'text-zinc-300' : 'text-zinc-500 italic'
        }`}
        title="Click to edit"
      >
        {value || placeholder}
      </span>
    );
  }

  return (
    <input
      ref={inputRef}
      type="text"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        onSave(draft);
        setEditing(false);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          onSave(draft);
          setEditing(false);
        }
        if (e.key === 'Escape') {
          setDraft(value);
          setEditing(false);
        }
        e.stopPropagation();
      }}
      onClick={(e) => e.stopPropagation()}
      className="bg-surface-3 text-zinc-200 text-xs px-1 py-0.5 rounded border border-zinc-600 outline-none focus:border-accent w-full"
      placeholder={placeholder}
    />
  );
}

export function AnnotationList() {
  const markers = useAnnotationStore((s) => s.markers);
  const selectedMarkerId = useAnnotationStore((s) => s.selectedMarkerId);
  const selectMarker = useAnnotationStore((s) => s.selectMarker);
  const removeMarker = useAnnotationStore((s) => s.removeMarker);
  const updateMarkerValue = useAnnotationStore((s) => s.updateMarkerValue);
  const pendingMarkerId = useAnnotationStore((s) => s.pendingMarkerId);
  const spans = useAnnotationStore((s) => s.spans);
  const selectedSpanId = useAnnotationStore((s) => s.selectedSpanId);
  const editingSpanId = useAnnotationStore((s) => s.editingSpanId);
  const selectSpan = useAnnotationStore((s) => s.selectSpan);
  const setEditingSpan = useAnnotationStore((s) => s.setEditingSpan);
  const updateSpanGloss = useAnnotationStore((s) => s.updateSpanGloss);
  const removeSpan = useAnnotationStore((s) => s.removeSpan);
  const markerTypes = useSettingsStore((s) => s.markerTypes);
  const tiers = useSettingsStore((s) => s.tiers);
  const currentVideoId = useProjectStore((s) => s.currentVideoId);
  const seek = useVideoStore((s) => s.seek);

  const scrollToAnnotationId = useUiStore((s) => s.scrollToAnnotationId);
  const setScrollToAnnotation = useUiStore((s) => s.setScrollToAnnotation);
  const listRef = useRef<HTMLDivElement>(null);

  const [collapsedTiers, setCollapsedTiers] = useState<Set<string>>(new Set());

  const toggleTierCollapse = (tierId: string) => {
    setCollapsedTiers((prev) => {
      const next = new Set(prev);
      if (next.has(tierId)) next.delete(tierId);
      else next.add(tierId);
      return next;
    });
  };

  // All markers for current video (confirmed + pending)
  const videoMarkers = useMemo(() =>
    markers
      .filter((m) => m.videoId === currentVideoId)
      .sort((a, b) => a.time - b.time),
    [markers, currentVideoId]
  );

  // Group by tier
  const grouped = useMemo(() => {
    const map = new Map<string, typeof videoMarkers>();
    for (const m of videoMarkers) {
      const list = map.get(m.tierId) ?? [];
      list.push(m);
      map.set(m.tierId, list);
    }
    return map;
  }, [videoMarkers]);

  // Group spans by tier
  const videoSpans = useMemo(() =>
    spans.filter((sp) => sp.videoId === currentVideoId),
    [spans, currentVideoId]
  );

  const groupedSpans = useMemo(() => {
    const map = new Map<string, typeof videoSpans>();
    for (const sp of videoSpans) {
      const list = map.get(sp.tierId) ?? [];
      list.push(sp);
      map.set(sp.tierId, list);
    }
    return map;
  }, [videoSpans]);

  // Determine display order: tiers in settings order, then "unassigned"
  const tierOrder = useMemo(() => {
    const ids = tiers.map((t) => t.id);
    // Add any tier IDs from markers or spans that aren't in settings
    for (const tierId of grouped.keys()) {
      if (!ids.includes(tierId)) ids.push(tierId);
    }
    for (const tierId of groupedSpans.keys()) {
      if (!ids.includes(tierId)) ids.push(tierId);
    }
    return ids.filter((id) => grouped.has(id) || groupedSpans.has(id));
  }, [tiers, grouped, groupedSpans]);

  // Scroll to a specific annotation when requested (e.g. from timeline double-click)
  useEffect(() => {
    if (!scrollToAnnotationId) return;
    // Uncollapse the tier containing the target annotation
    const targetSpan = videoSpans.find((sp) => sp.id === scrollToAnnotationId);
    const targetMarker = videoMarkers.find((m) => m.id === scrollToAnnotationId);
    const tierId = targetSpan?.tierId ?? targetMarker?.tierId;
    if (tierId && collapsedTiers.has(tierId)) {
      setCollapsedTiers((prev) => {
        const next = new Set(prev);
        next.delete(tierId);
        return next;
      });
    }
    // Select it
    if (targetSpan) {
      selectSpan(targetSpan.id);
      selectMarker(null);
    } else if (targetMarker) {
      selectMarker(targetMarker.id);
    }
    // Scroll into view after a short delay (for uncollapse to render)
    const timer = setTimeout(() => {
      const el = listRef.current?.querySelector(`[data-annotation-id="${scrollToAnnotationId}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Brief highlight flash
        el.classList.add('ring-2', 'ring-accent');
        setTimeout(() => el.classList.remove('ring-2', 'ring-accent'), 1500);
      }
      setScrollToAnnotation(null);
    }, 100);
    return () => clearTimeout(timer);
  }, [scrollToAnnotationId, videoSpans, videoMarkers, collapsedTiers, selectSpan, selectMarker, setScrollToAnnotation]);

  if (videoMarkers.length === 0 && videoSpans.length === 0) {
    return (
      <div className="p-4 text-sm text-zinc-500 text-center">
        No annotations yet
      </div>
    );
  }

  return (
    <div ref={listRef} className="flex flex-col text-xs">
      {tierOrder.map((tierId) => {
        const tier = tiers.find((t) => t.id === tierId);
        const tierMarkers = grouped.get(tierId) ?? [];
        const tierSpanList = groupedSpans.get(tierId) ?? [];
        const isCollapsed = collapsedTiers.has(tierId);
        const confirmedCount = tierMarkers.filter((m) => m.confirmed).length;
        const pendingCount = tierMarkers.filter((m) => !m.confirmed).length;
        const spanCount = tierSpanList.length;

        return (
          <div key={tierId}>
            {/* Tier header */}
            <button
              onClick={() => toggleTierCollapse(tierId)}
              className="w-full flex items-center gap-2 px-3 py-1.5 bg-surface-2 hover:bg-surface-3 transition-colors sticky top-0 z-10 border-b border-surface-3"
            >
              <span className="text-xs text-zinc-500">{isCollapsed ? '\u25b8' : '\u25be'}</span>
              <span
                className="w-2.5 h-2.5 rounded-sm shrink-0"
                style={{ backgroundColor: tier?.color ?? '#666' }}
              />
              <span className="text-xs text-zinc-300 font-medium flex-1 text-left truncate">
                {tier?.name ?? 'Unknown Tier'}
              </span>
              <span className="text-xs text-zinc-500 tabular-nums">
                {confirmedCount}{pendingCount > 0 && `+${pendingCount}`}{spanCount > 0 && ` · ${spanCount}sp`}
              </span>
            </button>

            {/* Markers in this tier */}
            {!isCollapsed && tierMarkers.map((marker) => {
              const mt = markerTypes.find((t) => t.id === marker.typeId);
              const isSelected = marker.id === selectedMarkerId;
              const isPending = !marker.confirmed;

              return (
                <div key={marker.id} data-annotation-id={marker.id}>
                  <button
                    onClick={() => {
                      selectMarker(marker.id);
                      seek(msToSec(marker.time));
                    }}
                    className={`w-full grid grid-cols-[1fr_60px_auto] gap-1 px-3 py-1 text-left transition-colors ${
                      isPending
                        ? 'bg-amber-500/10'
                        : isSelected
                          ? 'bg-accent/20'
                          : 'hover:bg-surface-2'
                    }`}
                  >
                    <span className="flex items-center gap-1">
                      {isPending ? (
                        <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
                      ) : (
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: mt?.color ?? '#666' }}
                        />
                      )}
                      <span
                        className={`truncate ${isPending ? 'text-amber-300' : 'text-zinc-300'}`}
                        title={mt?.description ?? undefined}
                      >
                        {isPending ? '(pending)' : mt?.name ?? 'Unknown'}
                      </span>
                    </span>
                    <span className="text-zinc-400 font-mono tabular-nums">
                      {formatTime(msToSec(marker.time))}
                    </span>
                    {marker.confirmed && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeMarker(marker.id);
                        }}
                        className="text-zinc-500 hover:text-red-400 transition-colors px-1"
                        title="Delete marker"
                        aria-label={`Delete ${mt?.name ?? 'marker'} at ${formatTime(msToSec(marker.time))}`}
                      >
                        ×
                      </button>
                    )}
                  </button>
                  {/* Marker value field (visible when selected) */}
                  {isSelected && marker.confirmed && (
                    <div className="px-5 py-0.5 bg-accent/10 border-b border-surface-3">
                      <InlineEdit
                        value={marker.value ?? ''}
                        placeholder="value…"
                        onSave={(v) => updateMarkerValue(marker.id, v)}
                      />
                    </div>
                  )}
                </div>
              );
            })}

            {/* Spans in this tier */}
            {!isCollapsed && (groupedSpans.get(tierId) ?? []).map((span) => {
              const startMarker = markers.find((m) => m.id === span.startMarkerId);
              const endMarker = markers.find((m) => m.id === span.endMarkerId);
              if (!startMarker || !endMarker) return null;
              const isSelected = span.id === selectedSpanId;
              const isEditing = span.id === editingSpanId;

              return (
                <div
                  key={span.id}
                  data-annotation-id={span.id}
                  onClick={() => {
                    selectSpan(span.id);
                    selectMarker(null);
                    seek(msToSec(startMarker.time));
                  }}
                  className={`w-full px-3 py-1 text-left transition-colors cursor-pointer border-l-2 ${
                    isSelected
                      ? 'bg-accent/20 border-accent'
                      : 'hover:bg-surface-2 border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-1">
                    <span className="text-zinc-500 text-[10px]">span</span>
                    <span className="text-zinc-400 font-mono tabular-nums text-[10px]">
                      {formatTime(msToSec(startMarker.time))} → {formatTime(msToSec(endMarker.time))}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeSpan(span.id);
                      }}
                      className="text-zinc-500 hover:text-red-400 transition-colors px-1 ml-auto"
                      title="Delete span"
                      aria-label={`Delete span from ${formatTime(msToSec(startMarker.time))} to ${formatTime(msToSec(endMarker.time))}`}
                    >
                      ×
                    </button>
                  </div>
                  <div className="mt-0.5">
                    <InlineEdit
                      value={span.gloss}
                      placeholder="gloss…"
                      onSave={(v) => updateSpanGloss(span.id, v)}
                      autoFocus={isEditing}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
