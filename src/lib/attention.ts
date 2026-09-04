import type { Contact, Interaction, Notification } from "../types";
import { isFullTimer, isTrainee } from "./walking";
import { teamOf } from "./teams";
import type { ThreadMessageWithContact } from "./threads";
import { bucketFor, type DateBucket } from "../components/landing/dateBuckets";
import { UserEntityState } from "./userEntityState";

export type AttentionKind = "contact" | "interaction" | "thread" | "task" | "notification";

/** Everyone tied to a contact (#813): they added them, they are the adder's
 *  gospel partner, or they are the assigned caregiver — the same three ties
 *  `canSeeContact` has always used — plus the fourth, private one: teammates
 *  keeping this person on their own My Day. That fourth tie is indexed by
 *  person rather than by contact, so it cannot be resolved by whoever is
 *  posting; it is resolved here, on the reader's own screen, from preferences
 *  they already have loaded. */
export function isTiedTo(
  contact: Pick<Contact, "createdBy" | "addedBy" | "owner" | "coCreators"> | undefined,
  uid: string,
  personalContactIds?: Set<string> | null,
  contactId?: string | null,
): boolean {
  if (contactId && personalContactIds?.has(contactId)) return true;
  if (!contact || !uid) return false;
  return (
    contact.createdBy === uid ||
    contact.addedBy === uid ||
    contact.owner === uid ||
    (contact.coCreators || []).includes(uid)
  );
}

export interface AttentionItem {
  id: string; // e.g. "contact:<id>" | "interaction:<id>" | "thread:<id>" | "task:<id>" | "notif:<id>"
  type: AttentionKind;
  at: string; // ISO
  contactId?: string | null;
  targetId?: string | null;
  by?: string | null; // uid of actor
  byName?: string | null;
  title?: string | null;
  body?: string | null;
  interactionId?: string | null;
  kind?: string | null; // e.g. "question" | "nudge" | "note"
  mentioned?: boolean;
  /** Follow-up asks: set once someone said they did it (or the asker retracted). */
  closedAt?: string | null;
  closedByName?: string | null;
  /** Set on the asker's own outstanding questions, so they can see what they
   *  are waiting on. Without it "both ends" is really one end. */
  awaitingReply?: boolean;
}


export interface AttentionStack {
  id: string; // "att:contact:<id>" or "att:target:<id>" or "att:<id>"
  contactId?: string | null;
  targetId?: string | null;
  items: AttentionItem[];
  at: string; // ISO of newest item
  bucket: DateBucket;
  by: string[];
  kinds: AttentionKind[];
  unread: number;
}

export interface AttentionGroup {
  bucket: DateBucket;
  label: string;
  stacks: AttentionStack[];
}

const BUCKET_LABELS: Record<DateBucket, string> = {
  today: "Today",
  yesterday: "Yesterday",
  thisWeek: "This week",
  lastWeek: "Last week",
  thisMonth: "Earlier this month",
  lastMonth: "Last month",
  older: "Longer ago",
};

const BUCKET_ORDER: DateBucket[] = [
  "today",
  "yesterday",
  "thisWeek",
  "lastWeek",
  "thisMonth",
  "lastMonth",
  "older",
];

const ms = (iso?: string | null) => {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? 0 : t;
};

