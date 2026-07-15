// Shared kind->tone/icon maps for the Feedback picker + admin row.
// packages/core's FEEDBACK_KINDS only carries a platform-agnostic tone (it
// can't import RN color tokens or Ionicons) — mobile owns this mapping, same
// pattern as NotificationRow/AnsweredTile's own tone maps.
import { Ionicons } from '@expo/vector-icons';
import type { FeedbackKind, FeedbackTone } from '@cisa/core';
import type { ToneKey } from '../../theme/tokens';

export const FEEDBACK_TONE_MAP: Record<FeedbackTone, ToneKey> = {
  accent: 'accent',
  violet: 'violet',
  amber: 'amber',
  teal: 'teal',
};

export const FEEDBACK_ICON: Record<FeedbackKind, keyof typeof Ionicons.glyphMap> = {
  thought: 'chatbubble-outline',
  idea: 'bulb-outline',
  off: 'bug-outline',
  request: 'hand-left-outline',
};
