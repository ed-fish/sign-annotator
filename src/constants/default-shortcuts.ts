import type { ShortcutBinding } from '../types/shortcuts';

export const DEFAULT_SHORTCUTS: ShortcutBinding[] = [
  // Playback
  { id: 'play-pause', action: 'play-pause', key: ' ', description: 'Play / pause (places marker if playing)', category: 'playback' },
  { id: 'frame-forward', action: 'frame-forward', key: '.', description: 'Frame forward', category: 'playback' },
  { id: 'frame-backward', action: 'frame-backward', key: ',', description: 'Frame backward', category: 'playback' },
  { id: 'speed-up', action: 'speed-up', key: ']', description: 'Speed up', category: 'playback' },
  { id: 'speed-down', action: 'speed-down', key: '[', description: 'Speed down', category: 'playback' },
  { id: 'seek-forward', action: 'seek-forward', key: 'ArrowRight', description: 'Seek forward 1s', category: 'playback' },
  { id: 'seek-backward', action: 'seek-backward', key: 'ArrowLeft', description: 'Seek backward 1s', category: 'playback' },
  { id: 'seek-start', action: 'seek-start', key: 'Home', description: 'Seek to start', category: 'playback' },
  { id: 'seek-end', action: 'seek-end', key: 'End', description: 'Seek to end', category: 'playback' },

  // Annotation
  { id: 'place-marker', action: 'place-marker', key: 'Enter', description: 'Place marker at current time', category: 'annotation' },
  { id: 'confirm-sign-start', action: 'confirm-sign-start', key: 's', description: 'Sign Start (tap or hold)', category: 'annotation' },
  { id: 'confirm-sign-end', action: 'confirm-sign-end', key: 'e', description: 'Sign End (tap or hold to extend)', category: 'annotation' },
  { id: 'confirm-transition', action: 'confirm-transition', key: 't', description: 'Transition', category: 'annotation' },
  { id: 'confirm-hold', action: 'confirm-hold', key: 'h', description: 'Hold', category: 'annotation' },
  { id: 'confirm-pause', action: 'confirm-pause', key: 'p', description: 'Pause', category: 'annotation' },
  { id: 'confirm-rest', action: 'confirm-rest', key: 'r', description: 'Rest', category: 'annotation' },
  { id: 'cycle-tier', action: 'cycle-active-tier', key: '`', description: 'Cycle active tier', category: 'annotation' },
  { id: 'create-span', action: 'create-span', key: 'g', description: 'Create span from selected marker', category: 'annotation' },
  { id: 'cancel-marker', action: 'cancel-marker', key: 'Escape', description: 'Cancel pending marker', category: 'annotation' },

  // Editing
  { id: 'nudge-right', action: 'nudge-marker-right', key: 'ArrowRight', shift: true, description: 'Nudge marker +10ms', category: 'editing' },
  { id: 'nudge-left', action: 'nudge-marker-left', key: 'ArrowLeft', shift: true, description: 'Nudge marker -10ms', category: 'editing' },
  { id: 'fine-nudge-right', action: 'fine-nudge-marker-right', key: 'ArrowRight', alt: true, description: 'Nudge marker +1ms', category: 'editing' },
  { id: 'fine-nudge-left', action: 'fine-nudge-marker-left', key: 'ArrowLeft', alt: true, description: 'Nudge marker -1ms', category: 'editing' },
  { id: 'select-next', action: 'select-next-marker', key: 'n', description: 'Select next marker', category: 'editing' },
  { id: 'select-prev', action: 'select-prev-marker', key: 'N', shift: true, description: 'Select previous marker', category: 'editing' },
  { id: 'delete-marker', action: 'delete-marker', key: 'Delete', description: 'Delete selected marker or span', category: 'editing' },

  // Navigation
  { id: 'next-video', action: 'next-video', key: 'n', ctrl: true, description: 'Next video', category: 'navigation' },
  { id: 'prev-video', action: 'prev-video', key: 'p', alt: true, description: 'Previous video', category: 'navigation' },

  // General
  { id: 'undo', action: 'undo', key: 'z', ctrl: true, description: 'Undo', category: 'general' },
  { id: 'redo', action: 'redo', key: 'z', ctrl: true, shift: true, description: 'Redo', category: 'general' },
  { id: 'save', action: 'save', key: 's', ctrl: true, description: 'Save', category: 'general' },
  { id: 'mark-done', action: 'mark-done', key: 'Enter', ctrl: true, description: 'Mark video as done', category: 'general' },
  { id: 'toggle-loop', action: 'toggle-loop', key: 'L', shift: true, description: 'Toggle loop', category: 'general' },
  { id: 'toggle-sidebar', action: 'toggle-sidebar', key: 'b', ctrl: true, description: 'Toggle sidebar', category: 'general' },
  { id: 'show-shortcuts', action: 'show-shortcuts', key: '?', description: 'Show keyboard shortcuts', category: 'general' },
];
