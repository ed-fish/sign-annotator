interface KeyboardHintProps {
  keys: string;
  label?: string;
  className?: string;
}

export function KeyboardHint({ keys, label, className = '' }: KeyboardHintProps) {
  const parts = keys.split('+');
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      {parts.map((key, i) => (
        <span key={i}>
          {i > 0 && <span className="text-zinc-500 mx-0.5">+</span>}
          <kbd className="px-1.5 py-0.5 text-xs font-mono bg-surface-2 border border-surface-3 rounded text-zinc-300">
            {key === ' ' ? '␣' : key}
          </kbd>
        </span>
      ))}
      {label && <span className="text-xs text-zinc-500 ml-1">{label}</span>}
    </span>
  );
}
