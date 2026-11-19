// Quick add (cut-or-keep §26): one note parsed into one person's next step.
//
// These are the request/response shapes the server route, the phone and the
// web preview share. The writes live in ./data/quickAdd; this file stays free
// of imports so the web app can take the TYPES only, with no runtime package
// dependency (the same rule every web/core mirror follows).

/** The pipeline steps a parsed note may name. Mirrors the web app's fixed list
 *  of built-in stages; a team's own stages can still be chosen in the preview. */
export const QUICK_ADD_STEPS = ['lead', 'contact', 'follow-up', 'connected', 'active'] as const;
export type QuickAddStep = (typeof QUICK_ADD_STEPS)[number];

/** What the model may find about the person. All fields are present so the
 *  preview can bind an input to each one; an absent value arrives as ''. */
export interface QuickAddContactDraft {
  name: string;
  phone: string;
  email: string;
  /** One of the sign-up years (see SIGNUP_YEARS). */
  year: string;
  /** One of QUICK_ADD_STEPS, or a team stage chosen in the preview. */
  step: string;
  tags: string[];
}

/** A candidate the note might already be about. The server returns EVERY name
 *  match and never picks one; the preview makes the person choose. */
export interface QuickAddMatch {
  id: string;
  name: string;
}

export interface QuickAddInteractionDraft {
  /** meeting | call | text | visit | chat | other */
  type: string;
  /** When it happened, `yyyy-MM-dd` or an ISO instant. */
  when: string;
  notes: string;
}

export interface QuickAddReminderDraft {
  /** The day to come back, `yyyy-MM-dd`. */
  when: string;
  text: string;
}

export interface QuickAddParseResponse {
  contact: QuickAddContactDraft;
  match: QuickAddMatch[];
  interaction?: QuickAddInteractionDraft;
  prayer?: string;
  reminder?: QuickAddReminderDraft;
}

export interface QuickAddRequest {
  text: string;
}

/** What Save writes. `matchId` (with the name shown in the preview) makes the
 *  save add to an existing person; without it, a new person is created. */
export interface QuickAddSaveInput {
  matchId?: string | null;
  matchName?: string | null;
  contact: QuickAddContactDraft;
  interaction?: QuickAddInteractionDraft | null;
  prayer?: string | null;
  reminder?: QuickAddReminderDraft | null;
}

/** A person to save needs a name, or an existing person to attach to — and a
 *  note that matched several people must not slide by as "New person": while
 *  `awaitingMatchChoice` is set, nothing is picked and Save stays off. */
export function quickAddCanSave(
  input: Pick<QuickAddSaveInput, 'matchId' | 'contact'> & { awaitingMatchChoice?: boolean },
): boolean {
  if (input.awaitingMatchChoice) return false;
  return Boolean(input.matchId?.trim() || input.contact.name.trim());
}

/** Case- and whitespace-insensitive full name, for matching a parsed name to
 *  the people already in the directory. */
export function quickAddNameKey(name: string): string {
  return (name || '').trim().replace(/\s+/g, ' ').toLowerCase();
}
