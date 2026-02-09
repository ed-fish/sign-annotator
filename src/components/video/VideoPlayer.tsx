import { useRef, useEffect, useCallback, useState } from 'react';
import { useVideoStore } from '../../stores/video-store';
import { useProjectStore } from '../../stores/project-store';
import { useAnnotationStore } from '../../stores/annotation-store';
import { VideoOverlay } from './VideoOverlay';
import { VideoControls } from './VideoControls';

export function VideoPlayer() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const errorHandlerRef = useRef<(() => void) | null>(null);
  const setVideoElement = useVideoStore((s) => s.setVideoElement);
  const currentVideoId = useProjectStore((s) => s.currentVideoId);
  const videos = useProjectStore((s) => s.videos);
  const [videoError, setVideoError] = useState<string | null>(null);

  const currentVideo = videos.find((v) => v.id === currentVideoId);

  // Ref callback — fires exactly when the <video> DOM node mounts/unmounts.
  const videoCallbackRef = useCallback(
    (el: HTMLVideoElement | null) => {
      // Clean up old error listener
      if (videoRef.current && errorHandlerRef.current) {
        videoRef.current.removeEventListener('error', errorHandlerRef.current);
      }

      videoRef.current = el;
      setVideoElement(el);

      // Attach error handler to new element
      if (el) {
        const handler = () => {
          const err = el.error;
          const userMessages: Record<number, string> = {
            1: 'Video loading was cancelled.',
            2: 'Could not load the video file. Check that the file still exists in the original folder.',
            3: 'This video file appears to be corrupted or uses an unsupported codec. Try converting to MP4 (H.264).',
            4: 'This video format is not supported by your browser. Try converting to MP4 (H.264).',
          };
          const message = err ? userMessages[err.code] ?? `Unknown video error (code ${err.code})` : 'Unknown video error';
          setVideoError(message);
          console.error('[DCAL] Video error:', err?.code, err?.message, 'src:', el.src);
        };
        errorHandlerRef.current = handler;
        el.addEventListener('error', handler);
      } else {
        errorHandlerRef.current = null;
      }
    },
    [setVideoElement],
  );

  // Lazy URL creation: create objectUrl on-demand when video is selected
  useEffect(() => {
    if (!currentVideo || currentVideo.objectUrl) return;
    if (!currentVideo.fileHandle) return;
    let cancelled = false;
    const videoId = currentVideo.id;
    currentVideo.fileHandle.getFile().then((file) => {
      if (cancelled) return;
      // Guard: check the video is still current and doesn't already have a URL
      const state = useProjectStore.getState();
      if (state.currentVideoId !== videoId) return;
      const v = state.videos.find((v) => v.id === videoId);
      if (v?.objectUrl) return;
      const url = URL.createObjectURL(file);
      useProjectStore.getState().updateVideoObjectUrl(videoId, url);
    });
    return () => { cancelled = true; };
  }, [currentVideo?.id, currentVideo?.objectUrl, currentVideo?.fileHandle]);

  // Cancel pending marker and revoke objectURLs when switching videos
  const prevVideoIdRef = useRef<string | null>(null);
  useEffect(() => {
    const prevId = prevVideoIdRef.current;
    prevVideoIdRef.current = currentVideoId;
    if (!prevId || prevId === currentVideoId) return;
    // Cancel any pending (unconfirmed) marker from the previous video
    useAnnotationStore.getState().cancelPendingMarker();
    // Revoke the previous video's objectURL to free memory
    const prev = videos.find((v) => v.id === prevId);
    if (prev?.objectUrl) {
      URL.revokeObjectURL(prev.objectUrl);
      useProjectStore.getState().updateVideoObjectUrl(prevId, undefined);
    }
  }, [currentVideoId, videos]);

  // Update video source when current video changes
  useEffect(() => {
    const el = videoRef.current;
    if (el && currentVideo?.objectUrl) {
      setVideoError(null);
      // Reset playback state before loading new source
      useVideoStore.getState().setCurrentTime(0);
      el.src = currentVideo.objectUrl;
      el.load();
    }
  }, [currentVideo?.objectUrl]);

  if (!currentVideo) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex-1 flex items-center justify-center bg-black">
          <div className="text-center text-zinc-600">
            <div className="text-4xl mb-3">🎬</div>
            <div className="text-sm">Open a folder to start annotating</div>
            <div className="text-xs mt-1 text-zinc-700">
              Click "Open Folder" or drag a folder of videos
            </div>
          </div>
        </div>
        <VideoControls />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 relative bg-black flex items-center justify-center overflow-hidden">
        <video
          ref={videoCallbackRef}
          className="max-h-full max-w-full object-contain"
          preload="metadata"
          playsInline
        />
        {videoError && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80">
            <div className="text-center max-w-md px-4">
              <div className="text-red-400 text-sm font-medium mb-2">Video playback error</div>
              <div className="text-zinc-300 text-sm">{videoError}</div>
              <button
                onClick={() => {
                  setVideoError(null);
                  const el = videoRef.current;
                  if (el && currentVideo?.objectUrl) {
                    el.src = currentVideo.objectUrl;
                    el.load();
                  }
                }}
                className="mt-3 px-3 py-1 text-xs bg-surface-2 hover:bg-surface-3 text-zinc-300 rounded border border-surface-3 transition-colors"
              >
                Retry
              </button>
            </div>
          </div>
        )}
        <VideoOverlay />
      </div>
      <VideoControls />
    </div>
  );
}
