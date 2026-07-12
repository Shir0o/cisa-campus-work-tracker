import React, { useEffect, useMemo, useState } from "react";
import { collectionGroup, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { Users, MessageSquare, HelpCircle, Heart, Bell, Check, ChevronRight, X } from "lucide-react";
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

const IBX_ENCOURAGE: Record<string, string> = {
  "🙏": "Praying for you both! Let me know if you need anything.",
  "❤️": "Love seeing this! Praying for your next step with them.",
  "🌱": "Such encouraging news. Let's keep watering those seeds!",
  "✅": "Awesome follow up! Let me know if I can support you here."
};

const firstNameOf = (full?: string) => (full || "A teammate").trim().split(/\s+/)[0];

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
  actorFirst,
  read,
  onEncourage,
  onComment,
  onRemind,
  onToggleScanned,
  mobile,
  onEncourageWithEmoji,
}: {
  item: InboxItem;
  contact?: Contact;
  actorFirst: string;
  read: boolean;
  onEncourage: () => void;
  onComment: () => void;
  onRemind: () => void;
  onToggleScanned: () => void;
  mobile?: boolean;
  onEncourageWithEmoji: (emoji: string) => void;
}) {
  const { cls, Icon } = NODE[item.type];
  const who = contact?.name || "someone new";
  const summary =
    item.type === "contact"
      ? `${actorFirst} added ${who}`
      : item.type === "interaction"
        ? `${actorFirst} logged time with ${who}`
        : `${actorFirst} asked about ${who}`;

  const [sheetOpen, setSheetOpen] = useState(false);
  const [reactOpen, setReactOpen] = useState(false);

  const closeSheet = () => {
    setSheetOpen(false);
    setReactOpen(false);
  };

  if (mobile) {
    return (
      <>
        <div
          className={cn(
            "ibx-row ibx-row-m flex items-center justify-between p-4 cursor-pointer relative",
            !read && "is-unread"
          )}
          role="button"
          tabIndex={0}
          onClick={() => setSheetOpen(true)}
        >
          <div className="ibx-main min-w-0 flex-1">
            <div className="ibx-title font-semibold text-on-surface text-sm truncate">{summary}</div>
            {item.body && <div className="ibx-body text-xs text-on-surface-variant line-clamp-2 mt-1">{item.body}</div>}
            <div className="ibx-meta text-[11px] text-on-surface-variant mt-1.5">{relTime(item.at)}</div>
          </div>
          {!read && <span className="ibx-dot w-2 h-2 rounded-full bg-primary ml-2" aria-hidden="true" />}
          <ChevronRight className="ibx-chev w-4 h-4 text-on-surface-variant/50 ml-2" />
        </div>

        {sheetOpen && (
          <div className="scrim" onClick={(e) => { if (e.target === e.currentTarget) closeSheet(); }}>
            <div className="modal ibxs" role="dialog" aria-modal="true">
              <span className="ibxs-grab" aria-hidden="true"></span>
              <div className="ibxs-head">
                <div className="ibxs-headtext">
                  <div className="ibxs-title">{summary}</div>
                  <div className="ibxs-meta">{relTime(item.at)}</div>
                </div>
                <button className="modal-x" onClick={closeSheet}><X className="w-4 h-4" /></button>
              </div>

              <div className="ibxs-body">{item.body || "No details available."}</div>

              <div className="ibxs-acts">
                {reactOpen ? (
                  <div className="ibxs-react">
                    {Object.keys(IBX_ENCOURAGE).map((e) => (
                      <button
                        key={e}
                        className="ibxs-react-e"
                        title={IBX_ENCOURAGE[e]}
                        onClick={() => {
                          onEncourageWithEmoji(e);
                          closeSheet();
                        }}
                      >
                        {e}
                      </button>
                    ))}
                    <button className="ibxs-btn ibxs-btn-ghost" onClick={() => setReactOpen(false)}>Cancel</button>
                  </div>
                ) : (
                  <>
                    <button className="ibxs-btn" onClick={() => setReactOpen(true)}>
                      <Heart className="w-[15px] h-[15px]" /> Encourage {actorFirst}
                    </button>
                    {contact && (
                      <button className="ibxs-btn" onClick={() => { onComment(); closeSheet(); }}>
                        <MessageSquare className="w-[15px] h-[15px]" /> Open the conversation
                      </button>
                    )}
                    <button className="ibxs-btn" onClick={() => { onRemind(); closeSheet(); }}>
                      <Bell className="w-[15px] h-[15px]" /> Remind {actorFirst}
                    </button>
                    <button className="ibxs-btn ibxs-btn-ghost" onClick={() => { onToggleScanned(); closeSheet(); }}>
                      <Check className="w-[15px] h-[15px]" /> {read ? "Mark unscanned" : "Mark scanned"}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

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
              <Bell className="w-3.5 h-3.5" /> Remind {actorFirst}
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
  mobile,
}: {
  meUid: string;
  contacts: Contact[];
  onOpenContact: (
    c: Contact,
    opts?: { tab?: "thread"; interactionId?: string | null },
  ) => void;
  mobile?: boolean;
}) {
  const { user } = useAuth();
  const inbox = useInboxReads();
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [threads, setThreads] = useState<ThreadMessageWithContact[]>([]);
  const [showAll, setShowAll] = useState(false);

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

  const meName = user?.displayName || "Someone";

  // Keep My Day calm: show everything unread plus a few recent, collapse the rest.
  const COLLAPSED = 6;
  const visible = showAll ? items : items.slice(0, Math.max(COLLAPSED, unreadCount));
  const hidden = items.length - visible.length;

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
    <section className={cn("mt-12", mobile ? "dash-sec ibx-sec" : "dash-sec")}>
      <SectionHead
        title="From the team"
        sub={mobile ? undefined : "New people and conversations across the team, as they happen — scan, encourage, or nudge a next step."}
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
      <div className={cn("flex flex-col gap-3", mobile ? "card" : "")}>
        <div className={mobile ? "card-body py-1.5 px-0 divide-y divide-outline-variant/30" : "flex flex-col gap-3"}>
          {visible.map((item) => {
            const contact = contactById(item.contactId);
            const actorFirst = firstNameOf(nameByUid[item.by]);
            const contactFirst = (contact?.name || "them").split(/\s+/)[0];
            return (
              <InboxRow
                key={item.id}
                item={item}
                contact={contact}
                actorFirst={actorFirst}
                read={isRead(item.id)}
                mobile={mobile}
                onEncourage={() =>
                  post(
                    item,
                    "encouragement",
                    `Love seeing this — thank you for caring for ${contactFirst} so faithfully. 🌱`,
                  )
                }
                onEncourageWithEmoji={(emoji) =>
                  post(
                    item,
                    "encouragement",
                    IBX_ENCOURAGE[emoji] || `Love seeing this — thank you for caring for ${contactFirst} so faithfully. 🌱`
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
      </div>
      {hidden > 0 && !showAll && (
        <button
          onClick={() => setShowAll(true)}
          className={mobile ? "ibx-more w-full py-3 text-center text-sm font-medium text-primary hover:underline border-t border-outline-variant/20 mt-1" : "mt-3 text-sm font-medium text-primary hover:underline"}
        >
          Show {hidden} earlier
        </button>
      )}
      {showAll && items.length > COLLAPSED && (
        <button
          onClick={() => setShowAll(false)}
          className={mobile ? "ibx-more w-full py-3 text-center text-sm font-medium text-on-surface-variant hover:underline border-t border-outline-variant/20 mt-1" : "mt-3 text-sm font-medium text-on-surface-variant hover:underline"}
        >
          Show less
        </button>
      )}
    </section>
  );
}
