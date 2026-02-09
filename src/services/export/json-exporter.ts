import type { Marker, AnnotationSpan, Tier, MarkerType } from '../../types/annotation';

interface JsonExportOptions {
  markers: Marker[];
  spans: AnnotationSpan[];
  tiers: Tier[];
  markerTypes: MarkerType[];
  videoName: string;
  annotator?: string;
  version?: string;
}

export function exportAnnotationsJson(options: JsonExportOptions): string;
export function exportAnnotationsJson(
  markers: Marker[],
  spans: AnnotationSpan[],
  tiers: Tier[],
  markerTypes: MarkerType[],
  videoName: string,
  annotator?: string,
  version?: string,
): string;
export function exportAnnotationsJson(
  markersOrOpts: Marker[] | JsonExportOptions,
  spansArg?: AnnotationSpan[],
  tiersArg?: Tier[],
  markerTypesArg?: MarkerType[],
  videoNameArg?: string,
  annotatorArg?: string,
  versionArg?: string,
): string {
  let markers: Marker[];
  let spans: AnnotationSpan[];
  let tiers: Tier[];
  let markerTypes: MarkerType[];
  let videoName: string;
  let annotator: string | undefined;
  let version: string | undefined;

  if (Array.isArray(markersOrOpts)) {
    markers = markersOrOpts;
    spans = spansArg!;
    tiers = tiersArg!;
    markerTypes = markerTypesArg!;
    videoName = videoNameArg!;
    annotator = annotatorArg;
    version = versionArg;
  } else {
    ({ markers, spans, tiers, markerTypes, videoName, annotator, version } = markersOrOpts);
  }

  const tierMap = new Map(tiers.map((t) => [t.id, t.name]));
  const typeMap = new Map(markerTypes.map((mt) => [mt.id, mt.name]));
  const markerMap = new Map(markers.map((m) => [m.id, m]));

  // P1-11: Filter out spans whose start or end marker doesn't exist
  const validSpans = spans.filter(
    (s) => markerMap.has(s.startMarkerId) && markerMap.has(s.endMarkerId)
  );

  return JSON.stringify(
    {
      video: videoName,
      exportedAt: new Date().toISOString(),
      ...(annotator ? { annotator } : {}),
      ...(version ? { version } : {}),
      tiers: tiers.map((t) => ({ id: t.id, name: t.name })),
      markerTypes: markerTypes.map((mt) => ({ id: mt.id, name: mt.name, key: mt.key })),
      markers: markers
        .filter((m) => m.confirmed)
        .sort((a, b) => a.time - b.time)
        .map((m) => ({
          id: m.id,
          time: Math.round(m.time),
          type: typeMap.get(m.typeId) ?? '',
          tier: tierMap.get(m.tierId) ?? '',
        })),
      spans: validSpans.map((s) => ({
        start: Math.round(markerMap.get(s.startMarkerId)!.time),
        end: Math.round(markerMap.get(s.endMarkerId)!.time),
        gloss: s.gloss,
        tier: tierMap.get(s.tierId) ?? '',
      })),
    },
    null,
    2
  );
}
