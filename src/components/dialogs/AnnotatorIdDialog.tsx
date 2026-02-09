import { useState } from 'react';
import { useSettingsStore } from '../../stores/settings-store';

export function AnnotatorIdDialog() {
  const setAnnotatorId = useSettingsStore((s) => s.setAnnotatorId);
  const [value, setValue] = useState('');

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (trimmed) {
      setAnnotatorId(trimmed);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative bg-surface-1 border border-surface-3 rounded-lg shadow-2xl w-[400px]">
        <div className="px-4 py-3 border-b border-surface-3">
          <h2 className="text-sm font-semibold text-zinc-200">Welcome to DCAL Annotator</h2>
        </div>
        <div className="p-4 space-y-4">
          <p className="text-xs text-zinc-400">
            Please enter your name or initials. This will be embedded in exported annotation files as the author ID.
          </p>
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSubmit();
            }}
            placeholder="e.g. JSmith"
            autoFocus
            className="w-full px-3 py-2 bg-surface-2 border border-surface-3 rounded text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-accent"
          />
          <button
            onClick={handleSubmit}
            disabled={!value.trim()}
            className="w-full py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white text-sm rounded transition-colors"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