export function buildAttentionItems(params: {
  role?: string;
  uid: string;
  contacts?: Contact[];
  interactions?: Interaction[];
  threads?: ThreadMessageWithContact[];
  tasks?: Array<{
    id: string;
    title: string;
    status: string;
    assigneeId?: string | null;
    dueDate?: string | null;
    contactId?: string | null;
    createdById?: string | null;
  }>;
  notifications?: Notification[];
  /** The reader's own "keeping them" set — the fourth, private tie (#813). */
  personalContactIds?: Set<string> | null;
}): AttentionItem[] {
  const {
    role,
    uid,
    contacts = [],
    interactions = [],
    threads = [],
    tasks = [],
    notifications = [],
    personalContactIds = null,
  } = params;
  const items: AttentionItem[] = [];

  const isFullTimerView = role === "admin" || role === "owner" || role === "full_timer" || isFullTimer(uid);
  const contactById = new Map<string, Contact>();
  for (const c of contacts) contactById.set(c.id, c);
  const tied = (contactId?: string | null) =>
    !!contactId && isTiedTo(contactById.get(contactId), uid, personalContactIds, contactId);

  if (isFullTimerView) {
    // 1. Team-added contacts (except full-timer's own)
    for (const c of contacts) {
      if (c.createdBy && c.createdBy !== uid) {
        items.push({
          id: "contact:" + c.id,
          type: "contact",
          at: c.createdAt ?? new Date().toISOString(),
          contactId: c.id,
          by: c.createdBy,
          body: c.notes,
        });
      }
    }

    // 2. Team-logged interactions (except full-timer's own)
    for (const i of interactions) {
      const by = i.userId ?? i.createdById;
      if (by && by !== uid && i.contactId) {
        const rawI = i as unknown as { title?: string };
        items.push({
          id: "interaction:" + i.id,
          type: "interaction",
          at: i.createdAt ?? i.dateTime ?? new Date().toISOString(),
          contactId: i.contactId,
          by,
          interactionId: i.id,
          title: rawI.title || i.type || "Interaction",
          body: i.content,
        });
      }
    }

    // 3. Unanswered thread questions from anyone else
    for (const m of threads) {
      if (m.kind === "question" && m.from && m.from !== uid) {
        const answered = threads.some(
          (r) =>
            r.from === uid &&
            r.contactId === m.contactId &&
            (r.interactionId ?? null) === (m.interactionId ?? null) &&
            ms(r.at) > ms(m.at),
        );
        if (!answered) {
          items.push({
            id: "thread:" + m.id,
            type: "thread",
            at: m.at,
            contactId: m.contactId,
            by: m.from,
            body: m.body,
            kind: m.kind,
            interactionId: m.interactionId ?? null,
            closedAt: m.closedAt ?? null,
            closedByName: m.closedByName ?? null,
          });
        }
      }
    }
  } else if (role === "manager" || isTrainee(uid)) {
    // A Trainee sees what was written about the people they are TIED to (#813).
    // The branch this replaces gated on `role === "trainee"`, but a Trainee's
    // role is `manager`, so it had never once executed — and had it executed it
    // would have handed every Trainee every Full-timer's message about students
    // they have never met. Students and Community members are deliberately not
    // included: they do not get this feed, and staff notes are not theirs to
    // read even about a person they signed up. Team-scope messages are
    // Full-timer-only and must never reach anyone else.
    for (const m of threads) {
      if (m.scope === "team") continue;
      if (!m.from || m.from === uid) continue;
      if (!tied(m.contactId)) continue;
      items.push({
        id: "thread:" + m.id,
        type: "thread",
        at: m.at,
        contactId: m.contactId,
        by: m.from,
        body: m.body,
        kind: m.kind,
        interactionId: m.interactionId ?? null,
        closedAt: m.closedAt ?? null,
        closedByName: m.closedByName ?? null,
      });
    }
  }

  // The asker's own outstanding questions. `buildAttentionItems` has always
  // tracked unanswered questions from *anyone else*, so the one person who
  // cannot see a question is the person waiting on it.
  for (const m of threads) {
    if (m.kind !== "question" || m.from !== uid) continue;
    if (m.scope === "team" && !isFullTimerView) continue;
    const answered = threads.some(
      (r) =>
        r.from !== uid &&
        r.contactId === m.contactId &&
        (r.interactionId ?? null) === (m.interactionId ?? null) &&
        ms(r.at) > ms(m.at),
    );
    if (answered) continue;
    items.push({
      id: "thread:" + m.id,
      type: "thread",
      at: m.at,
      contactId: m.contactId,
      by: m.from,
      body: m.body,
      kind: m.kind,
      interactionId: m.interactionId ?? null,
      awaitingReply: true,
    });
  }

  // 4. Thread messages where current user is explicitly mentioned
  for (const m of threads) {
    if (m.scope === "team" && !isFullTimerView) continue;
    if (m.from && m.from !== uid && m.mentionedUserIds?.includes(uid)) {
      // Ensure we don't duplicate if it was already added above as a question or full-timer item
      const existing = items.find((it) => it.id === "thread:" + m.id);
      if (!existing) {
        items.push({
          id: "thread:" + m.id,
          type: "thread",
          at: m.at,
          contactId: m.contactId,
          by: m.from,
          body: m.body,
          kind: m.kind,
          interactionId: m.interactionId ?? null,
          closedAt: m.closedAt ?? null,
          closedByName: m.closedByName ?? null,
          mentioned: true,
        });
      } else {
        existing.mentioned = true;
      }
    }
  }


  // Tasks assigned to user (pending)

  for (const t of tasks) {
    if (t.assigneeId === uid && t.status !== "completed") {
      items.push({
        id: "task:" + t.id,
        type: "task",
        at: t.dueDate ?? new Date().toISOString(),
        contactId: t.contactId ?? null,
        title: t.title,
        by: t.createdById ?? null,
      });
    }
  }

  // Notifications for user
  for (const n of notifications) {
    if (!n.read && (!n.userId || n.userId === uid)) {
      const atStr =
        typeof n.createdAt === "string"
          ? n.createdAt
          : n.createdAt && typeof (n.createdAt as unknown as { seconds?: number }).seconds === "number"
            ? new Date((n.createdAt as unknown as { seconds: number }).seconds * 1000).toISOString()
            : new Date().toISOString();
      items.push({
        id: "notif:" + n.id,
        type: "notification",
        at: atStr,
        targetId: n.targetId ?? null,
        title: n.title,
        body: n.message,
      });
    }
  }

  return items;
}

