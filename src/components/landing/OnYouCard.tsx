import React, { useEffect, useMemo, useState } from "react";
import { collectionGroup, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../../lib/firebase";
import { Heart } from "lucide-react";
import { cn } from "../../lib/utils";
import { useAuth } from "../AuthProvider";
import type { Contact, Interaction, Notification } from "../../types";
import {
  buildAttentionItems,
  attentionStacksFor,
  worklistGroupsFor,
  partitionAttentionStacks,
  feedVisibleThreads,
  openAsksIn,
  encouragementSummary,
  type AttentionStack,
  type WorklistVerb,
} from "../../lib/attention";
import { useLanguage } from "../LanguageProvider";
import { InboxState } from "../../lib/inboxState";
import { UndoSnackbar } from "../UndoSnackbar";
import { useUndoSnack } from "../../hooks/useUndoSnack";
import { closeFollowUpAsk, reopenFollowUpAsk, subscribeAllThreads, type ThreadMessageWithContact } from "../../lib/threads";
import { WorklistCard, GROUP_LABEL, VERB_SNACK } from "./WorklistCard";

// ── "On you" as a bento card (#943) ────────────────────────────────────────
// My Day is a skim dashboard of your own work. "On you" — the things addressed
// to you or on people you carry — sits in the bento as a card like Your sheep
// and Your week: same five-row cap, same "show more", same empty copy, still a
// labelled region. The team column is gone from My Day; it lives at /around.

const COLLAPSED_LIMIT = 5;

export default function OnYouCard({
  contacts = [],
  interactions: propsInteractions,
  threads: propsThreads,
  tasks = [],
  notifications = [],
  staffNameMap: propsStaffNameMap,
  personalContactIds,
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
  /** The reader's own "keeping them" set — the fourth, private tie (#813). */
  personalContactIds?: Set<string> | null;
  onOpenContact?: (
    c: Contact,
    opts?: { tab?: "overview" | "thread" | "history"; interactionId?: string | null },
  ) => void;
  onToast?: (msg: string) => void;
  mobile?: boolean;
  className?: string;
}) {
  const { user, effectiveUserId, role } = useAuth();
  const { t } = useLanguage();
  const uid = effectiveUserId || user?.uid || "u1";
  const meName = user?.displayName || propsStaffNameMap?.[uid] || "Someone";
  const [showAll, setShowAll] = useState(false);
  const [liveInteractions, setLiveInteractions] = useState<Interaction[]>([]);
  const [liveThreads, setLiveThreads] = useState<ThreadMessageWithContact[]>([]);
  // Completed HERE, this visit. A card you finish greys in place and clears when
  // you leave — never under your cursor while you are still reading it.
  const [completedHere, setCompletedHere] = useState<Set<string>>(new Set());
  const { undoSnack, showUndoSnack, closeUndoSnack } = useUndoSnack();

  // Seen and completed change under the memos below, not in the props, so the
  // derivation has to be told. Without the tick in its dependency list,
  // `allStacks` would keep the seen flags it was built with and the accent dot
  // would outlive the click that cleared it.
  const [inboxTick, setInboxTick] = useState(0);
  useEffect(() => InboxState.subscribe(() => setInboxTick((n) => n + 1)), []);

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
  const threads = useMemo(
    () => feedVisibleThreads(propsThreads || liveThreads, role),
    [propsThreads, liveThreads, role],
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
    for (const m2 of threads) if (m2.from && m2.fromName) m[m2.from] ??= m2.fromName;
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
        personalContactIds,
      }),
    [role, uid, contacts, interactions, threads, tasks, notifications, personalContactIds],
  );

  const allStacks = useMemo(() => {
    void inboxTick; // the seen axis, read from the store inside
    return attentionStacksFor(rawItems, uid);
  }, [rawItems, uid, inboxTick]);

  // Praise is summarised, never a card: needing to dismiss an encouragement is
  // worse than the encouragement is worth.
  const encouraged = useMemo(
    () => encouragementSummary(threads, uid, contacts, personalContactIds),
    [threads, uid, contacts, personalContactIds],
  );

  // Partition ONCE on the unfiltered feed, then narrow the "On you" side. The
  // partition is untouched by this change (#943) — what lands here versus at
  // /around is exactly what the feed decided before.
  const allSides = useMemo(
    () => partitionAttentionStacks(allStacks, contacts, uid, role, personalContactIds),
    [allStacks, contacts, uid, role, personalContactIds],
  );

  const isCompleted = (stack: AttentionStack) => InboxState.isCompleted(uid, stack.id);
  const stillListed = (stack: AttentionStack) =>
    !isCompleted(stack) || completedHere.has(stack.id);

  const onYou = useMemo(
    () => allSides.onYou.filter((s) => stillListed(s)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allSides.onYou, uid, completedHere, inboxTick],
  );

  if (allStacks.length === 0 && encouraged.count === 0) {
    return null;
  }

  const onYouOpen = onYou.filter((s) => !isCompleted(s)).length;

  const visibleOnYou = showAll ? onYou : onYou.slice(0, COLLAPSED_LIMIT);
  const hiddenOnYouCount = onYou.length - visibleOnYou.length;
  const onYouGroups = worklistGroupsFor(visibleOnYou);

  const handleComplete = (stack: AttentionStack, verb: WorklistVerb) => {
    // A follow-up ask is closed once, for everyone tied to the contact: the
    // thing tracked is the errand, not five people's reading of it.
    const asks = verb === "followedUp" && stack.contactId ? openAsksIn(stack) : [];
    for (const ask of asks) {
      void closeFollowUpAsk(stack.contactId!, ask.id.replace(/^thread:/, ""), {
        uid,
        name: meName,
      });
    }
    InboxState.markCompleted(uid, stack.id);
    setCompletedHere((prev) => new Set(prev).add(stack.id));

    const name = (stack.contactId && contactMap.get(stack.contactId)?.name) || t("whatsNew.this_one");
    showUndoSnack(t(VERB_SNACK[verb]).replace("{name}", name), () => {
      InboxState.undoCompleted(uid, stack.id);
      setCompletedHere((prev) => {
        const next = new Set(prev);
        next.delete(stack.id);
        return next;
      });
      for (const ask of asks) {
        void reopenFollowUpAsk(stack.contactId!, ask.id.replace(/^thread:/, ""));
      }
    });
  };

  return (
    <section
      aria-label={t("whatsNew.on_you")}
      className={cn(
        "bg-surface border border-outline-variant/60 rounded-3xl p-5 sm:p-6 flex flex-col gap-4 shadow-xs",
        className,
      )}
    >
      <div className="flex items-baseline justify-between gap-3 flex-wrap border-b border-outline-variant/40 pb-3">
        <div className="flex items-baseline gap-2.5 flex-wrap">
          <h3 className="font-serif text-lg text-on-surface font-semibold m-0">
            {t("whatsNew.on_you")}
          </h3>
          <span className="text-xs text-on-surface-variant">
            {onYou.length === 0
              ? t("whatsNew.nothing_waiting")
              : t(onYou.length === 1 ? "whatsNew.because_you_carry_one" : "whatsNew.because_you_carry").replace(
                  "{n}",
                  String(onYou.length),
                )}
          </span>
          {onYouOpen > 0 && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-accent/15 text-accent">
              {t("whatsNew.to_work_through").replace("{n}", String(onYouOpen))}
            </span>
          )}
        </div>
      </div>

      {onYou.length === 0 ? (
        <p className="text-xs text-on-surface-variant italic py-2">
          {t("whatsNew.nothings_waiting_on_you")}
        </p>
      ) : (
        <div className="flex flex-col gap-5">
          {onYouGroups.map((group) => (
            <div key={group.bucket} className="flex flex-col gap-2.5">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant/70 px-1">
                {t(GROUP_LABEL[group.bucket])}
              </div>
              <div className="flex flex-col gap-3">
                {group.stacks.map((stack) => (
                  <WorklistCard
                    key={stack.id}
                    stack={stack}
                    contact={stack.contactId ? contactMap.get(stack.contactId) : undefined}
                    staffNameMap={staffNameMap}
                    uid={uid}
                    meName={meName}
                    completed={isCompleted(stack)}
                    onOpenContact={handleOpenContact}
                    onComplete={handleComplete}
                    onToast={onToast}
                    mobile={mobile}
                    showReach={false}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {hiddenOnYouCount > 0 && !showAll && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mt-1 py-1.5 text-xs font-medium text-accent hover:underline text-center cursor-pointer"
        >
          {t(
            hiddenOnYouCount === 1 ? "whatsNew.show_more_person" : "whatsNew.show_more_people",
          ).replace("{n}", String(hiddenOnYouCount))}
        </button>
      )}

      {showAll && onYou.length > COLLAPSED_LIMIT && (
        <button
          type="button"
          onClick={() => setShowAll(false)}
          className="mt-1 py-1.5 text-xs font-medium text-accent hover:underline text-center cursor-pointer"
        >
          {t("whatsNew.show_less")}
        </button>
      )}

      {encouraged.count > 0 && (
        <p className="text-xs text-on-surface-variant m-0 flex items-center gap-1.5">
          <Heart className="w-3.5 h-3.5 text-stage-accent shrink-0" />
          {(encouraged.count > encouraged.names.length
            ? t("whatsNew.encouraged_you_many").replace("{n}", String(encouraged.count))
            : t("whatsNew.encouraged_you")
          ).replace("{names}", encouraged.names.join(", "))}
        </p>
      )}

      <UndoSnackbar undoSnack={undoSnack} onClose={closeUndoSnack} />
    </section>
  );
}
