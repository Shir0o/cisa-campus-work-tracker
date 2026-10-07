// BNPB Interaction suggestions (#1420, ADR 0037).
//
// BNPB pushes its Interactions through the server intake; each lands as one
// pending suggestion per named person, privately under the owner's user
// document. This module is the queue's deep module: it maps BNPB media to the
// tracker's interaction types, matches suggestions to the Contacts the owner
// can see (#1424), renders the duration, orders and groups the queue, settles
// or dismisses a suggestion, and records "Not a CISA person" choices.
import {
  collection,
  deleteField,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { canSeeContact, type AppRole } from './permissions';
import type { Contact, Interaction } from '../types';

export const INTERACTION_SUGGESTIONS_SUBCOLLECTION = 'interactionSuggestions';
export const SUGGESTION_LINKS_SUBCOLLECTION = 'suggestionLinks';
export const NOT_A_CISA_PERSON_SUBCOLLECTION = 'notACisaPeople';

export type InteractionSuggestionStatus = 'pending' | 'confirmed' | 'dismissed' | 'withdrawn';

export interface InteractionSuggestion {
  id: string;
  syncId: string;
  bnpbContactId: string;
  /** The name as written in BNPB. */
  bnpbName: string;
  occurredAt: string;
  durationMinutes: number | null;
  summary: string;
  medium: string;
  /** The text the owner can tidy before confirming; starts as `summary`. */
  text: string;
  status: InteractionSuggestionStatus;
  contactId?: string | null;
}

/**
 * BNPB's medium vocabulary mapped to the tracker's interaction types. Matched
 * case-insensitively and by containment so "Phone Call" and "coffee catch-up"
 * both land. Anything unrecognised is a plain interaction.
 */
export function mediumToType(medium: string): string {
  const value = (medium || '').toLowerCase();
  if (value.includes('call')) return 'call';
  if (value.includes('email')) return 'email';
  if (value.includes('text') || value.includes('message') || value.includes('chat')) return 'chat';
  if (
    value.includes('coffee') ||
    value.includes('meal') ||
    value.includes('meeting') ||
    value.includes('in person')
  ) {
    return 'meeting';
  }
  return 'interaction';
}

/** Renders BNPB's `durationMinutes` in the tracker's short duration format. */
export function formatDurationMinutes(minutes: number | null | undefined): string | undefined {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes) || minutes < 0) {
    return undefined;
  }
  const whole = Math.round(minutes);
  if (whole < 60) return `${whole} min`;
  const hours = Math.floor(whole / 60);
  const rest = whole % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/** Pending suggestions only, newest first. */
export function orderPendingSuggestions(list: InteractionSuggestion[]): InteractionSuggestion[] {
  return list
    .filter((s) => s.status === 'pending')
    .slice()
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}

/** Why a suggestion sits where it does in the queue (#1424). */
export type SuggestionMatchBasis = 'chosen' | 'remembered' | 'exact' | 'guess' | 'unmatched';

export interface SuggestionMatch {
  basis: SuggestionMatchBasis;
  contact: Contact | null;
}

export interface QueuedSuggestion {
  suggestion: InteractionSuggestion;
  basis: SuggestionMatchBasis;
  contact: Contact | null;
}

/** Ready-to-confirm suggestions for one month, newest first. */
export interface ReadySection {
  /** `YYYY-MM`, or `unknown` when the timestamp is unusable. */
  month: string;
  items: QueuedSuggestion[];
}

/** One card in "Who is this?": every waiting suggestion naming one BNPB contact. */
export interface WhoIsThisGroup {
  bnpbContactId: string;
  bnpbName: string;
  latestOccurredAt: string;
  count: number;
  samples: InteractionSuggestion[];
  suggestions: InteractionSuggestion[];
}

export interface SuggestionQueue {
  ready: ReadySection[];
  whoIsThis: WhoIsThisGroup[];
}

/**
 * Lower-cases, strips accents and punctuation, and collapses whitespace, so
 * "José  O'Brien" and "jose o brien" compare equal (#1424).
 */
