import { useEffect } from 'react';
import { useProjectStore } from '../stores/project-store';
import { useAnnotationStore } from '../stores/annotation-store';
import { useSettingsStore } from '../stores/settings-store';
import { useUiStore } from '../stores/ui-store';
import { importEafForVideo, importDcalAnnotationsFromEaf } from '../services/elan/eaf-importer';
import { readRemoteFile } from '../services/file-system/remote-scanner';

export function useEafImport() {
  const currentVideoId = useProjectStore((s) => s.currentVideoId);
  const videos = useProjectStore((s) => s.videos);
  const setElanData = useAnnotationStore((s) => s.setElanData);
  const clearElanData = useAnnotationStore((s) => s.clearElanData);

  useEffect(() => {
    if (!currentVideoId) {
      clearElanData();
      return;
    }

    const video = videos.find((v) => v.id === currentVideoId);
    if (!video || (!video.eafPath && !video.eafHandle)) {
      clearElanData();
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        let xml: string;
        if (video.eafHandle) {
          const file = await video.eafHandle.getFile();
          xml = await file.text();
        } else if (video.eafPath) {
          xml = await readRemoteFile(video.eafPath);
        } else {
          return;
        }

        if (cancelled) return;

        // Import non-dcal tiers as read-only ELAN display data
        const { tiers, spans } = importEafForVideo(xml, currentVideoId);
        setElanData(tiers, spans);

        // If this video has no existing DCAL markers, import dcal- tiers as editable annotations
        const annStore = useAnnotationStore.getState();
        const existingMarkers = annStore.markers.filter((m) => m.videoId === currentVideoId);
        if (existingMarkers.length === 0) {
          const { tiers: settingsTiers, markerTypes } = useSettingsStore.getState();
          const dcalImport = importDcalAnnotationsFromEaf(xml, currentVideoId, settingsTiers, markerTypes);

          if (dcalImport.markers.length > 0) {
            // Create any missing tiers first
            if (dcalImport.newTiers.length > 0) {
              const currentTiers = useSettingsStore.getState().tiers;
              useSettingsStore.getState().setTiers([...currentTiers, ...dcalImport.newTiers]);
            }

            // Add imported markers and spans
            annStore.setMarkers([...annStore.markers, ...dcalImport.markers]);
            annStore.setSpans([...annStore.spans, ...dcalImport.spans]);

            const count = dcalImport.markers.length;
            const spanCount = dcalImport.spans.length;
            useUiStore.getState().addToast(
              `Imported ${count} markers and ${spanCount} spans from EAF`,
              'success'
            );
          }
        }
      } catch (err) {
        console.warn('[DCAL] Failed to import EAF:', err);
        if (!cancelled) clearElanData();
      }
    })();

    return () => { cancelled = true; };
  }, [currentVideoId, videos, setElanData, clearElanData]);
}
