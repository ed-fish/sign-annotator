import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type SidebarTab = 'videos' | 'tiers' | 'annotations';
export type DialogType = 'shortcut-editor' | 'export' | 'tier-config' | 'settings' | 'open-folder' | 'marker-types' | null;

interface Toast {
  id: string;
  message: string;
  type: 'info' | 'success' | 'error';
  timestamp: number;
  action?: { label: string; callback: () => void };
}

/** Active hold-mode state (key held to mark sign duration) */
export interface ActiveHold {
  startMarkerId: string;
  startTimeMs: number;
  tierId: string;
  color: string;
}

interface UiState {
  sidebarOpen: boolean;
  sidebarTab: SidebarTab;
  sidebarWidth: number;
  timelineHeight: number;
  activeDialog: DialogType;
  toasts: Toast[];
  flashColor: string | null;
  shortcutOverlayOpen: boolean;
  activeHold: ActiveHold | null;
  /** ID of annotation (marker or span) to scroll into view in AnnotationList */
  scrollToAnnotationId: string | null;

  toggleSidebar: () => void;
  setSidebarTab: (tab: SidebarTab) => void;
  setSidebarWidth: (width: number) => void;
  setTimelineHeight: (height: number) => void;
  openDialog: (dialog: DialogType) => void;
  closeDialog: () => void;
  addToast: (message: string, type?: Toast['type'], action?: Toast['action']) => void;
  removeToast: (id: string) => void;
  showFlash: (color: string) => void;
  setShortcutOverlayOpen: (open: boolean) => void;
  setActiveHold: (hold: ActiveHold | null) => void;
  setScrollToAnnotation: (id: string | null) => void;
}

let toastCounter = 0;

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarOpen: true,
      sidebarTab: 'videos',
      sidebarWidth: 280,
      timelineHeight: 200,
      activeDialog: null,
      toasts: [],
      flashColor: null,
      shortcutOverlayOpen: false,
      activeHold: null,
      scrollToAnnotationId: null,

      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      setSidebarTab: (tab) => set({ sidebarTab: tab }),
      setSidebarWidth: (width) => set({ sidebarWidth: Math.max(220, Math.min(480, width)) }),
      setTimelineHeight: (height) => set({ timelineHeight: Math.max(120, Math.min(500, height)) }),
      openDialog: (dialog) => set({ activeDialog: dialog }),
      closeDialog: () => set({ activeDialog: null }),
      addToast: (message, type = 'info', action?) => {
        const id = `toast-${++toastCounter}`;
        set((s) => ({ toasts: [...s.toasts, { id, message, type, timestamp: Date.now(), action }] }));
        const duration = action ? 6000 : 4000;
        setTimeout(() => {
          set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
        }, duration);
      },
      removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
      showFlash: (color) => {
        set({ flashColor: color });
        setTimeout(() => set({ flashColor: null }), 300);
      },
      setShortcutOverlayOpen: (open) => set({ shortcutOverlayOpen: open }),
      setActiveHold: (hold) => set({ activeHold: hold }),
      setScrollToAnnotation: (id) => set({ scrollToAnnotationId: id }),
    }),
    {
      name: 'dcal-ui-layout',
      partialize: (state) => ({
        sidebarWidth: state.sidebarWidth,
        timelineHeight: state.timelineHeight,
        sidebarOpen: state.sidebarOpen,
      }),
    }
  )
);