export function attentionStacksFor(items: AttentionItem[], uid: string): AttentionStack[] {
  const byGroup = new Map<string, AttentionItem[]>();

  for (const item of items) {
    // Check if item or entity is marked done in UserEntityState
    if (UserEntityState.isDone(uid, item.id)) continue;
    if (item.contactId && (UserEntityState.isDone(uid, `contact:${item.contactId}`) || UserEntityState.isDone(uid, item.contactId))) {
      continue;
    }
    if (item.targetId && (UserEntityState.isDone(uid, `target:${item.targetId}`) || UserEntityState.isDone(uid, item.targetId))) {
      continue;
    }

    const groupKey = item.contactId
      ? `contact:${item.contactId}`
      : item.targetId
        ? `target:${item.targetId}`
        : item.id;

    if (!byGroup.has(groupKey)) {
      byGroup.set(groupKey, []);
    }
    byGroup.get(groupKey)!.push(item);
  }

  const stacks: AttentionStack[] = [];

  byGroup.forEach((groupItems, groupKey) => {
    groupItems.sort((a, b) => ms(b.at) - ms(a.at));
    const newest = groupItems[0];
    const at = newest.at;
    const bucket = bucketFor(at) || "older";

    const contactId = groupItems.find((i) => i.contactId)?.contactId ?? null;
    const targetId = groupItems.find((i) => i.targetId)?.targetId ?? null;

    const by = [...new Set(groupItems.map((i) => i.by).filter((b): b is string => Boolean(b)))];
    const kinds = [...new Set(groupItems.map((i) => i.type))];

    const unread = groupItems.filter((i) => !UserEntityState.isRead(uid, i.id)).length;

    stacks.push({
      id: "att:" + groupKey,
      contactId,
      targetId,
      items: groupItems,
      at,
      bucket,
      by,
      kinds,
      unread,
    });
  });

  return stacks.sort((a, b) => ms(b.at) - ms(a.at));
}

export function attentionGroupsFor(stacks: AttentionStack[]): AttentionGroup[] {
  const groups: AttentionGroup[] = [];

  for (const bucketKey of BUCKET_ORDER) {
    const bucketStacks = stacks.filter((s) => s.bucket === bucketKey);
    if (bucketStacks.length > 0) {
      groups.push({
        bucket: bucketKey,
        label: BUCKET_LABELS[bucketKey] || bucketKey,
        stacks: bucketStacks,
      });
    }
  }

  return groups;
}

/** What happened, in words that fit what actually happened (#813). Every thread
 *  item used to read "asked you something", so a note, a comment and an
 *  encouragement all announced themselves as a question the reader owed an
 *  answer to — which is why nobody trusted the line. */
export function attentionPhrase(item: AttentionItem, staffNameMap?: Record<string, string>): string {
  const byName = item.byName || (item.by && staffNameMap?.[item.by]) || "Someone";
  const firstName = byName.trim().split(/\s+/)[0];

  if (item.type === "contact") return `${firstName} added them`;
  if (item.type === "task") return `${firstName} assigned a to-do`;
  if (item.type === "notification") return item.title || "New notification";

  if (item.type === "thread") {
    switch (item.kind) {
      case "question":
        // The asker's own outstanding question reads from their side.
        return item.awaitingReply
          ? "You asked something · no reply yet"
          : `${firstName} asked you something`;
      case "nudge":
        if (item.closedAt) return `${item.closedByName?.trim().split(/\s+/)[0] || "Someone"} followed up`;
        return `${firstName} asked for a follow-up`;
      case "encouragement":
        return `${firstName} encouraged you`;
      case "note":
        return `${firstName} left a note`;
      default:
        return `${firstName} wrote back`;
    }
  }

  return `${firstName} logged ${item.title ? `“${item.title.length > 28 ? item.title.slice(0, 28) + "…" : item.title}”` : "time"}`;
}

