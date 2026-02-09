import { AppLayout } from './components/layout/AppLayout';
import { VideoPlayer } from './components/video/VideoPlayer';
import { Timeline } from './components/timeline/Timeline';
import { Sidebar } from './components/sidebar/Sidebar';
import { ToastContainer } from './components/common/Toast';
import { OpenFolderDialog } from './components/dialogs/OpenFolderDialog';
import { ExportDialog } from './components/dialogs/ExportDialog';
import { ShortcutEditor } from './components/dialogs/ShortcutEditor';
import { TierConfigDialog } from './components/dialogs/TierConfigDialog';
import { SettingsDialog } from './components/dialogs/SettingsDialog';
import { MarkerTypeDialog } from './components/dialogs/MarkerTypeDialog';
import { AnnotatorIdDialog } from './components/dialogs/AnnotatorIdDialog';
import { ShortcutOverlay } from './components/common/ShortcutOverlay';
import { useUiStore } from './stores/ui-store';
import { useSettingsStore } from './stores/settings-store';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useVideoPlayback } from './hooks/useVideoPlayback';
import { useAutoSave } from './hooks/useAutoSave';
import { useSessionRecovery } from './hooks/useSessionRecovery';
import { useEafImport } from './hooks/useEafImport';

export default function App() {
  const activeDialog = useUiStore((s) => s.activeDialog);
  const shortcutOverlayOpen = useUiStore((s) => s.shortcutOverlayOpen);
  const setShortcutOverlayOpen = useUiStore((s) => s.setShortcutOverlayOpen);
  const annotatorId = useSettingsStore((s) => s.annotatorId);

  useSessionRecovery();
  useKeyboardShortcuts();
  useVideoPlayback();
  useAutoSave();
  useEafImport();

  return (
    <>
      {/* Annotator ID prompt on first launch */}
      {!annotatorId && <AnnotatorIdDialog />}

      <AppLayout
        sidebar={<Sidebar />}
        main={<VideoPlayer />}
        timeline={<Timeline />}
      />

      {/* Dialogs */}
      {activeDialog === 'open-folder' && <OpenFolderDialog />}
      {activeDialog === 'export' && <ExportDialog />}
      {activeDialog === 'shortcut-editor' && <ShortcutEditor />}
      {activeDialog === 'tier-config' && <TierConfigDialog />}
      {activeDialog === 'settings' && <SettingsDialog />}
      {activeDialog === 'marker-types' && <MarkerTypeDialog />}

      {/* Keyboard shortcut overlay */}
      {shortcutOverlayOpen && (
        <ShortcutOverlay onClose={() => setShortcutOverlayOpen(false)} />
      )}

      <ToastContainer />
    </>
  );
}
