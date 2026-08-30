import React, { useEffect, useMemo, useState } from "react";
import { collectionGroup, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../../lib/firebase";
import {
  Users,
  MessageSquare,
  HelpCircle,
  Heart,
  Bell,
  Check,
  ChevronRight,
  ClipboardList,
  ChevronDown,
} from "lucide-react";
import { cn, relTime } from "../../lib/utils";
import { useAuth } from "../AuthProvider";
import type { Contact, Interaction, Notification } from "../../types";
import { Avatar } from "./primitives";
import {
  buildAttentionItems,
  attentionStacksFor,
  attentionGroupsFor,
  partitionAttentionStacks,
  attentionPhrase,
  type AttentionStack,
  type AttentionItem,
} from "../../lib/attention";
import { useUserEntityState, UserEntityState } from "../../lib/userEntityState";
import { Translate } from "../Translate";
import {
  addThreadMessage,
  subscribeAllThreads,
  type ThreadMessageWithContact,
} from "../../lib/threads";

const IBX_ENCOURAGE: Record<string, string> = {
  "🙏": "Praying for you both! Let me know if you need anything.",
  "❤️": "Love seeing this! Praying for your next step with them.",
  "🌱": "Such encouraging news. Let's keep watering those seeds!",
  "✅": "Awesome follow up! Let me know if I can support you here.",
};

const NODE: Record<
  string,
  { cls: string; Icon: typeof Users }
> = {
  contact: { cls: "text-stage-teal bg-stage-teal-soft", Icon: Users },
  interaction: { cls: "text-stage-accent bg-stage-accent-soft", Icon: MessageSquare },
  thread: { cls: "text-stage-amber bg-stage-amber-soft", Icon: HelpCircle },
  task: { cls: "text-stage-violet bg-stage-violet-soft", Icon: ClipboardList },
  notification: { cls: "text-stage-accent bg-stage-accent-soft", Icon: Bell },
};

function AttentionSubItem({
  item,
  contact,
  actorFirst,
  read,
  onComment,
  onToggleRead,
  onEncourageWithEmoji,
  mobile,
}: {
  item: AttentionItem;
  contact?: Contact;
  actorFirst: string;
  read: boolean;
  onComment: () => void;
  onToggleRead: () => void;
  onEncourageWithEmoji: (emoji: string) => void;
  mobile?: boolean;
}) {
  const nodeInfo = NODE[item.type] || { cls: "text-stage-accent bg-stage-accent-soft", Icon: Users };
  const Icon = nodeInfo.Icon;
  const [reactOpen, setReactOpen] = useState(false);

  return (
    <div
      className={cn(
        "flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 rounded-xl border transition-colors",
        read ? "bg-surface border-outline-variant/60" : "bg-primary-container/20 border-outline-variant is-unread",
      )}
    >
      <div className="flex items-start gap-3 min-w-0">
        <span className={cn("w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5", nodeInfo.cls)}>
          <Icon className="w-3.5 h-3.5" />
        </span>
        <div className="min-w-0 text-sm">
          <div className="font-medium text-on-surface flex items-center gap-2">
            <span>{item.title || (item.type === "contact" ? "New Contact" : item.type === "thread" ? "Question" : "Interaction")}</span>
            {!read && <span className="w-1.5 h-1.5 rounded-full bg-accent inline-block" />}
          </div>
          {item.body && <Translate as="p" className="text-xs text-on-surface-variant line-clamp-2 mt-0.5" text={item.body} />}
          <span className="text-[11px] text-on-surface-variant/70 mt-1 block">{relTime(item.at)}</span>
        </div>
      </div>

      <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
        {item.by && (
          <div className="relative">
            <button
              onClick={() => setReactOpen(!reactOpen)}
              className="px-2.5 py-1 rounded-full border border-outline-variant text-xs font-medium text-on-surface hover:bg-surface-variant flex items-center gap-1 transition-colors cursor-pointer"
            >
              <Heart className="w-3 h-3 text-stage-accent" /> Encourage
            </button>
            {reactOpen && (
              <div className="absolute right-0 bottom-full mb-1 z-20 flex gap-1 p-1 bg-surface rounded-full shadow-lg border border-outline-variant">
                {Object.keys(IBX_ENCOURAGE).map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => {
                      onEncourageWithEmoji(emoji);
                      setReactOpen(false);
                    }}
                    className="w-7 h-7 rounded-full hover:bg-surface-variant flex items-center justify-center text-sm cursor-pointer"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <button
          onClick={onComment}
          className="px-2.5 py-1 rounded-full border border-outline-variant text-xs font-medium text-on-surface hover:bg-surface-variant flex items-center gap-1 transition-colors cursor-pointer"
        >
          <MessageSquare className="w-3 h-3" /> Comment
        </button>
        <button
          onClick={onToggleRead}
          className="px-2.5 py-1 rounded-full border border-outline-variant text-xs font-medium text-on-surface hover:bg-surface-variant transition-colors cursor-pointer"
        >
          {read ? "Scanned ✓" : "Mark scanned"}
        </button>
      </div>
    </div>
  );
}

function AttentionStackRow({
  stack,
  contact,
  staffNameMap,
  uid,
  onOpenContact,
  onToast,
  mobile,
}: {
  stack: AttentionStack;
  contact?: Contact;
  staffNameMap: Record<string, string>;
  uid: string;
  onOpenContact?: (contactId: string, initialTab?: "overview" | "thread" | "history") => void;
  onToast?: (msg: string) => void;
  mobile?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const newest = stack.items[0];
  const phrases = stack.items.slice(0, 3).map((it) => attentionPhrase(it, staffNameMap));
  const moreCount = stack.items.length - phrases.length;

  const latestText =
    newest.type === "thread"
      ? newest.body
      : newest.type === "contact"
        ? contact?.notes || "A new face to welcome."
        : newest.body || contact?.notes || "";

  const handleFollowedUp = () => {
    UserEntityState.markDone(uid, stack.id);
    if (stack.contactId) {
      UserEntityState.markDone(uid, `contact:${stack.contactId}`);
      UserEntityState.markDone(uid, stack.contactId);
    }
    if (stack.targetId) {
      UserEntityState.markDone(uid, `target:${stack.targetId}`);
      UserEntityState.markDone(uid, stack.targetId);
    }
    stack.items.forEach((it) => UserEntityState.markDone(uid, it.id));
    onToast?.(`Marked as followed up.`);
  };

  const handleScanAll = () => {
    UserEntityState.markAllRead(
      uid,
      stack.items.map((i) => i.id),
    );
  };

  const handleComment = () => {
    handleScanAll();
    if (stack.contactId && onOpenContact) {
      onOpenContact(stack.contactId, "thread");
    }
  };

  const handleEncourage = async (item: AttentionItem, emoji: string) => {
    if (!stack.contactId) return;
    const body = IBX_ENCOURAGE[emoji];
    if (!body) return;
    try {
      await addThreadMessage(stack.contactId, {
        from: uid,
        fromName: (staffNameMap && staffNameMap[uid]) || "Someone",
        kind: "encouragement",
        body,
        interactionId: item.interactionId ?? null,
      });
      UserEntityState.markRead(uid, item.id);
      onToast?.(`Encouragement posted`);
    } catch {
      onToast?.(`Could not post encouragement`);
    }
  };

  return (
    <div
      className={cn(
        "rounded-2xl border p-4 transition-all duration-200",
        stack.unread > 0
          ? "bg-surface border-outline-variant shadow-xs"
          : "bg-surface/60 border-outline-variant/40",
      )}
    >
      <div className="flex items-start gap-3.5">
        <Avatar
          contact={contact || ({ name: "Person" } as Contact)}
          size={mobile ? "sm" : "md"}
        />

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => stack.contactId && onOpenContact && onOpenContact(stack.contactId)}
                className="font-medium text-base text-on-surface hover:text-accent transition-colors truncate text-left cursor-pointer"
              >
                {contact?.name || (stack.contactId ? "Contact" : "Activity")}
              </button>
              {stack.unread > 0 && (
                <span className="w-2 h-2 rounded-full bg-accent shrink-0 inline-block" />
              )}
            </div>
            <span className="text-xs text-on-surface-variant/80 shrink-0">{relTime(stack.at)}</span>
          </div>

          <div className="text-xs text-on-surface-variant font-medium mt-1 truncate">
            {phrases.join(" · ")}
            {moreCount > 0 && ` · ${moreCount} more`}
          </div>

          {latestText && (
            <Translate
              as="p"
              className="text-xs text-on-surface-variant/90 mt-1 line-clamp-2 whitespace-pre-line bg-surface-variant/40 rounded-lg p-2"
              text={latestText}
            />
          )}

          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <button
              type="button"
              onClick={handleFollowedUp}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary text-on-primary text-xs font-medium hover:bg-primary/90 transition-colors shadow-xs cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" /> I followed up
            </button>

            <button
              type="button"
              onClick={handleComment}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-outline-variant text-xs font-medium text-on-surface hover:bg-surface-variant transition-colors cursor-pointer"
            >
              <MessageSquare className="w-3.5 h-3.5" /> Comment
            </button>

            {stack.items.length > 1 && (
              <button
                type="button"
                onClick={() => setOpen(!open)}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-outline-variant text-xs font-medium text-on-surface hover:bg-surface-variant transition-colors cursor-pointer"
              >
                <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", open && "rotate-180")} />
                {open ? "Hide" : `All ${stack.items.length}`}
              </button>
            )}

            {stack.unread > 0 && (
              <button
                type="button"
                onClick={handleScanAll}
                className="text-xs font-medium text-on-surface-variant hover:text-on-surface px-2 py-1 transition-colors ml-auto cursor-pointer"
              >
                Mark scanned
              </button>
            )}
          </div>

          {open && (
            <div className="mt-3.5 pt-3 border-t border-outline-variant/60 flex flex-col gap-2">
              {stack.items.map((it) => {
                const isRead = UserEntityState.isRead(uid, it.id) || !!it.reviewed;
                const actorName = (it.by && staffNameMap[it.by]) || "Someone";
                const actorFirst = actorName.trim().split(/\s+/)[0];
                return (
                  <AttentionSubItem
                    key={it.id}
                    item={it}
                    contact={contact}
                    actorFirst={actorFirst}
                    read={isRead}
                    onComment={handleComment}
                    onToggleRead={() => {
                      if (isRead) UserEntityState.markUnread(uid, it.id);
                      else UserEntityState.markRead(uid, it.id);
                    }}
                    onEncourageWithEmoji={(emoji) => handleEncourage(it, emoji)}
                    mobile={mobile}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AmbientItemRow({
  stack,
  contact,
  staffNameMap,
  uid,
  onOpenContact,
  onToast,
}: {
  stack: AttentionStack;
  contact?: Contact;
  staffNameMap: Record<string, string>;
  uid: string;
  onOpenContact?: (contactId: string, initialTab?: "overview" | "thread" | "history") => void;
  onToast?: (msg: string) => void;
}) {
  const newest = stack.items[0];
  const [reactOpen, setReactOpen] = useState(false);
  const byName = newest.byName || (newest.by && staffNameMap[newest.by]) || "Someone";
  const actorFirst = byName.trim().split(/\s+/)[0];

  const actionText =
    newest.type === "contact"
      ? `${actorFirst} added them — a new face`
      : newest.type === "interaction"
        ? `${actorFirst} logged ${newest.title || "interaction"}`
        : newest.type === "thread"
          ? `${actorFirst} asked the team`
          : attentionPhrase(newest, staffNameMap);

  const snippet =
    newest.body ||
    (newest.type === "contact" ? contact?.notes : undefined) ||
    "";

  const handleEncourage = async (emoji: string) => {
    if (!stack.contactId) return;
    const body = IBX_ENCOURAGE[emoji];
    if (!body) return;
    try {
      await addThreadMessage(stack.contactId, {
        from: uid,
        fromName: (staffNameMap && staffNameMap[uid]) || "Someone",
        kind: "encouragement",
        body,
        interactionId: newest.interactionId ?? null,
      });
      UserEntityState.markRead(uid, newest.id);
      onToast?.(`Encouragement posted`);
    } catch {
      onToast?.(`Could not post encouragement`);
    }
  };

  const handleComment = () => {
    UserEntityState.markRead(uid, newest.id);
    if (stack.contactId && onOpenContact) {
      onOpenContact(stack.contactId, "thread");
    }
  };

  return (
    <div className="flex items-center justify-between gap-3 p-2.5 rounded-xl hover:bg-surface-variant/50 transition-colors group">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <Avatar contact={contact || ({ name: "Person" } as Contact)} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => stack.contactId && onOpenContact && onOpenContact(stack.contactId)}
              className="text-sm font-medium text-on-surface hover:text-accent transition-colors truncate cursor-pointer"
            >
              {contact?.name || "Contact"}
            </button>
            <span className="text-xs text-on-surface-variant truncate">
              {actionText}
            </span>
          </div>
          {snippet && (
            <Translate
              as="p"
              className="text-xs text-on-surface-variant/80 truncate mt-0.5"
              text={snippet}
            />
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0 relative">
        <div className="relative">
          <button
            type="button"
            onClick={() => setReactOpen(!reactOpen)}
            title="Tell them it landed"
            aria-label="Tell them it landed"
            className="w-8 h-8 rounded-lg border border-outline-variant flex items-center justify-center text-on-surface-variant hover:bg-surface-variant hover:text-on-surface transition-colors cursor-pointer"
          >
            <Heart className="w-3.5 h-3.5" />
          </button>
          {reactOpen && (
            <div className="absolute right-0 bottom-full mb-1 z-20 flex gap-1 p-1 bg-surface rounded-full shadow-lg border border-outline-variant">
              {Object.keys(IBX_ENCOURAGE).map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => {
                    handleEncourage(emoji);
                    setReactOpen(false);
                  }}
                  className="w-7 h-7 rounded-full hover:bg-surface-variant flex items-center justify-center text-sm cursor-pointer"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={handleComment}
          title="Comment"
          aria-label="Comment"
          className="w-8 h-8 rounded-lg border border-outline-variant flex items-center justify-center text-on-surface-variant hover:bg-surface-variant hover:text-on-surface transition-colors cursor-pointer"
        >
          <MessageSquare className="w-3.5 h-3.5" />
        </button>

        {stack.contactId && (
          <button
            type="button"
            onClick={() => onOpenContact && onOpenContact(stack.contactId!)}
            title="Open their page"
            aria-label="Open their page"
            className="w-8 h-8 rounded-lg border border-outline-variant flex items-center justify-center text-on-surface-variant hover:bg-surface-variant hover:text-on-surface transition-colors cursor-pointer"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

export default function AttentionFeed({
  contacts = [],
  interactions: propsInteractions,
  threads: propsThreads,
  tasks = [],
  notifications = [],
  staffNameMap: propsStaffNameMap,
  onOpenContact,
  onToast,
  mobile,
  className,
}: {
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
  staffNameMap?: Record<string, string>;
  onOpenContact?: (
    c: Contact,
    opts?: { tab?: "overview" | "thread" | "history"; interactionId?: string | null },
  ) => void;
  onToast?: (msg: string) => void;
  mobile?: boolean;
  className?: string;
}) {
  const { user, effectiveUserId, role } = useAuth();
  const uid = effectiveUserId || user?.uid || "u1";
  const [showAllOnYou, setShowAllOnYou] = useState(false);
  const [showAllTeam, setShowAllTeam] = useState(false);
  const [liveInteractions, setLiveInteractions] = useState<Interaction[]>([]);
  const [liveThreads, setLiveThreads] = useState<ThreadMessageWithContact[]>([]);

  // Subscribe to read/done state changes live
  useUserEntityState();

  useEffect(() => {
    if (propsInteractions) return;
    try {
      const unsubInteractions = onSnapshot(
        query(collectionGroup(db, "interactions"), orderBy("createdAt", "desc"), limit(500)),
        (snap) =>
          setLiveInteractions(
            snap.docs.map((d) => ({
              id: d.id,
              ...(d.data() as Record<string, unknown>),
              contactId: d.ref.path.split("/")[1],
            })) as Interaction[],
          ),
        (e) => handleFirestoreError(e, OperationType.LIST, "interactions (collectionGroup)"),
      );
      return () => unsubInteractions();
    } catch {
      // Degrade gracefully in test environments without live firestore
    }
  }, [propsInteractions]);

  useEffect(() => {
    if (propsThreads) return;
    try {
      const unsubThreads = subscribeAllThreads(setLiveThreads);
      return () => unsubThreads();
    } catch {
      // Degrade gracefully in test environments without live firestore
    }
  }, [propsThreads]);

  const interactions = propsInteractions || liveInteractions;
  // Team-scope Discussion is Full-timer-only; hide it from any other role even
  // before the security rules filter it out server-side.
  const threads = (propsThreads || liveThreads).filter(
    (m) => m.scope !== "team" || role === "admin",
  );

  const staffNameMap = useMemo(() => {
    if (propsStaffNameMap) return propsStaffNameMap;
    const m: Record<string, string> = {};
    for (const c of contacts) if (c.createdBy && c.createdByName) m[c.createdBy] ??= c.createdByName;
    for (const i of interactions) {
      const u = i.userId ?? i.createdById;
      const n = i.userName ?? i.createdByName;
      if (u && n) m[u] ??= n;
    }
    for (const t of threads) if (t.from && t.fromName) m[t.from] ??= t.fromName;
    return m;
  }, [propsStaffNameMap, contacts, interactions, threads]);

  const contactMap = useMemo(() => {
    const map = new Map<string, Contact>();
    contacts.forEach((c) => map.set(c.id, c));
    return map;
  }, [contacts]);

  const handleOpenContact = (contactId: string, initialTab?: "overview" | "thread" | "history") => {
    if (!onOpenContact) return;
    const c = contactMap.get(contactId);
    if (c) {
      onOpenContact(c, { tab: initialTab });
      return;
    }
    // Orphan reference (e.g. an activity that points at a deleted contact):
    // skip the open entirely rather than passing the raw string id downstream,
    // which would otherwise build `/people/${string}` → `/people/undefined`.
  };

  const rawItems = useMemo(
    () =>
      buildAttentionItems({
        role,
        uid,
        contacts,
        interactions,
        threads,
        tasks,
        notifications,
      }),
    [role, uid, contacts, interactions, threads, tasks, notifications],
  );

  const allStacks = useMemo(() => attentionStacksFor(rawItems, uid), [rawItems, uid]);
  const { onYou, aroundTeam } = useMemo(
    () => partitionAttentionStacks(allStacks, contacts, uid, role),
    [allStacks, contacts, uid, role],
  );

  if (allStacks.length === 0) {
    return null;
  }

  const unreadCount = allStacks.filter((s) => s.unread > 0).length;
  const unreadOnYouCount = onYou.filter((s) => s.unread > 0).length;

  const COLLAPSED_LIMIT = 5;
  const visibleOnYou = showAllOnYou ? onYou : onYou.slice(0, COLLAPSED_LIMIT);
  const hiddenOnYouCount = onYou.length - visibleOnYou.length;

  const visibleAroundTeam = showAllTeam ? aroundTeam : aroundTeam.slice(0, COLLAPSED_LIMIT);
  const hiddenTeamCount = aroundTeam.length - visibleAroundTeam.length;

  const onYouGroups = attentionGroupsFor(visibleOnYou);
  const aroundTeamGroups = attentionGroupsFor(visibleAroundTeam);

  const handleMarkAllScanned = () => {
    const allItemIds = allStacks.flatMap((s) => s.items.map((i) => i.id));
    UserEntityState.markAllRead(uid, allItemIds);
  };

  // If mobile or aroundTeam is empty (e.g. trainee view where all items are onYou), render stacked
  const isSingleColumn = mobile || aroundTeam.length === 0;

  return (
    <section className={cn("flex flex-col gap-4", className)}>
      <div className="sr-only">
        <h2>Needs your attention</h2>
        <span>{unreadCount > 0 ? `${unreadCount} new` : "All clear"}</span>
      </div>

      <div className={cn(isSingleColumn ? "flex flex-col gap-6" : "grid grid-cols-1 lg:grid-cols-12 gap-6 items-start")}>
        {/* ── Left Column: "On you" ── */}
        <section
          aria-label="On you"
          className={cn(
            "bg-surface border border-outline-variant/60 rounded-3xl p-5 sm:p-6 flex flex-col gap-4 shadow-xs",
            !isSingleColumn && "lg:col-span-6",
          )}
        >
          <div className="flex items-baseline justify-between gap-3 flex-wrap border-b border-outline-variant/40 pb-3">
            <div className="flex items-baseline gap-2.5 flex-wrap">
              <h3 className="font-serif text-lg text-on-surface font-semibold m-0">On you</h3>
              <span className="text-xs text-on-surface-variant">
                {onYou.length === 0
                  ? "Nothing waiting on you right now."
                  : `${onYou.length} ${onYou.length === 1 ? "person" : "people"}, because you carry them.`}
              </span>
              {unreadOnYouCount > 0 && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-accent/15 text-accent">
                  {unreadOnYouCount} new
                </span>
              )}
            </div>
            {unreadOnYouCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllScanned}
                className="text-xs font-medium text-accent hover:underline cursor-pointer"
              >
                Mark all scanned
              </button>
            )}
          </div>

          {onYou.length === 0 ? (
            <p className="text-xs text-on-surface-variant italic py-2">All clear here.</p>
          ) : (
            <div className="flex flex-col gap-5">
              {onYouGroups.map((group) => (
                <div key={group.bucket} className="flex flex-col gap-2.5">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant/70 px-1">
                    {group.label}
                  </div>
                  <div className="flex flex-col gap-3">
                    {group.stacks.map((stack) => (
                      <AttentionStackRow
                        key={stack.id}
                        stack={stack}
                        contact={stack.contactId ? contactMap.get(stack.contactId) : undefined}
                        staffNameMap={staffNameMap}
                        uid={uid}
                        onOpenContact={handleOpenContact}
                        onToast={onToast}
                        mobile={mobile}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {hiddenOnYouCount > 0 && !showAllOnYou && (
            <button
              type="button"
              onClick={() => setShowAllOnYou(true)}
              className="mt-1 py-1.5 text-xs font-medium text-accent hover:underline text-center cursor-pointer"
            >
              Show {hiddenOnYouCount} more {hiddenOnYouCount === 1 ? "person" : "people"}
            </button>
          )}

          {showAllOnYou && onYou.length > COLLAPSED_LIMIT && (
            <button
              type="button"
              onClick={() => setShowAllOnYou(false)}
              className="mt-1 py-1.5 text-xs font-medium text-accent hover:underline text-center cursor-pointer"
            >
              Show less
            </button>
          )}
        </section>

        {/* ── Right Column: "Around the team" ── */}
        {!isSingleColumn && (
          <section
            aria-label="Around the team"
            className="bg-surface border border-outline-variant/60 rounded-3xl p-5 sm:p-6 flex flex-col gap-4 shadow-xs lg:col-span-6"
          >
            <div className="flex items-baseline justify-between gap-3 flex-wrap border-b border-outline-variant/40 pb-3">
              <div className="flex items-baseline gap-2.5 flex-wrap">
                <h3 className="font-serif text-lg text-on-surface font-semibold m-0">Around the team</h3>
                <span className="text-xs text-on-surface-variant">
                  Everything else the team has been doing. Nothing here is waiting on you.
                </span>
              </div>
            </div>

            {aroundTeam.length === 0 ? (
              <p className="text-xs text-on-surface-variant italic py-2">No recent team touches.</p>
            ) : (
              <div className="flex flex-col gap-4">
                {aroundTeamGroups.map((group) => (
                  <div key={group.bucket} className="flex flex-col gap-1.5">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant/70 px-1 border-b border-outline-variant/30 pb-1">
                      {group.label}
                    </div>
                    <div className="flex flex-col divide-y divide-outline-variant/30">
                      {group.stacks.map((stack) => (
                        <AmbientItemRow
                          key={stack.id}
                          stack={stack}
                          contact={stack.contactId ? contactMap.get(stack.contactId) : undefined}
                          staffNameMap={staffNameMap}
                          uid={uid}
                          onOpenContact={handleOpenContact}
                          onToast={onToast}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {hiddenTeamCount > 0 && !showAllTeam && (
              <div className="mt-2 pt-3 border-t border-dashed border-outline-variant flex items-center justify-between gap-3">
                <span className="text-xs text-on-surface-variant">
                  {hiddenTeamCount} older {hiddenTeamCount === 1 ? "update" : "updates"} across the team
                </span>
                <button
                  type="button"
                  onClick={() => setShowAllTeam(true)}
                  className="px-3 py-1 rounded-full border border-outline-variant text-xs font-medium text-on-surface hover:bg-surface-variant transition-colors cursor-pointer"
                >
                  Show them
                </button>
              </div>
            )}

            {showAllTeam && aroundTeam.length > COLLAPSED_LIMIT && (
              <button
                type="button"
                onClick={() => setShowAllTeam(false)}
                className="mt-1 py-1.5 text-xs font-medium text-accent hover:underline text-center cursor-pointer"
              >
                Show less
              </button>
            )}
          </section>
        )}
      </div>
    </section>
  );
}

