import { useEffect, useRef } from 'react';
import { useProjectStore } from '../stores/project-store';
import { useAnnotationStore } from '../stores/annotation-store';
import { useSettingsStore } from '../stores/settings-store';
import { useUiStore } from '../stores/ui-store';
import { loadSessionFromLocalStorage, getStoredDirectoryHandle, clearStoredDirectoryHandle } from '../services/file-system/fallback-io';
import { scanFolder } from '../services/file-system/folder-scanner';
import { readFile } from '../services/file-system/file-writer';
import type { ProjectSession } from '../types/project';

export function useSessionRecovery() {
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    // ?reset in URL clears all cached state
    if (new URLSearchParams(window.location.search).has('reset')) {
      localStorage.removeItem('dcal-session');
      localStorage.removeItem('dcal-ui-layout');
      clearStoredDirectoryHandle();
      // Clean URL without reload
      window.history.replaceState({}, '', window.location.pathname);
      console.log('[DCAL] Session cache cleared via ?reset');
      return;
    }

    recoverSession();
  }, []);
}

/** Validate that a parsed object has the required ProjectSession shape */
function isValidSession(obj: unknown): obj is ProjectSession {
  if (!obj || typeof obj !== 'object') return false;
  const s = obj as Record<string, unknown>;
  return (
    typeof s.version === 'number' &&
    typeof s.folderName === 'string' &&
    Array.isArray(s.videos) &&
    Array.isArray(s.markers) &&
    Array.isArray(s.spans)
  );
}

