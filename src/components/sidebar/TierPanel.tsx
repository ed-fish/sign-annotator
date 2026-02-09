import { useState, useRef } from 'react';
import { useSettingsStore } from '../../stores/settings-store';
import { useUiStore } from '../../stores/ui-store';

export function TierPanel() {
  const tiers = useSettingsStore((s) => s.tiers);
  const updateTier = useSettingsStore((s) => s.updateTier);
  const reorderTiers = useSettingsStore((s) => s.reorderTiers);
  const activeTierId = useSettingsStore((s) => s.activeTierId);
  const setActiveTier = useSettingsStore((s) => s.setActiveTier);
  const openDialog = useUiStore((s) => s.openDialog);

  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const dragSrcId = useRef<string | null>(null);

  const handleDragStart = (e: React.DragEvent, tierId: string) => {
    dragSrcId.current = tierId;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', tierId);
    // Make the drag image slightly transparent
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '0.5';
    }
  };

  const handleDragEnd = (e: React.DragEvent) => {
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '';
    }
    dragSrcId.current = null;
    setDragOverId(null);
  };

  const handleDragOver = (e: React.DragEvent, tierId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverId(tierId);
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    setDragOverId(null);
    const srcId = dragSrcId.current;
    if (!srcId || srcId === targetId) return;

    const srcIdx = tiers.findIndex((t) => t.id === srcId);
    const targetIdx = tiers.findIndex((t) => t.id === targetId);
    if (srcIdx === -1 || targetIdx === -1) return;

    const newTiers = [...tiers];
    const [moved] = newTiers.splice(srcIdx, 1);
    newTiers.splice(targetIdx, 0, moved);
    reorderTiers(newTiers);
  };

  return (
    <div className="flex flex-col">
      <div className="px-3 py-2 flex items-center justify-between">
        <span className="text-sm font-medium text-zinc-400 uppercase tracking-wider">Tiers</span>
        <button
          onClick={() => openDialog('tier-config')}
          className="text-sm text-accent hover:text-accent-hover transition-colors"
        >
          Configure
        </button>
      </div>
      {tiers.map((tier) => {
        const isActive = tier.id === activeTierId;
        const canActivate = tier.visible && !tier.locked;
        const isDragOver = dragOverId === tier.id && dragSrcId.current !== tier.id;
        return (
          <div
            key={tier.id}
            draggable
            onDragStart={(e) => handleDragStart(e, tier.id)}
            onDragEnd={handleDragEnd}
            onDragOver={(e) => handleDragOver(e, tier.id)}
            onDragLeave={() => setDragOverId(null)}
            onDrop={(e) => handleDrop(e, tier.id)}
            onClick={() => canActivate && setActiveTier(tier.id)}
            className={`flex items-center gap-2 px-3 py-2 transition-colors cursor-pointer ${
              isActive
                ? 'bg-accent/15 border-l-2 border-accent'
                : 'hover:bg-surface-2 border-l-2 border-transparent'
            } ${isDragOver ? 'border-t-2 border-t-accent' : ''}`}
          >
            <span className="text-zinc-600 cursor-grab active:cursor-grabbing text-xs select-none" title="Drag to reorder" aria-label={`Drag to reorder ${tier.name}`}>⠿</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                updateTier(tier.id, { visible: !tier.visible });
              }}
              className={`w-3 h-3 rounded-sm border ${
                tier.visible ? 'border-transparent' : 'border-zinc-600'
              }`}
              style={{ backgroundColor: tier.visible ? tier.color : 'transparent' }}
              title={tier.visible ? 'Hide tier' : 'Show tier'}
              aria-label={tier.visible ? `Hide ${tier.name} tier` : `Show ${tier.name} tier`}
            />
            <span className="text-sm text-zinc-300 flex-1 truncate">{tier.name}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                updateTier(tier.id, { locked: !tier.locked });
              }}
              className={`text-sm ${tier.locked ? 'text-amber-500' : 'text-zinc-600'}`}
              title={tier.locked ? 'Unlock tier' : 'Lock tier'}
              aria-label={tier.locked ? `Unlock ${tier.name} tier` : `Lock ${tier.name} tier`}
            >
              {tier.locked ? (
                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><rect x="2" y="7" width="12" height="8" rx="1.5"/><path d="M5 7V5a3 3 0 016 0v2" fill="none" stroke="currentColor" strokeWidth="2"/></svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><rect x="2" y="7" width="12" height="8" rx="1.5"/><path d="M5 7V5a3 3 0 016 0" fill="none" stroke="currentColor" strokeWidth="2"/></svg>
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}
