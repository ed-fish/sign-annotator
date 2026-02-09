import { useCallback, type ReactNode } from 'react';
import { useUiStore } from '../../stores/ui-store';
import { useResizeHandle } from '../../hooks/useResizeHandle';
import { Header } from './Header';
import { StatusBar } from './StatusBar';

interface AppLayoutProps {
  sidebar: ReactNode;
  main: ReactNode;
  timeline: ReactNode;
}

export function AppLayout({ sidebar, main, timeline }: AppLayoutProps) {
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const sidebarWidth = useUiStore((s) => s.sidebarWidth);
  const timelineHeight = useUiStore((s) => s.timelineHeight);
  const setSidebarWidth = useUiStore((s) => s.setSidebarWidth);
  const setTimelineHeight = useUiStore((s) => s.setTimelineHeight);

  const handleSidebarResize = useCallback(
    (delta: number) => setSidebarWidth(useUiStore.getState().sidebarWidth + delta),
    [setSidebarWidth]
  );
  const handleTimelineResize = useCallback(
    (delta: number) => setTimelineHeight(useUiStore.getState().timelineHeight - delta),
    [setTimelineHeight]
  );

  const sidebarHandle = useResizeHandle('horizontal', handleSidebarResize);
  const timelineHandle = useResizeHandle('vertical', handleTimelineResize);

  return (
    <div className="h-screen flex flex-col bg-surface-0">
      <Header />
      <div className="flex-1 flex overflow-hidden">
        {sidebarOpen && (
          <>
            <aside
              className="bg-surface-1 border-r border-surface-3 overflow-y-auto shrink-0"
              style={{ width: sidebarWidth }}
            >
              {sidebar}
            </aside>
            <div
              className="w-2 shrink-0 cursor-col-resize hover:bg-accent/40 active:bg-accent/60 transition-colors relative before:absolute before:inset-y-0 before:-left-1 before:-right-1 before:content-['']"
              onPointerDown={sidebarHandle.handlePointerDown}
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize sidebar"
            />
          </>
        )}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-hidden relative">
            {main}
          </div>
          <div
            className="h-2 shrink-0 cursor-row-resize hover:bg-accent/40 active:bg-accent/60 transition-colors relative before:absolute before:-top-1 before:-bottom-1 before:inset-x-0 before:content-['']"
            onPointerDown={timelineHandle.handlePointerDown}
            role="separator"
            aria-orientation="horizontal"
            aria-label="Resize timeline"
          />
          <div
            className="bg-surface-1 border-t border-surface-3 overflow-hidden"
            style={{ height: timelineHeight }}
          >
            {timeline}
          </div>
        </div>
      </div>
      <StatusBar />
    </div>
  );
}
