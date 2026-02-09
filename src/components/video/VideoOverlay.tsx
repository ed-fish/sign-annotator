import { useUiStore } from '../../stores/ui-store';
import { useAnnotationStore } from '../../stores/annotation-store';
import { useSettingsStore } from '../../stores/settings-store';
import { useVideoStore } from '../../stores/video-store';

export function VideoOverlay() {
  const flashColor = useUiStore((s) => s.flashColor);
  const isPlaying = useVideoStore((s) => s.isPlaying);
  const pendingMarkerId = useAnnotationStore((s) => s.pendingMarkerId);
  const markers = useAnnotationStore((s) => s.markers);
  const markerTypes = useSettingsStore((s) => s.markerTypes);
  const tiers = useSettingsStore((s) => s.tiers);
  const activeTierId = useSettingsStore((s) => s.activeTierId);

  // Determine which tier's types to show
  const pendingMarker = pendingMarkerId ? markers.find((m) => m.id === pendingMarkerId) : null;
  const pendingTier = pendingMarker ? tiers.find((t) => t.id === pendingMarker.tierId) : null;
  const tierName = pendingTier?.name ?? tiers.find((t) => t.id === activeTierId)?.name ?? '';
  const allowedTypeIds = new Set(pendingTier?.markerTypes ?? []);
  const filteredTypes = pendingTier
    ? markerTypes.filter((mt) => allowedTypeIds.has(mt.id))
    : markerTypes;

  return (
    <>
      {/* Flash overlay on marker placement */}
      {flashColor && (
        <div
          className="absolute inset-0 pointer-events-none marker-flash"
          style={{ backgroundColor: flashColor }}
        />
      )}

      {/* Pending marker hint — hidden during playback */}
      {pendingMarkerId && !isPlaying && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/80 backdrop-blur-sm rounded-lg px-4 py-2 pointer-events-none">
          <div className="text-amber-400 text-sm font-medium text-center mb-1">
            {tierName}: Press a key to set marker type
          </div>
          {filteredTypes.length > 0 ? (
            <div className="flex gap-2 justify-center flex-wrap">
              {filteredTypes.map((mt) => (
                <span key={mt.id} className="inline-flex items-center gap-1 text-sm">
                  <kbd className="px-1.5 py-0.5 bg-zinc-800 border border-zinc-600 rounded font-mono text-zinc-200">
                    {mt.key}
                  </kbd>
                  <span style={{ color: mt.color }}>{mt.name}</span>
                </span>
              ))}
            </div>
          ) : (
            <div className="text-zinc-400 text-xs text-center">
              No marker types assigned to this tier.
              <br />
              Configure in Tier Settings.
            </div>
          )}
          <div className="text-zinc-400 text-xs text-center mt-1">
            ←→ nudge · ` switch tier · Esc cancel
          </div>
        </div>
      )}
    </>
  );
}
