import { create } from 'zustand';
import { PLAYBACK_SPEEDS } from '../constants/theme';
import { clamp } from '../utils/time';

// Module-level ref — always holds the current <video> element.
// Bypasses React effect lifecycle timing so store methods never see a stale null.
let _videoEl: HTMLVideoElement | null = null;

export function getVideoElement(): HTMLVideoElement | null {
  return _videoEl;
}

interface VideoState {
  isPlaying: boolean;
  currentTime: number; // seconds
  duration: number;
  playbackRate: number;
  volume: number;
  loopStart: number | null;
  loopEnd: number | null;
  loopEnabled: boolean;
  videoElement: HTMLVideoElement | null;
  detectedFps: number | null;

  setVideoElement: (el: HTMLVideoElement | null) => void;
  setDetectedFps: (fps: number | null) => void;
  setPlaying: (playing: boolean) => void;
  /** Sync isPlaying state from browser events without triggering play/pause */
  syncPlaying: (playing: boolean) => void;
  togglePlay: () => void;
  setCurrentTime: (time: number) => void;
  seek: (time: number) => void;
  seekRelative: (delta: number) => void;
  setDuration: (duration: number) => void;
  setPlaybackRate: (rate: number) => void;
  cycleSpeed: (direction: 1 | -1) => void;
  setVolume: (volume: number) => void;
  setLoop: (start: number | null, end: number | null) => void;
  toggleLoop: () => void;
  frameStep: (direction: 1 | -1) => void;
}

export const useVideoStore = create<VideoState>((set, get) => ({
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  playbackRate: 1,
  volume: 1,
  loopStart: null,
  loopEnd: null,
  loopEnabled: false,
  videoElement: null,
  detectedFps: null,

  setVideoElement: (el) => {
    // When replacing with a different element, pause the old one to stop decoding
    if (_videoEl && _videoEl !== el) {
      _videoEl.pause();
    }
    _videoEl = el;
    set({ videoElement: el });
  },
  setDetectedFps: (fps) => set({ detectedFps: fps }),

  // syncPlaying: called from browser event handlers (onPlay/onPause) to sync state only
  syncPlaying: (playing) => set({ isPlaying: playing }),

  // setPlaying: called by user actions — actually triggers play/pause on the element
  setPlaying: (playing) => {
    const el = _videoEl;
    if (!el) return;
    if (playing) {
      el.play().then(() => {
        set({ isPlaying: true });
      }).catch((err) => {
        // AbortError is expected when toggling play/pause quickly — suppress it
        if (err.name !== 'AbortError') {
          console.warn('[DCAL] play() rejected:', err.name, err.message);
        }
        set({ isPlaying: false });
      });
    } else {
      el.pause();
      set({ isPlaying: false });
    }
  },

  togglePlay: () => {
    const el = _videoEl;
    if (!el) return;
    if (get().isPlaying) {
      el.pause();
      set({ isPlaying: false });
    } else {
      el.play().then(() => {
        set({ isPlaying: true });
      }).catch((err) => {
        // AbortError is expected when toggling play/pause quickly — suppress it
        if (err.name !== 'AbortError') {
          console.warn('[DCAL] play() rejected:', err.name, err.message);
        }
        set({ isPlaying: false });
      });
    }
  },

  setCurrentTime: (time) => set({ currentTime: time }),
  seek: (time) => {
    const el = _videoEl;
    const clamped = clamp(time, 0, get().duration);
    if (el) el.currentTime = clamped;
    set({ currentTime: clamped });
  },
  seekRelative: (delta) => {
    const { currentTime, duration } = get();
    const newTime = clamp(currentTime + delta, 0, duration);
    if (_videoEl) _videoEl.currentTime = newTime;
    set({ currentTime: newTime });
  },
  setDuration: (duration) => set({ duration }),
  setPlaybackRate: (rate) => {
    if (_videoEl) _videoEl.playbackRate = rate;
    set({ playbackRate: rate });
  },
  cycleSpeed: (direction) => {
    const { playbackRate } = get();
    const idx = PLAYBACK_SPEEDS.indexOf(playbackRate);
    const newIdx = clamp(idx + direction, 0, PLAYBACK_SPEEDS.length - 1);
    const newRate = PLAYBACK_SPEEDS[newIdx];
    if (_videoEl) _videoEl.playbackRate = newRate;
    set({ playbackRate: newRate });
  },
  setVolume: (volume) => {
    if (_videoEl) _videoEl.volume = volume;
    set({ volume });
  },
  setLoop: (start, end) => set({ loopStart: start, loopEnd: end }),
  toggleLoop: () => set((s) => ({ loopEnabled: !s.loopEnabled })),
  frameStep: (direction) => {
    const el = _videoEl;
    if (!el) return;
    if (get().isPlaying) {
      el.pause();
      set({ isPlaying: false });
    }
    const fps = get().detectedFps ?? 30;
    const step = direction * (1 / fps);
    const newTime = clamp(el.currentTime + step, 0, get().duration);
    el.currentTime = newTime;
    set({ currentTime: newTime });
  },
}));
