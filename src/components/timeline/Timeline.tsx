import { useRef, useEffect, useCallback, useState } from 'react';
import { useVideoStore } from '../../stores/video-store';
import { useAnnotationStore } from '../../stores/annotation-store';
import { useSettingsStore } from '../../stores/settings-store';
import { useProjectStore } from '../../stores/project-store';
import { useUiStore } from '../../stores/ui-store';
import {
  TIMELINE_MIN_ZOOM,
  TIMELINE_MAX_ZOOM,
  TIMELINE_DEFAULT_ZOOM,
  RULER_HEIGHT,
  TIER_HEIGHT,
  MARKER_WIDTH,
  MARKER_HIT_WIDTH,
  MARKER_SHAPE_SIZE,
  MINIMAP_HEIGHT,
  DOUBLE_CLICK_DELAY,
  AUTO_SCROLL_SMOOTH_SPEED,
} from '../../constants/theme';
import { UNCONFIRMED_COLOR } from '../../constants/annotation-types';
import { formatTimeShort } from '../../utils/time';
import { clamp, msToSec } from '../../utils/time';

// Shape definitions for marker types (cycled by type index)
type ShapeType = 'circle' | 'diamond' | 'triangle-up' | 'square' | 'triangle-down' | 'star';
const SHAPE_CYCLE: ShapeType[] = ['circle', 'diamond', 'triangle-up', 'square', 'triangle-down', 'star'];

function drawShape(ctx: CanvasRenderingContext2D, shape: ShapeType, cx: number, cy: number, r: number) {
  ctx.beginPath();
  switch (shape) {
    case 'circle':
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      break;
    case 'diamond':
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx + r, cy);
      ctx.lineTo(cx, cy + r);
      ctx.lineTo(cx - r, cy);
      break;
    case 'triangle-up':
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx + r, cy + r * 0.7);
      ctx.lineTo(cx - r, cy + r * 0.7);
      break;
    case 'square':
      ctx.rect(cx - r * 0.8, cy - r * 0.8, r * 1.6, r * 1.6);
      break;
    case 'triangle-down':
      ctx.moveTo(cx, cy + r);
      ctx.lineTo(cx + r, cy - r * 0.7);
      ctx.lineTo(cx - r, cy - r * 0.7);
      break;
    case 'star': {
      const spikes = 5;
      const outerR = r;
      const innerR = r * 0.45;
      for (let i = 0; i < spikes * 2; i++) {
        const rad = (Math.PI / 2) * -1 + (Math.PI / spikes) * i;
        const sr = i % 2 === 0 ? outerR : innerR;
        const sx = cx + Math.cos(rad) * sr;
        const sy = cy + Math.sin(rad) * sr;
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      }
      break;
    }
  }
  ctx.closePath();
}

