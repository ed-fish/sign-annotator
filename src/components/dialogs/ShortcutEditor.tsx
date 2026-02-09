import { useState } from 'react';
import { DialogShell } from './DialogShell';
import { useUiStore } from '../../stores/ui-store';
import { useSettingsStore } from '../../stores/settings-store';
import type { ShortcutBinding } from '../../types/shortcuts';

interface ConflictInfo {
  bindingId: string;
  key: string;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  conflictsWith: ShortcutBinding;
}

export function ShortcutEditor() {
  const closeDialog = useUiStore((s) => s.closeDialog);
  const shortcuts = useSettingsStore((s) => s.shortcuts);
  const updateShortcut = useSettingsStore((s) => s.updateShortcut);
  const resetShortcuts = useSettingsStore((s) => s.resetShortcuts);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [conflict, setConflict] = useState<ConflictInfo | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);

  const findConflict = (
    bindingId: string,
    key: string,
    ctrl: boolean,
    shift: boolean,
    alt: boolean
  ): ShortcutBinding | undefined => {
    return shortcuts.find(
      (s) =>
        s.id !== bindingId &&
        s.key.toLowerCase() === key.toLowerCase() &&
        (s.ctrl ?? false) === ctrl &&
        (s.shift ?? false) === shift &&
        (s.alt ?? false) === alt
    );
  };

  const applyShortcut = (info: ConflictInfo | { bindingId: string; key: string; ctrl: boolean; shift: boolean; alt: boolean }) => {
    updateShortcut(info.bindingId, {
      key: info.key,
      ctrl: info.ctrl,
      shift: info.shift,
      alt: info.alt,
    });
    setConflict(null);
    setEditingId(null);
  };

  const handleKeyCapture = (e: React.KeyboardEvent, binding: ShortcutBinding) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape') {
      setEditingId(null);
      setConflict(null);
      return;
    }
    const key = e.key;
    const ctrl = e.ctrlKey || e.metaKey;
    const shift = e.shiftKey;
    const alt = e.altKey;

    const existing = findConflict(binding.id, key, ctrl, shift, alt);
    if (existing) {
      setConflict({ bindingId: binding.id, key, ctrl, shift, alt, conflictsWith: existing });
      return;
    }
    applyShortcut({ bindingId: binding.id, key, ctrl, shift, alt });
  };

  const formatKey = (b: ShortcutBinding): string => {
    const parts: string[] = [];
    if (b.ctrl) parts.push('Ctrl');
    if (b.shift) parts.push('Shift');
    if (b.alt) parts.push('Alt');
    parts.push(b.key === ' ' ? 'Space' : b.key);
    return parts.join('+');
  };

  const categories = ['playback', 'annotation', 'editing', 'navigation', 'general'] as const;

  return (
    <DialogShell title="Keyboard Shortcuts" onClose={closeDialog} wide>
      <div className="space-y-4">
        {categories.map((cat) => {
          const bindings = shortcuts.filter((s) => s.category === cat);
          if (bindings.length === 0) return null;
          return (
            <div key={cat}>
              <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">
                {cat}
              </h3>
              <div className="space-y-1">
                {bindings.map((binding) => (
                  <div
                    key={binding.id}
                    className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-surface-2"
                  >
                    <span className="text-xs text-zinc-300">{binding.description}</span>
                    {editingId === binding.id ? (
                      <div className="flex flex-col items-end gap-1">
                        <div
                          tabIndex={0}
                          onKeyDown={(e) => handleKeyCapture(e, binding)}
                          className="px-3 py-1 text-xs bg-accent/20 border border-accent rounded animate-pulse text-accent"
                          autoFocus
                          onBlur={() => {
                            if (!conflict) setEditingId(null);
                          }}
                        >
                          Press a key...
                        </div>
                        {conflict && conflict.bindingId === binding.id && (
                          <div className="text-xs text-amber-400 flex items-center gap-2">
                            <span>Conflicts with "{conflict.conflictsWith.description}"</span>
                            <button
                              onClick={() => applyShortcut(conflict)}
                              className="text-xs text-accent hover:text-accent-hover underline"
                            >
                              Use anyway
                            </button>
                            <button
                              onClick={() => { setConflict(null); setEditingId(null); }}
                              className="text-xs text-zinc-500 hover:text-zinc-300"
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <button
                        onClick={() => { setEditingId(binding.id); setConflict(null); }}
                        className="px-2 py-1 text-xs font-mono bg-surface-2 border border-surface-3 rounded text-zinc-300 hover:border-accent transition-colors"
                      >
                        {formatKey(binding)}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {confirmingReset ? (
          <div className="flex items-center gap-3 text-xs">
            <span className="text-amber-400">
              Are you sure? This will reset all {shortcuts.length} shortcuts to defaults.
            </span>
            <button
              onClick={() => { resetShortcuts(); setConfirmingReset(false); }}
              className="text-red-400 hover:text-red-300 font-medium"
            >
              Reset
            </button>
            <button
              onClick={() => setConfirmingReset(false)}
              className="text-zinc-500 hover:text-zinc-300"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmingReset(true)}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Reset all to defaults
          </button>
        )}
      </div>
    </DialogShell>
  );
}
