import { useState } from 'react';
import { DialogShell } from './DialogShell';
import { useUiStore } from '../../stores/ui-store';
import { useSettingsStore } from '../../stores/settings-store';

export function SettingsDialog() {
  const closeDialog = useUiStore((s) => s.closeDialog);
  const openDialog = useUiStore((s) => s.openDialog);
  const showWaveform = useSettingsStore((s) => s.showWaveform);
  const toggleWaveform = useSettingsStore((s) => s.toggleWaveform);
  const annotatorId = useSettingsStore((s) => s.annotatorId);
  const setAnnotatorId = useSettingsStore((s) => s.setAnnotatorId);
  const [editingId, setEditingId] = useState(false);
  const [idValue, setIdValue] = useState(annotatorId ?? '');

  return (
    <DialogShell title="Settings" onClose={closeDialog}>
      <div className="space-y-4">
        <div className="flex items-center justify-between py-1">
          <div>
            <div className="text-sm text-zinc-200">Show Waveform</div>
            <div className="text-xs text-zinc-400">Display audio waveform in timeline</div>
          </div>
          <button
            onClick={toggleWaveform}
            className={`w-9 h-5 rounded-full transition-colors ${
              showWaveform ? 'bg-accent' : 'bg-surface-3'
            }`}
          >
            <div
              className={`w-4 h-4 rounded-full bg-white transition-transform ${
                showWaveform ? 'translate-x-4.5' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>

        <div className="flex items-center justify-between py-1">
          <div>
            <div className="text-sm text-zinc-200">Annotator ID</div>
            <div className="text-xs text-zinc-400">Embedded in exported files as author</div>
          </div>
          {editingId ? (
            <div className="flex gap-1">
              <input
                type="text"
                value={idValue}
                onChange={(e) => setIdValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && idValue.trim()) {
                    setAnnotatorId(idValue.trim());
                    setEditingId(false);
                  }
                }}
                autoFocus
                className="w-24 px-2 py-0.5 bg-surface-2 border border-surface-3 rounded text-sm text-zinc-200 focus:outline-none focus:border-accent"
              />
              <button
                onClick={() => {
                  if (idValue.trim()) {
                    setAnnotatorId(idValue.trim());
                    setEditingId(false);
                  }
                }}
                className="px-2 py-0.5 bg-accent text-white text-xs rounded"
              >
                Save
              </button>
            </div>
          ) : (
            <button
              onClick={() => setEditingId(true)}
              className="px-2 py-0.5 bg-surface-2 hover:bg-surface-3 text-xs text-zinc-300 rounded transition-colors"
            >
              {annotatorId || 'Not set'}
            </button>
          )}
        </div>

        <button
          onClick={() => {
            closeDialog();
            setTimeout(() => openDialog('shortcut-editor'), 50);
          }}
          className="w-full text-left px-3 py-2 bg-surface-2 hover:bg-surface-3 rounded transition-colors"
        >
          <div className="text-sm text-zinc-200">Keyboard Shortcuts</div>
          <div className="text-xs text-zinc-400">Customize key bindings</div>
        </button>

        <button
          onClick={() => {
            closeDialog();
            setTimeout(() => openDialog('marker-types'), 50);
          }}
          className="w-full text-left px-3 py-2 bg-surface-2 hover:bg-surface-3 rounded transition-colors"
        >
          <div className="text-sm text-zinc-200">Marker Types</div>
          <div className="text-xs text-zinc-400">Add, edit, or remove annotation marker types</div>
        </button>

        <button
          onClick={() => {
            closeDialog();
            setTimeout(() => openDialog('tier-config'), 50);
          }}
          className="w-full text-left px-3 py-2 bg-surface-2 hover:bg-surface-3 rounded transition-colors"
        >
          <div className="text-sm text-zinc-200">Tier Configuration</div>
          <div className="text-xs text-zinc-400">Manage annotation tiers and presets</div>
        </button>

        <div className="pt-2 border-t border-surface-3">
          <div className="text-xs text-zinc-500">
            DCAL Annotator v0.1.0
          </div>
          <div className="text-xs text-zinc-500 mt-0.5">
            Keyboard-driven annotation for sign language video
          </div>
        </div>
      </div>
    </DialogShell>
  );
}
