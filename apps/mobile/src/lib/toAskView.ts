// The plain-data assembly the To ask derivation reads, and the words it shows
// on the phone. Pure and Firestore-free, the mobile twin of the web app's
// src/lib/toAskView.ts: the derivation itself (`buildToAsk`) is the shared
// @cisa/core module, so web and mobile render exactly what it returns.
import {
  contactKind,
  parseMs,
  type AppUser,
  type Contact,
  type Interaction,
  type ThreadMessageWithContact,
  type ToAskClearedBy,
  type ToAskInteraction,
  type ToAskPerson,
  type ToAskSignalMeta,
  type ToAskThreadMessage,
  type ToAskTrainee,
  type ToAskUpdateDest,
} from '@cisa/core';
import type { TranslateFunction } from './LanguageProvider';

type Translate = TranslateFunction;

/** The two teams the filter offers — the ids a user document's `team` holds. */
export const TO_ASK_TEAMS = ['campus', 'yp'] as const;

/** A stored time as ms: an ISO string, or the Timestamp a snapshot hands back. */
function msOf(value: unknown): number {
  if (typeof value === 'string') return parseMs(value) ?? Number.NaN;
  const stamp = value as { toMillis?: () => number } | null | undefined;
  return typeof stamp?.toMillis === 'function' ? stamp.toMillis() : Number.NaN;
}

/** The roster as `buildToAsk` reads it: a name and the ties grouping needs. */
export function toAskPeopleOf(contacts: Contact[]): ToAskPerson[] {
  return contacts.map((c) => ({
    id: c.id,
    name: c.name,
    kind: contactKind(c),
    createdAtMs: parseMs(c.createdAt),
    createdBy: c.createdBy ?? null,
    addedBy: c.addedBy ?? null,
    coCreators: c.coCreators ?? null,
    founders: c.founders ?? null,
    carers: c.carers ?? null,
    unfollowedBy: c.unfollowedBy ?? null,
  }));
}

/** An Interaction's time: the date it was logged for, else when it was written. */
export const interactionMs = (i: Pick<Interaction, 'dateTime' | 'createdAt'>): number => {
  const logged = msOf(i.dateTime);
  return Number.isNaN(logged) ? msOf(i.createdAt) : logged;
};

export function toAskInteractionsOf(interactions: Interaction[]): ToAskInteraction[] {
  return interactions.map((i) => ({
    id: i.id,
    contactId: i.contactId ?? '',
    ms: interactionMs(i),
    userId: i.reachedById ?? i.userId ?? null,
    userName: i.reachedByName ?? i.userName ?? null,
    type: i.type ?? null,
  }));
}

export function toAskMessagesOf(threads: ThreadMessageWithContact[]): ToAskThreadMessage[] {
  return threads.map((m) => ({
    id: m.id,
    contactId: m.contactId,
    interactionId: m.interactionId ?? null,
    from: m.from,
    fromName: m.fromName,
    kind: m.kind,
    body: m.body,
    at: m.at,
    closedAt: m.closedAt ?? null,
    closedByName: m.closedByName ?? null,
    parentId: m.parentId ?? null,
    scope: m.scope === 'team' ? 'team' : null,
    mentionedUserIds: m.mentionedUserIds ?? null,
  }));
}

/** Every Trainee on the roster (role `manager`), with the team the filter reads
 *  and a name — their own, else whatever the app has seen them write under. */
export function toAskTraineesOf(
  users: Pick<AppUser, 'uid' | 'role' | 'team'>[],
  nameByUid: Record<string, string | undefined>,
): ToAskTrainee[] {
  return users
    .filter((u) => u.role === 'manager')
    .map((u) => ({
      uid: u.uid,
      name: nameByUid[u.uid]?.trim() || u.uid,
      team: (TO_ASK_TEAMS as readonly string[]).includes(u.team ?? '') ? u.team : null,
    }));
}

/** The app's own words for a drafted line, when the Full-timer has not
 *  reworded it. */
