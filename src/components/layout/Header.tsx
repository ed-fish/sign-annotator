import { useProjectStore } from '../../stores/project-store';
import { useAnnotationStore } from '../../stores/annotation-store';
import { useUiStore } from '../../stores/ui-store';

export function Header() {
  const folderName = useProjectStore((s) => s.folderName);
  const hasAnnotations = useAnnotationStore((s) => s.markers.length > 0 || s.spans.length > 0);
  const openDialog = useUiStore((s) => s.openDialog);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);

  return (
    <header className="h-12 bg-surface-1 border-b border-surface-3 flex items-center px-3 gap-3 shrink-0">
      <button
        onClick={toggleSidebar}
        className="text-zinc-400 hover:text-zinc-200 transition-colors text-sm"
        title="Toggle sidebar"
        aria-label="Toggle sidebar"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect y="2" width="16" height="2" rx="1"/><rect y="7" width="16" height="2" rx="1"/><rect y="12" width="16" height="2" rx="1"/></svg>
      </button>

      <span className="text-base font-semibold text-zinc-200 select-none">DCAL Annotator</span>

      {folderName && (
        <span className="text-sm text-zinc-400 truncate max-w-48">
          {folderName}
        </span>
      )}

      <div className="flex-1" />

      {!folderName && (
        <button
          onClick={() => openDialog('open-folder')}
          className="px-4 py-1.5 text-sm bg-accent hover:bg-accent-hover text-white rounded transition-colors"
        >
          Open Folder
        </button>
      )}

      {folderName && (
        <button
          onClick={() => openDialog('open-folder')}
          className="px-4 py-1.5 text-sm text-zinc-400 hover:text-zinc-200 bg-surface-2 hover:bg-surface-3 rounded transition-colors"
        >
          Open Folder
        </button>
      )}
      {(folderName || hasAnnotations) && (
        <button
          onClick={() => openDialog('export')}
          className="px-4 py-1.5 text-sm bg-accent hover:bg-accent-hover text-white rounded transition-colors"
        >
          Export
        </button>
      )}

      <button
        onClick={() => openDialog('settings')}
        className="text-zinc-400 hover:text-zinc-200 transition-colors"
        title="Settings"
        aria-label="Settings"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M6.5.5A.5.5 0 017 0h2a.5.5 0 01.5.5v1.12a5.5 5.5 0 011.56.64l.79-.79a.5.5 0 01.71 0l1.41 1.42a.5.5 0 010 .7l-.79.8c.29.48.5 1 .64 1.55H15a.5.5 0 01.5.5v2a.5.5 0 01-.5.5h-1.18c-.14.56-.35 1.08-.64 1.56l.79.79a.5.5 0 010 .7l-1.41 1.42a.5.5 0 01-.71 0l-.79-.79a5.5 5.5 0 01-1.56.64V15a.5.5 0 01-.5.5H7a.5.5 0 01-.5-.5v-1.18a5.5 5.5 0 01-1.56-.64l-.79.79a.5.5 0 01-.71 0L2.03 12.56a.5.5 0 010-.7l.79-.8A5.5 5.5 0 012.18 9.5H1A.5.5 0 01.5 9V7a.5.5 0 01.5-.5h1.18c.14-.56.35-1.07.64-1.55l-.79-.8a.5.5 0 010-.7L3.44 2.03a.5.5 0 01.71 0l.79.79A5.5 5.5 0 016.5 2.18V.5zM8 11a3 3 0 100-6 3 3 0 000 6z"/></svg>
      </button>
    </header>
  );
}
