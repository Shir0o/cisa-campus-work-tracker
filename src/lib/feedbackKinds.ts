import { Bug, HelpingHand, Lightbulb, MessageSquareText, type LucideIcon } from 'lucide-react';
import { FeedbackKind, FeedbackOutcome } from '../types';

export type { FeedbackOutcome };

export const FEEDBACK_OUTCOMES: readonly FeedbackOutcome[] = [
  'shipped',
  'not-planned',
  'already-there',
];

const OUTCOME_COPY: Record<FeedbackOutcome, string> = {
  shipped: 'This shipped! Thank you for helping shape the app.',
  'not-planned': "We looked into this and aren't planning to build it right now, but thank you for speaking up.",
  'already-there': "This is already in the app! Ask someone on the team and we'll show you where it lives.",
};

const OUTCOME_LABELS: Record<FeedbackOutcome, string> = {
  shipped: 'Shipped',
  'not-planned': 'Not planned',
  'already-there': 'Already in the app',
};

export const outcomeCopy = (outcome: FeedbackOutcome): string => OUTCOME_COPY[outcome];

export const outcomeLabel = (outcome: FeedbackOutcome): string => OUTCOME_LABELS[outcome];

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
