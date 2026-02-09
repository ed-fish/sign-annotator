import type { VideoFile } from '../../types/project';
import { isVideoFile, getBaseName } from '../../utils/video-formats';
import { generateId } from '../../utils/id-generator';

export interface ScanResult {
  videos: VideoFile[];
  eafFiles: Map<string, FileSystemFileHandle>; // basename -> handle
}

/** Scan a directory handle for video and EAF files */
export async function scanFolder(dirHandle: FileSystemDirectoryHandle): Promise<ScanResult> {
  const videos: VideoFile[] = [];
  const eafFiles = new Map<string, FileSystemFileHandle>();

  for await (const entry of dirHandle.values()) {
    if (entry.kind !== 'file') continue;
    const fileEntry = entry as FileSystemFileHandle;
    const name = fileEntry.name;

    if (isVideoFile(name)) {
      videos.push({
        id: generateId('v'),
        name,
        path: name,
        duration: 0,
        status: 'pending' as const,
        // No objectUrl here — created lazily when the video is selected
        fileHandle: fileEntry,
      });
    } else if (name.endsWith('.eaf')) {
      eafFiles.set(name, fileEntry);
    }
  }

  // Sort videos alphabetically
  videos.sort((a, b) => a.name.localeCompare(b.name));

  // Match EAF files to videos by basename
  for (const video of videos) {
    const eafHandle = eafFiles.get(getBaseName(video.name) + '.eaf');
    if (eafHandle) {
      video.eafHandle = eafHandle;
    }
  }

  return { videos, eafFiles };
}

/** Scan using fallback <input> file list */
export function scanFileList(files: FileList): ScanResult {
  const videos: VideoFile[] = [];
  const eafFiles = new Map<string, FileSystemFileHandle>();

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (isVideoFile(file.name)) {
      const objectUrl = URL.createObjectURL(file);
      videos.push({
        id: generateId('v'),
        name: file.name,
        path: file.webkitRelativePath || file.name,
        duration: 0,
        status: 'pending',
        objectUrl,
      });
    }
    // Note: can't get FileSystemFileHandle from FileList in fallback mode
  }

  videos.sort((a, b) => a.name.localeCompare(b.name));
  return { videos, eafFiles };
}