export function normalizeName(value: string): string {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  let curr = new Array<number>(n + 1);
  for (let i = 1; i <= m; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

/** True when every token of `short` appears in `long`, and `short` has fewer. */
function isWordSubset(short: string, long: string): boolean {
  if (short.length < 2) return false;
  const shortTokens = short.split(' ');
  const longTokens = new Set(long.split(' '));
  if (shortTokens.length >= longTokens.size) return false;
  return shortTokens.every((token) => longTokens.has(token));
}

/** A fuzzy best guess needs at least this much similarity (#1424). */
export const FUZZY_MATCH_THRESHOLD = 0.7;

/**
 * How close two names read, 0–1. An exact normalised match is 1; a name wholly
 * contained in another ("Alex" in "Alex Chen") is a strong 0.9, so short names
 * and nicknames still get a sensible guess; otherwise the edit-distance ratio.
 */
export function nameSimilarity(a: string, b: string): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (isWordSubset(na, nb) || isWordSubset(nb, na)) return 0.9;
  return 1 - levenshtein(na, nb) / Math.max(na.length, nb.length);
}

function byNameThenId(a: Contact, b: Contact): number {
  return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
}

function bestGuess(name: string, visible: Contact[]): Contact | null {
  let best: Contact | null = null;
  let bestScore = 0;
  for (const candidate of visible.slice().sort(byNameThenId)) {
    const score = nameSimilarity(name, candidate.name);
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return bestScore >= FUZZY_MATCH_THRESHOLD ? best : null;
}

export interface MatchSuggestionInput {
  suggestion: InteractionSuggestion;
  contacts: Contact[];
  /** BNPB contact id → remembered CISA Contact id. */
  links: Map<string, string>;
  role: AppRole | string | null;
  uid: string | null | undefined;
}

/**
 * The matching cascade (#1424): a Contact the owner chose → a remembered
 * Suggestion link → an exact normalised name → a fuzzy best guess → unmatched.
 * Only Contacts the owner can see are ever matched or offered, so a link to a
 * now-invisible Contact falls through.
 */
export function matchSuggestion(input: MatchSuggestionInput): SuggestionMatch {
  const { suggestion, contacts, links, role, uid } = input;
  const visible = contacts.filter((c) => isContactVisible(role, uid, c));
  const byId = new Map(visible.map((c) => [c.id, c]));

  if (suggestion.contactId) {
    const chosen = byId.get(suggestion.contactId);
    if (chosen) return { basis: 'chosen', contact: chosen };
  }

  const linkedContactId = links.get(suggestion.bnpbContactId);
  if (linkedContactId) {
    const linked = byId.get(linkedContactId);
    if (linked) return { basis: 'remembered', contact: linked };
  }

  const normalized = normalizeName(suggestion.bnpbName);
  if (normalized) {
    const exact = visible
      .slice()
      .sort(byNameThenId)
      .find((c) => normalizeName(c.name) === normalized);
    if (exact) return { basis: 'exact', contact: exact };
  }

  const guess = bestGuess(suggestion.bnpbName, visible);
  if (guess) return { basis: 'guess', contact: guess };
  return { basis: 'unmatched', contact: null };
}

/** The `YYYY-MM` a timestamp belongs to, or `unknown` when it has none. */
export function monthKey(value: string): string {
  const match = /^(\d{4})-(\d{2})/.exec(value);
  return match ? `${match[1]}-${match[2]}` : 'unknown';
}

/**
 * Groups unmatched suggestions into one "Who is this?" card per BNPB contact,
 * newest group first, each carrying its count, latest date and a few newest
 * sample lines (#1424).
 */
export function groupUnmatched(suggestions: InteractionSuggestion[]): WhoIsThisGroup[] {
  const byContact = new Map<string, InteractionSuggestion[]>();
  for (const suggestion of suggestions) {
    const list = byContact.get(suggestion.bnpbContactId);
    if (list) list.push(suggestion);
    else byContact.set(suggestion.bnpbContactId, [suggestion]);
  }

  const groups: WhoIsThisGroup[] = [];
  for (const [bnpbContactId, list] of byContact) {
    const sorted = list.slice().sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
    groups.push({
      bnpbContactId,
      bnpbName: sorted[0].bnpbName,
      latestOccurredAt: sorted[0].occurredAt,
      count: sorted.length,
      samples: sorted.slice(0, 3),
      suggestions: sorted,
    });
  }
  return groups.sort((a, b) => b.latestOccurredAt.localeCompare(a.latestOccurredAt));
}

export interface BuildSuggestionQueueInput {
  suggestions: InteractionSuggestion[];
  contacts: Contact[];
  links: Map<string, string>;
  role: AppRole | string | null;
  uid: string | null | undefined;
}

/**
 * The Suggestion queue's read model (#1424): pending suggestions split into
 * "Ready to confirm" (newest first, sectioned by month) and "Who is this?"
 * (grouped by BNPB contact).
 */
export function buildSuggestionQueue(input: BuildSuggestionQueueInput): SuggestionQueue {
  const queued: QueuedSuggestion[] = input.suggestions
    .filter((suggestion) => suggestion.status === 'pending')
    .map((suggestion) => {
      const match = matchSuggestion({ ...input, suggestion });
      return { suggestion, basis: match.basis, contact: match.contact };
    });

  const matched = queued
    .filter((item) => item.basis !== 'unmatched')
    .sort((a, b) => b.suggestion.occurredAt.localeCompare(a.suggestion.occurredAt));

  const ready: ReadySection[] = [];
  for (const item of matched) {
    const month = monthKey(item.suggestion.occurredAt);
    const last = ready[ready.length - 1];
    if (last && last.month === month) last.items.push(item);
    else ready.push({ month, items: [item] });
  }

  const unmatched = queued
    .filter((item) => item.basis === 'unmatched')
    .map((item) => item.suggestion);

  return { ready, whoIsThis: groupUnmatched(unmatched) };
}

/**
 * The calendar day a timestamp belongs to, as `YYYY-MM-DD` (#1422). A logged
 * Interaction stores a bare date, while a BNPB `occurredAt` is a full
 * timestamp; both lead with the day the person means, so the prefix is the
 * comparison key and no timezone enters the answer.
 */
export function calendarDay(value: string): string | null {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return match ? match[1] : null;
}

/**
 * The owner's own Interaction on the chosen Contact that shares `occurredAt`'s
 * calendar day, if any (#1422). Entries another teammate logged never count,
 * and when several of the owner's fall on the day the latest wins.
 */
export function findSameDayInteraction(
  interactions: Interaction[],
  uid: string,
  occurredAt: string,
): Interaction | null {
  const day = calendarDay(occurredAt);
  if (!day) return null;
  let found: Interaction | null = null;
  for (const interaction of interactions) {
    if (interaction.userId !== uid) continue;
    if (calendarDay(interaction.dateTime) !== day) continue;
    if (!found || interaction.dateTime > found.dateTime) found = interaction;
  }
  return found;
}

/** Live Interactions for one Contact, for the same-day duplicate flag (#1422). */
export function subscribeContactInteractions(
  contactId: string,
  cb: (interactions: Interaction[]) => void,
  onError?: (error: unknown) => void,
): () => void {
  const q = query(collection(db, 'contacts', contactId, 'interactions'), orderBy('dateTime', 'desc'));
  return onSnapshot(
    q,
    (snap) =>
      cb(
        snap.docs.map(
          (entry) => ({ id: entry.id, ...(entry.data() as Omit<Interaction, 'id'>) } as Interaction),
        ),
      ),
    (error) =>
      onError ? onError(error) : console.error('contact interactions subscription error', error),
  );
}

/** Whether `uid` may attach a suggestion to `contact` at their `role`. */
export function isContactVisible(
  role: AppRole | string | null,
  uid: string | null | undefined,
  contact: Contact | null | undefined,
): boolean {
  return canSeeContact(role, uid, contact);
}

export function subscribePendingSuggestions(
  uid: string,
  cb: (suggestions: InteractionSuggestion[]) => void,
  onError?: (error: unknown) => void,
): () => void {
  const q = query(
    collection(db, 'users', uid, INTERACTION_SUGGESTIONS_SUBCOLLECTION),
    orderBy('occurredAt', 'desc'),
  );
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((entry) => {
        const data = entry.data() as Partial<InteractionSuggestion>;
        return {
          id: entry.id,
          syncId: data.syncId ?? '',
          bnpbContactId: data.bnpbContactId ?? '',
          bnpbName: data.bnpbName ?? '',
          occurredAt: data.occurredAt ?? '',
          durationMinutes: data.durationMinutes ?? null,
          summary: data.summary ?? '',
          medium: data.medium ?? '',
          text: data.text ?? data.summary ?? '',
          status: data.status ?? 'pending',
          contactId: data.contactId ?? null,
        } as InteractionSuggestion;
      });
      cb(orderPendingSuggestions(list));
    },
    (error) => (onError ? onError(error) : console.error('interaction suggestions subscription error', error)),
  );
}