export function partitionAttentionStacks(
  stacks: AttentionStack[],
  contacts: Contact[],
  uid: string,
  role?: string,
  personalContactIds?: Set<string> | null,
): { onYou: AttentionStack[]; aroundTeam: AttentionStack[] } {
  void role;
  const contactMap = new Map<string, Contact>();
  for (const c of contacts) {
    contactMap.set(c.id, c);
  }

  const onYou: AttentionStack[] = [];
  const aroundTeam: AttentionStack[] = [];

  for (const stack of stacks) {
    // Direct items (tasks assigned to user, notifications for user)
    const hasDirectTaskOrNotif = stack.items.some(
      (it) => it.type === "task" || it.type === "notification",
    );

    // Something addressed to you: a question or a follow-up ask on a person you
    // are involved with, an explicit mention, or a question you are waiting on.
    const hasThreadAskOrMention = stack.items.some(
      (it) =>
        it.type === "thread" &&
        (it.kind === "question" || it.kind === "nudge" || it.mentioned || it.awaitingReply),
    );

    // One definition of "tied to this person", shared with the notification
    // reach — two different answers is how this drifted in the first place.
    const isOwnedContact = isTiedTo(
      stack.contactId ? contactMap.get(stack.contactId) : undefined,
      uid,
      personalContactIds,
      stack.contactId,
    );

    if (hasDirectTaskOrNotif || hasThreadAskOrMention || isOwnedContact) {
      onYou.push(stack);
    } else {
      aroundTeam.push(stack);
    }

  }

  return { onYou, aroundTeam };
}


// ── Filtering the feed (#727) ───────────────────────────────────────────────
// The filter cuts on the ACTOR — the trainee who added the contact or logged
// the conversation — never on the contact. It is the only axis on which a team
// means anything, and it is what makes "filter the news" and "group people into
// teams" one feature rather than two.

export interface AttentionFilter {
  /** A team id from `lib/teams`, or null/absent for everyone. */
  team?: string | null;
  /** One teammate's uid, or null/absent for the whole (team's) roster. */
  who?: string | null;
}

/** True when nothing is chosen and the feed should be left alone. */
export function isRestingFilter(filter: AttentionFilter): boolean {
  return !filter.team && !filter.who;
}

/**
 * Keep the stacks at least one of whose actors satisfies the filter. Both
 * clauses have to land on the SAME actor: asking for Grace inside the YP team
 * matches nobody, because Grace is on Campus.
 *
 * A stack with no actor at all (a notification, an unassigned task) drops out
 * as soon as a filter is on — filtering by who did it, when nobody did.
 */
export function filterAttentionStacks(
  stacks: AttentionStack[],
  filter: AttentionFilter,
): AttentionStack[] {
  if (isRestingFilter(filter)) return stacks;
  const { team, who } = filter;
  return stacks.filter((s) =>
    s.by.some((uid) => (!who || uid === who) && (!team || teamOf(uid) === team)),
  );
}

/**
 * The distinct actors present in these stacks — the people the teammate select
 * offers, so it never lists someone with nothing on the feed. Pass a team to
 * scope the options to the chip above the select.
 */
export function actorsInStacks(stacks: AttentionStack[], team?: string | null): string[] {
  const out = new Set<string>();
  for (const s of stacks) {
    for (const uid of s.by) {
      if (team && teamOf(uid) !== team) continue;
      out.add(uid);
    }
  }
  return [...out];
}

/** The team a stack's actors are on, for the tag on an "Around the team" row.
 *  Null when they are unassigned or disagree — a tag that could name either of
 *  two teams says nothing. */
export function soleTeamOf(stack: AttentionStack): string | null {
  const teams = [...new Set(stack.by.map((uid) => teamOf(uid)).filter(Boolean))];
  return teams.length === 1 ? (teams[0] as string) : null;
}
