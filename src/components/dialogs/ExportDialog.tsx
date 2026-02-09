import { useState } from 'react';
import { DialogShell } from './DialogShell';
import { useUiStore } from '../../stores/ui-store';
import { useAnnotationStore } from '../../stores/annotation-store';
import { useProjectStore } from '../../stores/project-store';
import { useSettingsStore } from '../../stores/settings-store';
import { generateEaf } from '../../services/elan/eaf-writer';
import { mergeEaf } from '../../services/elan/eaf-merger';
import { exportMarkersCsv } from '../../services/export/csv-exporter';
import { exportAnnotationsJson } from '../../services/export/json-exporter';
import { writeFile, hasFileSystemAccess, downloadFile, findSafeFilename } from '../../services/file-system/file-writer';
import { writeRemoteFile, readRemoteFile } from '../../services/file-system/remote-scanner';
import { getBaseName } from '../../utils/video-formats';
import type { VideoFile } from '../../types/project';

type ExportFormat = 'eaf' | 'csv' | 'json';
type EafMergeMode = 'dcal-only' | 'merge';

/** Check if a video has original EAF content available (via handle or remote path) */
function videoHasEaf(video: VideoFile): boolean {
  return !!(video.eafHandle || video.eafPath);
}

/** Read original EAF content from a video's associated file */
async function readOriginalEaf(video: VideoFile): Promise<string | null> {
  try {
    if (video.eafHandle) {
      const file = await video.eafHandle.getFile();
      return await file.text();
    }
    if (video.eafPath) {
      return await readRemoteFile(video.eafPath);
    }
  } catch {
    // Fall through to null
  }
  return null;
}

const APP_VERSION = '0.1.0';

