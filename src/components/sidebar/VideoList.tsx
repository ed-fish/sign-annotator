import { useState, useMemo } from 'react';
import { useProjectStore } from '../../stores/project-store';
import { useAnnotationStore } from '../../stores/annotation-store';
import { ProgressBadge } from '../common/ProgressBadge';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { formatTimeShort } from '../../utils/time';

type SortKey = 'name' | 'duration' | 'markers' | 'status';

export function VideoList() {
  const videos = useProjectStore((s) => s.videos);
  const currentVideoId = useProjectStore((s) => s.currentVideoId);
  const setCurrentVideo = useProjectStore((s) => s.setCurrentVideo);
  const removeVideo = useProjectStore((s) => s.removeVideo);
  const removeAllVideos = useProjectStore((s) => s.removeAllVideos);
  const markers = useAnnotationStore((s) => s.markers);

  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Count confirmed markers per video
  const markerCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of markers) {
      if (m.confirmed) {
        counts.set(m.videoId, (counts.get(m.videoId) ?? 0) + 1);
      }
    }
    return counts;
  }, [markers]);

  const sortedVideos = useMemo(() => {
    const sorted = [...videos];
    switch (sortKey) {
      case 'name':
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'duration':
        sorted.sort((a, b) => a.duration - b.duration);
        break;
      case 'markers':
        sorted.sort((a, b) => (markerCounts.get(b.id) ?? 0) - (markerCounts.get(a.id) ?? 0));
        break;
      case 'status':
        sorted.sort((a, b) => {
          const order = { done: 0, 'in-progress': 1, pending: 2 };
          return (order[a.status as keyof typeof order] ?? 2) - (order[b.status as keyof typeof order] ?? 2);
        });
        break;
    }
    return sorted;
  }, [videos, sortKey, markerCounts]);

  if (videos.length === 0) {
    return (
      <div className="p-4 text-sm text-zinc-500 text-center">
        No videos loaded
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="px-3 py-1.5 flex items-center justify-between border-b border-surface-3">
        <span className="text-xs text-zinc-500">
          {videos.length} video{videos.length !== 1 ? 's' : ''}
        </span>
        <div className="flex items-center gap-2">
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="text-xs bg-surface-2 text-zinc-400 border border-surface-3 rounded px-1 py-0.5 focus:outline-none"
            title="Sort videos"
          >
            <option value="name">Name</option>
            <option value="duration">Duration</option>
            <option value="markers">Markers</option>
            <option value="status">Status</option>
          </select>
          <button
            onClick={() => setShowClearConfirm(true)}
            className="text-xs text-zinc-500 hover:text-red-400 transition-colors"
            title="Remove all videos from list"
          >
            Clear All
          </button>
        </div>
      </div>
      {showClearConfirm && (
        <ConfirmDialog
          message={`Remove all ${videos.length} videos from the list?`}
          detail="The video files on disk will not be deleted. Any unsaved annotations may be lost."
          confirmLabel="Clear All"
          onConfirm={() => { removeAllVideos(); setShowClearConfirm(false); }}
          onCancel={() => setShowClearConfirm(false)}
          destructive
        />
      )}
      {sortedVideos.map((video, idx) => {
        const count = markerCounts.get(video.id) ?? 0;
        return (
          <div
            key={video.id}
            className={`group flex items-center gap-2 px-3 py-2 text-sm transition-colors cursor-pointer ${
              video.id === currentVideoId
                ? 'bg-accent/20 text-zinc-100 border-l-2 border-accent'
                : 'text-zinc-400 hover:bg-surface-2 hover:text-zinc-200 border-l-2 border-transparent'
            }`}
            onClick={() => setCurrentVideo(video.id)}
          >
            <ProgressBadge status={video.status} />
            <div className="flex-1 min-w-0">
              <div className="truncate text-sm">
                {video.name}
                {(video.eafPath || video.eafHandle) && (
                  <span className="text-xs text-amber-500 font-mono ml-1" title="ELAN annotations available">EAF</span>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                {video.duration > 0 && <span>{formatTimeShort(video.duration)}</span>}
                {count > 0 && (
                  <span title={`${count} confirmed marker${count !== 1 ? 's' : ''}`}>
                    {count} mkr{count !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </div>
            <span className="text-xs text-zinc-500 group-hover:hidden">{idx + 1}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                removeVideo(video.id);
              }}
              className="hidden group-hover:block text-xs text-zinc-500 hover:text-red-400 transition-colors px-1"
              title="Remove from list"
              aria-label={`Remove ${video.name} from list`}
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}
