import React, { useEffect, useMemo, useState } from "react";
import { collectionGroup, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { Users, MessageSquare, HelpCircle, Heart, Bell, Check } from "lucide-react";
import { db, handleFirestoreError, OperationType } from "../../lib/firebase";
import { cn, relTime } from "../../lib/utils";
import { useAuth } from "../AuthProvider";
import { Contact, Interaction } from "../../types";
import { SectionHead } from "./primitives";
import { traineesOf } from "../../lib/walking";
import { inboxItemsFor, type InboxItem } from "../../lib/inbox";
import {
  addThreadMessage,
  subscribeAllThreads,
  type ThreadMessageWithContact,
} from "../../lib/threads";
import { useInboxReads } from "../../lib/inboxReads";

// The full-timer's "Walking with {trainee}" inbox on My Day: new people,
// conversations and questions from the trainee(s) they walk with — scannable,
// with quick ways to encourage, comment, or nudge a follow-up. Reads thread/
// interaction data across all contacts (collection-group), derives the feed with
// `inboxItemsFor`, and tracks per-device scanned state via `InboxReads`.

const firstNameOf = (full?: string) => (full || "Your trainee").trim().split(/\s+/)[0];

// Tonal node per item type (reuses the History/notification stage tones).
const NODE: Record<
  "contact" | "interaction" | "thread",
  { cls: string; Icon: typeof Users }
> = {
  contact: { cls: "text-stage-teal bg-stage-teal-soft", Icon: Users },
  interaction: { cls: "text-stage-accent bg-stage-accent-soft", Icon: MessageSquare },
  thread: { cls: "text-stage-amber bg-stage-amber-soft", Icon: HelpCircle },
};

function ActionButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-outline-variant text-xs font-medium text-on-surface hover:bg-surface-variant transition-colors"
    >
      {children}
    </button>
  );
}

