import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collectionGroup, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../../lib/firebase";
import { Users, ChevronRight } from "lucide-react";
import { cn } from "../../lib/utils";
import { useAuth } from "../AuthProvider";
import type { Contact, Interaction } from "../../types";
import {
  buildAttentionItems,
  attentionStacksFor,
  partitionAttentionStacks,
  feedVisibleThreads,
  unseenTeamCount,
  type AttentionStack,
} from "../../lib/attention";
import { useLanguage } from "../LanguageProvider";
import { InboxState } from "../../lib/inboxState";
import { subscribeAllThreads, type ThreadMessageWithContact } from "../../lib/threads";

// ── The pointer card (#943) ─────────────────────────────────────────────────
// A small card beside "On you" on a Full-timer's My Day: a count of team
// activity the reader has not looked at, and a door to /around. It is a door
// and nothing else — team rows are never read here, so there is exactly one
// place with one behaviour. The count is the existing per-stack seen set, so
// it changes when the reader acts and can never disagree with the dots on the
// page. Trainees get no pointer card and no team destination.

export default function PointerCard({
  contacts = [],
  interactions: propsInteractions,
  threads: propsThreads,
  personalContactIds,
  className,
}: {
  contacts?: Contact[];
  interactions?: Interaction[];
  threads?: ThreadMessageWithContact[];
  /** The reader's own "keeping them" set — the fourth, private tie (#813). */
  personalContactIds?: Set<string> | null;
  className?: string;
}) {
  const { user, effectiveUserId, role } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const uid = effectiveUserId || user?.uid || "u1";
  const [liveInteractions, setLiveInteractions] = useState<Interaction[]>([]);
  const [liveThreads, setLiveThreads] = useState<ThreadMessageWithContact[]>([]);

  // Seen changes under the memo below, not in the props, so the derivation has
  // to be told. Without the tick in its dependency list, the count would keep
  // the seen flags it was built with and outlive the click that cleared them.
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

  const rawItems = useMemo(
    () =>
      buildAttentionItems({
        role,
        uid,
        contacts,
        interactions,
        threads,
        personalContactIds,
      }),
    [role, uid, contacts, interactions, threads, personalContactIds],
  );

  const allStacks = useMemo(() => {
    void inboxTick; // the seen axis, read from the store inside
    return attentionStacksFor(rawItems, uid);
  }, [rawItems, uid, inboxTick]);

  const aroundTeam = useMemo(
    () => partitionAttentionStacks(allStacks, contacts, uid, role, personalContactIds).aroundTeam,
    [allStacks, contacts, uid, role, personalContactIds],
  );

  // The number is a pure function of the partitioned team stacks and the seen
  // predicate — the same per-stack seen set the dots read, so the card and the
  // page can never disagree.
  const unseen = useMemo(
    () => unseenTeamCount(aroundTeam, (s: AttentionStack) => InboxState.isSeen(uid, s.id)),
    [aroundTeam, uid, inboxTick],
  );

  return (
    <a
      href="/around"
      onClick={(e) => {
        e.preventDefault();
        navigate("/around");
      }}
      className={cn(
        "group flex flex-col justify-between gap-3 bg-surface border border-outline-variant/60 rounded-3xl p-5 sm:p-6 shadow-xs hover:border-accent/40 hover:shadow-md transition-all",
        className,
      )}
    >
      <div className="flex items-center gap-2.5">
        <span className="w-8 h-8 rounded-full bg-accent/15 text-accent flex items-center justify-center shrink-0">
          <Users className="w-4 h-4" />
        </span>
        <span className="font-serif text-lg text-on-surface font-semibold">
          {t("whatsNew.around_the_team")}
        </span>
      </div>
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-3xl font-semibold text-on-surface tabular-nums leading-none">
            {unseen}
          </div>
          <div className="text-xs text-on-surface-variant mt-1.5">
            {t("whatsNew.unseen_team_activity")}
          </div>
        </div>
        <span className="inline-flex items-center gap-1 text-xs font-medium text-accent group-hover:underline">
          {t("whatsNew.see_around")}
          <ChevronRight className="w-3.5 h-3.5" />
        </span>
      </div>
    </a>
  );
}
