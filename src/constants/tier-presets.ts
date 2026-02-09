import type { TierPreset } from '../types/annotation';
import { DEFAULT_MARKER_TYPES, KENDON_MARKER_TYPES, NON_MANUAL_MARKER_TYPES } from './annotation-types';

export const TIER_PRESETS: TierPreset[] = [
  {
    id: 'sign-boundaries',
    name: 'Sign Boundaries',
    description: 'Simple start/end/transition markers for sign segmentation',
    tiers: [
      {
        name: 'Sign Boundaries',
        markerTypes: ['sign-start', 'sign-end', 'transition'],
        visible: true,
        locked: false,
        color: '#6366f1',
      },
    ],
    markerTypes: DEFAULT_MARKER_TYPES.filter(m =>
      ['sign-start', 'sign-end', 'transition'].includes(m.id)
    ),
  },
  {
    id: 'sign-phases',
    name: 'Sign Phases (Kendon)',
    description: 'Full Kendon framework: preparation, hold, stroke, retraction',
    tiers: [
      {
        name: 'Sign Phases',
        markerTypes: KENDON_MARKER_TYPES.map(m => m.id),
        visible: true,
        locked: false,
        color: '#f97316',
      },
    ],
    markerTypes: KENDON_MARKER_TYPES,
  },
  {
    id: 'non-manual',
    name: 'Non-Manual Features',
    description: 'Eye gaze, facial expressions, head movements, body shifts',
    tiers: [
      {
        name: 'Non-Manual Features',
        markerTypes: NON_MANUAL_MARKER_TYPES.map(m => m.id),
        visible: true,
        locked: false,
        color: '#ec4899',
      },
    ],
    markerTypes: NON_MANUAL_MARKER_TYPES,
  },
  {
    id: 'two-handed',
    name: 'Two-Handed Annotation',
    description: 'Separate DH/NDH tiers for sign boundaries and Kendon phases',
    tiers: [
      {
        name: 'DH Sign Boundaries',
        markerTypes: ['sign-start', 'sign-end', 'transition'],
        visible: true,
        locked: false,
        color: '#6366f1',
      },
      {
        name: 'NDH Sign Boundaries',
        markerTypes: ['sign-start', 'sign-end', 'transition'],
        visible: true,
        locked: false,
        color: '#818cf8',
      },
      {
        name: 'DH Phases',
        markerTypes: KENDON_MARKER_TYPES.map(m => m.id),
        visible: true,
        locked: false,
        color: '#f97316',
      },
      {
        name: 'NDH Phases',
        markerTypes: KENDON_MARKER_TYPES.map(m => m.id),
        visible: true,
        locked: false,
        color: '#fb923c',
      },
    ],
    markerTypes: [
      ...DEFAULT_MARKER_TYPES.filter(m =>
        ['sign-start', 'sign-end', 'transition'].includes(m.id)
      ),
      ...KENDON_MARKER_TYPES,
    ],
  },
  {
    id: 'bsl-corpus',
    name: 'BSL Corpus Standard',
    description: 'Sign boundaries, Kendon phases, and non-manual features',
    tiers: [
      {
        name: 'Sign Boundaries',
        markerTypes: ['sign-start', 'sign-end', 'transition', 'hold', 'pause', 'rest'],
        visible: true,
        locked: false,
        color: '#6366f1',
      },
      {
        name: 'Sign Phases',
        markerTypes: KENDON_MARKER_TYPES.map(m => m.id),
        visible: true,
        locked: false,
        color: '#f97316',
      },
      {
        name: 'Non-Manual',
        markerTypes: NON_MANUAL_MARKER_TYPES.map(m => m.id),
        visible: true,
        locked: false,
        color: '#ec4899',
      },
    ],
    markerTypes: [...DEFAULT_MARKER_TYPES, ...KENDON_MARKER_TYPES, ...NON_MANUAL_MARKER_TYPES],
  },
  {
    id: 'full',
    name: 'Full Annotation',
    description: 'All tiers: boundaries, phases, and non-manual features',
    tiers: [
      {
        name: 'Sign Boundaries',
        markerTypes: ['sign-start', 'sign-end', 'transition', 'hold', 'pause', 'rest'],
        visible: true,
        locked: false,
        color: '#6366f1',
      },
      {
        name: 'Sign Phases',
        markerTypes: KENDON_MARKER_TYPES.map(m => m.id),
        visible: true,
        locked: false,
        color: '#f97316',
      },
      {
        name: 'Non-Manual',
        markerTypes: NON_MANUAL_MARKER_TYPES.map(m => m.id),
        visible: true,
        locked: false,
        color: '#ec4899',
      },
    ],
    markerTypes: [...DEFAULT_MARKER_TYPES, ...KENDON_MARKER_TYPES, ...NON_MANUAL_MARKER_TYPES],
  },
];