function InboxRow({
  item,
  contact,
  traineeFirst,
  read,
  onEncourage,
  onComment,
  onRemind,
  onToggleScanned,
}: {
  item: InboxItem;
  contact?: Contact;
  traineeFirst: string;
  read: boolean;
  onEncourage: () => void;
  onComment: () => void;
  onRemind: () => void;
  onToggleScanned: () => void;
}) {
  const { cls, Icon } = NODE[item.type];
  const who = contact?.name || "someone new";
  const summary =
    item.type === "contact"
      ? `${traineeFirst} added ${who}`
      : item.type === "interaction"
        ? `${traineeFirst} logged time with ${who}`
        : `${traineeFirst} asked about ${who}`;

  return (
    <div
      className={cn(
        "bg-surface rounded-2xl border p-5 transition-colors",
        read ? "border-outline-variant/40" : "border-primary/30",
      )}
    >
      <div className="flex gap-3">
        <span
          className={cn("flex-none grid place-items-center rounded-[9px] w-[30px] h-[30px] mt-0.5", cls)}
          aria-hidden
        >
          <Icon className="w-[15px] h-[15px]" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-on-surface">{summary}</span>
                <span className="text-[11.5px] text-on-surface-variant">{relTime(item.at)}</span>
              </div>
              {item.body && (
                <p className="text-sm text-on-surface-variant leading-relaxed mt-1">
                  {item.body}
                </p>
              )}
            </div>
            {!read && (
              <span
                className="flex-none mt-1.5 w-[7px] h-[7px] rounded-full bg-primary"
                aria-label="Unread"
              />
            )}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <ActionButton onClick={onEncourage}>
              <Heart className="w-3.5 h-3.5" /> Encourage
            </ActionButton>
            <ActionButton onClick={onComment}>
              <MessageSquare className="w-3.5 h-3.5" /> Comment
            </ActionButton>
            <ActionButton onClick={onRemind}>
              <Bell className="w-3.5 h-3.5" /> Remind {traineeFirst}
            </ActionButton>
            <button
              onClick={onToggleScanned}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ml-auto",
                read
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-outline-variant text-on-surface-variant hover:bg-surface-variant",
              )}
            >
              <Check className="w-3.5 h-3.5" /> {read ? "Scanned" : "Mark scanned"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function FromTraineesInbox({
  meUid,
  contacts,
  onOpenContact,
}: {
  meUid: string;
  contacts: Contact[];
  onOpenContact: (
    c: Contact,
    opts?: { tab?: "thread"; interactionId?: string | null },
  ) => void;
}) {
  const { user } = useAuth();
  const inbox = useInboxReads();
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [threads, setThreads] = useState<ThreadMessageWithContact[]>([]);

  const trainees = useMemo(() => traineesOf(meUid), [meUid]);
  const hasTrainees = trainees.length > 0;

  useEffect(() => {
    if (!hasTrainees) return;
    const unsubInteractions = onSnapshot(
      query(collectionGroup(db, "interactions"), orderBy("createdAt", "desc"), limit(500)),
      (snap) =>
        setInteractions(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Record<string, unknown>),
            contactId: d.ref.path.split("/")[1],
          })) as Interaction[],
        ),
      (e) => handleFirestoreError(e, OperationType.LIST, "interactions (collectionGroup)"),
    );
    // Quiet on error: before the threads collection-group rule is deployed this
    // read is permission-denied — degrade to no questions, like Session 1's
    // contact thread does, rather than throwing on every load.
    const unsubThreads = subscribeAllThreads(setThreads);
    return () => {
      unsubInteractions();
      unsubThreads();
    };
  }, [hasTrainees]);

  // Resolve a trainee's display name from anything they authored.
  const nameByUid = useMemo(() => {
    const m: Record<string, string> = {};
    for (const c of contacts) if (c.createdBy && c.createdByName) m[c.createdBy] ??= c.createdByName;
    for (const i of interactions) {
      const u = i.userId ?? i.createdById;
      const n = i.userName ?? i.createdByName;
      if (u && n) m[u] ??= n;
    }
    for (const t of threads) if (t.from && t.fromName) m[t.from] ??= t.fromName;
    return m;
  }, [contacts, interactions, threads]);

  const items = useMemo(
    () => inboxItemsFor(meUid, { contacts, interactions, threads }),
    [meUid, contacts, interactions, threads],
  );

  const contactById = (id: string) => contacts.find((c) => c.id === id);
  const isRead = (id: string) => inbox.isRead(meUid, id);
  const unreadCount = items.filter((it) => !isRead(it.id)).length;

  // Don't render the section at all for someone who isn't a full-timer, or who
  // has no inbox content yet (e.g. before the rules deploy lands).
  if (!hasTrainees || items.length === 0) return null;

  const titleFirst = firstNameOf(nameByUid[trainees[0]]);
  const title = trainees.length > 1 ? "Walking with your trainees" : `Walking with ${titleFirst}`;
  const meName = user?.displayName || "Someone";

  const post = (item: InboxItem, kind: "encouragement" | "nudge", body: string) => {
    const contact = contactById(item.contactId);
    void addThreadMessage(
      item.contactId,
      { interactionId: item.interactionId ?? null, from: meUid, fromName: meName, kind, body },
      { to: item.by, contactName: contact?.name },
    );
    inbox.markRead(meUid, item.id);
  };

  return (
    <section className="mt-12">
      <SectionHead
        title={title}
        sub="New people and conversations, as they happen — scan, encourage, or nudge a next step."
        action={
          unreadCount > 0 ? (
            <span className="text-xs font-semibold text-primary bg-stage-accent-soft rounded-full px-2.5 py-1">
              {unreadCount} new
            </span>
          ) : undefined
        }
        linkLabel={unreadCount > 0 ? "Mark all scanned" : undefined}
        onLink={() => inbox.markAll(meUid, items.map((it) => it.id))}
      />
      <div className="flex flex-col gap-3">
        {items.map((item) => {
          const contact = contactById(item.contactId);
          const traineeFirst = firstNameOf(nameByUid[item.by]);
          const contactFirst = (contact?.name || "them").split(/\s+/)[0];
          return (
            <InboxRow
              key={item.id}
              item={item}
              contact={contact}
              traineeFirst={traineeFirst}
              read={isRead(item.id)}
              onEncourage={() =>
                post(
                  item,
                  "encouragement",
                  `Love seeing this — thank you for walking with ${contactFirst} so faithfully. 🌱`,
                )
              }
              onRemind={() =>
                post(item, "nudge", `A gentle nudge to follow up with ${contactFirst} when you get a chance.`)
              }
              onComment={() => {
                if (!contact) return;
                onOpenContact(contact, { tab: "thread", interactionId: item.interactionId ?? null });
                inbox.markRead(meUid, item.id);
              }}
              onToggleScanned={() =>
                isRead(item.id)
                  ? inbox.markUnread(meUid, item.id)
                  : inbox.markRead(meUid, item.id)
              }
            />
          );
        })}
      </div>
    </section>
  );
}
