import { get, set, del } from 'idb-keyval';
import type { ProjectSession } from '../../types/project';

const SESSION_KEY = 'dcal-session';
const HANDLE_KEY = 'dcal-folder-handle';

/** Save session to localStorage as fallback */
export function saveSessionToLocalStorage(session: ProjectSession): void {
  try {
    // Strip objectUrl, fileHandle, and eafHandle which can't be serialized
    const cleaned = {
      ...session,
      videos: session.videos.map(({ objectUrl: _o, fileHandle: _f, eafHandle: _e, ...rest }) => rest),
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(cleaned));
  } catch {
    // localStorage full or unavailable
  }
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

/** Load session from localStorage */
export function loadSessionFromLocalStorage(): ProjectSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isValidSession(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Store directory handle in IndexedDB for session recovery */
export async function storeDirectoryHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  await set(HANDLE_KEY, handle);
}

/** Retrieve stored directory handle */
export async function getStoredDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    return (await get(HANDLE_KEY)) ?? null;
  } catch {
    return null;
  }
}

/** Clear stored directory handle */
export async function clearStoredDirectoryHandle(): Promise<void> {
  await del(HANDLE_KEY);
}
