export interface ShortcutBinding {
  id: string;
  action: string;
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  description: string;
  category: 'playback' | 'annotation' | 'navigation' | 'editing' | 'general';
}

export type ShortcutAction =
  | 'play-pause'
  | 'frame-forward'
  | 'frame-backward'
  | 'speed-up'
  | 'speed-down'
  | 'seek-forward'
  | 'seek-backward'
  | 'nudge-marker-right'
  | 'nudge-marker-left'
  | 'fine-nudge-marker-right'
  | 'fine-nudge-marker-left'
  | 'place-marker'
  | 'select-next-marker'
  | 'select-prev-marker'
  | 'delete-marker'
  | 'next-video'
  | 'prev-video'
  | 'undo'
  | 'redo'
  | 'save'
  | 'mark-done'
  | 'toggle-loop'
  | 'toggle-sidebar'
  | 'confirm-sign-start'
  | 'confirm-sign-end'
  | 'confirm-transition'
  | 'confirm-hold'
  | 'confirm-pause'
  | 'confirm-rest'
  | 'cycle-active-tier'
  | 'create-span'
  | 'cancel-marker'
  | 'show-shortcuts';
