interface ProgressBadgeProps {
  status: 'pending' | 'in-progress' | 'done';
}

export function ProgressBadge({ status }: ProgressBadgeProps) {
  if (status === 'done') {
    return (
      <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-green-900/50 text-green-400 text-xs font-bold">
        ✓
      </span>
    );
  }
  if (status === 'in-progress') {
    return (
      <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-amber-900/50 text-amber-400 text-xs">
        ◐
      </span>
    );
  }
  return (
    <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-zinc-700 text-zinc-400 text-xs">
      ○
    </span>
  );
}
