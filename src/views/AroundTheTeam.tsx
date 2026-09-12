import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { collection, collectionGroup, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { useOptionalLayout } from "../App";
import { Users } from "lucide-react";
import { cn } from "../lib/utils";
import { useAuth } from "../components/AuthProvider";
import type { Contact, Interaction } from "../types";
import {
  buildAttentionItems,
  attentionStacksFor,
  partitionAttentionStacks,
  feedVisibleThreads,
  filterAttentionStacks,
  actorsInStacks,
  isRestingFilter,
  openAsksIn,
  type AttentionStack,
  type WorklistVerb,
} from "../lib/attention";
import { TEAMS, teamLabelKey, rosterOnTeam } from "../lib/teams";
import { useLanguage } from "../components/LanguageProvider";
import { InboxState } from "../lib/inboxState";
import { UndoSnackbar } from "../components/UndoSnackbar";
import { useUndoSnack } from "../hooks/useUndoSnack";
import { closeFollowUpAsk, reopenFollowUpAsk, subscribeAllThreads, type ThreadMessageWithContact } from "../lib/threads";
import { WorklistCard, VERB_SNACK } from "../components/landing/WorklistCard";
import PageContainer from "../components/layout/PageContainer";

// ── "Around the team" as its own destination (#943) ─────────────────────────
// The team's activity — everything the team has been doing on people you
// aren't carrying — lives at /around, Full-timer-only. It keeps the team and
// teammate filters, the new-only filter, per-stack seen and completed state,
// and the reach affordance, and finally gets the width to show them properly,
// paged by day.
//
// Filters are URL state: read on load, written on change, never persisted per
// user. The page reaches exactly as far as the existing feed subscription —
// the same live query, the same document limit — and says so plainly.

const COLLAPSED_LIMIT = 5;

/** The day a stack belongs to, as a real heading label. */
function dayLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const today = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(today) - startOf(d)) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