/** Try to load .dcal-session.json from the file system */
async function loadSessionFromFileSystem(
  handle: FileSystemDirectoryHandle
): Promise<ProjectSession | null> {
  try {
    const raw = await readFile(handle, '.dcal-session.json');
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isValidSession(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** P2-13: Pick the newer session from localStorage and file-system sources */
function pickNewerSession(
  localSession: ProjectSession | null,
  fsSession: ProjectSession | null
): { session: ProjectSession; source: string } | null {
  if (localSession && fsSession) {
    const localTs = localSession.savedAt ?? 0;
    const fsTs = fsSession.savedAt ?? 0;
    if (fsTs >= localTs) {
      console.log(`[DCAL] Using file-system session (savedAt=${fsTs}) over localStorage (savedAt=${localTs})`);
      return { session: fsSession, source: 'file-system' };
    }
    console.log(`[DCAL] Using localStorage session (savedAt=${localTs}) over file-system (savedAt=${fsTs})`);
    return { session: localSession, source: 'localStorage' };
  }
  if (fsSession) {
    console.log('[DCAL] Using file-system session (no localStorage session found)');
    return { session: fsSession, source: 'file-system' };
  }
  if (localSession) {
    console.log('[DCAL] Using localStorage session (no file-system session found)');
    return { session: localSession, source: 'localStorage' };
  }
  return null;
}

async function recoverSession() {
  const localSession = loadSessionFromLocalStorage();

  const projStore = useProjectStore.getState();
  const annStore = useAnnotationStore.getState();
  const settingsStore = useSettingsStore.getState();
  const uiStore = useUiStore.getState();

  // Try to get stored directory handle and re-scan
  let scannedVideos: ProjectSession['videos'] = [];
  let folderHandle: FileSystemDirectoryHandle | null = null;
  let fsSession: ProjectSession | null = null;

  // Try local filesystem handle first
  try {
    const storedHandle = await getStoredDirectoryHandle();
    if (storedHandle) {
      // Request permission (Chrome will re-prompt)
      const perm = await (storedHandle as unknown as { requestPermission(opts: { mode: string }): Promise<string> }).requestPermission({ mode: 'readwrite' });
      if (perm === 'granted') {
        folderHandle = storedHandle;
        const result = await scanFolder(storedHandle);
        scannedVideos = result.videos;
        // P2-13: Try to load file-system session for timestamp comparison
        fsSession = await loadSessionFromFileSystem(storedHandle);
      }
    }
  } catch {
    // Permission denied or handle unavailable — fall through
    uiStore.addToast('Folder permission denied — using cached data', 'info');
  }

  // P2-13: Compare timestamps and pick the newer session
  const picked = pickNewerSession(localSession, fsSession);
  if (!picked) return;

  const { session, source } = picked;

  // Version check
  if (session.version !== 1) {
    console.warn(`[DCAL] Unknown session version ${session.version}, skipping recovery`);
    return;
  }

  // If we didn't scan from filesystem, use session's videos as fallback
  if (scannedVideos.length === 0) {
    scannedVideos = session.videos;
  }

  // If we have a remote path, try that instead
  if (!folderHandle && session.remotePath) {
    try {
      const { scanRemotePath } = await import('../services/file-system/remote-scanner');
      const remoteVideos = await scanRemotePath(session.remotePath);
      if (remoteVideos.length > 0) {
        scannedVideos = remoteVideos;
        projStore.setRemotePath(session.remotePath);
      }
    } catch {
      // Remote path unavailable — use session data without playable URLs
    }
  }

  // P1-16: Build old → new ID mapping using path first (more unique), falling back to name
  const pathToNewId = new Map<string, string>();
  const nameToNewIds = new Map<string, string[]>();
  for (const v of scannedVideos) {
    // Use path as the primary key (unique within a folder)
    if (v.path) {
      pathToNewId.set(v.path, v.id);
    }
    // Also collect name → id mappings, tracking duplicates
    const existing = nameToNewIds.get(v.name);
    if (existing) {
      existing.push(v.id);
    } else {
      nameToNewIds.set(v.name, [v.id]);
    }
  }

  // Detect duplicate names and warn
  const duplicateNames = new Set<string>();
  for (const [name, ids] of nameToNewIds) {
    if (ids.length > 1) {
      duplicateNames.add(name);
      console.warn(`[DCAL] Duplicate video filename "${name}" found (${ids.length} videos). Path-based matching will be used where possible.`);
    }
  }

  // Remap old video IDs to new ones
  const oldIdToNewId = new Map<string, string>();
  for (const oldVideo of session.videos) {
    // Try path first (more unique)
    if (oldVideo.path && pathToNewId.has(oldVideo.path)) {
      oldIdToNewId.set(oldVideo.id, pathToNewId.get(oldVideo.path)!);
    } else if (!duplicateNames.has(oldVideo.name)) {
      // Safe to use name — it's unique
      const ids = nameToNewIds.get(oldVideo.name);
      if (ids && ids.length === 1) {
        oldIdToNewId.set(oldVideo.id, ids[0]);
      }
    } else {
      // Duplicate name and no path match — skip this video's remapping
      console.warn(`[DCAL] Skipping remap for video "${oldVideo.name}" (id=${oldVideo.id}): duplicate filename with no path match`);
    }
  }

  // Merge session video metadata (status, duration) with scanned videos using path then name
  const sessionVideoByPath = new Map(session.videos.filter((v) => v.path).map((v) => [v.path, v]));
  const sessionVideoByName = new Map(session.videos.map((v) => [v.name, v]));
  const mergedVideos = scannedVideos.map((v) => {
    const saved = (v.path && sessionVideoByPath.get(v.path)) || (!duplicateNames.has(v.name) && sessionVideoByName.get(v.name));
    if (saved) {
      return { ...v, status: saved.status, duration: saved.duration, eafPath: saved.eafPath };
    }
    return v;
  });

  // Restore project state
  projStore.setFolder(session.folderName, folderHandle);
  projStore.setVideos(mergedVideos);

  // Restore current video by matching name
  if (session.currentVideoId) {
    const newVideoId = oldIdToNewId.get(session.currentVideoId);
    if (newVideoId) {
      projStore.setCurrentVideo(newVideoId);
    } else if (mergedVideos.length > 0) {
      projStore.setCurrentVideo(mergedVideos[0].id);
    }
  }

  // Restore markers with remapped video IDs
  const remappedMarkers = session.markers
    .filter((m) => oldIdToNewId.has(m.videoId))
    .map((m) => ({ ...m, videoId: oldIdToNewId.get(m.videoId)! }));

  const remappedSpans = session.spans
    .filter((s) => oldIdToNewId.has(s.videoId))
    .map((s) => ({ ...s, videoId: oldIdToNewId.get(s.videoId)! }));

  // Filter out spans whose start/end markers don't exist
  const markerIdSet = new Set(remappedMarkers.map((m) => m.id));
  const validSpans = remappedSpans.filter(
    (s) => markerIdSet.has(s.startMarkerId) && markerIdSet.has(s.endMarkerId)
  );

  if (remappedMarkers.length > 0) {
    annStore.setMarkers(remappedMarkers);
  }
  if (validSpans.length > 0) {
    annStore.setSpans(validSpans);
  }

  // Restore tiers and marker types from session
  if (session.tiers && session.tiers.length > 0) {
    settingsStore.setTiers(session.tiers);
  }
  if (session.markerTypes && session.markerTypes.length > 0) {
    settingsStore.setMarkerTypes(session.markerTypes);
  }

  uiStore.addToast(`Restored session: ${session.folderName} (from ${source})`, 'success');
}
