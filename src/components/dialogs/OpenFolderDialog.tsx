import { useRef, useState } from 'react';
import { DialogShell } from './DialogShell';
import { useFileSystem } from '../../hooks/useFileSystem';
import { useUiStore } from '../../stores/ui-store';
import { useProjectStore } from '../../stores/project-store';
import { scanRemotePath } from '../../services/file-system/remote-scanner';

export function OpenFolderDialog() {
  const closeDialog = useUiStore((s) => s.closeDialog);
  const addToast = useUiStore((s) => s.addToast);
  const { openFolder, openFolderFallback, hasFileSystemAccess } = useFileSystem();
  const inputRef = useRef<HTMLInputElement>(null);
  const [remotePath, setRemotePath] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState('');

  const handleFallback = () => {
    inputRef.current?.click();
  };

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      openFolderFallback(e.target.files);
      closeDialog();
    }
  };

  const handleRemoteScan = async () => {
    const trimmed = remotePath.trim();
    if (!trimmed) return;
    setScanning(true);
    setScanError('');
    try {
      const videos = await scanRemotePath(trimmed);
      if (videos.length === 0) {
        setScanError('No video files found in that directory');
        return;
      }
      const folderName = trimmed.split('/').filter(Boolean).pop() || trimmed;
      const projStore = useProjectStore.getState();
      projStore.setFolder(folderName, null);
      projStore.setVideos(videos);
      projStore.setCurrentVideo(videos[0].id);
      projStore.setRemotePath(trimmed);
      addToast(`Opened remote: ${folderName} (${videos.length} videos)`, 'success');
      closeDialog();
    } catch (err) {
      setScanError((err as Error).message);
    } finally {
      setScanning(false);
    }
  };

  return (
    <DialogShell title="Open Video Folder" onClose={closeDialog}>
      <div className="space-y-4">
        {hasFileSystemAccess ? (
          <button
            onClick={async () => {
              await openFolder();
              closeDialog();
            }}
            className="w-full py-8 border-2 border-dashed border-surface-3 rounded-lg hover:border-accent hover:bg-accent/5 transition-colors text-center"
          >
            <div className="text-2xl mb-2">📁</div>
            <div className="text-sm text-zinc-300">Click to select a folder</div>
            <div className="text-xs text-zinc-500 mt-1">
              Choose a folder containing video files (.mp4, .webm, etc.)
            </div>
          </button>
        ) : (
          <>
            <button
              onClick={handleFallback}
              className="w-full py-8 border-2 border-dashed border-surface-3 rounded-lg hover:border-accent hover:bg-accent/5 transition-colors text-center"
            >
              <div className="text-2xl mb-2">📁</div>
              <div className="text-sm text-zinc-300">Click to select a folder</div>
              <div className="text-xs text-zinc-500 mt-1">
                Your browser uses the folder upload dialog
              </div>
            </button>
            <input
              ref={inputRef}
              type="file"
              // @ts-expect-error webkitdirectory is non-standard
              webkitdirectory=""
              multiple
              className="hidden"
              onChange={handleFiles}
            />
          </>
        )}

        <div className="border-t border-surface-3 pt-3">
          <div className="text-sm text-zinc-400 mb-2">Or enter a server path:</div>
          <div className="flex gap-2">
            <input
              type="text"
              value={remotePath}
              onChange={(e) => setRemotePath(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRemoteScan();
              }}
              placeholder="/path/to/video/folder"
              className="flex-1 px-3 py-1.5 bg-surface-2 border border-surface-3 rounded text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-accent"
            />
            <button
              onClick={handleRemoteScan}
              disabled={scanning || !remotePath.trim()}
              className="px-3 py-1.5 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white text-sm rounded transition-colors"
            >
              {scanning ? 'Scanning...' : 'Scan'}
            </button>
          </div>
          {scanError && (
            <div className="mt-1.5 text-xs text-red-400">{scanError}</div>
          )}
          <div className="mt-1.5 text-xs text-zinc-500">
            Use this when accessing a remote dev server via browser
          </div>
        </div>

        <div className="text-xs text-zinc-500">
          Supported formats: MP4, WebM, OGG, MOV, AVI, MKV
        </div>
      </div>
    </DialogShell>
  );
}
