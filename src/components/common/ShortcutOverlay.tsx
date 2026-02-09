import { useEffect } from 'react';
import { useSettingsStore } from '../../stores/settings-store';

interface ShortcutOverlayProps {
  onClose: () => void;
}

export function ShortcutOverlay({ onClose }: ShortcutOverlayProps) {
  const shortcuts = useSettingsStore((s) => s.shortcuts);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === '?') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const formatKey = (b: { key: string; ctrl?: boolean; shift?: boolean; alt?: boolean }): string => {
    const parts: string[] = [];
    if (b.ctrl) parts.push('Ctrl');
    if (b.shift) parts.push('Shift');
    if (b.alt) parts.push('Alt');
    parts.push(b.key === ' ' ? 'Space' : b.key);
    return parts.join(' + ');
  };

  const categories = [
    { id: 'playback', label: 'Playback' },
    { id: 'annotation', label: 'Annotation' },
    { id: 'editing', label: 'Editing' },
    { id: 'navigation', label: 'Navigation' },
    { id: 'general', label: 'General' },
  ] as const;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={onClose}
    >
      <div
        className="bg-surface-1 border border-surface-3 rounded-xl shadow-2xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Keyboard shortcuts"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-3 sticky top-0 bg-surface-1 z-10">
          <h2 className="text-base font-semibold text-zinc-200">Keyboard Shortcuts</h2>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-200 transition-colors text-lg"
            aria-label="Close shortcuts overlay"
          >
            ×
          </button>
        </div>

        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-6">
          {categories.map(({ id, label }) => {
            const bindings = shortcuts.filter((s) => s.category === id);
            if (bindings.length === 0) return null;
            return (
              <div key={id}>
                <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">
                  {label}
                </h3>
                <div className="space-y-1">
                  {bindings.map((binding) => (
                    <div
                      key={binding.id}
                      className="flex items-center justify-between py-1"
                    >
                      <span className="text-xs text-zinc-300">{binding.description}</span>
                      <kbd className="ml-3 px-2 py-0.5 text-xs font-mono bg-surface-2 border border-surface-3 rounded text-zinc-400 shrink-0">
                        {formatKey(binding)}
                      </kbd>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="px-5 py-3 border-t border-surface-3">
          <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">
            Hold Mode
          </h3>
          <div className="text-xs text-zinc-400 space-y-1">
            <p>While the video is playing, <strong className="text-zinc-300">press and hold</strong> a type key to mark duration as a span. Release places the end marker.</p>
            <p>Holding a <strong className="text-zinc-300">start-type</strong> key (e.g. <kbd className="px-1 py-0.5 bg-surface-2 border border-surface-3 rounded font-mono">s</kbd>) creates a new span from that point.</p>
            <p>Holding an <strong className="text-zinc-300">end-type</strong> key (e.g. <kbd className="px-1 py-0.5 bg-surface-2 border border-surface-3 rounded font-mono">e</kbd>) extends the last span on the active tier.</p>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-surface-3">
          <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">
            Timeline (Mouse)
          </h3>
          <div className="text-xs text-zinc-400 space-y-1">
            <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
              <span className="text-zinc-500">Click ruler</span><span>Seek to time</span>
              <span className="text-zinc-500">Drag ruler</span><span>Scrub through video</span>
              <span className="text-zinc-500">Marker top-half drag</span><span>Create span / resize edge</span>
              <span className="text-zinc-500">Marker bottom-half drag</span><span>Move marker</span>
              <span className="text-zinc-500">Span edge drag</span><span>Resize span (snap to merge)</span>
              <span className="text-zinc-500">Span middle drag</span><span>Move entire span</span>
              <span className="text-zinc-500">Empty area drag</span><span>Draw new span</span>
              <span className="text-zinc-500">Double-click span</span><span>Edit gloss</span>
              <span className="text-zinc-500">Ctrl + Scroll</span><span>Zoom (cursor-relative)</span>
            </div>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-surface-3 text-xs text-zinc-500 text-center">
          Press <kbd className="px-1.5 py-0.5 bg-surface-2 border border-surface-3 rounded font-mono">?</kbd> or <kbd className="px-1.5 py-0.5 bg-surface-2 border border-surface-3 rounded font-mono">Esc</kbd> to close
        </div>
      </div>
    </div>
  );
}
