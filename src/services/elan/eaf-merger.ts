import type { Marker, AnnotationSpan, Tier, MarkerType } from '../../types/annotation';
import { parseXml, serializeXml } from '../../utils/xml';

interface MergeOptions {
  existingEaf: string;
  markers: Marker[];
  spans: AnnotationSpan[];
  tiers: Tier[];
  markerTypes: MarkerType[];
}

/** Merge new DCAL annotations into an existing EAF file, preserving all existing content */
export function mergeEaf(options: MergeOptions): string {
  const { existingEaf, markers, spans, tiers, markerTypes } = options;
  const doc = parseXml(existingEaf);
  const root = doc.documentElement;
  const confirmedMarkers = markers.filter((m) => m.confirmed);

  // Find highest existing time slot ID
  const existingSlots = root.querySelectorAll('TIME_ORDER > TIME_SLOT');
  let maxSlotNum = 0;
  for (const slot of existingSlots) {
    const id = slot.getAttribute('TIME_SLOT_ID') ?? '';
    const match = id.match(/ts(\d+)/);
    if (match) maxSlotNum = Math.max(maxSlotNum, parseInt(match[1], 10));
  }

  // Find highest existing annotation ID (scan both alignable and ref annotations)
  const existingAnnots = root.querySelectorAll('ALIGNABLE_ANNOTATION, REF_ANNOTATION');
  let maxAnnotNum = 0;
  for (const annot of existingAnnots) {
    const id = annot.getAttribute('ANNOTATION_ID') ?? '';
    const match = id.match(/a(\d+)/);
    if (match) maxAnnotNum = Math.max(maxAnnotNum, parseInt(match[1], 10));
  }

  let tsCounter = maxSlotNum + 1;
  let annotCounter = maxAnnotNum + 1;
  const markerToSlot = new Map<string, string>();

  // Add new time slots
  const timeOrder = root.querySelector('TIME_ORDER');
  if (!timeOrder) return existingEaf;

  for (const marker of confirmedMarkers.sort((a, b) => a.time - b.time)) {
    const slotId = `ts${tsCounter++}`;
    const slotEl = doc.createElement('TIME_SLOT');
    slotEl.setAttribute('TIME_SLOT_ID', slotId);
    slotEl.setAttribute('TIME_VALUE', String(Math.round(marker.time)));
    timeOrder.appendChild(slotEl);
    markerToSlot.set(marker.id, slotId);
  }

  // WARNING: All existing tiers with the "dcal-" prefix will be removed and replaced
  // with freshly generated tiers from the current annotation session. Non-dcal tiers
  // are preserved as-is. This is intentional — dcal- tiers are owned by this tool.
  // First, collect time slot refs used by dcal- tier annotations for orphan cleanup
  const dcalSlotRefs = new Set<string>();
  const existingTiers = root.querySelectorAll('TIER');
  for (const tierEl of existingTiers) {
    const tierId = tierEl.getAttribute('TIER_ID') ?? '';
    if (tierId.startsWith('dcal-')) {
      const annots = tierEl.querySelectorAll('ALIGNABLE_ANNOTATION');
      for (const annot of annots) {
        const ref1 = annot.getAttribute('TIME_SLOT_REF1');
        const ref2 = annot.getAttribute('TIME_SLOT_REF2');
        if (ref1) dcalSlotRefs.add(ref1);
        if (ref2) dcalSlotRefs.add(ref2);
      }
      tierEl.parentNode?.removeChild(tierEl);
    }
  }

  // Collect all time slot refs still used by remaining (non-dcal) tiers
  const usedSlotRefs = new Set<string>();
  const remainingTiers = root.querySelectorAll('TIER');
  for (const tierEl of remainingTiers) {
    const annots = tierEl.querySelectorAll('ALIGNABLE_ANNOTATION');
    for (const annot of annots) {
      const ref1 = annot.getAttribute('TIME_SLOT_REF1');
      const ref2 = annot.getAttribute('TIME_SLOT_REF2');
      if (ref1) usedSlotRefs.add(ref1);
      if (ref2) usedSlotRefs.add(ref2);
    }
  }

  // Remove orphan time slots (used only by dcal- tiers)
  for (const slotRef of dcalSlotRefs) {
    if (!usedSlotRefs.has(slotRef)) {
      const slotEl = timeOrder.querySelector(`TIME_SLOT[TIME_SLOT_ID="${slotRef}"]`);
      if (slotEl) timeOrder.removeChild(slotEl);
    }
  }

  // Ensure the linguistic type exists
  const ltExists = root.querySelector('LINGUISTIC_TYPE[LINGUISTIC_TYPE_ID="default-lt"]');
  if (!ltExists) {
    const lt = doc.createElement('LINGUISTIC_TYPE');
    lt.setAttribute('LINGUISTIC_TYPE_ID', 'default-lt');
    lt.setAttribute('TIME_ALIGNABLE', 'true');
    lt.setAttribute('GRAPHIC_REFERENCES', 'false');
    root.appendChild(lt);
  }

  // Add new tiers with dcal- prefix
  const insertBefore = root.querySelector('LINGUISTIC_TYPE');
  for (const tier of tiers) {
    const tierEl = doc.createElement('TIER');
    tierEl.setAttribute('LINGUISTIC_TYPE_REF', 'default-lt');
    tierEl.setAttribute('TIER_ID', `dcal-${tier.name}`);

    const tierMarkers = confirmedMarkers
      .filter((m) => m.tierId === tier.id)
      .sort((a, b) => a.time - b.time);

    // Add spans
    const spannedMarkerIds = new Set<string>();
    for (const span of spans.filter((s) => s.tierId === tier.id)) {
      const startSlot = markerToSlot.get(span.startMarkerId);
      const endSlot = markerToSlot.get(span.endMarkerId);
      if (startSlot && endSlot) {
        spannedMarkerIds.add(span.startMarkerId);
        spannedMarkerIds.add(span.endMarkerId);
        const annotEl = doc.createElement('ANNOTATION');
        const alignEl = doc.createElement('ALIGNABLE_ANNOTATION');
        alignEl.setAttribute('ANNOTATION_ID', `a${annotCounter++}`);
        alignEl.setAttribute('TIME_SLOT_REF1', startSlot);
        alignEl.setAttribute('TIME_SLOT_REF2', endSlot);
        const valueEl = doc.createElement('ANNOTATION_VALUE');
        valueEl.textContent = span.gloss;
        alignEl.appendChild(valueEl);
        annotEl.appendChild(alignEl);
        tierEl.appendChild(annotEl);
      }
    }

    // Add standalone markers
    for (const marker of tierMarkers) {
      if (spannedMarkerIds.has(marker.id)) continue;
      const slot1 = markerToSlot.get(marker.id);
      if (!slot1) continue;
      const endSlotId = `ts${tsCounter++}`;
      const endSlotEl = doc.createElement('TIME_SLOT');
      endSlotEl.setAttribute('TIME_SLOT_ID', endSlotId);
      endSlotEl.setAttribute('TIME_VALUE', String(Math.round(marker.time) + 1));
      timeOrder.appendChild(endSlotEl);

      const markerType = markerTypes.find((mt) => mt.id === marker.typeId);
      const annotEl = doc.createElement('ANNOTATION');
      const alignEl = doc.createElement('ALIGNABLE_ANNOTATION');
      alignEl.setAttribute('ANNOTATION_ID', `a${annotCounter++}`);
      alignEl.setAttribute('TIME_SLOT_REF1', slot1);
      alignEl.setAttribute('TIME_SLOT_REF2', endSlotId);
      const valueEl = doc.createElement('ANNOTATION_VALUE');
      valueEl.textContent = markerType?.name ?? '';
      alignEl.appendChild(valueEl);
      annotEl.appendChild(alignEl);
      tierEl.appendChild(annotEl);
    }

    if (insertBefore) {
      root.insertBefore(tierEl, insertBefore);
    } else {
      root.appendChild(tierEl);
    }
  }

  return serializeXml(doc);
}
