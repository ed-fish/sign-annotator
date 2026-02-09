import { useState, useRef, useCallback } from 'react';
import { useVideoStore } from '../../stores/video-store';
import { PLAYBACK_SPEEDS } from '../../constants/theme';
import { TimeDisplay } from '../common/TimeDisplay';
import { formatTime, parseTime } from '../../utils/time';

export function VideoControls() {
  const isPlaying = useVideoStore((s) => s.isPlaying);
  const togglePlay = useVideoStore((s) => s.togglePlay);
  const currentTime = useVideoStore((s) => s.currentTime);
  const duration = useVideoStore((s) => s.duration);
  const playbackRate = useVideoStore((s) => s.playbackRate);
  const setPlaybackRate = useVideoStore((s) => s.setPlaybackRate);
  const cycleSpeed = useVideoStore((s) => s.cycleSpeed);
  const frameStep = useVideoStore((s) => s.frameStep);
  const seek = useVideoStore((s) => s.seek);
  const volume = useVideoStore((s) => s.volume);
  const setVolume = useVideoStore((s) => s.setVolume);

  const [speedOpen, setSpeedOpen] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [prevVolume, setPrevVolume] = useState(1);
  const [editingTime, setEditingTime] = useState(false);
  const [timeInput, setTimeInput] = useState('');
  const timeInputRef = useRef<HTMLInputElement>(undefined);
  const progressRef = useRef<HTMLDivElement>(undefined);
  const isDraggingRef = useRef(false);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const seekToPosition = useCallback((clientX: number) => {
    const el = progressRef.current;
    if (!el || duration <= 0) return;
    const rect = el.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    seek(ratio * duration);
  }, [duration, seek]);

  const handleProgressMouseDown = useCallback((e: React.MouseEvent) => {
    isDraggingRef.current = true;
    seekToPosition(e.clientX);

    const handleMouseMove = (ev: MouseEvent) => {
      if (isDraggingRef.current) seekToPosition(ev.clientX);
    };
    const handleMouseUp = () => {
      isDraggingRef.current = false;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [seekToPosition]);

  const toggleMute = useCallback(() => {
    if (isMuted) {
      setVolume(prevVolume);
      setIsMuted(false);
    } else {
      setPrevVolume(volume);
      setVolume(0);
      setIsMuted(true);
    }
  }, [isMuted, volume, prevVolume, setVolume]);

  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    setVolume(v);
    if (v > 0 && isMuted) setIsMuted(false);
    if (v === 0) setIsMuted(true);
  }, [setVolume, isMuted]);

  return (
    <div className="bg-surface-2 border-t border-surface-3">
      {/* Progress / scrub bar */}
      <div
        ref={progressRef}
        className="h-2 bg-surface-1 cursor-pointer group relative"
        onMouseDown={handleProgressMouseDown}
      >
        <div
          className="h-full bg-accent transition-[width] duration-75"
          style={{ width: `${progress}%` }}
        />
        {/* Thumb */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white shadow opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
          style={{ left: `calc(${progress}% - 6px)` }}
        />
      </div>

      {/* Controls row */}
      <div className="h-10 flex items-center px-3 gap-2">
        <button
          onClick={togglePlay}
          className="text-zinc-300 hover:text-white transition-colors text-sm w-6"
          title={isPlaying ? 'Pause' : 'Play'}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="2" y="1" width="3.5" height="12" rx="1"/><rect x="8.5" y="1" width="3.5" height="12" rx="1"/></svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><path d="M3 1.5a.5.5 0 01.76-.43l9 5.5a.5.5 0 010 .86l-9 5.5A.5.5 0 013 12.5v-11z"/></svg>
          )}
        </button>

        <button
          onClick={() => frameStep(-1)}
          className="text-zinc-400 hover:text-zinc-200 transition-colors text-sm"
          title="Frame backward (,)"
          aria-label="Previous frame"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="1" y="2" width="2" height="10" rx="0.5"/><path d="M4 7.43a.5.5 0 010-.86l7-4.28a.5.5 0 01.75.43v8.56a.5.5 0 01-.75.43l-7-4.28z"/></svg>
        </button>
        <button
          onClick={() => frameStep(1)}
          className="text-zinc-400 hover:text-zinc-200 transition-colors text-sm"
          title="Frame forward (.)"
          aria-label="Next frame"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="11" y="2" width="2" height="10" rx="0.5"/><path d="M10 7.43a.5.5 0 000-.86l-7-4.28A.5.5 0 002.25 2.72v8.56a.5.5 0 00.75.43l7-4.28z"/></svg>
        </button>

        {/* Compact speed control */}
        <div
          className="relative"
          onMouseEnter={() => setSpeedOpen(true)}
          onMouseLeave={() => setSpeedOpen(false)}
        >
          <button
            onClick={() => cycleSpeed(1)}
            className="px-2 py-0.5 text-sm rounded bg-surface-3 text-zinc-300 hover:text-white transition-colors tabular-nums"
            title="Click to cycle speed, hover for menu"
          >
            {playbackRate}x
          </button>
          {speedOpen && (
            <div className="absolute bottom-full left-0 mb-1 bg-surface-2 border border-surface-3 rounded shadow-lg py-1 z-20 min-w-[56px]">
              {PLAYBACK_SPEEDS.map((speed) => (
                <button
                  key={speed}
                  onClick={() => {
                    setPlaybackRate(speed);
                    setSpeedOpen(false);
                  }}
                  className={`block w-full text-left px-3 py-0.5 text-sm transition-colors tabular-nums ${
                    playbackRate === speed
                      ? 'bg-accent text-white'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-surface-3'
                  }`}
                >
                  {speed}x
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Volume control */}
        <div className="flex items-center gap-1">
          <button
            onClick={toggleMute}
            className="text-zinc-400 hover:text-zinc-200 transition-colors text-sm w-5"
            title={isMuted ? 'Unmute' : 'Mute'}
            aria-label={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted || volume === 0 ? (
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M7 2.5a.5.5 0 01.82.38v10.24a.5.5 0 01-.82.38L3.56 10.5H1.5A1.5 1.5 0 010 9V7a1.5 1.5 0 011.5-1.5h2.06L7 2.5z"/><path d="M11.35 4.65a.5.5 0 01.7 0 .5.5 0 010 .7L10.42 7l1.63 1.65a.5.5 0 01-.7.7L9.72 7.72l-1.63 1.63a.5.5 0 01-.7-.7L8.98 7 7.35 5.35a.5.5 0 01.7-.7L9.72 6.3l1.63-1.65z"/></svg>
            ) : volume < 0.5 ? (
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M7 2.5a.5.5 0 01.82.38v10.24a.5.5 0 01-.82.38L3.56 10.5H1.5A1.5 1.5 0 010 9V7a1.5 1.5 0 011.5-1.5h2.06L7 2.5z"/><path d="M10 5.5a3 3 0 010 5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/></svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M7 2.5a.5.5 0 01.82.38v10.24a.5.5 0 01-.82.38L3.56 10.5H1.5A1.5 1.5 0 010 9V7a1.5 1.5 0 011.5-1.5h2.06L7 2.5z"/><path d="M10 5.5a3 3 0 010 5M12 3.5a6 6 0 010 9" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/></svg>
            )}
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={isMuted ? 0 : volume}
            onChange={handleVolumeChange}
            className="w-16 h-1 accent-accent cursor-pointer"
            title={`Volume: ${Math.round((isMuted ? 0 : volume) * 100)}%`}
          />
        </div>

        <div className="flex-1" />

        {editingTime ? (
          <input
            ref={timeInputRef}
            type="text"
            value={timeInput}
            onChange={(e) => setTimeInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const parsed = parseTime(timeInput);
                if (!isNaN(parsed) && parsed >= 0 && parsed <= duration) {
                  seek(parsed);
                }
                setEditingTime(false);
                e.stopPropagation();
              }
              if (e.key === 'Escape') {
                setEditingTime(false);
                e.stopPropagation();
              }
              e.stopPropagation();
            }}
            onBlur={() => setEditingTime(false)}
            autoFocus
            className="w-24 bg-surface-3 text-zinc-200 text-sm font-mono tabular-nums px-1 py-0.5 rounded border border-accent outline-none text-center"
            placeholder="MM:SS.mmm"
          />
        ) : (
          <button
            onClick={() => {
              setTimeInput(formatTime(currentTime));
              setEditingTime(true);
            }}
            className="cursor-text hover:bg-surface-3 rounded px-0.5 transition-colors"
            title="Click to type a time and seek"
          >
            <TimeDisplay seconds={currentTime} className="text-zinc-300" />
          </button>
        )}
        <span className="text-zinc-500">/</span>
        <TimeDisplay seconds={duration} className="text-zinc-400" />
      </div>
    </div>
  );
}