/** Live Suggestion links (#1424): BNPB contact id → remembered CISA Contact id. */
export function subscribeSuggestionLinks(
  uid: string,
  cb: (links: Map<string, string>) => void,
  onError?: (error: unknown) => void,
): () => void {
  const q = collection(db, 'users', uid, SUGGESTION_LINKS_SUBCOLLECTION);
  return onSnapshot(
    q,
    (snap) => {
      const links = new Map<string, string>();
      for (const entry of snap.docs) {
        const data = entry.data() as { bnpbContactId?: string; contactId?: string };
        if (data.bnpbContactId && data.contactId) links.set(data.bnpbContactId, data.contactId);
      }
      cb(links);
    },
    (error) => (onError ? onError(error) : console.error('suggestion links subscription error', error)),
  );
}

export interface ConfirmSuggestionInput {
  uid: string;
  user: { uid: string; displayName?: string | null; photoURL?: string | null; email?: string | null };
  role: AppRole | string | null;
  suggestion: InteractionSuggestion;
  contact: Contact;
  text: string;
}

/**
 * Settles one suggestion: in a single batch it writes the Interaction as the
 * owner on the chosen Contact, marks the suggestion confirmed, and remembers
 * the Suggestion link for that BNPB contact. Refuses if the Contact is not
 * visible, so the write is never half-done.
 */
