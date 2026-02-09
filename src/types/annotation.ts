export interface MarkerType {
  id: string;
  key: string;
  name: string;
  color: string;
  category: 'boundary' | 'phase' | 'feature' | 'custom';
  description?: string;
}

export interface Marker {
  id: string;
  time: number; // milliseconds
  typeId: string;
  tierId: string;
  videoId: string;
  confirmed: boolean; // false when placed with Space, true after pressing annotation key
  value?: string; // optional free-text value (e.g. gloss for NMF markers)
}

export interface AnnotationSpan {
  id: string;
  startMarkerId: string;
  endMarkerId: string;
  tierId: string;
  videoId: string;
  gloss: string;
}

export interface Tier {
  id: string;
  name: string;
  markerTypes: string[]; // MarkerType IDs allowed on this tier
  visible: boolean;
  locked: boolean;
  color: string;
}

export interface TierPreset {
  id: string;
  name: string;
  description: string;
  tiers: Omit<Tier, 'id'>[];
  markerTypes: MarkerType[];
}

export interface ElanDisplayTier {
  id: string;
  name: string;
  color: string;
  videoId: string;
}

export interface ElanDisplaySpan {
  id: string;
  tierId: string;
  videoId: string;
  startMs: number;
  endMs: number;
  value: string;
}
