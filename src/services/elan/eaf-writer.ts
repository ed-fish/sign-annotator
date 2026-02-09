import type { Marker, AnnotationSpan, Tier } from '../../types/annotation';
import type { MarkerType } from '../../types/annotation';
import { escapeXml } from '../../utils/xml';

interface WriteOptions {
  mediaFile: string;
  mediaUrl: string;
  markers: Marker[];
  spans: AnnotationSpan[];
  tiers: Tier[];
  markerTypes: MarkerType[];
  author?: string;
  participant?: string;
}

/** Generate a valid ELAN .eaf XML file from annotations */
export function generateEaf(options: WriteOptions): string {
  const { mediaFile, mediaUrl, markers, spans, tiers, markerTypes, author = 'DCAL Annotator', participant } = options;
  const now = new Date().toISOString();
  const confirmedMarkers = markers.filter((m) => m.confirmed);

  // Build time slots from markers
  const timeSlots: { id: string; time: number }[] = [];
  let tsCounter = 1;
  const markerToSlot = new Map<string, string>();

  for (const marker of confirmedMarkers.sort((a, b) => a.time - b.time)) {
    const slotId = `ts${tsCounter++}`;
    timeSlots.push({ id: slotId, time: Math.round(marker.time) });
    markerToSlot.set(marker.id, slotId);
  }

  // For spans that reference markers, we need both start and end slots
  // Add end slots for spans where the end marker might already have a slot
  for (const span of spans) {
    if (!markerToSlot.has(span.startMarkerId)) {
      const startMarker = confirmedMarkers.find((m) => m.id === span.startMarkerId);
      if (startMarker) {
        const slotId = `ts${tsCounter++}`;
        timeSlots.push({ id: slotId, time: Math.round(startMarker.time) });
        markerToSlot.set(span.startMarkerId, slotId);
      }
    }
    if (!markerToSlot.has(span.endMarkerId)) {
      const endMarker = confirmedMarkers.find((m) => m.id === span.endMarkerId);
      if (endMarker) {
        const slotId = `ts${tsCounter++}`;
        timeSlots.push({ id: slotId, time: Math.round(endMarker.time) });
        markerToSlot.set(span.endMarkerId, slotId);
      }
    }
  }

  // Build tier XML — use a single counter across all tiers for unique IDs
  let annotCounter = 1;
  const tierXml = tiers.map((tier) => {
    const tierMarkers = confirmedMarkers
      .filter((m) => m.tierId === tier.id)
      .sort((a, b) => a.time - b.time);

    // Create annotations from consecutive marker pairs + spans
    const annotations: string[] = [];

    // First, handle explicit spans
    for (const span of spans.filter((s) => s.tierId === tier.id)) {
      const startSlot = markerToSlot.get(span.startMarkerId);
      const endSlot = markerToSlot.get(span.endMarkerId);
      if (startSlot && endSlot) {
        annotations.push(
          `        <ANNOTATION>
            <ALIGNABLE_ANNOTATION ANNOTATION_ID="a${annotCounter++}" TIME_SLOT_REF1="${startSlot}" TIME_SLOT_REF2="${endSlot}">
                <ANNOTATION_VALUE>${escapeXml(span.gloss)}</ANNOTATION_VALUE>
            </ALIGNABLE_ANNOTATION>
        </ANNOTATION>`
        );
      }
    }

    // Then, create point annotations for standalone markers (with tiny duration for ELAN compat)
    const spannedMarkerIds = new Set(
      spans.flatMap((s) => [s.startMarkerId, s.endMarkerId])
    );
    for (const marker of tierMarkers) {
      if (spannedMarkerIds.has(marker.id)) continue;
      const slot1 = markerToSlot.get(marker.id);
      if (!slot1) continue;
      // Create a tiny span (marker time to marker time + 1ms) for ELAN compatibility
      const endSlotId = `ts${tsCounter++}`;
      timeSlots.push({ id: endSlotId, time: Math.round(marker.time) + 1 });
      const markerType = markerTypes.find((mt) => mt.id === marker.typeId);
      const label = markerType?.name ?? '';
      annotations.push(
        `        <ANNOTATION>
            <ALIGNABLE_ANNOTATION ANNOTATION_ID="a${annotCounter++}" TIME_SLOT_REF1="${slot1}" TIME_SLOT_REF2="${endSlotId}">
                <ANNOTATION_VALUE>${escapeXml(label)}</ANNOTATION_VALUE>
            </ALIGNABLE_ANNOTATION>
        </ANNOTATION>`
      );
    }

    const participantAttr = participant ? ` PARTICIPANT="${escapeXml(participant)}"` : '';
    return `    <TIER LINGUISTIC_TYPE_REF="default-lt" TIER_ID="dcal-${escapeXml(tier.name)}"${participantAttr}>
${annotations.join('\n')}
    </TIER>`;
  }).join('\n');

  // Sort time slots by time for clean output
  timeSlots.sort((a, b) => a.time - b.time);
  const timeSlotsXml = timeSlots
    .map((ts) => `        <TIME_SLOT TIME_SLOT_ID="${ts.id}" TIME_VALUE="${ts.time}"/>`)
    .join('\n');

  // Determine MIME type from extension
  const mimeType = mediaFile.endsWith('.mp4') ? 'video/mp4'
    : mediaFile.endsWith('.webm') ? 'video/webm'
    : 'video/*';

  const relativeMediaUrl = `./${escapeXml(mediaFile)}`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<ANNOTATION_DOCUMENT AUTHOR="${escapeXml(author)}" DATE="${now}" VERSION="3.0"
    FORMAT="3.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xsi:noNamespaceSchemaLocation="http://www.mpi.nl/tools/elan/EAFv3.0.xsd">
    <HEADER MEDIA_FILE="" TIME_UNITS="milliseconds">
        <!-- MEDIA_URL uses relative path; absolute file:/// URI cannot be constructed in-browser -->
        <MEDIA_DESCRIPTOR MEDIA_URL="${relativeMediaUrl}"
            MIME_TYPE="${mimeType}" RELATIVE_MEDIA_URL="${relativeMediaUrl}"/>
    </HEADER>
    <TIME_ORDER>
${timeSlotsXml}
    </TIME_ORDER>
${tierXml}
    <LINGUISTIC_TYPE LINGUISTIC_TYPE_ID="default-lt" TIME_ALIGNABLE="true"
        GRAPHIC_REFERENCES="false"/>
    <CONSTRAINT DESCRIPTION="Time subdivision of parent annotation's time interval, no time gaps allowed within this interval" STEREOTYPE="Time_Subdivision"/>
    <CONSTRAINT DESCRIPTION="Symbolic subdivision of a parent annotation. Annotations refering to the same parent are ordered" STEREOTYPE="Symbolic_Subdivision"/>
    <CONSTRAINT DESCRIPTION="1-1 association with a parent annotation" STEREOTYPE="Symbolic_Association"/>
    <CONSTRAINT DESCRIPTION="Time alignable annotations within the parent annotation's time interval, gaps are allowed" STEREOTYPE="Included_In"/>
    <LOCALE LANGUAGE_CODE="en"/>
</ANNOTATION_DOCUMENT>`;
}