export async function confirmSuggestion(input: ConfirmSuggestionInput): Promise<void> {
  const { uid, user, role, suggestion, contact, text } = input;
  if (!isContactVisible(role, uid, contact)) {
    throw new Error('That contact is not visible to you.');
  }

  const trimmed = text.trim();
  const duration = formatDurationMinutes(suggestion.durationMinutes);
  const loggerName = user.displayName || user.email?.split('@')[0] || '';
  const batch = writeBatch(db);

  const interactionRef = doc(collection(db, 'contacts', contact.id, 'interactions'));
  batch.set(interactionRef, {
    userId: uid,
    userName: loggerName,
    userPhoto: user.photoURL || '',
    content: trimmed,
    dateTime: suggestion.occurredAt,
    type: mediumToType(suggestion.medium),
    ...(duration ? { duration } : {}),
    createdAt: serverTimestamp(),
  });

  batch.update(doc(db, 'users', uid, INTERACTION_SUGGESTIONS_SUBCOLLECTION, suggestion.id), {
    status: 'confirmed',
    contactId: contact.id,
    text: trimmed,
    confirmedAt: serverTimestamp(),
  });

  batch.set(
    doc(db, 'users', uid, SUGGESTION_LINKS_SUBCOLLECTION, suggestionLinkId(suggestion.bnpbContactId)),
    {
      bnpbContactId: suggestion.bnpbContactId,
      contactId: contact.id,
      updatedAt: serverTimestamp(),
    },
  );

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `contacts/${contact.id}/interactions`);
    throw error;
  }
}

export interface AssignContactInput {
  uid: string;
  contactId: string;
  /** The suggestions to point at the chosen Contact. */
  suggestionIds: string[];
}

/**
 * Assigns one Contact to every suggestion for a BNPB contact at once (#1424).
 * It only points them at the Contact — nothing is logged and no Suggestion link
 * is written until each is confirmed on its own.
 */
