import type { VideoFile } from '../../types/project';
import { generateId } from '../../utils/id-generator';
import { getBaseName } from '../../utils/video-formats';

interface ScanResponse {
  folderName: string;
  videos: { name: string; path: string; size: number }[];
  eafFiles: { name: string; path: string }[];
}

export async function scanRemotePath(dirPath: string): Promise<VideoFile[]> {
  const res = await fetch('/api/scan-path', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dirPath }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to scan path');
  }
  const data: ScanResponse = await res.json();

  // Build eaf lookup by basename
  const eafByBase = new Map<string, string>();
  for (const eaf of data.eafFiles) {
    eafByBase.set(getBaseName(eaf.name), eaf.path);
  }

  return data.videos.map((v) => {
    const eafPath = eafByBase.get(getBaseName(v.name));
    return {
      id: generateId('v'),
      name: v.name,
      path: v.path,
      duration: 0,
      status: 'pending' as const,
      objectUrl: `/api/serve-video?path=${encodeURIComponent(v.path)}`,
      ...(eafPath ? { eafPath } : {}),
    };
  });
}

export async function getRemoteEafFiles(dirPath: string): Promise<{ name: string; path: string }[]> {
  const res = await fetch('/api/scan-path', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dirPath }),
  });
  if (!res.ok) return [];
  const data: ScanResponse = await res.json();
  return data.eafFiles;
}

export async function readRemoteFile(filePath: string): Promise<string> {
  const res = await fetch('/api/read-file', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filePath }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to read file');
  }
  return await res.text();
}

export async function writeRemoteFile(filePath: string, content: string): Promise<void> {
  const res = await fetch('/api/write-file', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filePath, content }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to write file');
  }
}
