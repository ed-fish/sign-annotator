import { useEffect, useRef } from 'react';
import { useVideoStore } from '../stores/video-store';
import { useProjectStore } from '../stores/project-store';

export function useVideoPlayback() {
  const videoElement = useVideoStore((s) => s.videoElement);
  const setCurrentTime = useVideoStore((s) => s.setCurrentTime);
  const setDuration = useVideoStore((s) => s.setDuration);
  const syncPlaying = useVideoStore((s) => s.syncPlaying);
  const setDetectedFps = useVideoStore((s) => s.setDetectedFps);
  const loopStart = useVideoStore((s) => s.loopStart);
  const loopEnd = useVideoStore((s) => s.loopEnd);
  const loopEnabled = useVideoStore((s) => s.loopEnabled);
  const animFrameRef = useRef<number>(0);
  const rvfcHandleRef = useRef<number | null>(null);
  const frameTimesRef = useRef<number[]>([]);
  const fpsDetectedRef = useRef(false);

  // Time update via requestAnimationFrame for smooth playhead
  useEffect(() => {
    if (!videoElement) return;

    const startLoop = () => {
      // Always cancel any existing RAF before starting a new one to prevent stacking
      cancelAnimationFrame(animFrameRef.current);
      const update = () => {
        setCurrentTime(videoElement.currentTime);

        // Loop region check
        if (loopEnabled && loopStart !== null && loopEnd !== null) {
          if (videoElement.currentTime >= loopEnd) {
            videoElement.currentTime = loopStart;
          }
        }

        animFrameRef.current = requestAnimationFrame(update);
      };
      animFrameRef.current = requestAnimationFrame(update);
    };

    const stopLoop = () => {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = 0;
    };

    const onPlay = () => {
      syncPlaying(true);
      startLoop();
    };
    const onPause = () => {
      syncPlaying(false);
      stopLoop();
    };
    const onLoadedMetadata = () => {
      setDuration(videoElement.duration);
      setDetectedFps(null);
      frameTimesRef.current = [];
      fpsDetectedRef.current = false;
      const currentVideoId = useProjectStore.getState().currentVideoId;
      if (currentVideoId) {
        useProjectStore.getState().updateVideoDuration(currentVideoId, videoElement.duration);
      }
    };
    const onEnded = () => {
      syncPlaying(false);
      stopLoop();
    };
    // el.load() aborts playback — cancel the RAF loop to prevent orphaned loops
    const onEmptied = () => {
      stopLoop();
    };

    videoElement.addEventListener('play', onPlay);
    videoElement.addEventListener('pause', onPause);
    videoElement.addEventListener('loadedmetadata', onLoadedMetadata);
    videoElement.addEventListener('ended', onEnded);
    videoElement.addEventListener('emptied', onEmptied);

    // If already playing when the effect mounts (e.g. after dep change), start the loop
    if (!videoElement.paused) {
      startLoop();
    }

    return () => {
      stopLoop();
      videoElement.removeEventListener('play', onPlay);
      videoElement.removeEventListener('pause', onPause);
      videoElement.removeEventListener('loadedmetadata', onLoadedMetadata);
      videoElement.removeEventListener('ended', onEnded);
      videoElement.removeEventListener('emptied', onEmptied);
    };
  }, [videoElement, setCurrentTime, setDuration, syncPlaying, setDetectedFps, loopEnabled, loopStart, loopEnd]);

  // FPS detection via requestVideoFrameCallback
  useEffect(() => {
    if (!videoElement) return;
    if (!('requestVideoFrameCallback' in videoElement)) return;

    const startRvfc = () => {
      // Cancel any existing callback before starting a new chain
      if (rvfcHandleRef.current !== null) {
        videoElement.cancelVideoFrameCallback(rvfcHandleRef.current);
        rvfcHandleRef.current = null;
      }

      const onFrame = (_now: DOMHighResTimeStamp, metadata: VideoFrameCallbackMetadata) => {
        if (fpsDetectedRef.current) {
          rvfcHandleRef.current = null;
          return;
        }

        frameTimesRef.current.push(metadata.mediaTime);

        if (frameTimesRef.current.length >= 12) {
          // Compute deltas between consecutive media times
          const times = frameTimesRef.current;
          const deltas: number[] = [];
          for (let i = 1; i < times.length; i++) {
            const d = times[i] - times[i - 1];
            if (d > 0) deltas.push(d);
          }
          if (deltas.length >= 8) {
            // Use median delta for robustness
            deltas.sort((a, b) => a - b);
            const median = deltas[Math.floor(deltas.length / 2)];
            const fps = Math.round(1 / median);
            // Sanity check: common frame rates
            if (fps >= 10 && fps <= 120) {
              setDetectedFps(fps);
              fpsDetectedRef.current = true;
              rvfcHandleRef.current = null;
              return; // Stop collecting
            }
          }
        }

        // Keep collecting
        rvfcHandleRef.current = videoElement.requestVideoFrameCallback(onFrame);
      };

      rvfcHandleRef.current = videoElement.requestVideoFrameCallback(onFrame);
    };

    // Restart FPS detection when a new video source loads (same element, new source)
    const onLoadedMetadata = () => {
      frameTimesRef.current = [];
      fpsDetectedRef.current = false;
      startRvfc();
    };

    videoElement.addEventListener('loadedmetadata', onLoadedMetadata);
    startRvfc();

    return () => {
      if (rvfcHandleRef.current !== null) {
        videoElement.cancelVideoFrameCallback(rvfcHandleRef.current);
        rvfcHandleRef.current = null;
      }
      videoElement.removeEventListener('loadedmetadata', onLoadedMetadata);
    };
  }, [videoElement, setDetectedFps]);

  return null;
}
