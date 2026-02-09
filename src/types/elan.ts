export interface EafTimeSlot {
  id: string;
  time: number; // milliseconds
}

export interface EafAnnotation {
  id: string;
  startSlotRef: string;
  endSlotRef: string;
  value: string;
}

export interface EafTier {
  id: string;
  participant: string;
  annotator: string;
  linguisticTypeRef: string;
  annotations: EafAnnotation[];
}

export interface EafDocument {
  author: string;
  date: string;
  version: string;
  mediaFile: string;
  mediaUrl: string;
  mimeType: string;
  timeSlots: EafTimeSlot[];
  tiers: EafTier[];
  linguisticTypes: { id: string; timeAlignable: boolean }[];
  rawXml?: string; // preserved for merge operations
}
