import { parseEaf } from './eaf-parser';
import { generateId } from '../../utils/id-generator';
import type { ElanDisplayTier, ElanDisplaySpan, Marker, AnnotationSpan, Tier, MarkerType } from '../../types/annotation';

const TIER_COLORS = [
  '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f97316', '#6366f1',
];

export function importEafForVideo(
  xmlString: string,
  videoId: string
): { tiers: ElanDisplayTier[]; spans: ElanDisplaySpan[] } {
  const doc = parseEaf(xmlString);
  const timeSlotMap = new Map(doc.timeSlots.map((ts) => [ts.id, ts.time]));

  const tiers: ElanDisplayTier[] = [];
  const spans: ElanDisplaySpan[] = [];

  let colorIndex = 0;
  doc.tiers.forEach((eafTier) => {
    // Skip dcal- prefixed tiers (those are our own exports)
    if (eafTier.id.startsWith('dcal-')) return;

    const tier: ElanDisplayTier = {
      id: `elan-${eafTier.id}`,
      name: eafTier.id,
      color: TIER_COLORS[colorIndex++ % TIER_COLORS.length],
      videoId,
    };
    tiers.push(tier);

    for (const annot of eafTier.annotations) {
      const startMs = timeSlotMap.get(annot.startSlotRef) ?? 0;
      const endMs = timeSlotMap.get(annot.endSlotRef) ?? 0;
      spans.push({
        id: generateId('elan-sp'),
        tierId: tier.id,
        videoId,
        startMs,
        endMs,
        value: annot.value,
      });
    }
  });

  return { tiers, spans };
}

/**
 * Import dcal- prefixed tiers from an EAF back into editable DCAL markers and spans.
 * Used when a video has no session markers but has a DCAL-exported EAF file.
 */
export function importDcalAnnotationsFromEaf(
  xmlString: string,
  videoId: string,
  existingTiers: Tier[],
  markerTypes: MarkerType[]
): { markers: Marker[]; spans: AnnotationSpan[]; newTiers: Tier[] } {
  const doc = parseEaf(xmlString);
  const timeSlotMap = new Map(doc.timeSlots.map((ts) => [ts.id, ts.time]));

  const markers: Marker[] = [];
  const spans: AnnotationSpan[] = [];
  const newTiers: Tier[] = [];

  // Build lookups
  const tierNameToId = new Map(existingTiers.map((t) => [t.name, t.id]));
  const typeNameToId = new Map(markerTypes.map((mt) => [mt.name.toLowerCase(), mt.id]));

  let colorIdx = existingTiers.length;

  for (const eafTier of doc.tiers) {
    if (!eafTier.id.startsWith('dcal-')) continue;

    const tierName = eafTier.id.slice(5); // strip 'dcal-'
    let tierId = tierNameToId.get(tierName);

    // Create a new tier if no match found
    if (!tierId) {
      tierId = generateId('tier');
      const newTier: Tier = {
        id: tierId,
        name: tierName,
        markerTypes: markerTypes.map((mt) => mt.id),
        visible: true,
        locked: false,
        color: TIER_COLORS[colorIdx++ % TIER_COLORS.length],
      };
      newTiers.push(newTier);
      tierNameToId.set(tierName, tierId);
    }

    // Find start/end marker types for span endpoints
    const tier = existingTiers.find((t) => t.id === tierId);
    const tierTypeIds = tier?.markerTypes ?? markerTypes.map((mt) => mt.id);
    const tierTypes = tierTypeIds
      .map((id) => markerTypes.find((mt) => mt.id === id))
      .filter(Boolean) as MarkerType[];
    const startType = tierTypes.find((mt) => mt.name.toLowerCase().includes('start'));
    const endType = tierTypes.find((mt) => mt.name.toLowerCase().includes('end'));
    const defaultType = tierTypes[0];

    for (const annot of eafTier.annotations) {
      const startMs = timeSlotMap.get(annot.startSlotRef) ?? 0;
      const endMs = timeSlotMap.get(annot.endSlotRef) ?? 0;
      const duration = endMs - startMs;

      if (duration <= 1) {
        // Standalone marker (exported as 1ms span for ELAN compat)
        const matchedTypeId = typeNameToId.get(annot.value.toLowerCase());
        const typeId = matchedTypeId ?? defaultType?.id ?? '';
        markers.push({
          id: generateId('m'),
          time: startMs,
          typeId,
          tierId: tierId!,
          videoId,
          confirmed: typeId !== '',
        });
      } else {
        // Span annotation → create start marker, end marker, and span
        const startMarkerId = generateId('m');
        const endMarkerId = generateId('m');

        markers.push({
          id: startMarkerId,
          time: startMs,
          typeId: startType?.id ?? defaultType?.id ?? '',
          tierId: tierId!,
          videoId,
          confirmed: true,
        });
        markers.push({
          id: endMarkerId,
          time: endMs,
          typeId: endType?.id ?? defaultType?.id ?? '',
          tierId: tierId!,
          videoId,
          confirmed: true,
        });

        spans.push({
          id: generateId('sp'),
          startMarkerId,
          endMarkerId,
          tierId: tierId!,
          videoId,
          gloss: annot.value,
        });
      }
    }
  }

  return { markers, spans, newTiers };
}