export default function AroundTheTeam({
  contacts: propsContacts,
  interactions: propsInteractions,
  threads: propsThreads,
  staffNameMap: propsStaffNameMap,
  personalContactIds,
  onOpenContact,
  onToast,
}: {
  contacts?: Contact[];
  interactions?: Interaction[];
  threads?: ThreadMessageWithContact[];
  staffNameMap?: Record<string, string>;
  /** The reader's own "keeping them" set — the fourth, private tie (#813). */
  personalContactIds?: Set<string> | null;
  onOpenContact?: (
    c: Contact,
    opts?: { tab?: "overview" | "thread" | "history"; interactionId?: string | null },
  ) => void;
  onToast?: (msg: string) => void;
}) {
  const { user, effectiveUserId, role } = useAuth();
  const { t } = useLanguage();
  const uid = effectiveUserId || user?.uid || "u1";
  const meName = user?.displayName || propsStaffNameMap?.[uid] || "Someone";
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const layout = useOptionalLayout();

  // ── Filters are URL state (#943) ─────────────────────────────────────────
  // Read on load, written on change, never persisted per user — a filter you
  // forgot about must never make the team look quiet next visit.
  const team = searchParams.get("team");
  const who = searchParams.get("who");
  const newOnly = searchParams.get("new") === "1";
  const setTeam = (v: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (v) next.set("team", v);
    else next.delete("team");
    // A teammate picked inside one team is meaningless under another.
    if (v && who && !rosterOnTeam(v).some((m) => m.uid === who)) next.delete("who");
    setSearchParams(next, { replace: false });
  };
  const setWho = (v: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (v) next.set("who", v);
    else next.delete("who");
    setSearchParams(next, { replace: false });
  };
  const setNewOnly = (v: boolean) => {
    const next = new URLSearchParams(searchParams);
    if (v) next.set("new", "1");
    else next.delete("new");
    setSearchParams(next, { replace: false });
  };
  const clearFilter = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("team");
    next.delete("who");
    next.delete("new");
    setSearchParams(next, { replace: false });
  };

  const [liveContacts, setLiveContacts] = useState<Contact[]>([]);
  const [liveInteractions, setLiveInteractions] = useState<Interaction[]>([]);
  const [liveThreads, setLiveThreads] = useState<ThreadMessageWithContact[]>([]);
  // Completed HERE, this visit. Under New, a card you finish greys in place and
  // clears when you leave; All keeps completed cards visible grayed.
  const [completedHere, setCompletedHere] = useState<Set<string>>(new Set());
  const { undoSnack, showUndoSnack, closeUndoSnack } = useUndoSnack();

  // Seen and completed change under the memos below, not in the props, so the
  // derivation has to be told. Without the tick in its dependency list,
  // `allStacks` would keep the seen flags it was built with and the accent dot
  // would outlive the click that cleared it.
  const [inboxTick, setInboxTick] = useState(0);
  useEffect(() => InboxState.subscribe(() => setInboxTick((n) => n + 1)), []);

  useEffect(() => {
    if (propsContacts) return;
    try {
      const unsubContacts = onSnapshot(
        query(collection(db, "contacts")),
        (snap) =>
          setLiveContacts(
            snap.docs.map((d) => ({
              id: d.id,
              ...(d.data() as Record<string, unknown>),
            })) as Contact[],
          ),
        (e) => handleFirestoreError(e, OperationType.LIST, "contacts"),
      );
      return () => unsubContacts();
    } catch {
      // Degrade gracefully in test environments without live firestore
    }
  }, [propsContacts]);

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

  const contacts = propsContacts || liveContacts;
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
    const c = contactMap.get(contactId);
    if (onOpenContact) {
      if (c) onOpenContact(c, { tab: initialTab });
      return;
    }
    if (c && layout?.setSelectedContact) {
      layout.setSelectedContact(c);
      return;
    }
    if (contactId) {
      navigate(`/people/${contactId}${initialTab === "thread" ? "?tab=thread" : ""}`, {
        state: { from: location.pathname },
      });
    }
  };

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

  // Partition ONCE on the unfiltered feed, then narrow. The partition is
  // untouched by this change (#943).
  const allSides = useMemo(
    () => partitionAttentionStacks(allStacks, contacts, uid, role, personalContactIds),
    [allStacks, contacts, uid, role, personalContactIds],
  );

  const isCompleted = (stack: AttentionStack) => InboxState.isCompleted(uid, stack.id);

  const filter = useMemo(() => ({ team, who }), [team, who]);

  // The teammates the select offers: the team's roster, so a teammate who has
  // done nothing this week is still offerable — that is exactly the person the
  // "nothing from them" state exists for. Anyone with news but no team stays
  // listed too, so the select can never hide something the page is showing.
  const teammateOptions = useMemo(() => {
    const byUid = new Map<string, string>();
    for (const m of rosterOnTeam(team)) byUid.set(m.uid, m.name);
    for (const id of actorsInStacks(allSides.aroundTeam, team)) {
      if (!byUid.has(id)) byUid.set(id, staffNameMap[id] || "Someone");
    }
    return [...byUid.entries()]
      .map(([id, name]) => ({ uid: id, name: staffNameMap[id] || name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allSides.aroundTeam, team, staffNameMap]);

  // A teammate picked inside one team is meaningless under another: the chip
  // wins, and the select falls back to the whole team rather than to nothing.
  const effectiveWho = who && teammateOptions.some((o) => o.uid === who) ? who : null;

  const aroundTeam = useMemo(
    () =>
      filterAttentionStacks(allSides.aroundTeam, { team, who: effectiveWho }).filter(
        (s) => !newOnly || !isCompleted(s) || completedHere.has(s.id),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allSides.aroundTeam, team, effectiveWho, newOnly, uid, completedHere, inboxTick],
  );

  const resting = isRestingFilter({ team, who: effectiveWho });
  const teamLabel = team ? t(teamLabelKey(team)) : "";
  const whoName = effectiveWho
    ? (teammateOptions.find((o) => o.uid === effectiveWho)?.name || "Someone").trim().split(/\s+/)[0]
    : "";

  // ── Paged by day (#943) ──────────────────────────────────────────────────
  // Rows group under real day headings, newest first. The headings come from
  // the unfiltered team stacks, so a day the filters empty out still reads as
  // an empty day rather than vanishing.
  const dayGroups = useMemo(() => {
    const groups: { label: string; stacks: AttentionStack[] }[] = [];
    for (const stack of allSides.aroundTeam) {
      const label = dayLabel(stack.at);
      const last = groups[groups.length - 1];
      if (last && last.label === label) last.stacks.push(stack);
      else groups.push({ label, stacks: [stack] });
    }
    return groups.map((g) => ({
      label: g.label,
      stacks: g.stacks.filter((s) => aroundTeam.includes(s)),
    }));
  }, [allSides.aroundTeam, aroundTeam]);

  const toWorkThrough = aroundTeam.filter((s) => !isCompleted(s)).length;
  const anyUnseen = aroundTeam.some((s) => !s.seen && !isCompleted(s));

  const handleMarkAllSeen = () => {
    // What's on screen, not what's behind the filter — "all" means all of what
    // the person is looking at.
    InboxState.markSeen(
      uid,
      aroundTeam.map((s) => s.id),
    );
  };

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
    <PageContainer variant="wide">
      <header className="flex flex-col gap-3 mb-5">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <div className="flex items-baseline gap-2.5 flex-wrap">
            <h1 className="font-serif text-2xl lg:text-3xl text-on-surface font-semibold m-0">
              {t("whatsNew.around_the_team")}
            </h1>
            {toWorkThrough > 0 && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-accent/15 text-accent">
                {t("whatsNew.to_work_through").replace("{n}", String(toWorkThrough))}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div
              role="group"
              aria-label={t("whatsNew.filter_by_state")}
              className="inline-flex gap-0.5 p-0.5 rounded-full bg-surface-variant"
            >
              <button
                type="button"
                aria-pressed={newOnly}
                onClick={() => setNewOnly(true)}
                className={cn(
                  "px-3 py-1 rounded-full text-[11.5px] transition-colors cursor-pointer",
                  newOnly
                    ? "bg-surface text-on-surface font-semibold shadow-xs"
                    : "text-on-surface-variant font-medium hover:text-on-surface",
                )}
              >
                {t("whatsNew.filter_new")}
              </button>
              <button
                type="button"
                aria-pressed={!newOnly}
                onClick={() => setNewOnly(false)}
                className={cn(
                  "px-3 py-1 rounded-full text-[11.5px] transition-colors cursor-pointer",
                  !newOnly
                    ? "bg-surface text-on-surface font-semibold shadow-xs"
                    : "text-on-surface-variant font-medium hover:text-on-surface",
                )}
              >
                {t("whatsNew.filter_all")}
              </button>
            </div>
            {anyUnseen && (
              <button
                type="button"
                onClick={handleMarkAllSeen}
                className="text-xs font-medium text-accent hover:underline cursor-pointer"
              >
                {t("whatsNew.mark_all_seen")}
              </button>
            )}
          </div>
        </div>

        <p className="text-sm text-on-surface-variant m-0 max-w-2xl">
          {t("whatsNew.around_the_team_sub")}
        </p>
        <p className="text-xs text-on-surface-variant/80 m-0">
          {t("whatsNew.recent_activity_note")}
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <div
            role="group"
            aria-label={t("whatsNew.filter_by_team")}
            className="inline-flex flex-wrap gap-1 p-1 rounded-full bg-surface-container-low border border-outline-variant"
          >
            <button
              type="button"
              onClick={() => setTeam(null)}
              aria-pressed={!team}
              className={cn(
                "text-[13px] px-3 py-1.5 rounded-full transition-colors cursor-pointer",
                !team ? "bg-background text-on-surface" : "text-on-surface-variant hover:text-on-surface",
              )}
            >
              {t("teams.everyone")}
            </button>
            {TEAMS.map((tm) => (
              <button
                key={tm.id}
                type="button"
                onClick={() => setTeam(tm.id)}
                aria-pressed={team === tm.id}
                className={cn(
                  "text-[13px] px-3 py-1.5 rounded-full transition-colors cursor-pointer",
                  team === tm.id
                    ? "bg-background text-on-surface"
                    : "text-on-surface-variant hover:text-on-surface",
                )}
              >
                {t(teamLabelKey(tm.id), tm.label)}
              </button>
            ))}
          </div>

          <label
            className={cn(
              "inline-flex items-center gap-2 h-10 pl-3 pr-2 rounded-full bg-surface border text-sm text-on-surface focus-within:border-primary transition-colors",
              effectiveWho ? "border-primary" : "border-outline-variant",
            )}
          >
            <Users className="w-3.5 h-3.5 text-on-surface-variant shrink-0" />
            <select
              value={effectiveWho ?? "all"}
              onChange={(e) => setWho(e.target.value === "all" ? null : e.target.value)}
              aria-label={t("whatsNew.filter_by_person")}
              className="bg-transparent outline-none pr-1 text-on-surface cursor-pointer"
            >
              <option value="all">
                {team
                  ? t("whatsNew.whole_named_team").replace("{team}", teamLabel)
                  : t("whatsNew.whole_team")}
              </option>
              {teammateOptions.map((o) => (
                <option key={o.uid} value={o.uid}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>

          {!resting && (
            <button
              type="button"
              onClick={clearFilter}
              className="text-xs font-medium text-accent hover:underline cursor-pointer"
            >
              {t("whatsNew.clear")}
            </button>
          )}
        </div>
      </header>

      {aroundTeam.length === 0 ? (
        <div className="bg-surface border border-outline-variant/60 rounded-3xl px-6 py-11 text-center flex flex-col items-center gap-3.5">
          <div className="flex flex-col gap-1">
            <h3 className="font-serif text-xl text-on-surface font-semibold m-0">
              {newOnly && resting
                ? t("whatsNew.nothing_new")
                : effectiveWho
                  ? t("whatsNew.nothing_from_person").replace("{name}", whoName)
                  : t("whatsNew.nothing_from_team").replace("{team}", teamLabel)}
            </h3>
            <p className="text-sm text-on-surface-variant m-0">
              {newOnly && resting
                ? t("whatsNew.try_all")
                : effectiveWho && team
                  ? t("whatsNew.try_whole_team").replace("{team}", teamLabel)
                  : t("whatsNew.try_everyone")}
            </p>
          </div>
          <button
            type="button"
            onClick={() => (newOnly && resting ? setNewOnly(false) : clearFilter())}
            className="px-3.5 py-1.5 rounded-full border border-outline-variant bg-background text-[13px] font-medium text-on-surface hover:bg-surface-variant transition-colors cursor-pointer"
          >
            {newOnly && resting ? t("whatsNew.show_all") : t("whatsNew.show_everyone")}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {dayGroups.map((group) => (
            <section key={group.label} aria-label={group.label}>
              <h2 className="font-serif text-lg text-on-surface font-semibold m-0 mb-3">
                {group.label}
              </h2>
              {group.stacks.length === 0 ? (
                <p className="text-xs text-on-surface-variant italic py-2">
                  {t("whatsNew.no_team_touches")}
                </p>
              ) : (
                <div className="grid items-start gap-3 sm:grid-cols-2 xl:grid-cols-3">
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
                      showReach
                    />
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}

      <UndoSnackbar undoSnack={undoSnack} onClose={closeUndoSnack} />
    </PageContainer>
  );
}