export async function assignContactToSuggestions(input: AssignContactInput): Promise<void> {
  const { uid, contactId, suggestionIds } = input;
  if (suggestionIds.length === 0) return;
  const batch = writeBatch(db);
  for (const suggestionId of suggestionIds) {
    batch.update(doc(db, 'users', uid, INTERACTION_SUGGESTIONS_SUBCOLLECTION, suggestionId), {
      contactId,
    });
  }
  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${uid}/${INTERACTION_SUGGESTIONS_SUBCOLLECTION}`);
    throw error;
  }
}

/** Firestore-safe, deterministic link id for a BNPB contact. */
export function suggestionLinkId(bnpbContactId: string): string {
  return hashId(bnpbContactId);
}

/** Firestore-safe, deterministic choice id for a BNPB contact. */
export function notACisaPersonId(bnpbContactId: string): string {
  return hashId(bnpbContactId);
}

function hashId(bnpbContactId: string): string {
  let hash = 0;
  for (let i = 0; i < bnpbContactId.length; i += 1) {
    hash = (hash * 31 + bnpbContactId.charCodeAt(i)) | 0;
  }
  return `b${(hash >>> 0).toString(36)}`;
}

export interface DismissSuggestionInput {
  uid: string;
  suggestion: InteractionSuggestion;
}

/** Dismisses one suggestion for good; the only way back is the offered Undo. */
export async function dismissSuggestion(input: DismissSuggestionInput): Promise<void> {
  const { uid, suggestion } = input;
  const batch = writeBatch(db);
  batch.update(doc(db, 'users', uid, INTERACTION_SUGGESTIONS_SUBCOLLECTION, suggestion.id), {
    status: 'dismissed',
    dismissedBy: 'single',
    dismissedAt: serverTimestamp(),
  });
  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${uid}/${INTERACTION_SUGGESTIONS_SUBCOLLECTION}`);
    throw error;
  }
}

export interface UndoSuggestionDismissInput {
  uid: string;
  suggestionId: string;
}

/** Reverses a single dismissal, restoring the suggestion to pending. */
export async function undoSuggestionDismiss(input: UndoSuggestionDismissInput): Promise<void> {
  const { uid, suggestionId } = input;
  const batch = writeBatch(db);
  batch.update(doc(db, 'users', uid, INTERACTION_SUGGESTIONS_SUBCOLLECTION, suggestionId), {
    status: 'pending',
    dismissedBy: deleteField(),
    dismissedAt: deleteField(),
  });
  await batch.commit();
}

export interface MarkNotACisaPersonInput {
  uid: string;
  bnpbContactId: string;
  /** The owner's pending suggestions; every one for this BNPB contact is dismissed. */
  suggestions: InteractionSuggestion[];
}

/**
 * Records a "Not a CISA person" choice for a BNPB contact and dismisses every
 * pending suggestion naming them. Returns the dismissed suggestion ids so the
 * caller's Undo can restore exactly these, and not ones dismissed one at a time.
 */
export async function markNotACisaPerson(input: MarkNotACisaPersonInput): Promise<string[]> {
  const { uid, bnpbContactId, suggestions } = input;
  const affected = suggestions.filter(
    (s) => s.bnpbContactId === bnpbContactId && s.status === 'pending',
  );
  const batch = writeBatch(db);
  batch.set(doc(db, 'users', uid, NOT_A_CISA_PERSON_SUBCOLLECTION, notACisaPersonId(bnpbContactId)), {
    bnpbContactId,
    createdAt: serverTimestamp(),
  });
  for (const suggestion of affected) {
    batch.update(doc(db, 'users', uid, INTERACTION_SUGGESTIONS_SUBCOLLECTION, suggestion.id), {
      status: 'dismissed',
      dismissedBy: 'notACisaPerson',
      dismissedAt: serverTimestamp(),
    });
  }
  await batch.commit();
  return affected.map((s) => s.id);
}

export interface UndoNotACisaPersonInput {
  uid: string;
  bnpbContactId: string;
  suggestionIds: string[];
}

/** Removes a "Not a CISA person" choice and restores only what it dismissed. */
export async function undoNotACisaPerson(input: UndoNotACisaPersonInput): Promise<void> {
  const { uid, bnpbContactId, suggestionIds } = input;
  const batch = writeBatch(db);
  batch.delete(doc(db, 'users', uid, NOT_A_CISA_PERSON_SUBCOLLECTION, notACisaPersonId(bnpbContactId)));
  for (const suggestionId of suggestionIds) {
    batch.update(doc(db, 'users', uid, INTERACTION_SUGGESTIONS_SUBCOLLECTION, suggestionId), {
      status: 'pending',
      dismissedBy: deleteField(),
      dismissedAt: deleteField(),
    });
  }
  await batch.commit();
}
