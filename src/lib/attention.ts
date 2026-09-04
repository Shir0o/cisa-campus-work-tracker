import type { Contact, Interaction, Notification } from "../types";
import { isFullTimer, fullTimerIds } from "./walking";
import { teamOf } from "./teams";
import type { ThreadKind, ThreadMessageWithContact } from "./threads";
import { bucketFor, type DateBucket } from "../components/landing/dateBuckets";
import { UserEntityState } from "./userEntityState";

export type AttentionKind = "contact" | "interaction" | "thread" | "task" | "notification";

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
  reviewed?: boolean;
  kind?: string | null; // e.g. "question" | "nudge" | "note"
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
}): AttentionItem[] {
  const { role, uid, contacts = [], interactions = [], threads = [], tasks = [], notifications = [] } = params;
  const items: AttentionItem[] = [];

  const isFullTimerView = role === "admin" || role === "owner" || role === "full_timer" || isFullTimer(uid);
  const isTraineeView = role === "trainee";

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
          reviewed: !!c.reviewed,
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
          });
        }
      }
    }
  } else if (isTraineeView) {
    // Trainee: anything a full-timer wrote (answers/comments/nudges + questions).
    // No pairing — accept from ANY full-timer and name the writer. Team-scope
    // Discussion messages are Full-timer-only and must never reach trainees.
    const fts = fullTimerIds();
    for (const m of threads) {
      if (m.scope === "team") continue;
      if (m.from && fts.includes(m.from) && m.from !== uid) {
        items.push({
          id: "thread:" + m.id,
          type: "thread",
          at: m.at,
          contactId: m.contactId,
          by: m.from,
          body: m.body,
          kind: m.kind,
          interactionId: m.interactionId ?? null,
        });
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

    const unread = groupItems.filter(
      (i) => !UserEntityState.isRead(uid, i.id) && !i.reviewed,
    ).length;

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

export function attentionPhrase(item: AttentionItem, staffNameMap?: Record<string, string>): string {
  const byName = item.byName || (item.by && staffNameMap?.[item.by]) || "Someone";
  const firstName = byName.trim().split(/\s+/)[0];

  if (item.type === "contact") return `${firstName} added them`;
  if (item.type === "thread") return `${firstName} asked you something`;
  if (item.type === "task") return `${firstName} assigned a task`;
  if (item.type === "notification") return item.title || "New notification";
  return `${firstName} logged ${item.title ? `“${item.title.length > 28 ? item.title.slice(0, 28) + "…" : item.title}”` : "time"}`;
}

export function partitionAttentionStacks(
  stacks: AttentionStack[],
  contacts: Contact[],
  uid: string,
  role?: string,
): { onYou: AttentionStack[]; aroundTeam: AttentionStack[] } {
  const isTraineeView = role === "trainee";
  const contactMap = new Map<string, Contact>();
  for (const c of contacts) {
    contactMap.set(c.id, c);
  }

  const onYou: AttentionStack[] = [];
  const aroundTeam: AttentionStack[] = [];

  for (const stack of stacks) {
    if (isTraineeView) {
      // For trainees, everything in their attention feed is from a full-timer or assigned to them
      onYou.push(stack);
      continue;
    }

    // Direct items (tasks assigned to user, notifications for user)
    const hasDirectTaskOrNotif = stack.items.some(
      (it) => it.type === "task" || it.type === "notification",
    );

    // Direct question or nudge in thread (where user didn't ask it, someone asked them)
    const hasThreadAsk = stack.items.some(
      (it) => it.type === "thread" && (it.kind === "question" || it.kind === "nudge"),
    );

    // Check contact ownership/assignment
    const contact = stack.contactId ? contactMap.get(stack.contactId) : undefined;
    const isOwnedContact =
      contact &&
      (contact.owner === uid ||
        contact.addedBy === uid ||
        (!contact.owner && contact.createdBy === uid) ||
        (contact.coCreators && contact.coCreators.includes(uid)));

    if (hasDirectTaskOrNotif || hasThreadAsk || isOwnedContact) {
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
