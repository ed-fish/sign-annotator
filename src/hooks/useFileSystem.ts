import { useCallback } from 'react';
import { useProjectStore } from '../stores/project-store';
import { useUiStore } from '../stores/ui-store';
import { scanFolder, scanFileList } from '../services/file-system/folder-scanner';
import { hasFileSystemAccess } from '../services/file-system/file-writer';
import { storeDirectoryHandle } from '../services/file-system/fallback-io';

export function useFileSystem() {
  const setFolder = useProjectStore((s) => s.setFolder);
  const setVideos = useProjectStore((s) => s.setVideos);
  const setCurrentVideo = useProjectStore((s) => s.setCurrentVideo);
  const addToast = useUiStore((s) => s.addToast);

  const openFolder = useCallback(async () => {
    if (hasFileSystemAccess()) {
      try {
        const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
        const result = await scanFolder(dirHandle);
        setFolder(dirHandle.name, dirHandle);
        setVideos(result.videos);
        if (result.videos.length > 0) {
          setCurrentVideo(result.videos[0].id);
        }
        await storeDirectoryHandle(dirHandle);
        addToast(`Opened folder: ${dirHandle.name} (${result.videos.length} videos)`, 'success');
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        addToast('Failed to open folder', 'error');
      }
    }
  }, [setFolder, setVideos, setCurrentVideo, addToast]);

  const openFolderFallback = useCallback(
    (files: FileList) => {
      const result = scanFileList(files);
      // Extract folder name from webkitRelativePath
      const firstPath = files[0]?.webkitRelativePath ?? '';
      const folderName = firstPath.split('/')[0] || 'Uploaded Files';
      setFolder(folderName, null);
      setVideos(result.videos);
      if (result.videos.length > 0) {
        setCurrentVideo(result.videos[0].id);
      }
      addToast(`Opened: ${folderName} (${result.videos.length} videos)`, 'success');
    },
    [setFolder, setVideos, setCurrentVideo, addToast]
  );

  return { openFolder, openFolderFallback, hasFileSystemAccess: hasFileSystemAccess() };
}
