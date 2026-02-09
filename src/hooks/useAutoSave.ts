import { useEffect, useRef, useCallback } from 'react';
import { useAnnotationStore } from '../stores/annotation-store';
import { useProjectStore } from '../stores/project-store';
import { useSettingsStore } from '../stores/settings-store';
import type { ProjectSession } from '../types/project';
import { saveSessionToLocalStorage } from '../services/file-system/fallback-io';
import { writeFile } from '../services/file-system/file-writer';
import { AUTOSAVE_DEBOUNCE_MS, AUTOSAVE_INTERVAL_MS } from '../constants/theme';

/** Module-level save ref so Ctrl+S can trigger a save from outside the hook */
let _moduleSave: (() => Promise<void>) | null = null;

/** Trigger a manual save from outside the hook (e.g., Ctrl+S) */
export async function triggerManualSave(): Promise<void> {
  if (_moduleSave) await _moduleSave();
}

export function useAutoSave() {
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined);

  const save = useCallback(async () => {
    const { markers, spans } = useAnnotationStore.getState();
    const { folderName, folderHandle, videos, currentVideoId, remotePath } = useProjectStore.getState();
    const { markerTypes, tiers } = useSettingsStore.getState();

    if (markers.length === 0 && videos.length === 0) return;

    const session: ProjectSession = {
      version: 1,
      folderName,
      videos: videos.map(({ objectUrl: _o, fileHandle: _f, eafHandle: _e, ...rest }) => rest),
      markers: markers.filter((m) => m.confirmed), // only save confirmed markers
      spans,
      tiers,
      markerTypes,
      currentVideoId,
      savedAt: Date.now(),
      ...(remotePath ? { remotePath } : {}),
    };

    // Try File System Access first
    if (folderHandle) {
      try {
        await writeFile(folderHandle, '.dcal-session.json', JSON.stringify(session, null, 2));
        useProjectStore.getState().setLastSavedAt(Date.now());
        return;
      } catch {
        // Fall through to localStorage
      }
    }

    // Fallback
    saveSessionToLocalStorage(session);
    useProjectStore.getState().setLastSavedAt(Date.now());
  }, []);

  const debouncedSave = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(save, AUTOSAVE_DEBOUNCE_MS);
  }, [save]);

  // Register save function at module level for external access (Ctrl+S)
  useEffect(() => {
    _moduleSave = save;
    return () => { _moduleSave = null; };
  }, [save]);

  // Subscribe only to markers/spans changes (not selection, pending, etc.)
  useEffect(() => {
    const unsub = useAnnotationStore.subscribe((state, prev) => {
      if (state.markers !== prev.markers || state.spans !== prev.spans) {
        debouncedSave();
      }
    });
    return () => unsub();
  }, [debouncedSave]);

  // Periodic save
  useEffect(() => {
    intervalRef.current = setInterval(save, AUTOSAVE_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [save]);

  // Save on visibility change and before unload
  useEffect(() => {
    const handleVisChange = () => {
      if (document.hidden) save();
    };
    // beforeunload: use synchronous localStorage save directly (async won't complete).
    // We write to localStorage directly here instead of via saveSessionToLocalStorage
    // so we can catch QuotaExceededError and attempt a minimal fallback save.
    const handleBeforeUnload = () => {
      const { markers, spans } = useAnnotationStore.getState();
      const { folderName, videos, currentVideoId, remotePath } = useProjectStore.getState();
      const { markerTypes, tiers } = useSettingsStore.getState();
      if (markers.length === 0 && videos.length === 0) return;
      const session: ProjectSession = {
        version: 1,
        folderName,
        videos: videos.map(({ objectUrl: _o, fileHandle: _f, eafHandle: _e, ...rest }) => rest),
        markers: markers.filter((m) => m.confirmed),
        spans,
        tiers,
        markerTypes,
        currentVideoId,
        savedAt: Date.now(),
        ...(remotePath ? { remotePath } : {}),
      };
      try {
        localStorage.setItem('dcal-session', JSON.stringify(session));
      } catch (err) {
        console.warn('[DCAL] beforeunload save failed (QuotaExceeded?), trying minimal save', err);
        try {
          // Minimal session: just markers, spans, and current video — no video list
          const minimal: ProjectSession = {
            version: 1,
            folderName,
            videos: [],
            markers: session.markers,
            spans: session.spans,
            tiers,
            markerTypes,
            currentVideoId,
            savedAt: Date.now(),
            ...(remotePath ? { remotePath } : {}),
          };
          localStorage.setItem('dcal-session', JSON.stringify(minimal));
        } catch (err2) {
          console.error('[DCAL] Minimal beforeunload save also failed', err2);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisChange);
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      document.removeEventListener('visibilitychange', handleVisChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [save]);

  return { save };
}
