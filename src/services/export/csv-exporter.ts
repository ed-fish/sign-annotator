import type { Marker, AnnotationSpan, Tier, MarkerType } from '../../types/annotation';

/** Escape a CSV field: wrap in double-quotes and escape internal double-quotes */
function csvEscape(value: string): string {
  if (value.includes('"') || value.includes(',') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return `"${value}"`;
}

export function exportMarkersCsv(
  markers: Marker[],
  tiers: Tier[],
  markerTypes: MarkerType[],
  videoName: string,
  annotatorId?: string,
  spans?: AnnotationSpan[]
): string {
  const confirmed = markers.filter((m) => m.confirmed).sort((a, b) => a.time - b.time);
  const tierMap = new Map(tiers.map((t) => [t.id, t.name]));
  const typeMap = new Map(markerTypes.map((mt) => [mt.id, mt.name]));
  const markerMap = new Map(markers.map((m) => [m.id, m]));

  // Marker rows
  const rows = [['Video', 'Time (ms)', 'Time (s)', 'Tier', 'Marker Type', 'Annotator'].join(',')];
  for (const m of confirmed) {
    rows.push(
      [
        csvEscape(videoName),
        String(Math.round(m.time)),
        (m.time / 1000).toFixed(3),
        csvEscape(tierMap.get(m.tierId) ?? ''),
        csvEscape(typeMap.get(m.typeId) ?? ''),
        csvEscape(annotatorId ?? ''),
      ].join(',')
    );
  }

  // Span rows (P2-12)
  if (spans && spans.length > 0) {
    // Filter to valid spans only
    const validSpans = spans.filter(
      (s) => markerMap.has(s.startMarkerId) && markerMap.has(s.endMarkerId)
    );
    if (validSpans.length > 0) {
      rows.push(''); // blank separator line
      rows.push(['Video', 'Start Time (ms)', 'End Time (ms)', 'Duration (ms)', 'Tier', 'Gloss'].join(','));
      for (const s of validSpans) {
        const startTime = Math.round(markerMap.get(s.startMarkerId)!.time);
        const endTime = Math.round(markerMap.get(s.endMarkerId)!.time);
        rows.push(
          [
            csvEscape(videoName),
            String(startTime),
            String(endTime),
            String(endTime - startTime),
            csvEscape(tierMap.get(s.tierId) ?? ''),
            csvEscape(s.gloss),
          ].join(',')
        );
      }
    }
  }

  // UTF-8 BOM for Excel compatibility
  return '\uFEFF' + rows.join('\n');
}