export function draftText(signal: ToAskSignalMeta, t: Translate): string {
  const name = signal.contactName;
  const asker = signal.askerName || 'Someone';
  if (signal.kind === 'notReached') {
    return t('mobile.toAsk.draft_not_reached').replace('{name}', name);
  }
  if (signal.kind === 'ask') {
    return (signal.mine ? t('mobile.toAsk.draft_ask_mine') : t('mobile.toAsk.draft_ask_theirs'))
      .replace('{name}', name)
      .replace('{asker}', asker);
  }
  if (signal.kind === 'mention') {
    return (signal.mine ? t('mobile.toAsk.draft_mention_mine') : t('mobile.toAsk.draft_mention_theirs'))
      .replace('{name}', name)
      .replace('{asker}', asker);
  }
  if (signal.kind === 'noReply') {
    return (signal.mine ? t('mobile.toAsk.draft_no_reply_mine') : t('mobile.toAsk.draft_no_reply_theirs'))
      .replace('{name}', name)
      .replace('{reacher}', signal.reacherName || 'Someone');
  }
  return (signal.mine ? t('mobile.toAsk.draft_question_mine') : t('mobile.toAsk.draft_question_theirs'))
    .replace('{name}', name)
    .replace('{asker}', asker);
}

/** The signal chip under a drafted line, e.g. "Not reached yet · added 12 days ago". */
export function signalChip(signal: ToAskSignalMeta, t: Translate): string {
  const days = String(signal.days);
  const one = signal.days === 1;
  const asker = signal.askerName || 'Someone';
  if (signal.kind === 'notReached') {
    return one
      ? t('mobile.toAsk.sig_not_reached_one')
      : t('mobile.toAsk.sig_not_reached').replace('{days}', days);
  }
  if (signal.kind === 'ask') {
    return (signal.mine ? t('mobile.toAsk.sig_ask_mine') : t('mobile.toAsk.sig_ask_theirs'))
      .replace('{asker}', asker)
      .replace('{days}', days);
  }
  if (signal.kind === 'mention') {
    return (signal.mine ? t('mobile.toAsk.sig_mention_mine') : t('mobile.toAsk.sig_mention_theirs'))
      .replace('{asker}', asker)
      .replace('{days}', days);
  }
  if (signal.kind === 'noReply') {
    const reacher = signal.reacherName || 'Someone';
    if (signal.mine) {
      return one
        ? t('mobile.toAsk.sig_no_reply_mine_one')
        : t('mobile.toAsk.sig_no_reply_mine').replace('{days}', days);
    }
    return (one ? t('mobile.toAsk.sig_no_reply_theirs_one') : t('mobile.toAsk.sig_no_reply_theirs'))
      .replace('{reacher}', reacher)
      .replace('{days}', days);
  }
  return (signal.mine ? t('mobile.toAsk.sig_question_mine') : t('mobile.toAsk.sig_question_theirs'))
    .replace('{asker}', asker)
    .replace('{days}', days);
}

/** What cleared a struck-through line. */
export function clearedText(cleared: ToAskClearedBy, t: Translate): string {
  if (cleared.reason === 'askClosed') return t('mobile.toAsk.cleared_ask');
  if (cleared.reason === 'mentionClosed') return t('mobile.toAsk.cleared_mention');
  if (cleared.reason === 'answered') return t('mobile.toAsk.cleared_answered');
  return cleared.name
    ? t('mobile.toAsk.cleared_named').replace('{name}', cleared.name)
    : t('mobile.toAsk.cleared_reached');
}

/** Where an update went, for "Your update · 2h ago · {where}". */
export function updateWhere(dest: ToAskUpdateDest, t: Translate): string {
  if (dest === 'contact') return t('mobile.toAsk.update_where_contact');
  if (dest === 'thread') return t('mobile.toAsk.update_where_thread');
  return t('mobile.toAsk.update_where_line');
}

/** A short "how long ago" for an update: just now, minutes, hours, then days. */
export function updateAgo(at: string, nowMs: number, t: Translate): string {
  const ms = parseMs(at);
  if (ms == null) return '';
  const minutes = Math.max(0, Math.floor((nowMs - ms) / 60_000));
  if (minutes < 1) return t('mobile.toAsk.ago_now');
  if (minutes < 60) return t('mobile.toAsk.ago_minutes').replace('{n}', String(minutes));
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('mobile.toAsk.ago_hours').replace('{n}', String(hours));
  const days = Math.floor(hours / 24);
  return days === 1 ? t('mobile.toAsk.ago_day') : t('mobile.toAsk.ago_days').replace('{n}', String(days));
}
