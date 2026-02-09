import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ShortcutBinding } from '../types/shortcuts';
import type { MarkerType, Tier } from '../types/annotation';
import { DEFAULT_SHORTCUTS } from '../constants/default-shortcuts';
import { DEFAULT_MARKER_TYPES } from '../constants/annotation-types';
import { generateId } from '../utils/id-generator';

interface SettingsState {
  shortcuts: ShortcutBinding[];
  markerTypes: MarkerType[];
  tiers: Tier[];
  darkMode: boolean;
  showWaveform: boolean;
  annotatorId: string | null;
  activeTierId: string | null;

  setAnnotatorId: (id: string) => void;
  updateShortcut: (id: string, update: Partial<ShortcutBinding>) => void;
  resetShortcuts: () => void;
  addMarkerType: (markerType: Omit<MarkerType, 'id'>) => void;
  removeMarkerType: (id: string) => void;
  updateMarkerType: (id: string, update: Partial<MarkerType>) => void;
  addTier: (tier: Omit<Tier, 'id'>) => string;
  removeTier: (id: string) => void;
  updateTier: (id: string, update: Partial<Tier>) => void;
  setTiers: (tiers: Tier[]) => void;
  reorderTiers: (tiers: Tier[]) => void;
  setMarkerTypes: (types: MarkerType[]) => void;
  toggleDarkMode: () => void;
  toggleWaveform: () => void;
  setActiveTier: (id: string | null) => void;
  cycleActiveTier: () => void;
}

const defaultTier: Tier = {
  id: 'default-tier',
  name: 'Sign Boundaries',
  markerTypes: DEFAULT_MARKER_TYPES.map((m) => m.id),
  visible: true,
  locked: false,
  color: '#6366f1',
};

function firstEligibleTierId(tiers: Tier[]): string | null {
  const t = tiers.find((t) => t.visible && !t.locked);
  return t?.id ?? null;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      shortcuts: DEFAULT_SHORTCUTS,
      markerTypes: DEFAULT_MARKER_TYPES,
      tiers: [defaultTier],
      darkMode: true,
      showWaveform: true,
      annotatorId: null,
      activeTierId: 'default-tier',

      setAnnotatorId: (id) => set({ annotatorId: id }),
      updateShortcut: (id, update) =>
        set((s) => ({
          shortcuts: s.shortcuts.map((sc) => (sc.id === id ? { ...sc, ...update } : sc)),
        })),
      resetShortcuts: () => set({ shortcuts: DEFAULT_SHORTCUTS }),
      addMarkerType: (mt) => {
        const id = generateId('mt');
        set((s) => ({
          markerTypes: [...s.markerTypes, { ...mt, id }],
          tiers: s.tiers.map((t) => ({
            ...t,
            markerTypes: [...t.markerTypes, id],
          })),
        }));
      },
      removeMarkerType: (id) =>
        set((s) => ({ markerTypes: s.markerTypes.filter((m) => m.id !== id) })),
      updateMarkerType: (id, update) =>
        set((s) => ({
          markerTypes: s.markerTypes.map((m) => (m.id === id ? { ...m, ...update } : m)),
        })),
      addTier: (tier) => {
        const id = generateId('tier');
        set((s) => ({
          tiers: [...s.tiers, { ...tier, id }],
          activeTierId: id,
        }));
        return id;
      },
      removeTier: (id) =>
        set((s) => {
          const newTiers = s.tiers.filter((t) => t.id !== id);
          const activeTierId =
            s.activeTierId === id ? firstEligibleTierId(newTiers) : s.activeTierId;
          return { tiers: newTiers, activeTierId };
        }),
      updateTier: (id, update) =>
        set((s) => {
          const newTiers = s.tiers.map((t) => (t.id === id ? { ...t, ...update } : t));
          // If active tier becomes locked or hidden, auto-select next eligible
          let { activeTierId } = s;
          if (activeTierId === id) {
            const updated = newTiers.find((t) => t.id === id);
            if (updated && (!updated.visible || updated.locked)) {
              activeTierId = firstEligibleTierId(newTiers);
            }
          }
          return { tiers: newTiers, activeTierId };
        }),
      setTiers: (tiers) =>
        set({ tiers, activeTierId: firstEligibleTierId(tiers) }),
      reorderTiers: (tiers) => set({ tiers }),
      setMarkerTypes: (types) => set({ markerTypes: types }),
      toggleDarkMode: () => set((s) => ({ darkMode: !s.darkMode })),
      toggleWaveform: () => set((s) => ({ showWaveform: !s.showWaveform })),
      setActiveTier: (id) => set({ activeTierId: id }),
      cycleActiveTier: () => {
        const { tiers, activeTierId } = get();
        const eligible = tiers.filter((t) => t.visible && !t.locked);
        if (eligible.length === 0) return;
        const curIdx = eligible.findIndex((t) => t.id === activeTierId);
        const nextIdx = (curIdx + 1) % eligible.length;
        set({ activeTierId: eligible[nextIdx].id });
      },
    }),
    { name: 'dcal-settings' }
  )
);
