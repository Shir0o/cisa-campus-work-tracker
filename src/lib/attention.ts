import type { Contact, Interaction, Notification } from "../types";
import { fullTimerOf, FT_TRAINEES } from "./walking";
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

  const isFullTimer = role === "admin" || role === "owner" || role === "full_timer" || !!FT_TRAINEES[uid];
  const isTrainee = role === "trainee";

  if (isFullTimer) {
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
  } else if (isTrainee) {
    // Trainee: full-timer answers/comments/nudges + questions
    const ft = fullTimerOf(uid);
    for (const m of threads) {
      if (m.from && (m.from === ft || m.kind === "nudge" || m.kind === "question") && m.from !== uid) {
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
