import { useUiStore, type SidebarTab } from '../../stores/ui-store';
import { VideoList } from './VideoList';
import { TierPanel } from './TierPanel';
import { AnnotationList } from './AnnotationList';

const tabs: { id: SidebarTab; label: string }[] = [
  { id: 'videos', label: 'Videos' },
  { id: 'tiers', label: 'Tiers' },
  { id: 'annotations', label: 'Annots' },
];

export function Sidebar() {
  const activeTab = useUiStore((s) => s.sidebarTab);
  const setTab = useUiStore((s) => s.setSidebarTab);

  return (
    <div className="flex flex-col h-full">
      <div className="flex border-b border-surface-3 shrink-0">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setTab(tab.id)}
            className={`flex-1 px-2 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'text-zinc-200 border-b-2 border-accent bg-surface-2/50'
                : 'text-zinc-400 hover:text-zinc-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'videos' && <VideoList />}
        {activeTab === 'tiers' && <TierPanel />}
        {activeTab === 'annotations' && <AnnotationList />}
      </div>
    </div>
  );
}
