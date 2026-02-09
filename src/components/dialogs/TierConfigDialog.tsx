import { useState, useRef, useCallback, useEffect } from 'react';
import { DialogShell } from './DialogShell';
import { useUiStore } from '../../stores/ui-store';
import { useSettingsStore } from '../../stores/settings-store';
import { TIER_PRESETS } from '../../constants/tier-presets';
import { generateId } from '../../utils/id-generator';

export function TierConfigDialog() {
  const closeDialog = useUiStore((s) => s.closeDialog);
  const addToast = useUiStore((s) => s.addToast);
  const tiers = useSettingsStore((s) => s.tiers);
  const markerTypes = useSettingsStore((s) => s.markerTypes);
  const setTiers = useSettingsStore((s) => s.setTiers);
  const setMarkerTypes = useSettingsStore((s) => s.setMarkerTypes);
  const addTier = useSettingsStore((s) => s.addTier);
  const addMarkerType = useSettingsStore((s) => s.addMarkerType);
  const removeTier = useSettingsStore((s) => s.removeTier);
  const updateTier = useSettingsStore((s) => s.updateTier);
  const [newTierName, setNewTierName] = useState('');
  const [newTierColor, setNewTierColor] = useState('#6366f1');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pendingPreset, setPendingPreset] = useState<string | null>(null);
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Inline quick-add marker type state
  const [quickMtKey, setQuickMtKey] = useState('');
  const [quickMtName, setQuickMtName] = useState('');
  const [quickMtColor, setQuickMtColor] = useState('#10b981');

  // Clear pending preset timer on unmount
  useEffect(() => {
    return () => {
      if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current);
    };
  }, []);

  const handlePresetClick = useCallback((presetId: string) => {
    if (pendingPreset === presetId) {
      // Second click — apply the preset
      if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current);
      setPendingPreset(null);
      const preset = TIER_PRESETS.find((p) => p.id === presetId);
      if (!preset) return;
      const newTiers = preset.tiers.map((t) => ({ ...t, id: generateId('tier') }));
      setTiers(newTiers);
      setMarkerTypes(preset.markerTypes);
      addToast(`Applied "${preset.name}" preset`, 'success');
    } else {
      // First click — show warning
      setPendingPreset(presetId);
      if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = setTimeout(() => setPendingPreset(null), 3000);
    }
  }, [pendingPreset, setTiers, setMarkerTypes, addToast]);

  const handleAddTier = () => {
    if (!newTierName.trim()) return;
    const id = addTier({
      name: newTierName.trim(),
      markerTypes: markerTypes.map((mt) => mt.id),
      visible: true,
      locked: false,
      color: newTierColor,
    });
    setNewTierName('');
    setExpandedId(id);
  };

  const handleQuickAddMarkerType = () => {
    const key = quickMtKey.trim().toLowerCase();
    const name = quickMtName.trim();
    if (!key || !name) return;
    if (key.length !== 1) return;
    // Check for duplicate key
    if (markerTypes.some((mt) => mt.key === key)) {
      addToast(`Key "${key}" is already used by another marker type`, 'error');
      return;
    }
    addMarkerType({
      key,
      name,
      color: quickMtColor,
      category: 'custom',
    });
    setQuickMtKey('');
    setQuickMtName('');
    addToast(`Added marker type "${name}"`, 'success');
  };

  const toggleMarkerType = (tierId: string, mtId: string) => {
    const tier = tiers.find((t) => t.id === tierId);
    if (!tier) return;
    const has = tier.markerTypes.includes(mtId);
    updateTier(tierId, {
      markerTypes: has
        ? tier.markerTypes.filter((id) => id !== mtId)
        : [...tier.markerTypes, mtId],
    });
  };

  const selectAll = (tierId: string) => {
    updateTier(tierId, { markerTypes: markerTypes.map((mt) => mt.id) });
  };

  const clearAll = (tierId: string) => {
    updateTier(tierId, { markerTypes: [] });
  };

  return (
    <DialogShell title="Tier Configuration" onClose={closeDialog}>
      <div className="space-y-4">
        <div>
          <label className="text-xs text-zinc-400 block mb-2">Presets</label>
          <div className="grid grid-cols-2 gap-2">
            {TIER_PRESETS.map((preset) => {
              const isPending = pendingPreset === preset.id;
              return (
                <button
                  key={preset.id}
                  onClick={() => handlePresetClick(preset.id)}
                  className={`text-left p-2 rounded transition-colors ${
                    isPending
                      ? 'bg-amber-500/20 ring-1 ring-amber-500/50'
                      : 'bg-surface-2 hover:bg-surface-3'
                  }`}
                >
                  <div className="text-xs text-zinc-200 font-medium">{preset.name}</div>
                  {isPending ? (
                    <div className="text-xs text-amber-400 mt-0.5">
                      Replaces all tiers. Click again to confirm.
                    </div>
                  ) : (
                    <div className="text-xs text-zinc-500 mt-0.5">{preset.description}</div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="text-xs text-zinc-400 block mb-2">Current Tiers</label>
          <div className="space-y-1">
            {tiers.map((tier) => (
              <div key={tier.id} className="bg-surface-2 rounded overflow-hidden">
                {/* Header row */}
                <div className="flex items-center gap-2 px-2 py-1.5">
                  <span
                    className="w-3 h-3 rounded-sm shrink-0"
                    style={{ backgroundColor: tier.color }}
                  />
                  <span className="text-xs text-zinc-300 flex-1">{tier.name}</span>
                  <span className="text-xs text-zinc-500">
                    {tier.markerTypes.length}/{markerTypes.length} types
                  </span>
                  <button
                    onClick={() => setExpandedId(expandedId === tier.id ? null : tier.id)}
                    className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors px-1"
                    title="Configure marker types"
                  >
                    {expandedId === tier.id ? '\u25be' : '\u25b8'}
                  </button>
                  <button
                    onClick={() => removeTier(tier.id)}
                    className="text-xs text-zinc-600 hover:text-red-400 transition-colors"
                  >
                    ×
                  </button>
                </div>

                {/* Expanded: marker type checkboxes */}
                {expandedId === tier.id && (
                  <div className="px-3 py-2 bg-surface-1 border-t border-surface-3">
                    <div className="flex gap-2 mb-2">
                      <button
                        onClick={() => selectAll(tier.id)}
                        className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
                      >
                        Select All
                      </button>
                      <span className="text-xs text-zinc-600">|</span>
                      <button
                        onClick={() => clearAll(tier.id)}
                        className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
                      >
                        Clear All
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                      {markerTypes.map((mt) => (
                        <label
                          key={mt.id}
                          className="flex items-center gap-2 text-sm cursor-pointer hover:bg-surface-2 rounded px-1 py-0.5"
                        >
                          <input
                            type="checkbox"
                            checked={tier.markerTypes.includes(mt.id)}
                            onChange={() => toggleMarkerType(tier.id, mt.id)}
                            className="accent-accent"
                          />
                          <span
                            className="w-2.5 h-2.5 rounded shrink-0"
                            style={{ backgroundColor: mt.color }}
                          />
                          <kbd className="px-1 bg-surface-3 rounded font-mono text-xs text-zinc-300">
                            {mt.key}
                          </kbd>
                          <span className="text-xs text-zinc-300 truncate">{mt.name}</span>
                        </label>
                      ))}
                    </div>

                    {/* Inline quick-add marker type */}
                    <div className="mt-2 pt-2 border-t border-surface-3">
                      <div className="text-xs text-zinc-500 mb-1">Quick add marker type</div>
                      <div className="flex gap-1.5 items-center">
                        <input
                          type="color"
                          value={quickMtColor}
                          onChange={(e) => setQuickMtColor(e.target.value)}
                          className="w-6 h-6 rounded cursor-pointer border border-surface-3 bg-transparent p-0.5"
                          title="Marker color"
                        />
                        <input
                          type="text"
                          value={quickMtKey}
                          onChange={(e) => setQuickMtKey(e.target.value.slice(0, 1))}
                          placeholder="Key"
                          maxLength={1}
                          className="w-10 px-1.5 py-1 text-xs bg-surface-2 border border-surface-3 rounded text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-accent text-center font-mono"
                        />
                        <input
                          type="text"
                          value={quickMtName}
                          onChange={(e) => setQuickMtName(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleQuickAddMarkerType()}
                          placeholder="Name..."
                          className="flex-1 px-1.5 py-1 text-xs bg-surface-2 border border-surface-3 rounded text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-accent"
                        />
                        <button
                          onClick={handleQuickAddMarkerType}
                          className="px-2 py-1 text-xs bg-accent hover:bg-accent-hover text-white rounded transition-colors shrink-0"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-2 items-center">
          <input
            type="color"
            value={newTierColor}
            onChange={(e) => setNewTierColor(e.target.value)}
            className="w-7 h-7 rounded cursor-pointer border border-surface-3 bg-transparent p-0.5"
            title="Tier color"
          />
          <input
            type="text"
            value={newTierName}
            onChange={(e) => setNewTierName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddTier()}
            placeholder="New tier name..."
            className="flex-1 px-2 py-1.5 text-xs bg-surface-2 border border-surface-3 rounded text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-accent"
          />
          <button
            onClick={handleAddTier}
            className="px-3 py-1.5 text-xs bg-accent hover:bg-accent-hover text-white rounded transition-colors"
          >
            Add
          </button>
        </div>
      </div>
    </DialogShell>
  );
}
