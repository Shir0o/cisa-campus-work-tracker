// A Full-timer's **to work through** count (#1336): the **Around the team**
// cards not yet **Reviewed** — the number Around's pill and My Day's pointer
// card show, and the number the Full-timer weekly reminder announces.
//
// This is the shared copy for the server. The web app deliberately has no
// @cisa/core dependency (ADR 0033 §6), so the web derivation in
// src/lib/attention.ts (`buildAttentionItems` → `attentionStacksFor` →
// `partitionAttentionStacks` → `toWorkThroughCount`) is the behaviour oracle,
// and src/test/aroundTeamParity.test.ts holds the two in step. Only the
// Full-timer reading is mirrored: Around the team is Full-timer-only.
//
// Self-contained on purpose — firebase-functions compiles this file directly.

/** The fields of a contact the derivation reads: who is tied to them. */
export interface AroundTeamContact {
  id: string;
  createdBy?: string | null;
  addedBy?: string | null;
  coCreators?: string[] | null;
  founders?: string[] | null;
  carers?: string[] | null;
}

export interface AroundTeamInteraction {
  id: string;
  contactId?: string | null;
  userId?: string | null;
  createdById?: string | null;
}

/** A message from a contact's `threads` or `teamThreads`. */
export interface AroundTeamThread {
  id: string;
  contactId: string;
  from: string;
  kind: string;
  /** ISO; the web reads a missing one as "now". */
  at: string;
  interactionId?: string | null;
  mentionedUserIds?: string[] | null;
}

export interface AroundTeamInput {
  /** The Full-timer reading the page. */
  uid: string;
  contacts: readonly AroundTeamContact[];
  /** The newest interactions the page subscribes to (500, by `createdAt`). */
  interactions: readonly AroundTeamInteraction[];
  threads: readonly AroundTeamThread[];
  /** The reader's own "keeping them" set — the fourth, private tie. */
  personalContactIds?: ReadonlySet<string> | null;
}

/** Reviewed stamps older than a term are dropped, as the web prunes them. */
export const REVIEWED_PRUNE_AFTER_DAYS = 120;

const DAY_MS = 86_400_000;

const ms = (iso?: string | null) => {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? 0 : t;
};

function isTied(
  contact: AroundTeamContact | undefined,
  uid: string,
  personal: ReadonlySet<string> | null | undefined,
  contactId: string | null,
): boolean {
  if (contactId && personal?.has(contactId)) return true;
  if (!contact || !uid) return false;
  return (
    contact.createdBy === uid ||
    contact.addedBy === uid ||
    (contact.coCreators || []).includes(uid) ||
    (contact.founders || []).includes(uid) ||
    (contact.carers || []).includes(uid)
  );
}

interface Item {
  id: string;
  contactId: string | null;
  /** Addressed to the reader: a mention, or their own unanswered question. */
  direct: boolean;
}

/** The ids of the stacks on the reader's Around the team, Reviewed or not. */
export function aroundTeamStackIds(input: AroundTeamInput): string[] {
  const { uid, contacts, interactions, threads, personalContactIds = null } = input;
  const contactById = new Map<string, AroundTeamContact>();
  for (const c of contacts) contactById.set(c.id, c);
  const tied = (contactId: string | null) =>
    !!contactId && isTied(contactById.get(contactId), uid, personalContactIds, contactId);
  const sameLevel = (a: AroundTeamThread, b: AroundTeamThread) =>
    a.contactId === b.contactId && (a.interactionId ?? null) === (b.interactionId ?? null);

  const items: Item[] = [];

  // Every person someone else added, or nobody did.
  for (const c of contacts) {
    if (!c.createdBy || c.createdBy !== uid) items.push({ id: "contact:" + c.id, contactId: c.id, direct: false });
  }

  // Interactions a teammate logged.
  for (const i of interactions) {
    const by = i.userId ?? i.createdById;
    if (by && by !== uid && i.contactId) {
      items.push({ id: "interaction:" + i.id, contactId: i.contactId, direct: false });
    }
  }

  // Teammates' messages on a person tied to the reader, and unanswered
  // questions on anyone.
  for (const m of threads) {
    if (m.kind === "encouragement") continue;
    if (!m.from || m.from === uid) continue;
    const unanswered =
      m.kind === "question" && !threads.some((r) => r.from === uid && sameLevel(r, m) && ms(r.at) > ms(m.at));
    if (!tied(m.contactId) && !unanswered) continue;
    if (m.kind === "question" && !unanswered) continue;
    items.push({ id: "thread:" + m.id, contactId: m.contactId, direct: false });
  }

  // The reader's own questions still waiting on a reply.
  for (const m of threads) {
    if (m.kind !== "question" || m.from !== uid) continue;
    const answered = threads.some((r) => r.from !== uid && sameLevel(r, m) && ms(r.at) > ms(m.at));
    if (!answered) items.push({ id: "thread:" + m.id, contactId: m.contactId, direct: true });
  }

  // Messages that mention the reader.
  for (const m of threads) {
    if (m.kind === "encouragement") continue;
    if (m.from && m.from !== uid && m.mentionedUserIds?.includes(uid)) {
      const existing = items.find((it) => it.id === "thread:" + m.id);
      if (existing) existing.direct = true;
      else items.push({ id: "thread:" + m.id, contactId: m.contactId, direct: true });
    }
  }

  // One stack per person (or per item with no person); a stack is the
  // reader's own — On you — when anything on it is addressed to them or they
  // are tied to the person. The rest is Around the team.
  const stacks = new Map<string, { contactId: string | null; direct: boolean }>();
  for (const it of items) {
    const key = "att:" + (it.contactId ? `contact:${it.contactId}` : it.id);
    const s = stacks.get(key);
    if (s) s.direct ||= it.direct;
    else stacks.set(key, { contactId: it.contactId || null, direct: it.direct });
  }
  const around: string[] = [];
  for (const [id, s] of stacks) {
    const onYou =
      s.direct || isTied(s.contactId ? contactById.get(s.contactId) : undefined, uid, personalContactIds, s.contactId);
    if (!onYou) around.push(id);
  }
  return around;
}

/** How many of the reader's Around the team cards are not yet Reviewed. */
export function aroundTeamToWorkThrough(input: AroundTeamInput, reviewed: ReadonlySet<string>): number {
  return aroundTeamStackIds(input).filter((id) => !reviewed.has(id)).length;
}

/** The stack ids a person has Reviewed, from the `completed` stamps on their
 *  `inboxState/{uid}` doc, without the ones older than a term. */
export function reviewedStackIds(
  completed: Record<string, string> | null | undefined,
  at: number,
): Set<string> {
  const cutoff = at - REVIEWED_PRUNE_AFTER_DAYS * DAY_MS;
  const out = new Set<string>();
  for (const [id, iso] of Object.entries(completed ?? {})) {
    const t = new Date(iso).getTime();
    if (Number.isNaN(t) || t >= cutoff) out.add(id);
  }
  return out;
}
