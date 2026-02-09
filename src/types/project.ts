import type { Marker, AnnotationSpan, Tier, MarkerType } from './annotation';

export interface VideoFile {
  id: string;
  name: string;
  path: string; // relative path within folder
  duration: number; // seconds, 0 until loaded
  status: 'pending' | 'in-progress' | 'done';
  objectUrl?: string;
  fileHandle?: FileSystemFileHandle;
  eafPath?: string;
  eafHandle?: FileSystemFileHandle;
}

export interface ProjectSession {
  version: number;
  folderName: string;
  videos: VideoFile[];
  markers: Marker[];
  spans: AnnotationSpan[];
  tiers: Tier[];
  markerTypes: MarkerType[];
  currentVideoId: string | null;
  savedAt: number; // timestamp
  remotePath?: string;
}
