import { useVideoStore } from '../../stores/video-store';
import { useProjectStore } from '../../stores/project-store';
import { useAnnotationStore } from '../../stores/annotation-store';
import { useSettingsStore } from '../../stores/settings-store';
import { formatTime, formatRelativeTime } from '../../utils/time';

export function StatusBar() {
  const currentTime = useVideoStore((s) => s.currentTime);
  const playbackRate = useVideoStore((s) => s.playbackRate);
  const isPlaying = useVideoStore((s) => s.isPlaying);
  const detectedFps = useVideoStore((s) => s.detectedFps);
  const videos = useProjectStore((s) => s.videos);
  const currentVideoId = useProjectStore((s) => s.currentVideoId);
  const lastSavedAt = useProjectStore((s) => s.lastSavedAt);
  const pendingMarkerId = useAnnotationStore((s) => s.pendingMarkerId);
  const markers = useAnnotationStore((s) => s.markers);
  const elanTiers = useAnnotationStore((s) => s.elanTiers);
  const showElan = useAnnotationStore((s) => s.showElanAnnotations);
  const toggleShowElan = useAnnotationStore((s) => s.toggleShowElan);
  const annotatorId = useSettingsStore((s) => s.annotatorId);
  const activeTierId = useSettingsStore((s) => s.activeTierId);
  const tiers = useSettingsStore((s) => s.tiers);

  const doneCount = videos.filter((v) => v.status === 'done').length;
  const currentIdx = videos.findIndex((v) => v.id === currentVideoId);
  const confirmedCount = markers.filter((m) => m.confirmed && m.videoId === currentVideoId).length;
  const activeTier = tiers.find((t) => t.id === activeTierId);

  return (
    <footer className="h-8 bg-surface-1 border-t border-surface-3 flex items-center px-3 gap-4 text-sm text-zinc-400 shrink-0 select-none overflow-hidden whitespace-nowrap">
      <span className="font-mono tabular-nums shrink-0">{formatTime(currentTime)}</span>
      <span className="shrink-0">{playbackRate}x</span>
      {detectedFps && <span className="text-zinc-500 shrink-0 hidden sm:inline">{detectedFps}fps</span>}
      {isPlaying && (
        <span className="text-green-400 shrink-0">
          <svg width="10" height="10" viewBox="0 0 14 14" fill="currentColor"><path d="M3 1.5a.5.5 0 01.76-.43l9 5.5a.5.5 0 010 .86l-9 5.5A.5.5 0 013 12.5v-11z"/></svg>
        </span>
      )}
      {!isPlaying && (
        <span className="text-zinc-500 shrink-0">
          <svg width="10" height="10" viewBox="0 0 14 14" fill="currentColor"><rect x="2" y="1" width="3.5" height="12" rx="1"/><rect x="8.5" y="1" width="3.5" height="12" rx="1"/></svg>
        </span>
      )}

      {pendingMarkerId && (
        <span className="text-amber-400 animate-pulse shrink-0">
          ● Waiting for type key...
        </span>
      )}

      {activeTier && (
        <span className="flex items-center gap-1.5 shrink-0 min-w-0">
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: activeTier.color }}
          />
          <span className="text-zinc-300 truncate max-w-[120px]">{activeTier.name}</span>
        </span>
      )}

      <div className="flex-1 min-w-0" />

      {elanTiers.length > 0 && (
        <button
          onClick={toggleShowElan}
          className={`text-xs font-mono px-1.5 py-0.5 rounded transition-colors shrink-0 ${
            showElan ? 'text-amber-400 bg-amber-400/10' : 'text-zinc-500 hover:text-zinc-400'
          }`}
          title={showElan ? 'Hide ELAN annotations' : 'Show ELAN annotations'}
          aria-label={showElan ? 'Hide ELAN annotations' : 'Show ELAN annotations'}
        >
          ELAN
        </button>
      )}

      {currentVideoId && (
        <span className="shrink-0">{confirmedCount} marker{confirmedCount !== 1 ? 's' : ''}</span>
      )}

      {lastSavedAt && (
        <span className="shrink-0">Saved {formatRelativeTime(lastSavedAt)}</span>
      )}

      {videos.length > 0 && (
        <span className="shrink-0">
          Video {currentIdx + 1}/{videos.length} · {doneCount} done
        </span>
      )}

      {annotatorId && (
        <span className="text-zinc-500 shrink-0 hidden sm:inline">{annotatorId}</span>
      )}
    </footer>
  );
}
