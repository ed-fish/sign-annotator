import type { EafDocument, EafTimeSlot, EafTier, EafAnnotation } from '../../types/elan';
import { parseXml } from '../../utils/xml';

/** Parse an ELAN .eaf file into a structured document */
export function parseEaf(xmlString: string): EafDocument {
  const doc = parseXml(xmlString);
  const root = doc.documentElement;

  // Parse header
  const header = root.querySelector('HEADER');
  const mediaDesc = header?.querySelector('MEDIA_DESCRIPTOR');
  const mediaUrl = mediaDesc?.getAttribute('MEDIA_URL') ?? '';
  const relativeUrl = mediaDesc?.getAttribute('RELATIVE_MEDIA_URL') ?? '';
  const mimeType = mediaDesc?.getAttribute('MIME_TYPE') ?? 'video/mp4';
  const mediaFile = relativeUrl.replace('./', '');

  // Parse time slots
  const timeSlots: EafTimeSlot[] = [];
  const timeSlotElements = root.querySelectorAll('TIME_ORDER > TIME_SLOT');
  for (const el of timeSlotElements) {
    const id = el.getAttribute('TIME_SLOT_ID') ?? '';
    const time = parseInt(el.getAttribute('TIME_VALUE') ?? '0', 10);
    timeSlots.push({ id, time });
  }

  // Parse tiers
  const tiers: EafTier[] = [];
  const tierElements = root.querySelectorAll('TIER');
  for (const tierEl of tierElements) {
    const tierId = tierEl.getAttribute('TIER_ID') ?? '';
    const participant = tierEl.getAttribute('PARTICIPANT') ?? '';
    const annotator = tierEl.getAttribute('ANNOTATOR') ?? '';
    const linguisticTypeRef = tierEl.getAttribute('LINGUISTIC_TYPE_REF') ?? '';

    const annotations: EafAnnotation[] = [];

    // Parse ALIGNABLE_ANNOTATION elements (time-aligned)
    const annotElements = tierEl.querySelectorAll('ALIGNABLE_ANNOTATION');
    for (const annotEl of annotElements) {
      const annotId = annotEl.getAttribute('ANNOTATION_ID') ?? '';
      const startSlotRef = annotEl.getAttribute('TIME_SLOT_REF1') ?? '';
      const endSlotRef = annotEl.getAttribute('TIME_SLOT_REF2') ?? '';
      const value = annotEl.querySelector('ANNOTATION_VALUE')?.textContent ?? '';
      annotations.push({ id: annotId, startSlotRef, endSlotRef, value });
    }

    // Parse REF_ANNOTATION elements (reference to parent annotation)
    const refAnnotElements = tierEl.querySelectorAll('REF_ANNOTATION');
    for (const refEl of refAnnotElements) {
      const annotId = refEl.getAttribute('ANNOTATION_ID') ?? '';
      const annotRef = refEl.getAttribute('ANNOTATION_REF') ?? '';
      const value = refEl.querySelector('ANNOTATION_VALUE')?.textContent ?? '';

      // Resolve time from the parent annotation's time slots
      const parentEl = root.querySelector(`ALIGNABLE_ANNOTATION[ANNOTATION_ID="${annotRef}"]`);
      const startSlotRef = parentEl?.getAttribute('TIME_SLOT_REF1') ?? '';
      const endSlotRef = parentEl?.getAttribute('TIME_SLOT_REF2') ?? '';
      annotations.push({ id: annotId, startSlotRef, endSlotRef, value });
    }

    tiers.push({ id: tierId, participant, annotator, linguisticTypeRef, annotations });
  }

  // Parse linguistic types
  const linguisticTypes: { id: string; timeAlignable: boolean }[] = [];
  const ltElements = root.querySelectorAll('LINGUISTIC_TYPE');
  for (const lt of ltElements) {
    const id = lt.getAttribute('LINGUISTIC_TYPE_ID') ?? '';
    const timeAlignable = lt.getAttribute('TIME_ALIGNABLE') === 'true';
    linguisticTypes.push({ id, timeAlignable });
  }

  return {
    author: root.getAttribute('AUTHOR') ?? '',
    date: root.getAttribute('DATE') ?? '',
    version: root.getAttribute('VERSION') ?? '3.0',
    mediaFile,
    mediaUrl,
    mimeType,
    timeSlots,
    tiers,
    linguisticTypes,
    rawXml: xmlString,
  };
}
