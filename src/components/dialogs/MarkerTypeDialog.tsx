import { useState } from 'react';
import { DialogShell } from './DialogShell';
import { useUiStore } from '../../stores/ui-store';
import { useSettingsStore } from '../../stores/settings-store';
import { useAnnotationStore } from '../../stores/annotation-store';
import type { MarkerType } from '../../types/annotation';

const SYSTEM_KEYS = new Set(['g', 'n']); // g=create-span, n=next-marker (d/l now require Shift)
const CATEGORIES: MarkerType['category'][] = ['boundary', 'phase', 'feature', 'custom'];

export function MarkerTypeDialog() {
  const closeDialog = useUiStore((s) => s.closeDialog);
  const addToast = useUiStore((s) => s.addToast);
  const markerTypes = useSettingsStore((s) => s.markerTypes);
  const addMarkerType = useSettingsStore((s) => s.addMarkerType);
  const removeMarkerType = useSettingsStore((s) => s.removeMarkerType);
  const updateMarkerType = useSettingsStore((s) => s.updateMarkerType);
  const markers = useAnnotationStore((s) => s.markers);

  const [newKey, setNewKey] = useState('');
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#6366f1');
  const [newCategory, setNewCategory] = useState<MarkerType['category']>('custom');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [editCategory, setEditCategory] = useState<MarkerType['category']>('custom');

  const tiers = useSettingsStore((s) => s.tiers);

  const validateKey = (key: string, excludeId?: string): { error: string | null; warning: string | null } => {
    if (!key || key.length !== 1) return { error: 'Key must be a single character', warning: null };
    if (SYSTEM_KEYS.has(key.toLowerCase())) return { error: `Key "${key}" conflicts with a system shortcut`, warning: null };
    const conflict = markerTypes.find(
      (mt) => mt.key === key.toLowerCase() && mt.id !== excludeId
    );
    if (conflict) return { error: null, warning: `Key "${key}" is also used by "${conflict.name}" — ensure they're on different tiers` };
    return { error: null, warning: null };
  };

  const handleAdd = () => {
    const { error, warning } = validateKey(newKey);
    if (error) {
      addToast(error, 'error');
      return;
    }
    if (!newName.trim()) {
      addToast('Name is required', 'error');
      return;
    }
    addMarkerType({
      key: newKey.toLowerCase(),
      name: newName.trim(),
      color: newColor,
      category: newCategory,
    });
    if (warning) addToast(warning, 'info');
    setNewKey('');
    setNewName('');
    setNewColor('#6366f1');
    setNewCategory('custom');
    addToast(`Added marker type "${newName.trim()}"`, 'success');
  };

  const handleDelete = (mt: MarkerType) => {
    const usedCount = markers.filter((m) => m.typeId === mt.id).length;
    if (usedCount > 0 && pendingDeleteId !== mt.id) {
      setPendingDeleteId(mt.id);
      setTimeout(() => setPendingDeleteId((cur) => cur === mt.id ? null : cur), 3000);
      return;
    }
    setPendingDeleteId(null);
    removeMarkerType(mt.id);
    addToast(`Removed "${mt.name}"`, 'success');
  };

  const startEdit = (mt: MarkerType) => {
    setEditingId(mt.id);
    setEditName(mt.name);
    setEditColor(mt.color);
    setEditCategory(mt.category);
  };

  const saveEdit = (mt: MarkerType) => {
    if (!editName.trim()) {
      addToast('Name is required', 'error');
      return;
    }
    updateMarkerType(mt.id, {
      name: editName.trim(),
      color: editColor,
      category: editCategory,
    });
    setEditingId(null);
  };

  return (
    <DialogShell title="Marker Types" onClose={closeDialog} wide>
      <div className="space-y-4">
        {/* Existing types */}
        <div className="space-y-1">
          {markerTypes.map((mt) => (
            <div
              key={mt.id}
              className="flex items-center gap-2 px-2 py-1.5 rounded bg-surface-2"
            >
              {editingId === mt.id ? (
                <>
                  <input
                    type="color"
                    value={editColor}
                    onChange={(e) => setEditColor(e.target.value)}
                    className="w-6 h-6 rounded border-0 cursor-pointer bg-transparent"
                  />
                  <kbd className="px-1.5 py-0.5 bg-surface-3 rounded text-sm font-mono text-zinc-300 shrink-0">
                    {mt.key}
                  </kbd>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="flex-1 px-2 py-0.5 bg-surface-0 border border-surface-3 rounded text-sm text-zinc-200 focus:outline-none focus:border-accent"
                  />
                  <select
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value as MarkerType['category'])}
                    className="px-1.5 py-0.5 bg-surface-0 border border-surface-3 rounded text-sm text-zinc-300"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => saveEdit(mt)}
                    className="px-2 py-0.5 bg-accent text-white text-sm rounded"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="px-2 py-0.5 bg-surface-3 text-zinc-400 text-sm rounded"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <div
                    className="w-4 h-4 rounded shrink-0"
                    style={{ backgroundColor: mt.color }}
                  />
                  <kbd className="px-1.5 py-0.5 bg-surface-3 rounded text-sm font-mono text-zinc-300 shrink-0">
                    {mt.key}
                  </kbd>
                  <span className="flex-1 text-sm text-zinc-200">{mt.name}</span>
                  <span className="px-1.5 py-0.5 bg-surface-0 rounded text-xs text-zinc-400">
                    {mt.category}
                  </span>
                  <button
                    onClick={() => startEdit(mt)}
                    className="px-1.5 py-0.5 text-zinc-400 hover:text-zinc-200 text-sm transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(mt)}
                    className={`px-1.5 py-0.5 text-sm transition-colors ${
                      pendingDeleteId === mt.id
                        ? 'text-amber-400 hover:text-red-400'
                        : 'text-zinc-400 hover:text-red-400'
                    }`}
                  >
                    {pendingDeleteId === mt.id
                      ? `Used by ${markers.filter((m) => m.typeId === mt.id).length} — click to confirm`
                      : 'Delete'}
                  </button>
                </>
              )}
            </div>
          ))}
          {markerTypes.length === 0 && (
            <div className="text-sm text-zinc-500 py-2 text-center">
              No marker types defined. Add one below.
            </div>
          )}
        </div>

        {/* Add new */}
        <div className="border-t border-surface-3 pt-3">
          <div className="text-sm text-zinc-400 mb-2">Add New Marker Type</div>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={newColor}
              onChange={(e) => setNewColor(e.target.value)}
              className="w-6 h-6 rounded border-0 cursor-pointer bg-transparent"
            />
            <input
              type="text"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value.slice(-1))}
              placeholder="Key"
              maxLength={1}
              className="w-10 px-2 py-1 bg-surface-2 border border-surface-3 rounded text-sm text-zinc-200 text-center font-mono focus:outline-none focus:border-accent"
            />
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Name"
              className="flex-1 px-2 py-1 bg-surface-2 border border-surface-3 rounded text-sm text-zinc-200 focus:outline-none focus:border-accent"
            />
            <select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value as MarkerType['category'])}
              className="px-1.5 py-1 bg-surface-2 border border-surface-3 rounded text-sm text-zinc-300"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <button
              onClick={handleAdd}
              disabled={!newKey || !newName.trim()}
              className="px-3 py-1 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white text-sm rounded transition-colors"
            >
              Add
            </button>
          </div>
        </div>
      </div>
    </DialogShell>
  );
}
