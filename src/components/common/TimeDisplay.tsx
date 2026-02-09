import { formatTime } from '../../utils/time';

interface TimeDisplayProps {
  seconds: number;
  className?: string;
}

export function TimeDisplay({ seconds, className = '' }: TimeDisplayProps) {
  return (
    <span className={`font-mono text-sm tabular-nums ${className}`}>
      {formatTime(seconds)}
    </span>
  );
}