// Format time with ms for tooltip
function formatTimePrecise(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toFixed(3).padStart(6, '0')}`;
}

interface OverlapPopup {
  x: number;
  y: number;
  markers: Array<{ id: string; typeName: string; color: string; time: number }>;
}

export function Timeline() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(TIMELINE_DEFAULT_ZOOM); // px per second
  const scrollLeftRef = useRef(0);
  const targetScrollLeftRef = useRef(0); // for smooth scrolling
  const [, forceUpdate] = useState(0);
  const animRef = useRef(0);
  const canvasSizeRef = useRef({ w: 0, h: 0 });
  const dirtyRef = useRef(true); // P2-2: RAF dirty flag

  // Drag state:
  // 'move' repositions a single marker
  // 'span' creates a span from an existing marker
  // 'draw' draws a new span from empty space (Logic Pro style)
  // 'span-move' moves an entire span (both markers)
  // 'span-resize' drags one edge of an existing span
  const MERGE_SNAP_PX = 15;
  const dragRef = useRef<{
    mode: 'move' | 'span' | 'draw' | 'span-move' | 'span-resize';
    markerId: string;
    tierId: string;
    videoId: string;
    startX: number;
    currentTimeMs: number;
    originalTimeMs: number;
    // For span-move: track the second marker and both original positions
    secondMarkerId?: string;
    secondOriginalTimeMs?: number;
    /** Original click time in ms (used as drag anchor for span-move) */
    clickAnchorMs?: number;
    /** Start marker's original time before drag began */
    startMarkerOrigMs?: number;
    /** End marker's original time before drag began */
    endMarkerOrigMs?: number;
    /** The span ID being resized (for span-resize mode) */
    spanId?: string;
    // Merge snap state (for span-resize)
    mergeSnapTargetMs?: number | null;
    preMergeTimeMs?: number | null;
    mergeTargetSpanId?: string | null;
    inMergeZone?: boolean;
  } | null>(null);
  const [dragTooltip, setDragTooltip] = useState<{ x: number; y: number; time: string } | null>(null);

  // Ruler scrub state (P2-3)
  const scrubRef = useRef(false);

  // Auto-follow state (P2-4)
  const autoFollowRef = useRef(true);
  const autoFollowTimerRef = useRef(0);

  // Double-click fix (P3-4)
  const clickTimerRef = useRef(0);
  // Suppress click after a drag/draw gesture
  const justDraggedRef = useRef(false);

  // Overlap popup (P1-5)
  const [overlapPopup, setOverlapPopup] = useState<OverlapPopup | null>(null);

  // Cursor state (P3-2)
  const [cursorStyle, setCursorStyle] = useState('default');

  // Hover tooltip for markers/spans
  const [hoverTooltip, setHoverTooltip] = useState<{
    x: number;
    y: number;
    label: string;
    sublabel?: string;
  } | null>(null);

  // Mark dirty on state changes (P2-2)
  useEffect(() => {
    const markDirty = () => { dirtyRef.current = true; };
    const unsub1 = useVideoStore.subscribe(markDirty);
    const unsub2 = useAnnotationStore.subscribe(markDirty);
    const unsub3 = useSettingsStore.subscribe(markDirty);
    const unsub4 = useProjectStore.subscribe(markDirty);
    const unsub5 = useUiStore.subscribe(markDirty);
    return () => { unsub1(); unsub2(); unsub3(); unsub4(); unsub5(); };
  }, []);

  // ResizeObserver — only resize canvas when container size actually changes
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const dpr = window.devicePixelRatio || 1;
      const w = entry.contentRect.width;
      const h = entry.contentRect.height;
      if (w !== canvasSizeRef.current.w || h !== canvasSizeRef.current.h) {
        canvasSizeRef.current = { w, h };
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
        dirtyRef.current = true;
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Draw function reads from stores directly (decoupled from React re-renders)
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { w, h } = canvasSizeRef.current;
    if (w === 0 || h === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Smooth scroll interpolation (P2-4)
    const diff = targetScrollLeftRef.current - scrollLeftRef.current;
    if (Math.abs(diff) > 0.5) {
      scrollLeftRef.current += diff * AUTO_SCROLL_SMOOTH_SPEED;
      dirtyRef.current = true;
    } else {
      scrollLeftRef.current = targetScrollLeftRef.current;
    }

    const scrollLeft = scrollLeftRef.current;

    // Read from stores directly to avoid React re-render coupling
    const currentTime = useVideoStore.getState().currentTime;
    const duration = useVideoStore.getState().duration;
    const markers = useAnnotationStore.getState().markers;
    const selectedMarkerId = useAnnotationStore.getState().selectedMarkerId;
    const pendingMarkerId = useAnnotationStore.getState().pendingMarkerId;
    const tiers = useSettingsStore.getState().tiers;
    const markerTypes = useSettingsStore.getState().markerTypes;
    const activeTierId = useSettingsStore.getState().activeTierId;
    const currentVideoId = useProjectStore.getState().currentVideoId;
    const elanTiers = useAnnotationStore.getState().elanTiers;
    const elanSpans = useAnnotationStore.getState().elanSpans;
    const showElan = useAnnotationStore.getState().showElanAnnotations;

    const videoMarkers = markers.filter((m) => m.videoId === currentVideoId);

    // P3-1: scroll bounds clamping
    const maxScroll = Math.max(0, duration * zoom - w);
    scrollLeftRef.current = clamp(scrollLeftRef.current, 0, maxScroll);
    targetScrollLeftRef.current = clamp(targetScrollLeftRef.current, 0, maxScroll);

    const clampedScrollLeft = scrollLeftRef.current;

    // Clear
    ctx.fillStyle = '#27272a';
    ctx.fillRect(0, 0, w, h);

    const visibleTiers = tiers.filter((t) => t.visible);
    const contentHeight = h - MINIMAP_HEIGHT;

    // --- Ruler ---
    ctx.fillStyle = '#3f3f46';
    ctx.fillRect(0, 0, w, RULER_HEIGHT);
    ctx.strokeStyle = '#52525b';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, RULER_HEIGHT);
    ctx.lineTo(w, RULER_HEIGHT);
    ctx.stroke();

    // Time ticks
    const tickInterval = getTickInterval(zoom);
    const startTime = Math.max(0, clampedScrollLeft / zoom);
    const endTime = Math.min(duration, (clampedScrollLeft + w) / zoom);
    const firstTick = Math.floor(startTime / tickInterval) * tickInterval;

    ctx.fillStyle = '#a1a1aa';
    ctx.font = '10px ui-monospace, monospace';
    ctx.textAlign = 'center';

    for (let t = firstTick; t <= endTime; t += tickInterval) {
      const x = t * zoom - clampedScrollLeft;
      if (x < -10 || x > w + 10) continue;

      // Major tick
      ctx.strokeStyle = '#52525b';
      ctx.beginPath();
      ctx.moveTo(x, RULER_HEIGHT - 8);
      ctx.lineTo(x, RULER_HEIGHT);
      ctx.stroke();

      ctx.fillText(formatTimeShort(t), x, RULER_HEIGHT - 10);

      // Minor ticks
      const minorInterval = tickInterval / 4;
      for (let mt = 1; mt < 4; mt++) {
        const mx = (t + mt * minorInterval) * zoom - clampedScrollLeft;
        if (mx < 0 || mx > w) continue;
        ctx.strokeStyle = '#3f3f46';
        ctx.beginPath();
        ctx.moveTo(mx, RULER_HEIGHT - 4);
        ctx.lineTo(mx, RULER_HEIGHT);
        ctx.stroke();
      }
    }

    // --- Tier backgrounds ---
    visibleTiers.forEach((tier, i) => {
      const y = RULER_HEIGHT + i * TIER_HEIGHT;
      const isActive = tier.id === activeTierId;

      ctx.fillStyle = i % 2 === 0 ? '#2a2a30' : '#27272a';
      if (isActive) {
        ctx.fillStyle = i % 2 === 0 ? '#32323a' : '#2e2e36';
      }
      ctx.fillRect(0, y, w, TIER_HEIGHT);

      // Active tier left accent bar
      if (isActive) {
        const tierObj = tiers.find((t) => t.id === tier.id);
        ctx.fillStyle = tierObj?.color ?? '#6366f1';
        ctx.fillRect(0, y, 3, TIER_HEIGHT);
      }

      // Tier label
      ctx.fillStyle = isActive ? '#a1a1aa' : '#71717a';
      ctx.font = isActive ? 'bold 12px system-ui' : '12px system-ui';
      ctx.textAlign = 'left';
      ctx.fillText(tier.name, isActive ? 7 : 4, y + TIER_HEIGHT / 2 + 4);

      // Bottom border
      ctx.strokeStyle = '#3f3f46';
      ctx.beginPath();
      ctx.moveTo(0, y + TIER_HEIGHT);
      ctx.lineTo(w, y + TIER_HEIGHT);
      ctx.stroke();
    });

    // --- Markers ---
    const isDragging = dragRef.current !== null;
    for (const marker of videoMarkers) {
      const tierIdx = visibleTiers.findIndex((t) => t.id === marker.tierId);
      if (tierIdx === -1) continue;

      // If this marker is being dragged, use drag position instead of store value
      let timeMs = marker.time;
      if (dragRef.current) {
        if (dragRef.current.markerId === marker.id) {
          timeMs = dragRef.current.currentTimeMs;
        } else if (dragRef.current.secondMarkerId === marker.id && dragRef.current.secondOriginalTimeMs != null) {
          timeMs = dragRef.current.secondOriginalTimeMs; // secondOriginalTimeMs is live-updated during drag
        }
      }

      const x = msToSec(timeMs) * zoom - clampedScrollLeft;
      if (x < -10 || x > w + 10) continue;

      const y = RULER_HEIGHT + tierIdx * TIER_HEIGHT;
      const isSelected = marker.id === selectedMarkerId;
      const isPending = marker.id === pendingMarkerId;
      const isBeingDragged = dragRef.current?.markerId === marker.id || dragRef.current?.secondMarkerId === marker.id;

      let color: string;
      if (!marker.confirmed) {
        color = UNCONFIRMED_COLOR;
      } else {
        const mt = markerTypes.find((t) => t.id === marker.typeId);
        color = mt?.color ?? '#6366f1';
      }

      // Drag highlight (P1-4)
      if (isBeingDragged) {
        ctx.fillStyle = color + '20';
        ctx.fillRect(x - 8, y, 16, TIER_HEIGHT);
      }

      // Marker line
      ctx.strokeStyle = color;
      ctx.lineWidth = isSelected || isBeingDragged ? 3 : MARKER_WIDTH;
      ctx.beginPath();
      ctx.moveTo(x, y + 2);
      ctx.lineTo(x, y + TIER_HEIGHT - 2);
      ctx.stroke();

      // P1-3: Shape differentiation at top of marker
      const typeIdx = markerTypes.findIndex((t) => t.id === marker.typeId);
      const shapeType = marker.confirmed
        ? SHAPE_CYCLE[typeIdx >= 0 ? typeIdx % SHAPE_CYCLE.length : 1]
        : 'diamond'; // unconfirmed always gets diamond
      const shapeR = MARKER_SHAPE_SIZE / 2;
      const shapeCy = y + 2 + shapeR;

      ctx.fillStyle = color;
      drawShape(ctx, shapeType, x, shapeCy, shapeR);
      ctx.fill();

      // Selected highlight
      if (isSelected || isBeingDragged) {
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 1;
        drawShape(ctx, shapeType, x, shapeCy, shapeR);
        ctx.stroke();
      }

      // Pending pulse indicator
      if (isPending) {
        ctx.fillStyle = UNCONFIRMED_COLOR + '40';
        ctx.fillRect(x - 6, y, 12, TIER_HEIGHT);
      }
    }

    // --- Span drag preview (both 'span' from marker and 'draw' from empty space) ---
    if (dragRef.current?.mode === 'span' || dragRef.current?.mode === 'draw') {
      const { originalTimeMs, currentTimeMs, tierId: dragTierId } = dragRef.current;
      const dragTierIdx = visibleTiers.findIndex((t) => t.id === dragTierId);
      if (dragTierIdx !== -1 && Math.abs(currentTimeMs - originalTimeMs) > 5) {
        const startMs = Math.min(originalTimeMs, currentTimeMs);
        const endMs = Math.max(originalTimeMs, currentTimeMs);
        const previewX1 = msToSec(startMs) * zoom - clampedScrollLeft;
        const previewX2 = msToSec(endMs) * zoom - clampedScrollLeft;
        const previewY = RULER_HEIGHT + dragTierIdx * TIER_HEIGHT;

        // Animated span preview
        ctx.fillStyle = '#f59e0b30'; // amber semi-transparent
        ctx.fillRect(previewX1, previewY + 2, previewX2 - previewX1, TIER_HEIGHT - 4);
        ctx.strokeStyle = '#f59e0b80';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(previewX1, previewY + 2, previewX2 - previewX1, TIER_HEIGHT - 4);
        ctx.setLineDash([]);

        // Duration label in preview
        const durationMs = endMs - startMs;
        const durationLabel = durationMs < 1000
          ? `${durationMs}ms`
          : `${(durationMs / 1000).toFixed(2)}s`;
        if (previewX2 - previewX1 > 30) {
          ctx.font = 'bold 11px system-ui';
          ctx.textAlign = 'center';
          ctx.fillStyle = '#fbbf24';
          ctx.fillText(durationLabel, (previewX1 + previewX2) / 2, previewY + TIER_HEIGHT / 2 + 4);
        }
      }
    }

    // --- Hold mode: live-growing segment preview ---
    const activeHold = useUiStore.getState().activeHold;
    if (activeHold) {
      const holdTierIdx = visibleTiers.findIndex((t) => t.id === activeHold.tierId);
      if (holdTierIdx !== -1) {
        const holdStartX = msToSec(activeHold.startTimeMs) * zoom - clampedScrollLeft;
        const holdEndX = currentTime * zoom - clampedScrollLeft;
        const holdY = RULER_HEIGHT + holdTierIdx * TIER_HEIGHT;
        const x1 = Math.min(holdStartX, holdEndX);
        const x2 = Math.max(holdStartX, holdEndX);

        if (x2 - x1 > 1) {
          // Pulsing fill
          ctx.fillStyle = activeHold.color + '35';
          ctx.fillRect(x1, holdY + 2, x2 - x1, TIER_HEIGHT - 4);

          // Solid border (grows in real-time)
          ctx.strokeStyle = activeHold.color + 'aa';
          ctx.lineWidth = 2;
          ctx.strokeRect(x1, holdY + 2, x2 - x1, TIER_HEIGHT - 4);

          // Duration label
          const holdDurMs = Math.abs(currentTime * 1000 - activeHold.startTimeMs);
          const holdLabel = holdDurMs < 1000
            ? `${Math.round(holdDurMs)}ms`
            : `${(holdDurMs / 1000).toFixed(2)}s`;
          if (x2 - x1 > 30) {
            ctx.font = 'bold 11px system-ui';
            ctx.textAlign = 'center';
            ctx.fillStyle = activeHold.color;
            ctx.fillText(holdLabel, (x1 + x2) / 2, holdY + TIER_HEIGHT / 2 + 4);
          }
        }
      }
    }

    // --- Annotation spans (gloss) ---
    const spans = useAnnotationStore.getState().spans;
    const selectedSpanId = useAnnotationStore.getState().selectedSpanId;
    const videoSpans = spans.filter((sp) => sp.videoId === currentVideoId);

    for (const span of videoSpans) {
      const startMarker = videoMarkers.find((m) => m.id === span.startMarkerId);
      const endMarker = videoMarkers.find((m) => m.id === span.endMarkerId);
      if (!startMarker || !endMarker) continue;

      const tierIdx = visibleTiers.findIndex((t) => t.id === span.tierId);
      if (tierIdx === -1) continue;

      // Use drag positions if either marker is being dragged
      let startMs = startMarker.time;
      let endMs = endMarker.time;
      if (dragRef.current) {
        if (dragRef.current.markerId === startMarker.id) startMs = dragRef.current.currentTimeMs;
        else if (dragRef.current.secondMarkerId === startMarker.id && dragRef.current.secondOriginalTimeMs != null) startMs = dragRef.current.secondOriginalTimeMs;
        if (dragRef.current.markerId === endMarker.id) endMs = dragRef.current.currentTimeMs;
        else if (dragRef.current.secondMarkerId === endMarker.id && dragRef.current.secondOriginalTimeMs != null) endMs = dragRef.current.secondOriginalTimeMs;
      }
      const x1 = msToSec(Math.min(startMs, endMs)) * zoom - clampedScrollLeft;
      const x2 = msToSec(Math.max(startMs, endMs)) * zoom - clampedScrollLeft;
      if (x2 < 0 || x1 > w) continue;

      const y = RULER_HEIGHT + tierIdx * TIER_HEIGHT;
      const isSelectedSpan = span.id === selectedSpanId;

      // Get color from the tier
      const tier = tiers.find((t) => t.id === span.tierId);
      const spanColor = tier?.color ?? '#6366f1';

      // Semi-transparent fill
      ctx.fillStyle = spanColor + (isSelectedSpan ? '50' : '25');
      ctx.fillRect(x1, y + 2, x2 - x1, TIER_HEIGHT - 4);

      // Border
      ctx.strokeStyle = spanColor + (isSelectedSpan ? 'cc' : '80');
      ctx.lineWidth = isSelectedSpan ? 2 : 1;
      ctx.strokeRect(x1, y + 2, x2 - x1, TIER_HEIGHT - 4);

      // Gloss text centered in span
      if (x2 - x1 > 20) {
        const label = span.gloss || '(no gloss)';
        ctx.font = isSelectedSpan ? 'bold 11px system-ui' : '11px system-ui';
        ctx.textAlign = 'center';
        ctx.save();
        ctx.beginPath();
        ctx.rect(x1 + 2, y, x2 - x1 - 4, TIER_HEIGHT);
        ctx.clip();
        ctx.fillStyle = span.gloss ? '#e2e8f0' : '#71717a';
        ctx.fillText(label, (x1 + x2) / 2, y + TIER_HEIGHT / 2 + 4);
        ctx.restore();
      }
    }

    // --- Merge preview overlay ---
    if (dragRef.current?.mode === 'span-resize' && dragRef.current.inMergeZone && dragRef.current.mergeTargetSpanId && dragRef.current.spanId) {
      const mergeColor = '#14b8a6'; // teal-500
      for (const highlightSpanId of [dragRef.current.spanId, dragRef.current.mergeTargetSpanId]) {
        const hlSpan = spans.find((sp) => sp.id === highlightSpanId);
        if (!hlSpan) continue;
        const hlStart = videoMarkers.find((m) => m.id === hlSpan.startMarkerId);
        const hlEnd = videoMarkers.find((m) => m.id === hlSpan.endMarkerId);
        if (!hlStart || !hlEnd) continue;
        const hlTierIdx = visibleTiers.findIndex((t) => t.id === hlSpan.tierId);
        if (hlTierIdx === -1) continue;

        let hlStartMs = hlStart.time;
        let hlEndMs = hlEnd.time;
        // Use drag position for the marker being dragged
        if (dragRef.current.markerId === hlStart.id) hlStartMs = dragRef.current.currentTimeMs;
        if (dragRef.current.markerId === hlEnd.id) hlEndMs = dragRef.current.currentTimeMs;

        const hx1 = msToSec(Math.min(hlStartMs, hlEndMs)) * zoom - clampedScrollLeft;
        const hx2 = msToSec(Math.max(hlStartMs, hlEndMs)) * zoom - clampedScrollLeft;
        const hy = RULER_HEIGHT + hlTierIdx * TIER_HEIGHT;

        ctx.fillStyle = mergeColor + '30';
        ctx.fillRect(hx1, hy + 2, hx2 - hx1, TIER_HEIGHT - 4);
        ctx.strokeStyle = mergeColor + 'cc';
        ctx.lineWidth = 2;
        ctx.strokeRect(hx1, hy + 2, hx2 - hx1, TIER_HEIGHT - 4);
      }

      // "MERGE" label at the junction
      if (dragRef.current.mergeSnapTargetMs != null) {
        const junctionX = msToSec(dragRef.current.mergeSnapTargetMs) * zoom - clampedScrollLeft;
        const dragSpan = spans.find((sp) => sp.id === dragRef.current!.spanId);
        if (dragSpan) {
          const jTierIdx = visibleTiers.findIndex((t) => t.id === dragSpan.tierId);
          if (jTierIdx !== -1) {
            const jy = RULER_HEIGHT + jTierIdx * TIER_HEIGHT;
            ctx.font = 'bold 10px system-ui';
            ctx.textAlign = 'center';
            ctx.fillStyle = mergeColor;
            ctx.fillText('MERGE', junctionX, jy + 12);
          }
        }
      }
    }

    // --- ELAN spans ---
    const elanVideoTiers = showElan ? elanTiers.filter((t) => t.videoId === currentVideoId) : [];
    if (elanVideoTiers.length > 0) {
      elanVideoTiers.forEach((eTier, i) => {
        const y = RULER_HEIGHT + (visibleTiers.length + i) * TIER_HEIGHT;

        // Tier background
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(0, y, w, TIER_HEIGHT);

        // Bottom border
        ctx.strokeStyle = '#334155';
        ctx.beginPath();
        ctx.moveTo(0, y + TIER_HEIGHT);
        ctx.lineTo(w, y + TIER_HEIGHT);
        ctx.stroke();

        // Tier label
        ctx.fillStyle = '#94a3b8';
        ctx.font = 'italic 11px system-ui';
        ctx.textAlign = 'left';
        ctx.fillText(`\u25b7 ${eTier.name}`, 4, y + TIER_HEIGHT / 2 + 4);

        // Draw spans
        const tierSpans = elanSpans.filter((s) => s.tierId === eTier.id);
        for (const span of tierSpans) {
          const x1 = (span.startMs / 1000) * zoom - clampedScrollLeft;
          const x2 = (span.endMs / 1000) * zoom - clampedScrollLeft;
          if (x2 < 0 || x1 > w) continue;

          ctx.fillStyle = eTier.color + '40';
          ctx.fillRect(x1, y + 2, x2 - x1, TIER_HEIGHT - 4);
          ctx.strokeStyle = eTier.color + '80';
          ctx.lineWidth = 1;
          ctx.strokeRect(x1, y + 2, x2 - x1, TIER_HEIGHT - 4);

          // Annotation text (clipped to span width)
          if (x2 - x1 > 20) {
            ctx.fillStyle = '#e2e8f0';
            ctx.font = '10px system-ui';
            ctx.textAlign = 'left';
            ctx.save();
            ctx.beginPath();
            ctx.rect(x1, y, x2 - x1, TIER_HEIGHT);
            ctx.clip();
            ctx.fillText(span.value, x1 + 3, y + TIER_HEIGHT / 2 + 3);
            ctx.restore();
          }
        }
      });
    }

    // --- Playhead ---
    const playheadX = currentTime * zoom - clampedScrollLeft;
    if (playheadX >= 0 && playheadX <= w) {
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX, contentHeight);
      ctx.stroke();

      // Playhead handle
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.moveTo(playheadX - 5, 0);
      ctx.lineTo(playheadX + 5, 0);
      ctx.lineTo(playheadX, 6);
      ctx.closePath();
      ctx.fill();
    }

    // --- P3-3: Minimap ---
    const minimapY = contentHeight;
    ctx.fillStyle = '#1c1c20';
    ctx.fillRect(0, minimapY, w, MINIMAP_HEIGHT);
    // Border
    ctx.strokeStyle = '#3f3f46';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, minimapY);
    ctx.lineTo(w, minimapY);
    ctx.stroke();

    if (duration > 0) {
      const minimapScale = w / duration; // px per second in minimap

      // Marker dots on minimap
      for (const marker of videoMarkers) {
        const mx = msToSec(marker.time) * minimapScale;
        if (mx < 0 || mx > w) continue;
        let dotColor: string;
        if (!marker.confirmed) {
          dotColor = UNCONFIRMED_COLOR;
        } else {
          const mt = markerTypes.find((t) => t.id === marker.typeId);
          dotColor = mt?.color ?? '#6366f1';
        }
        ctx.fillStyle = dotColor;
        ctx.fillRect(mx - 0.5, minimapY + 3, 1.5, MINIMAP_HEIGHT - 6);
      }

      // Viewport rectangle
      const vpLeft = (clampedScrollLeft / zoom) * minimapScale;
      const vpWidth = (w / zoom) * minimapScale;
      ctx.fillStyle = '#ffffff15';
      ctx.fillRect(vpLeft, minimapY + 1, vpWidth, MINIMAP_HEIGHT - 2);
      ctx.strokeStyle = '#ffffff40';
      ctx.lineWidth = 1;
      ctx.strokeRect(vpLeft, minimapY + 1, vpWidth, MINIMAP_HEIGHT - 2);

      // Playhead on minimap
      const minimapPlayhead = currentTime * minimapScale;
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(minimapPlayhead, minimapY + 1);
      ctx.lineTo(minimapPlayhead, minimapY + MINIMAP_HEIGHT - 1);
      ctx.stroke();
    }
  }, [zoom]);

  // Animation loop — draw runs every frame but uses dirty flag (P2-2)
  useEffect(() => {
    const loop = () => {
      const isPlaying = useVideoStore.getState().isPlaying;
      const smoothing = Math.abs(targetScrollLeftRef.current - scrollLeftRef.current) > 0.5;

      if (dirtyRef.current || isPlaying || smoothing || dragRef.current || scrubRef.current) {
        draw();
        dirtyRef.current = false;
      }
      animRef.current = requestAnimationFrame(loop);
    };
    animRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animRef.current);
  }, [draw]);

  // Auto-scroll to keep playhead visible (P2-4: smooth + following mode)
  useEffect(() => {
    const unsub = useVideoStore.subscribe((state, prev) => {
      if (state.currentTime === prev.currentTime) return;
      if (!autoFollowRef.current) return;
      const { w } = canvasSizeRef.current;
      if (w === 0) return;
      const playheadX = state.currentTime * zoom;
      const sl = targetScrollLeftRef.current;
      if (playheadX < sl + 50 || playheadX > sl + w - 50) {
        targetScrollLeftRef.current = Math.max(0, playheadX - w / 3);
        dirtyRef.current = true;
      }
    });
    return () => unsub();
  }, [zoom]);

  // P2-1: Cursor-relative zoom
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;

        const factor = e.deltaY > 0 ? 0.9 : 1.1;
        const oldZoom = zoom;
        const newZoom = clamp(oldZoom * factor, TIMELINE_MIN_ZOOM, TIMELINE_MAX_ZOOM);

        // Keep time at cursor stable
        const timeAtCursor = (scrollLeftRef.current + mouseX) / oldZoom;
        const newScrollLeft = Math.max(0, timeAtCursor * newZoom - mouseX);

        scrollLeftRef.current = newScrollLeft;
        targetScrollLeftRef.current = newScrollLeft;
        setZoom(newZoom);
        dirtyRef.current = true;
      } else {
        // Horizontal scroll — disable auto-follow temporarily (P2-4)
        autoFollowRef.current = false;
        clearTimeout(autoFollowTimerRef.current);
        autoFollowTimerRef.current = window.setTimeout(() => {
          autoFollowRef.current = true;
        }, 5000);

        const delta = e.deltaX + e.deltaY;
        const duration = useVideoStore.getState().duration;
        const maxScroll = Math.max(0, duration * zoom - canvasSizeRef.current.w);
        const newSl = clamp(scrollLeftRef.current + delta, 0, maxScroll);
        scrollLeftRef.current = newSl;
        targetScrollLeftRef.current = newSl;
        dirtyRef.current = true;
        forceUpdate((n) => n + 1);
      }
    },
    [zoom]
  );

  // Helper: find markers at a given canvas position
  const findMarkersAt = useCallback(
    (x: number, y: number) => {
      const scrollLeft = scrollLeftRef.current;
      const tiers = useSettingsStore.getState().tiers;
      const visibleTiers = tiers.filter((t) => t.visible);
      const markers = useAnnotationStore.getState().markers;
      const markerTypes = useSettingsStore.getState().markerTypes;
      const currentVideoId = useProjectStore.getState().currentVideoId;
      const videoMarkers = markers.filter((m) => m.videoId === currentVideoId);

      const hits: Array<{ id: string; typeName: string; color: string; time: number; tierId: string; videoId: string; yInTier: number }> = [];
      for (const marker of videoMarkers) {
        const tierIdx = visibleTiers.findIndex((t) => t.id === marker.tierId);
        if (tierIdx === -1) continue;
        const mx = msToSec(marker.time) * zoom - scrollLeft;
        const my = RULER_HEIGHT + tierIdx * TIER_HEIGHT;
        if (Math.abs(x - mx) < MARKER_HIT_WIDTH && y >= my && y <= my + TIER_HEIGHT) {
          const mt = markerTypes.find((t) => t.id === marker.typeId);
          hits.push({
            id: marker.id,
            typeName: mt?.name ?? (marker.confirmed ? 'Unknown' : 'Unconfirmed'),
            color: marker.confirmed ? (mt?.color ?? '#6366f1') : UNCONFIRMED_COLOR,
            time: marker.time,
            tierId: marker.tierId,
            videoId: marker.videoId,
            yInTier: y - my,
          });
        }
      }
      return hits;
    },
    [zoom]
  );

  // Helper: find span at a given canvas position (returns full info + edge detection)
  const SPAN_EDGE_PX = 8; // px from edge to count as edge hit
  const findSpanAt = useCallback(
    (x: number, y: number): {
      id: string;
      startMarkerId: string;
      endMarkerId: string;
      startTimeMs: number;
      endTimeMs: number;
      tierId: string;
      videoId: string;
      /** Which part of the span was hit: 'left' edge, 'right' edge, or 'middle' */
      edge: 'left' | 'right' | 'middle';
    } | null => {
      const scrollLeft = scrollLeftRef.current;
      const tiers = useSettingsStore.getState().tiers;
      const visibleTiers = tiers.filter((t) => t.visible);
      const markers = useAnnotationStore.getState().markers;
      const spans = useAnnotationStore.getState().spans;
      const currentVideoId = useProjectStore.getState().currentVideoId;
      const videoSpans = spans.filter((sp) => sp.videoId === currentVideoId);

      for (const span of videoSpans) {
        const startMarker = markers.find((m) => m.id === span.startMarkerId);
        const endMarker = markers.find((m) => m.id === span.endMarkerId);
        if (!startMarker || !endMarker) continue;

        const tierIdx = visibleTiers.findIndex((t) => t.id === span.tierId);
        if (tierIdx === -1) continue;

        const x1 = msToSec(startMarker.time) * zoom - scrollLeft;
        const x2 = msToSec(endMarker.time) * zoom - scrollLeft;
        const sy = RULER_HEIGHT + tierIdx * TIER_HEIGHT;

        if (x >= x1 - SPAN_EDGE_PX && x <= x2 + SPAN_EDGE_PX && y >= sy + 2 && y <= sy + TIER_HEIGHT - 2) {
          const edge: 'left' | 'right' | 'middle' =
            Math.abs(x - x1) <= SPAN_EDGE_PX ? 'left'
            : Math.abs(x - x2) <= SPAN_EDGE_PX ? 'right'
            : 'middle';
          return {
            id: span.id,
            startMarkerId: span.startMarkerId,
            endMarkerId: span.endMarkerId,
            startTimeMs: startMarker.time,
            endTimeMs: endMarker.time,
            tierId: span.tierId,
            videoId: span.videoId,
            edge,
          };
        }
      }
      return null;
    },
    [zoom]
  );

  // P3-4: Click handler with double-click fix
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      // Close overlap popup on any click outside it
      if (overlapPopup) {
        setOverlapPopup(null);
        return;
      }

      // Ignore click if we just finished a drag/draw gesture
      if (dragRef.current || justDraggedRef.current) return;

      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const scrollLeft = scrollLeftRef.current;
      const { w } = canvasSizeRef.current;
      const contentH = canvasSizeRef.current.h - MINIMAP_HEIGHT;
      const duration = useVideoStore.getState().duration;

      // P3-3: Minimap click
      if (y >= contentH && duration > 0) {
        const minimapScale = w / duration;
        const clickTimeSec = x / minimapScale;
        const newScrollLeft = Math.max(0, clickTimeSec * zoom - w / 2);
        targetScrollLeftRef.current = newScrollLeft;
        dirtyRef.current = true;
        return;
      }

      // Check for marker click (P1-5: handle overlaps)
      const hits = findMarkersAt(x, y);

      if (hits.length > 1) {
        // Show overlap popup
        setOverlapPopup({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
          markers: hits,
        });
        return;
      }

      if (hits.length === 1) {
        // P3-4: use timeout to distinguish single-click from double-click
        clearTimeout(clickTimerRef.current);
        const markerId = hits[0].id;
        clickTimerRef.current = window.setTimeout(() => {
          useAnnotationStore.getState().selectMarker(markerId);
        }, DOUBLE_CLICK_DELAY);
        return;
      }

      // Check for span click (only when no marker was hit)
      const spanHit = findSpanAt(x, y);
      if (spanHit) {
        clearTimeout(clickTimerRef.current);
        if (e.detail >= 2) {
          // Double-click → open gloss editing + show in annotation sidebar
          const annStore2 = useAnnotationStore.getState();
          const uiStore = useUiStore.getState();
          annStore2.selectSpan(spanHit.id);
          annStore2.selectMarker(null);
          annStore2.setEditingSpan(spanHit.id);
          uiStore.setSidebarTab('annotations');
          uiStore.setScrollToAnnotation(spanHit.id);
          if (!uiStore.sidebarOpen) uiStore.toggleSidebar();
        } else {
          // Single-click → select the span
          clickTimerRef.current = window.setTimeout(() => {
            useAnnotationStore.getState().selectSpan(spanHit.id);
            useAnnotationStore.getState().selectMarker(null);
          }, DOUBLE_CLICK_DELAY);
        }
        return;
      }

      // Click on ruler to seek
      if (y <= RULER_HEIGHT) {
        const time = (x + scrollLeft) / zoom;
        useVideoStore.getState().seek(clamp(time, 0, duration));
        return;
      }

      // P3-4: Double-click on empty area to seek (without deselecting first)
      if (e.detail === 2) {
        clearTimeout(clickTimerRef.current);
        const time = (x + scrollLeft) / zoom;
        useVideoStore.getState().seek(clamp(time, 0, duration));
        return;
      }

      // Single click on empty area: delay deselect to allow double-click
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = window.setTimeout(() => {
        useAnnotationStore.getState().selectMarker(null);
      }, DOUBLE_CLICK_DELAY);
    },
    [zoom, overlapPopup, findMarkersAt, findSpanAt]
  );

  // P1-4: Pointer events for marker dragging + P2-3: ruler scrubbing
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      setHoverTooltip(null); // Clear hover tooltip when starting any interaction
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const scrollLeft = scrollLeftRef.current;
      const duration = useVideoStore.getState().duration;

      // P2-3: Ruler scrub
      if (y <= RULER_HEIGHT) {
        scrubRef.current = true;
        canvas.setPointerCapture(e.pointerId);
        const time = (x + scrollLeft) / zoom;
        useVideoStore.getState().seek(clamp(time, 0, duration));
        dirtyRef.current = true;
        return;
      }

      // Check what's under the pointer: marker hit and span hit
      const hits = findMarkersAt(x, y);
      const spanHit = findSpanAt(x, y);
      const annStore = useAnnotationStore.getState();

      // Marker drag — but check if this marker is a span edge first
      if (hits.length >= 1) {
        const hit = hits[0];
        const marker = annStore.markers.find((m) => m.id === hit.id);
        if (marker) {
          const isTopHalf = hit.yInTier < TIER_HEIGHT / 2;

          // Check if this marker is an edge of an existing span
          const edgeSpan = annStore.spans.find(
            (sp) => sp.startMarkerId === marker.id || sp.endMarkerId === marker.id
          );

          if (isTopHalf && edgeSpan) {
            // Marker is a span edge — top-half drag resizes the span (NOT create new)
            canvas.setPointerCapture(e.pointerId);
            dragRef.current = {
              mode: 'span-resize',
              markerId: marker.id,
              tierId: marker.tierId,
              videoId: marker.videoId,
              startX: x,
              currentTimeMs: marker.time,
              originalTimeMs: marker.time,
              spanId: edgeSpan.id,
            };
            annStore.selectSpan(edgeSpan.id);
            dirtyRef.current = true;
          } else if (isTopHalf && !edgeSpan) {
            // Marker is NOT part of a span — top-half drag creates a new span
            canvas.setPointerCapture(e.pointerId);
            dragRef.current = {
              mode: 'span',
              markerId: marker.id,
              tierId: marker.tierId,
              videoId: marker.videoId,
              startX: x,
              currentTimeMs: marker.time,
              originalTimeMs: marker.time,
            };
            annStore.selectMarker(marker.id);
            dirtyRef.current = true;
          } else {
            // Bottom half — always move the marker
            canvas.setPointerCapture(e.pointerId);
            dragRef.current = {
              mode: 'move',
              markerId: marker.id,
              tierId: marker.tierId,
              videoId: marker.videoId,
              startX: x,
              currentTimeMs: marker.time,
              originalTimeMs: marker.time,
            };
            annStore.selectMarker(marker.id);
            dirtyRef.current = true;
          }
        }
        return;
      }

      // Span interaction (no marker was hit) — edge: resize, middle: move
      if (spanHit) {
        canvas.setPointerCapture(e.pointerId);
        if (spanHit.edge === 'left' || spanHit.edge === 'right') {
          // Edge drag — resize the span by moving one marker
          const edgeMarkerId = spanHit.edge === 'left' ? spanHit.startMarkerId : spanHit.endMarkerId;
          const edgeTimeMs = spanHit.edge === 'left' ? spanHit.startTimeMs : spanHit.endTimeMs;
          dragRef.current = {
            mode: 'span-resize',
            markerId: edgeMarkerId,
            tierId: spanHit.tierId,
            videoId: spanHit.videoId,
            startX: x,
            currentTimeMs: edgeTimeMs,
            originalTimeMs: edgeTimeMs,
            spanId: spanHit.id,
          };
        } else {
          // Middle drag — move the whole span
          const clickTimeSec = (x + scrollLeft) / zoom;
          const clickTimeMs = Math.round(clamp(clickTimeSec, 0, duration) * 1000);
          dragRef.current = {
            mode: 'span-move',
            markerId: spanHit.startMarkerId,
            tierId: spanHit.tierId,
            videoId: spanHit.videoId,
            startX: x,
            currentTimeMs: spanHit.startTimeMs,     // actual start marker time (NOT click pos)
            originalTimeMs: spanHit.startTimeMs,
            secondMarkerId: spanHit.endMarkerId,
            secondOriginalTimeMs: spanHit.endTimeMs, // actual end marker time
            clickAnchorMs: clickTimeMs,              // click position used for delta calc
            startMarkerOrigMs: spanHit.startTimeMs,
            endMarkerOrigMs: spanHit.endTimeMs,
          };
        }
        annStore.selectSpan(spanHit.id);
        dirtyRef.current = true;
        return;
      }

      // Draw new span from empty tier area (Logic Pro style)
      // Only start draw on left-button; simple clicks handled by handleClick
      const contentH = canvasSizeRef.current.h - MINIMAP_HEIGHT;
      if (y > RULER_HEIGHT && y < contentH) {
        const visibleTiers = useSettingsStore.getState().tiers.filter((t) => t.visible);
        const tierIdx = Math.floor((y - RULER_HEIGHT) / TIER_HEIGHT);
        const tier = visibleTiers[tierIdx];
        const currentVideoId = useProjectStore.getState().currentVideoId;
        if (tier && currentVideoId && !tier.locked) {
          canvas.setPointerCapture(e.pointerId);
          const clickTimeSec = (x + scrollLeft) / zoom;
          const clickTimeMs = Math.round(clamp(clickTimeSec, 0, duration) * 1000);
          dragRef.current = {
            mode: 'draw',
            markerId: '',
            tierId: tier.id,
            videoId: currentVideoId,
            startX: x,
            currentTimeMs: clickTimeMs,
            originalTimeMs: clickTimeMs,
          };
          useVideoStore.getState().seek(clamp(clickTimeSec, 0, duration));
          dirtyRef.current = true;
        }
      }
    },
    [zoom, findMarkersAt, findSpanAt]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const scrollLeft = scrollLeftRef.current;
      const duration = useVideoStore.getState().duration;

      // P2-3: Ruler scrub move
      if (scrubRef.current) {
        const time = (x + scrollLeft) / zoom;
        useVideoStore.getState().seek(clamp(time, 0, duration));
        dirtyRef.current = true;
        return;
      }

      // Marker drag move (all modes scrub video)
      if (dragRef.current) {
        const timeSec = (x + scrollLeft) / zoom;
        const timeMs = Math.round(clamp(timeSec, 0, duration) * 1000);
        const durationMs = Math.round(duration * 1000);

        if (dragRef.current.mode === 'span-move') {
          // Span-move: compute delta from click anchor and apply to both markers (visual only)
          const { clickAnchorMs, startMarkerOrigMs, endMarkerOrigMs } = dragRef.current;
          if (clickAnchorMs != null && startMarkerOrigMs != null && endMarkerOrigMs != null) {
            const deltaMs = timeMs - clickAnchorMs;
            // Clamp so neither marker goes out of bounds
            const clampedDelta = clamp(
              deltaMs,
              -startMarkerOrigMs,
              durationMs - endMarkerOrigMs
            );
            dragRef.current.currentTimeMs = startMarkerOrigMs + clampedDelta;
            dragRef.current.secondOriginalTimeMs = endMarkerOrigMs + clampedDelta;
            // Scrub video to the midpoint of the span
            const midSec = (dragRef.current.currentTimeMs + dragRef.current.secondOriginalTimeMs) / 2 / 1000;
            useVideoStore.getState().seek(clamp(midSec, 0, duration));
          }
        } else if (dragRef.current.mode === 'span-resize') {
          useVideoStore.getState().seek(clamp(timeSec, 0, duration));

          const annStore = useAnnotationStore.getState();
          const resizeSpan = annStore.spans.find((sp) => sp.id === dragRef.current!.spanId);
          if (resizeSpan) {
            const isStartEdge = dragRef.current.markerId === resizeSpan.startMarkerId;
            const anchorMarkerId = isStartEdge ? resizeSpan.endMarkerId : resizeSpan.startMarkerId;
            const anchorMarker = annStore.markers.find((m) => m.id === anchorMarkerId);
            const anchorMs = anchorMarker?.time ?? 0;

            // All other spans on this tier (includes unconfirmed-marker spans)
            const sameSpans = annStore.spans.filter(
              (sp) => sp.id !== resizeSpan.id && sp.tierId === resizeSpan.tierId && sp.videoId === resizeSpan.videoId
            );

            // 1. Check merge snap first (uses raw timeMs for pixel distance)
            let bestSnap: { spanId: string; edgeMs: number; distPx: number } | null = null;
            for (const adj of sameSpans) {
              const adjStart = annStore.markers.find((m) => m.id === adj.startMarkerId);
              const adjEnd = annStore.markers.find((m) => m.id === adj.endMarkerId);
              if (!adjStart || !adjEnd) continue;
              for (const edgeMs of [adjStart.time, adjEnd.time]) {
                const edgePx = msToSec(edgeMs) * zoom;
                const currentPx = msToSec(timeMs) * zoom;
                const distPx = Math.abs(edgePx - currentPx);
                if (distPx < MERGE_SNAP_PX && (!bestSnap || distPx < bestSnap.distPx)) {
                  bestSnap = { spanId: adj.id, edgeMs, distPx };
                }
              }
            }

            if (bestSnap) {
              // Entering or staying in merge zone — snap to adjacent edge
              if (!dragRef.current.inMergeZone) {
                dragRef.current.preMergeTimeMs = timeMs;
              }
              dragRef.current.currentTimeMs = bestSnap.edgeMs;
              dragRef.current.mergeSnapTargetMs = bestSnap.edgeMs;
              dragRef.current.mergeTargetSpanId = bestSnap.spanId;
              dragRef.current.inMergeZone = true;
            } else {
              // Not in merge zone — clear merge state if leaving
              if (dragRef.current.inMergeZone) {
                dragRef.current.mergeSnapTargetMs = null;
                dragRef.current.preMergeTimeMs = null;
                dragRef.current.mergeTargetSpanId = null;
                dragRef.current.inMergeZone = false;
              }

              // 2. Overlap prevention: clamp so edge can't pass through any span
              let lower = 0;
              let upper = durationMs;
              if (isStartEdge) {
                upper = anchorMs; // can't invert past our own end
                for (const adj of sameSpans) {
                  const s = annStore.markers.find((m) => m.id === adj.startMarkerId);
                  const eM = annStore.markers.find((m) => m.id === adj.endMarkerId);
                  if (!s || !eM) continue;
                  const adjEndMs = Math.max(s.time, eM.time);
                  if (adjEndMs <= anchorMs) {
                    lower = Math.max(lower, adjEndMs);
                  }
                }
              } else {
                lower = anchorMs; // can't invert past our own start
                for (const adj of sameSpans) {
                  const s = annStore.markers.find((m) => m.id === adj.startMarkerId);
                  const eM = annStore.markers.find((m) => m.id === adj.endMarkerId);
                  if (!s || !eM) continue;
                  const adjStartMs = Math.min(s.time, eM.time);
                  if (adjStartMs >= anchorMs) {
                    upper = Math.min(upper, adjStartMs);
                  }
                }
              }
              dragRef.current.currentTimeMs = clamp(timeMs, lower, upper);
            }
          } else {
            dragRef.current.currentTimeMs = timeMs;
          }
        } else {
          // move, span, draw — all track currentTimeMs and scrub video
          dragRef.current.currentTimeMs = timeMs;
          useVideoStore.getState().seek(clamp(timeSec, 0, duration));
        }

        let label: string;
        const mode = dragRef.current.mode;
        if (mode === 'span' || mode === 'draw') {
          const startMs = Math.min(dragRef.current.originalTimeMs, dragRef.current.currentTimeMs);
          const endMs = Math.max(dragRef.current.originalTimeMs, dragRef.current.currentTimeMs);
          const dur = endMs - startMs;
          label = dur < 1000 ? `${dur}ms` : `${(dur / 1000).toFixed(2)}s`;
        } else if (mode === 'span-move') {
          label = 'move span';
        } else if (mode === 'span-resize') {
          label = formatTimePrecise(timeMs / 1000);
        } else {
          label = formatTimePrecise(timeMs / 1000);
        }
        setDragTooltip({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top - 24,
          time: label,
        });
        dirtyRef.current = true;
        return;
      }

      // P3-2: Cursor feedback + hover tooltip
      const { h } = canvasSizeRef.current;
      const contentH = h - MINIMAP_HEIGHT;
      if (y <= RULER_HEIGHT) {
        setCursorStyle('crosshair');
        setHoverTooltip(null);
      } else if (y >= contentH) {
        setCursorStyle('pointer');
        setHoverTooltip(null);
      } else {
        const hits = findMarkersAt(x, y);
        if (hits.length > 0) {
          setCursorStyle(hits[0].yInTier < TIER_HEIGHT / 2 ? 'ew-resize' : 'grab');
          const hit = hits[0];
          setHoverTooltip({
            x: e.clientX - rect.left,
            y: e.clientY - rect.top - 52,
            label: hit.typeName,
            sublabel: formatTimePrecise(hit.time / 1000),
          });
        } else {
          // Check if hovering over a span
          const spanHit = findSpanAt(x, y);
          if (spanHit) {
            // Edges show resize cursor, middle shows move cursor
            setCursorStyle(spanHit.edge === 'middle' ? 'move' : 'ew-resize');
            const spans = useAnnotationStore.getState().spans;
            const span = spans.find((sp) => sp.id === spanHit.id);
            const durationMs = Math.abs(spanHit.endTimeMs - spanHit.startTimeMs);
            const durLabel = durationMs < 1000 ? `${durationMs}ms` : `${(durationMs / 1000).toFixed(2)}s`;
            setHoverTooltip({
              x: e.clientX - rect.left,
              y: e.clientY - rect.top - 52,
              label: span?.gloss || '(span)',
              sublabel: `${formatTimePrecise(spanHit.startTimeMs / 1000)} → ${formatTimePrecise(spanHit.endTimeMs / 1000)} (${durLabel})`,
            });
          } else {
            setCursorStyle('crosshair'); // empty tier area — draw cursor
            setHoverTooltip(null);
          }
        }
      }
    },
    [zoom, findMarkersAt, findSpanAt]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      // P2-3: End ruler scrub
      if (scrubRef.current) {
        scrubRef.current = false;
        canvas.releasePointerCapture(e.pointerId);
        return;
      }

      // End marker drag — commit position (move), create span (span), or finalize span-move
      if (dragRef.current) {
        const { mode, markerId, tierId, videoId, currentTimeMs, originalTimeMs } = dragRef.current;
        const annStore = useAnnotationStore.getState();

        if (mode === 'move') {
          // Move drag: update marker position
          if (currentTimeMs !== originalTimeMs) {
            annStore.updateMarkerTime(markerId, currentTimeMs);
          }
        } else if (mode === 'span') {
          // Span drag: create a second marker at the release position and link them
          const endTimeMs = currentTimeMs;
          const startTimeMs = originalTimeMs;
          // Only create span if dragged a meaningful distance (> 5ms)
          if (Math.abs(endTimeMs - startTimeMs) > 50) { // 50ms min to avoid accidental span creation
            const sourceMarker = annStore.markers.find((m) => m.id === markerId);
            if (sourceMarker) {
              // Determine span direction (user may drag left or right)
              const [spanStartMs, spanEndMs] = endTimeMs > startTimeMs
                ? [startTimeMs, endTimeMs]
                : [endTimeMs, startTimeMs];
              // Place a new marker at the drag-end position
              const endMarkerTimeMs = endTimeMs > startTimeMs ? spanEndMs : spanStartMs;
              annStore.placeMarker(endMarkerTimeMs, tierId, videoId);
              const newState = useAnnotationStore.getState();
              const endMarkerId = newState.pendingMarkerId;

              if (endMarkerId) {
                // If source is confirmed, auto-confirm the new marker with same type
                if (sourceMarker.confirmed && sourceMarker.typeId) {
                  annStore.confirmMarker(endMarkerId, sourceMarker.typeId);
                }

                // Create the span (ensure start < end chronologically)
                const actualStartId = endTimeMs > startTimeMs ? markerId : endMarkerId;
                const actualEndId = endTimeMs > startTimeMs ? endMarkerId : markerId;

                annStore.addSpan({
                  startMarkerId: actualStartId,
                  endMarkerId: actualEndId,
                  tierId,
                  videoId,
                  gloss: '',
                });

                // Select the new span for immediate gloss editing
                const updatedState = useAnnotationStore.getState();
                const newSpan = updatedState.spans.find(
                  (sp) => sp.startMarkerId === actualStartId && sp.endMarkerId === actualEndId
                );
                if (newSpan) {
                  annStore.selectSpan(newSpan.id);
                  annStore.setEditingSpan(newSpan.id);
                }
              }
            }
          }
        } else if (mode === 'draw') {
          // Draw mode: create two markers + span from empty area
          const startMs = Math.min(originalTimeMs, currentTimeMs);
          const endMs = Math.max(originalTimeMs, currentTimeMs);
          if (endMs - startMs > 50) { // 50ms min to avoid accidental creation from clicks
            // placeMarker returns the new marker ID
            const startMarkerId = annStore.placeMarker(startMs, tierId, videoId);
            const endMarkerId = annStore.placeMarker(endMs, tierId, videoId);
            annStore.addSpan({
              startMarkerId,
              endMarkerId,
              tierId,
              videoId,
              gloss: '',
            });
            const updatedState = useAnnotationStore.getState();
            const newSpan = updatedState.spans.find(
              (sp) => sp.startMarkerId === startMarkerId && sp.endMarkerId === endMarkerId
            );
            if (newSpan) {
              annStore.selectSpan(newSpan.id);
              annStore.setEditingSpan(newSpan.id);
            }
          }
        } else if (mode === 'span-resize') {
          const { inMergeZone, mergeTargetSpanId, spanId: resizeSpanId } = dragRef.current;
          if (inMergeZone && mergeTargetSpanId && resizeSpanId) {
            // Commit merge: restore marker to snap position, then merge spans
            if (currentTimeMs !== originalTimeMs) {
              annStore.updateMarkerTime(markerId, currentTimeMs);
            }
            const merged = annStore.mergeSpans(resizeSpanId, mergeTargetSpanId);
            if (merged) {
              useUiStore.getState().addToast('Spans merged', 'success', {
                label: 'Undo',
                callback: () => useAnnotationStore.temporal.getState().undo(),
              });
            }
          } else {
            // Normal resize commit
            if (currentTimeMs !== originalTimeMs) {
              annStore.updateMarkerTime(markerId, currentTimeMs);
            }
          }
        } else if (mode === 'span-move') {
          // Commit both marker positions (single undo entry for each)
          const { startMarkerOrigMs, endMarkerOrigMs } = dragRef.current;
          if (startMarkerOrigMs != null && endMarkerOrigMs != null) {
            if (currentTimeMs !== startMarkerOrigMs) {
              annStore.updateMarkerTime(markerId, currentTimeMs);
            }
            if (dragRef.current.secondMarkerId && dragRef.current.secondOriginalTimeMs != null
                && dragRef.current.secondOriginalTimeMs !== endMarkerOrigMs) {
              annStore.updateMarkerTime(dragRef.current.secondMarkerId, dragRef.current.secondOriginalTimeMs);
            }
          }
        }

        // Only suppress click if pointer actually moved (prevents blocking simple clicks on spans)
        const rect2 = canvas.getBoundingClientRect();
        const finalX = e.clientX - rect2.left;
        const didMove = Math.abs(finalX - dragRef.current.startX) > 3;
        if (didMove) {
          justDraggedRef.current = true;
          requestAnimationFrame(() => { justDraggedRef.current = false; });
        }

        dragRef.current = null;
        setDragTooltip(null);
        canvas.releasePointerCapture(e.pointerId);
        dirtyRef.current = true;
        return;
      }
    },
    []
  );

  // Re-enable auto-follow on play
  useEffect(() => {
    const unsub = useVideoStore.subscribe((state, prev) => {
      if (state.isPlaying && !prev.isPlaying) {
        autoFollowRef.current = true;
        clearTimeout(autoFollowTimerRef.current);
      }
    });
    return () => unsub();
  }, []);

  // Handle overlap popup item click
  const handleOverlapSelect = useCallback((markerId: string) => {
    useAnnotationStore.getState().selectMarker(markerId);
    setOverlapPopup(null);
  }, []);

  return (
    <div ref={containerRef} className="h-full w-full relative" onWheel={handleWheel}>
      <canvas
        ref={canvasRef}
        className="timeline-canvas absolute inset-0"
        style={{ cursor: dragRef.current
          ? dragRef.current.mode === 'span' || dragRef.current.mode === 'draw' || dragRef.current.mode === 'span-resize' ? 'ew-resize'
          : dragRef.current.mode === 'span-move' ? 'move'
          : 'grabbing'
          : cursorStyle }}
        onClick={handleClick}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={() => setHoverTooltip(null)}
      />
      {/* P1-4: Drag tooltip */}
      {dragTooltip && (
        <div
          className="absolute pointer-events-none bg-zinc-800 text-zinc-200 text-xs px-2 py-0.5 rounded shadow-lg border border-zinc-600"
          style={{ left: dragTooltip.x - 30, top: dragTooltip.y }}
        >
          {dragTooltip.time}
        </div>
      )}
      {/* Hover tooltip for markers/spans */}
      {hoverTooltip && !dragRef.current && (
        <div
          className="absolute pointer-events-none bg-zinc-900 text-zinc-200 text-xs px-2 py-1 rounded shadow-lg border border-zinc-600 z-40 max-w-[200px]"
          style={{ left: hoverTooltip.x - 40, top: Math.max(0, hoverTooltip.y) }}
        >
          <div className="font-medium truncate">{hoverTooltip.label}</div>
          {hoverTooltip.sublabel && (
            <div className="text-zinc-400 text-[10px] font-mono">{hoverTooltip.sublabel}</div>
          )}
        </div>
      )}
      {/* P1-5: Overlap popup */}
      {overlapPopup && (
        <div
          className="absolute bg-zinc-800 border border-zinc-600 rounded-lg shadow-xl py-1 z-50 min-w-[140px]"
          style={{ left: overlapPopup.x, top: overlapPopup.y + 8 }}
        >
          <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-zinc-500 border-b border-zinc-700">
            Select marker
          </div>
          {overlapPopup.markers.map((m) => (
            <button
              key={m.id}
              className="flex items-center gap-2 w-full px-2 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 cursor-pointer"
              onClick={() => handleOverlapSelect(m.id)}
            >
              <span
                className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: m.color }}
              />
              <span className="truncate">{m.typeName}</span>
              <span className="text-zinc-500 ml-auto text-[10px]">
                {formatTimePrecise(m.time / 1000)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function getTickInterval(zoom: number): number {
  const target = 80 / zoom; // ~80px between major ticks
  const intervals = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
  for (const interval of intervals) {
    if (interval >= target) return interval;
  }
  return 600;
}
