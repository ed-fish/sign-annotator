import { create } from 'zustand';
import type { VideoFile } from '../types/project';

interface ProjectState {
  folderName: string;
  folderHandle: FileSystemDirectoryHandle | null;
  videos: VideoFile[];
  currentVideoId: string | null;
  lastSavedAt: number | null;
  remotePath: string | null;

  setFolder: (name: string, handle: FileSystemDirectoryHandle | null) => void;
  setRemotePath: (path: string | null) => void;
  setVideos: (videos: VideoFile[]) => void;
  addVideo: (video: VideoFile) => void;
  setCurrentVideo: (id: string | null) => void;
  updateVideoStatus: (id: string, status: VideoFile['status']) => void;
  updateVideoDuration: (id: string, duration: number) => void;
  updateVideoObjectUrl: (id: string, url: string | undefined) => void;
  setLastSavedAt: (timestamp: number) => void;
  nextVideo: () => void;
  prevVideo: () => void;
  markCurrentDone: () => void;
  removeVideo: (id: string) => void;
  removeAllVideos: () => void;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  folderName: '',
  folderHandle: null,
  videos: [],
  currentVideoId: null,
  lastSavedAt: null,
  remotePath: null,

  setFolder: (name, handle) => set({ folderName: name, folderHandle: handle }),
  setRemotePath: (path) => set({ remotePath: path }),
  setVideos: (videos) => set({ videos }),
  addVideo: (video) => set((s) => ({ videos: [...s.videos, video] })),
  setCurrentVideo: (id) => set({ currentVideoId: id }),
  updateVideoStatus: (id, status) =>
    set((s) => ({ videos: s.videos.map((v) => (v.id === id ? { ...v, status } : v)) })),
  updateVideoDuration: (id, duration) =>
    set((s) => ({ videos: s.videos.map((v) => (v.id === id ? { ...v, duration } : v)) })),
  updateVideoObjectUrl: (id, url) =>
    set((s) => ({ videos: s.videos.map((v) => (v.id === id ? { ...v, objectUrl: url } : v)) })),
  setLastSavedAt: (timestamp) => set({ lastSavedAt: timestamp }),

  nextVideo: () => {
    const { videos, currentVideoId } = get();
    const idx = videos.findIndex((v) => v.id === currentVideoId);
    if (idx < videos.length - 1) {
      set({ currentVideoId: videos[idx + 1].id });
    }
  },
  prevVideo: () => {
    const { videos, currentVideoId } = get();
    const idx = videos.findIndex((v) => v.id === currentVideoId);
    if (idx > 0) {
      set({ currentVideoId: videos[idx - 1].id });
    }
  },
  markCurrentDone: () => {
    const { currentVideoId, videos } = get();
    if (!currentVideoId) return;
    const updatedVideos = videos.map((v) =>
      v.id === currentVideoId ? { ...v, status: 'done' as const } : v
    );
    set({ videos: updatedVideos });
    // Auto-advance to next undone video
    const idx = updatedVideos.findIndex((v) => v.id === currentVideoId);
    const next = updatedVideos.slice(idx + 1).find((v) => v.status !== 'done');
    if (next) {
      set({ currentVideoId: next.id });
    }
  },
  removeVideo: (id) => {
    const { videos, currentVideoId } = get();
    const removed = videos.find((v) => v.id === id);
    if (removed?.objectUrl) URL.revokeObjectURL(removed.objectUrl);
    const newVideos = videos.filter((v) => v.id !== id);
    let newCurrentId = currentVideoId;
    if (currentVideoId === id) {
      // Select adjacent video: prefer next, fall back to previous
      const oldIdx = videos.findIndex((v) => v.id === id);
      const next = newVideos[oldIdx] ?? newVideos[oldIdx - 1] ?? null;
      newCurrentId = next?.id ?? null;
    }
    set({ videos: newVideos, currentVideoId: newCurrentId });
  },
  removeAllVideos: () => {
    const { videos } = get();
    for (const v of videos) {
      if (v.objectUrl) URL.revokeObjectURL(v.objectUrl);
    }
    set({ videos: [], currentVideoId: null, folderName: '', folderHandle: null, remotePath: null });
  },
}));
