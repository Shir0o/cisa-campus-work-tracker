import { Bug, HelpingHand, Lightbulb, MessageSquareText, type LucideIcon } from 'lucide-react';
import { FeedbackKind } from '../types';

type FeedbackTone = 'accent' | 'violet' | 'amber' | 'teal';

export interface FeedbackKindMeta {
  id: FeedbackKind;
  label: string;
  placeholder: string;
  icon: LucideIcon;
  tone: FeedbackTone;
}

// Single source of truth for the four "Leave a note" kinds, shared by the FAB,
// the full-page form, and the admin inbox so labels/placeholders never drift.
export const FEEDBACK_KINDS: readonly FeedbackKindMeta[] = [
  { id: 'thought', label: 'A thought',      placeholder: "What's on your mind?",            icon: MessageSquareText, tone: 'accent' },
  { id: 'idea',    label: 'An idea',         placeholder: 'What if we tried…',               icon: Lightbulb,         tone: 'violet' },
  { id: 'off',     label: "Something's off", placeholder: 'Something felt a bit off when…',  icon: Bug,               tone: 'amber'  },
  { id: 'request', label: 'A request',       placeholder: 'It would help if…',               icon: HelpingHand,       tone: 'teal'   },
];

/** Derive the stored coarse `type` from a kind. Only "Something's off" is a bug. */
export const kindToType = (kind: FeedbackKind): 'bug' | 'enhancement' =>
  kind === 'off' ? 'bug' : 'enhancement';

/** Legacy fallback: docs written before `kind` existed only carry `type`. */
export const typeToKind = (type: 'bug' | 'enhancement'): FeedbackKind =>
  type === 'bug' ? 'off' : 'idea';

export const kindMeta = (kind: FeedbackKind): FeedbackKindMeta =>
  FEEDBACK_KINDS.find((k) => k.id === kind) ?? FEEDBACK_KINDS[0];

// Static literal Tailwind classes per tone. Tailwind v4 JIT only emits classes
// it can see as literals in source — never build `bg-stage-${tone}-soft`.
export const TONE_CLASSES: Record<FeedbackTone, { text: string; softBg: string; bar: string; chip: string }> = {
  accent: { text: 'text-stage-accent', softBg: 'bg-stage-accent-soft', bar: 'bg-stage-accent', chip: 'text-stage-accent bg-stage-accent-soft' },
  violet: { text: 'text-stage-violet', softBg: 'bg-stage-violet-soft', bar: 'bg-stage-violet', chip: 'text-stage-violet bg-stage-violet-soft' },
  amber:  { text: 'text-stage-amber',  softBg: 'bg-stage-amber-soft',  bar: 'bg-stage-amber',  chip: 'text-stage-amber bg-stage-amber-soft'  },
  teal:   { text: 'text-stage-teal',   softBg: 'bg-stage-teal-soft',   bar: 'bg-stage-teal',   chip: 'text-stage-teal bg-stage-teal-soft'   },
};
