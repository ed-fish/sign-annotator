import type { MarkerType } from '../types/annotation';

export const DEFAULT_MARKER_TYPES: MarkerType[] = [
  { id: 'sign-start', key: 's', name: 'Sign Start', color: '#22c55e', category: 'boundary' },
  { id: 'sign-end', key: 'e', name: 'Sign End', color: '#ef4444', category: 'boundary' },
  { id: 'transition', key: 't', name: 'Transition', color: '#3b82f6', category: 'boundary' },
  { id: 'hold', key: 'h', name: 'Hold', color: '#a855f7', category: 'phase', description: 'A brief pause where the hands maintain their position mid-sign' },
  { id: 'pause', key: 'p', name: 'Pause', color: '#6b7280', category: 'phase', description: 'A deliberate pause between signs, hands may relax slightly' },
  { id: 'rest', key: 'r', name: 'Rest', color: '#9ca3af', category: 'phase', description: 'Hands return to a neutral resting position between signing units' },
];

export const KENDON_MARKER_TYPES: MarkerType[] = [
  { id: 'preparation', key: '1', name: 'Preparation', color: '#f97316', category: 'phase' },
  { id: 'pre-stroke-hold', key: '2', name: 'Pre-Stroke Hold', color: '#eab308', category: 'phase' },
  { id: 'stroke', key: '3', name: 'Stroke', color: '#22c55e', category: 'phase' },
  { id: 'stroke-start', key: '6', name: 'Stroke Start', color: '#10b981', category: 'phase' },
  { id: 'stroke-end', key: '7', name: 'Stroke End', color: '#f43f5e', category: 'phase' },
  { id: 'post-stroke-hold', key: '4', name: 'Post-Stroke Hold', color: '#06b6d4', category: 'phase' },
  { id: 'retraction', key: '5', name: 'Retraction', color: '#a855f7', category: 'phase' },
];

export const NON_MANUAL_MARKER_TYPES: MarkerType[] = [
  { id: 'eye-gaze', key: 'g', name: 'Eye Gaze', color: '#06b6d4', category: 'feature' },
  { id: 'facial-expr', key: 'f', name: 'Facial Expression', color: '#ec4899', category: 'feature' },
  { id: 'head-mvmt', key: 'm', name: 'Head Movement', color: '#f97316', category: 'feature' },
  { id: 'body-shift', key: 'b', name: 'Body Shift', color: '#eab308', category: 'feature' },
  { id: 'mouth', key: 'o', name: 'Mouth Gesture', color: '#8b5cf6', category: 'feature' },
];

export const UNCONFIRMED_COLOR = '#f59e0b'; // amber for unconfirmed markers