export function ExportDialog() {
  const closeDialog = useUiStore((s) => s.closeDialog);
  const addToast = useUiStore((s) => s.addToast);
  const markers = useAnnotationStore((s) => s.markers);
  const spans = useAnnotationStore((s) => s.spans);
  const videos = useProjectStore((s) => s.videos);
  const remotePath = useProjectStore((s) => s.remotePath);
  const tiers = useSettingsStore((s) => s.tiers);
  const markerTypes = useSettingsStore((s) => s.markerTypes);
  const annotatorId = useSettingsStore((s) => s.annotatorId);
  const [format, setFormat] = useState<ExportFormat>('eaf');
  const [scope, setScope] = useState<'current' | 'all'>('all');
  const [mergeMode, setMergeMode] = useState<EafMergeMode>('dcal-only');
  const [skipEmpty, setSkipEmpty] = useState(true);
  const [exporting, setExporting] = useState(false);
  const currentVideoId = useProjectStore((s) => s.currentVideoId);

  // Preview step state
  const [previewContents, setPreviewContents] = useState<Map<string, string>>(new Map());
  const [activePreviewVideoId, setActivePreviewVideoId] = useState<string | null>(null);
  const showPreview = previewContents.size > 0;

  // Output location state
  const [outputDirHandle, setOutputDirHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [outputDirName, setOutputDirName] = useState('');
  const [remoteOutputPath, setRemoteOutputPath] = useState('');

  const hasLocalFS = hasFileSystemAccess();
  const isRemoteMode = !!remotePath;

  // P2-15: Check if any video in scope has original EAF content
  const scopeVideos = scope === 'current'
    ? videos.filter((v) => v.id === currentVideoId)
    : videos;
  const anyVideoHasEaf = scopeVideos.some(videoHasEaf);

  const chooseOutputFolder = async () => {
    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
      setOutputDirHandle(handle);
      setOutputDirName(handle.name);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      addToast('Failed to select output folder', 'error');
    }
  };

  /** Generate EAF content for a single video */
  const generateEafForVideo = async (video: VideoFile) => {
    const videoMarkers = markers.filter((m) => m.videoId === video.id);
    const videoSpans = spans.filter((s) => s.videoId === video.id);

    if (mergeMode === 'merge') {
      const originalEaf = await readOriginalEaf(video);
      if (originalEaf) {
        return mergeEaf({
          existingEaf: originalEaf,
          markers: videoMarkers,
          spans: videoSpans,
          tiers,
          markerTypes,
        });
      }
      addToast(`No original EAF found for "${video.name}" — using DCAL-only export`, 'warning');
    }
    return generateEaf({
      mediaFile: video.name,
      mediaUrl: `./${video.name}`,
      markers: videoMarkers,
      spans: videoSpans,
      tiers,
      markerTypes,
      author: annotatorId || 'DCAL Annotator',
      participant: annotatorId || undefined,
    });
  };

  /** Step 1 for EAF: generate previews; for other formats, export directly */
  const handleExport = async () => {
    if (format === 'eaf') {
      // Generate preview content for all target videos
      setExporting(true);
      try {
        const targetVideos = scope === 'current'
          ? videos.filter((v) => v.id === currentVideoId)
          : videos;

        const contents = new Map<string, string>();
        for (const video of targetVideos) {
          const videoMarkers = markers.filter((m) => m.videoId === video.id);
          const videoSpans = spans.filter((s) => s.videoId === video.id);
          const confirmedMarkers = videoMarkers.filter((m) => m.confirmed);
          if (skipEmpty && scope === 'all' && confirmedMarkers.length === 0 && videoSpans.length === 0) continue;
          const content = await generateEafForVideo(video);
          contents.set(video.id, content);
        }

        if (contents.size === 0) {
          addToast('No annotations to export', 'info');
          setExporting(false);
          return;
        }

        setPreviewContents(contents);
        setActivePreviewVideoId(contents.keys().next().value ?? null);
      } catch (err) {
        addToast('Preview generation failed: ' + (err as Error).message, 'error');
      } finally {
        setExporting(false);
      }
      return;
    }

    // Non-EAF formats: export directly
    await doExport();
  };

  /** Update preview content when user edits the textarea */
  const handlePreviewEdit = (videoId: string, newContent: string) => {
    setPreviewContents((prev) => {
      const next = new Map(prev);
      next.set(videoId, newContent);
      return next;
    });
  };

  /** Step 2: Actually write files (uses preview content for EAF, generates fresh for others) */
  const doExport = async () => {
    setExporting(true);
    try {
      const targetVideos = scope === 'current'
        ? videos.filter((v) => v.id === currentVideoId)
        : videos;

      let exportedCount = 0;
      let skippedCount = 0;

      for (const video of targetVideos) {
        const videoMarkers = markers.filter((m) => m.videoId === video.id);
        const videoSpans = spans.filter((s) => s.videoId === video.id);
        const confirmedMarkers = videoMarkers.filter((m) => m.confirmed);

        if (skipEmpty && scope === 'all' && confirmedMarkers.length === 0 && videoSpans.length === 0) {
          skippedCount++;
          continue;
        }

        const baseName = getBaseName(video.name);

        let content: string;
        let desiredFilename: string;
        let mimeType: string;

        switch (format) {
          case 'eaf':
            // Use the (possibly edited) preview content
            content = previewContents.get(video.id) ?? await generateEafForVideo(video);
            desiredFilename = `${baseName}.eaf`;
            mimeType = 'application/xml';
            break;
          case 'csv':
            content = exportMarkersCsv(videoMarkers, tiers, markerTypes, video.name, annotatorId ?? undefined, videoSpans);
            desiredFilename = `${baseName}.csv`;
            mimeType = 'text/csv';
            break;
          case 'json':
            content = exportAnnotationsJson(
              videoMarkers, videoSpans, tiers, markerTypes, video.name,
              annotatorId ?? undefined, APP_VERSION
            );
            desiredFilename = `${baseName}.json`;
            mimeType = 'application/json';
            break;
        }

        // Write to chosen output location
        if (outputDirHandle) {
          const safeFilename = await findSafeFilename(outputDirHandle, desiredFilename);
          await writeFile(outputDirHandle, safeFilename, content);
        } else if (isRemoteMode && remoteOutputPath.trim()) {
          const outPath = `${remoteOutputPath.trim().replace(/\/$/, '')}/${desiredFilename}`;
          await writeRemoteFile(outPath, content);
        } else if (hasLocalFS) {
          addToast('Please choose an output folder first', 'error');
          setExporting(false);
          return;
        } else {
          downloadFile(desiredFilename, content, mimeType);
        }
        exportedCount++;
      }

      const skippedMsg = skippedCount > 0 ? ` (${skippedCount} empty video(s) skipped)` : '';
      addToast(`Exported ${exportedCount} file(s) as ${format.toUpperCase()}${skippedMsg}`, 'success');
      closeDialog();
    } catch (err) {
      addToast('Export failed: ' + (err as Error).message, 'error');
    } finally {
      setExporting(false);
    }
  };

  const canExport = !hasLocalFS || outputDirHandle || (isRemoteMode && remoteOutputPath.trim());

  // Preview video navigation
  const previewVideoIds = [...previewContents.keys()];
  const previewVideoIdx = activePreviewVideoId ? previewVideoIds.indexOf(activePreviewVideoId) : 0;
  const activePreviewVideo = activePreviewVideoId ? videos.find((v) => v.id === activePreviewVideoId) : null;

  // Preview mode: show editable EAF XML
  if (showPreview) {
    return (
      <DialogShell title="Review EAF Before Export" onClose={closeDialog} wide>
        <div className="space-y-3">
          {/* Video selector for multi-video export */}
          {previewVideoIds.length > 1 && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActivePreviewVideoId(previewVideoIds[Math.max(0, previewVideoIdx - 1)])}
                disabled={previewVideoIdx === 0}
                className="px-2 py-1 text-xs bg-surface-2 hover:bg-surface-3 disabled:opacity-30 rounded text-zinc-400"
              >
                Prev
              </button>
              <span className="text-sm text-zinc-300 truncate flex-1 text-center">
                {activePreviewVideo?.name ?? 'Unknown'} ({previewVideoIdx + 1}/{previewVideoIds.length})
              </span>
              <button
                onClick={() => setActivePreviewVideoId(previewVideoIds[Math.min(previewVideoIds.length - 1, previewVideoIdx + 1)])}
                disabled={previewVideoIdx === previewVideoIds.length - 1}
                className="px-2 py-1 text-xs bg-surface-2 hover:bg-surface-3 disabled:opacity-30 rounded text-zinc-400"
              >
                Next
              </button>
            </div>
          )}
          {previewVideoIds.length === 1 && (
            <div className="text-sm text-zinc-400 truncate">
              {activePreviewVideo?.name ?? 'Unknown'}
            </div>
          )}

          {/* Editable XML textarea */}
          <textarea
            value={activePreviewVideoId ? previewContents.get(activePreviewVideoId) ?? '' : ''}
            onChange={(e) => activePreviewVideoId && handlePreviewEdit(activePreviewVideoId, e.target.value)}
            className="w-full h-80 bg-zinc-950 text-zinc-300 text-xs font-mono p-3 rounded border border-surface-3 focus:outline-none focus:border-accent resize-y"
            spellCheck={false}
          />
          <div className="text-xs text-zinc-500">
            Review the EAF XML above. You can make small edits before exporting.
          </div>

          {/* Action buttons */}
          <div className="flex gap-2">
            <button
              onClick={() => { setPreviewContents(new Map()); setActivePreviewVideoId(null); }}
              className="flex-1 py-2 bg-surface-2 hover:bg-surface-3 text-zinc-400 text-sm rounded transition-colors"
            >
              Back
            </button>
            <button
              onClick={doExport}
              disabled={exporting}
              className="flex-1 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white text-sm rounded transition-colors"
            >
              {exporting ? 'Exporting...' : `Export ${previewVideoIds.length} file(s)`}
            </button>
          </div>
        </div>
      </DialogShell>
    );
  }

  return (
    <DialogShell title="Export Annotations" onClose={closeDialog}>
      <div className="space-y-4">
        {/* Output location */}
        <div>
          <label className="text-sm text-zinc-400 block mb-1.5">Output Location</label>
          {hasLocalFS && (
            <button
              onClick={chooseOutputFolder}
              className="w-full text-left px-3 py-2 bg-surface-2 hover:bg-surface-3 rounded transition-colors"
            >
              <div className="text-sm text-zinc-200">
                {outputDirName ? `Folder: ${outputDirName}` : 'Choose Output Folder...'}
              </div>
              <div className="text-xs text-zinc-400">
                Exported files will never overwrite existing files
              </div>
            </button>
          )}
          {isRemoteMode && (
            <div className="mt-2">
              <input
                type="text"
                value={remoteOutputPath}
                onChange={(e) => setRemoteOutputPath(e.target.value)}
                placeholder="/path/to/output/folder"
                className="w-full px-3 py-1.5 bg-surface-2 border border-surface-3 rounded text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-accent"
              />
              <div className="text-xs text-zinc-500 mt-1">Remote output directory path</div>
            </div>
          )}
          {!hasLocalFS && !isRemoteMode && (
            <div className="text-xs text-zinc-500 bg-surface-2 rounded p-2">
              Files will be downloaded via your browser
            </div>
          )}
        </div>

        {/* Format */}
        <div>
          <label className="text-sm text-zinc-400 block mb-1.5">Format</label>
          <div className="flex gap-2">
            {(['eaf', 'csv', 'json'] as ExportFormat[]).map((f) => (
              <button
                key={f}
                onClick={() => setFormat(f)}
                className={`px-3 py-1.5 text-sm rounded transition-colors ${
                  format === f
                    ? 'bg-accent text-white'
                    : 'bg-surface-2 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {f === 'eaf' ? 'ELAN (.eaf)' : f.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* EAF merge mode — P2-15: only show when at least one video has original EAF */}
        {format === 'eaf' && anyVideoHasEaf && (
          <div>
            <label className="text-sm text-zinc-400 block mb-1.5">EAF Content</label>
            <div className="flex gap-2">
              <button
                onClick={() => setMergeMode('dcal-only')}
                className={`px-3 py-1.5 text-sm rounded transition-colors ${
                  mergeMode === 'dcal-only'
                    ? 'bg-accent text-white'
                    : 'bg-surface-2 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                DCAL annotations only
              </button>
              <button
                onClick={() => setMergeMode('merge')}
                className={`px-3 py-1.5 text-sm rounded transition-colors ${
                  mergeMode === 'merge'
                    ? 'bg-accent text-white'
                    : 'bg-surface-2 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Merge with original EAF
              </button>
            </div>
            <div className="text-xs text-zinc-500 mt-1.5">
              {mergeMode === 'dcal-only'
                ? 'Only exports new DCAL annotation tiers (prefixed with "dcal-")'
                : 'Includes existing tiers from the original .eaf file alongside new DCAL tiers'}
            </div>
          </div>
        )}

        {/* Scope */}
        <div>
          <label className="text-sm text-zinc-400 block mb-1.5">Scope</label>
          <div className="flex gap-2">
            <button
              onClick={() => setScope('all')}
              className={`px-3 py-1.5 text-sm rounded transition-colors ${
                scope === 'all'
                  ? 'bg-accent text-white'
                  : 'bg-surface-2 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              All videos ({videos.length})
            </button>
            <button
              onClick={() => setScope('current')}
              className={`px-3 py-1.5 text-sm rounded transition-colors ${
                scope === 'current'
                  ? 'bg-accent text-white'
                  : 'bg-surface-2 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Current video
            </button>
          </div>
        </div>

        {/* P2-21: Skip empty videos option */}
        {scope === 'all' && (
          <label className="flex items-center gap-2 text-sm text-zinc-400 cursor-pointer">
            <input
              type="checkbox"
              checked={skipEmpty}
              onChange={(e) => setSkipEmpty(e.target.checked)}
              className="accent-accent"
            />
            Skip videos with no annotations
          </label>
        )}

        {/* Annotator info */}
        {annotatorId && (
          <div className="text-xs text-zinc-500 bg-surface-2 rounded p-2">
            Author: {annotatorId}
          </div>
        )}

        <button
          onClick={handleExport}
          disabled={exporting || !canExport}
          className="w-full py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white text-sm rounded transition-colors"
        >
          {exporting ? 'Generating...' : format === 'eaf' ? 'Preview & Export' : 'Export'}
        </button>
      </div>
    </DialogShell>
  );
}
