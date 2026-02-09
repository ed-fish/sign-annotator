/** Format seconds to MM:SS.mmm */
export function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '00:00.000';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const whole = Math.floor(secs);
  const ms = Math.round((secs - whole) * 1000);
  return `${mins.toString().padStart(2, '0')}:${whole.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
}

/** Format seconds to compact MM:SS */
export function formatTimeShort(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/** Convert milliseconds to seconds */
export function msToSec(ms: number): number {
  return ms / 1000;
}

/** Convert seconds to milliseconds */
export function secToMs(sec: number): number {
  return Math.round(sec * 1000);
}

/** Clamp a value between min and max */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Parse a time string (MM:SS.mmm or MM:SS or SS.mmm or SS) to seconds. Returns NaN on failure. */
export function parseTime(input: string): number {
  const trimmed = input.trim();
  // Try MM:SS.mmm or MM:SS
  const colonMatch = trimmed.match(/^(\d+):(\d{1,2})(?:\.(\d{1,3}))?$/);
  if (colonMatch) {
    const mins = parseInt(colonMatch[1], 10);
    const secs = parseInt(colonMatch[2], 10);
    const ms = colonMatch[3] ? parseInt(colonMatch[3].padEnd(3, '0'), 10) : 0;
    return mins * 60 + secs + ms / 1000;
  }
  // Try SS.mmm or plain seconds
  const secMatch = trimmed.match(/^(\d+)(?:\.(\d{1,3}))?$/);
  if (secMatch) {
    const secs = parseInt(secMatch[1], 10);
    const ms = secMatch[2] ? parseInt(secMatch[2].padEnd(3, '0'), 10) : 0;
    return secs + ms / 1000;
  }
  return NaN;
}

/** Format relative time (e.g., "2s ago") */
export function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  if (diff < 1000) return 'just now';
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  return `${Math.floor(diff / 3600000)}h ago`;
}
