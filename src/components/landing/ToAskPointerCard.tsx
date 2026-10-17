import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, collectionGroup, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../../lib/firebase";
import { ChevronRight, NotebookPen } from "lucide-react";
import { cn } from "../../lib/utils";
import { useAuth } from "../AuthProvider";
import { useLanguage } from "../LanguageProvider";
import type { Contact, Event, Interaction } from "../../types";
import { parseMs } from "./helpers";
import { reachByContact } from "../../lib/reach";
import { subscribeAllThreads, type ThreadMessageWithContact } from "../../lib/threads";
import { rosterOnTeam } from "../../lib/teams";
import {
  buildToAsk,
  subscribeToAskNotepad,
  type ToAskNotepad,
} from "../../lib/toAsk";
import { toAskMessagesOf, toAskPeopleOf, toAskTraineesOf } from "../../lib/toAskView";

// ── The To ask pointer card (#1649) ─────────────────────────────────────────
// Beside "Around the team" on a Full-timer's My Day: the same open count the
// /ask pill shows and a door to the page. Full-timers only; a Trainee gets no
// card and no destination. The count is the shared derivation's `openCount`, so
// the card and the page can never disagree.

export default function ToAskPointerCard({
  contacts = [],
  interactions: propsInteractions,
  threads: propsThreads,
  className,
}: {
  contacts?: Contact[];
  interactions?: Interaction[];
  threads?: ThreadMessageWithContact[];
  className?: string;
}) {
  const { user, effectiveUserId, role } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const uid = effectiveUserId || user?.uid || "u1";
  const [liveInteractions, setLiveInteractions] = useState<Interaction[]>([]);
  const [liveThreads, setLiveThreads] = useState<ThreadMessageWithContact[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [notepad, setNotepad] = useState<ToAskNotepad>({});

  useEffect(() => {
    if (propsInteractions) return;
    const unsub = onSnapshot(
      query(collectionGroup(db, "interactions"), orderBy("createdAt", "desc"), limit(500)),
      (snap) =>
        setLiveInteractions(
          snap.docs.map(
            (d) => ({ id: d.id, ...(d.data() as object), contactId: d.ref.path.split("/")[1] }) as Interaction,
          ),
        ),
      (e) => handleFirestoreError(e, OperationType.LIST, "interactions (collectionGroup)"),
    );
    return () => unsub();
  }, [propsInteractions]);

  useEffect(() => {
    if (propsThreads) return;
    return subscribeAllThreads(setLiveThreads, undefined, { includeTeam: true });
  }, [propsThreads]);

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, "events")),
      (snap) => setEvents(snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) }) as Event)),
      (e) => handleFirestoreError(e, OperationType.LIST, "events"),
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!uid) return;
    return subscribeToAskNotepad(uid, setNotepad);
  }, [uid]);

  const interactions = propsInteractions || liveInteractions;
  const threads = propsThreads || liveThreads;

  const nameByUid = useMemo(() => {
    const m: Record<string, string> = {};
    for (const r of rosterOnTeam(null)) m[r.uid] ??= r.name;
    for (const c of contacts) if (c.createdBy && c.createdByName) m[c.createdBy] ??= c.createdByName;
    for (const i of interactions) {
      const u = i.reachedById ?? i.userId ?? i.createdById;
      const n = i.reachedByName ?? i.userName ?? i.createdByName;
      if (u && n) m[u] ??= n;
    }
    for (const msg of threads) if (msg.from && msg.fromName) m[msg.from] ??= msg.fromName;
    return m;
  }, [contacts, interactions, threads]);

  const openCount = useMemo(() => {
    const view = buildToAsk({
      uid,
      now: Date.now(),
      filter: notepad.teamFilter ?? "all",
      people: toAskPeopleOf(contacts),
      reach: reachByContact({
        interactions: interactions.map((i) => ({
          contactId: i.contactId ?? "",
          ms: parseMs(i.dateTime || i.createdAt) ?? Number.NaN,
        })),
        gatherings: events,
        contacts,
      }),
      trainees: toAskTraineesOf(nameByUid),
      messages: toAskMessagesOf(threads),
      notepad,
    });
    return { count: view.openCount, tops: view.topTrainees.slice(0, 3), more: Math.max(0, view.topTrainees.length - 3) };
  }, [uid, notepad, contacts, interactions, threads, events, nameByUid]);

  if (role !== "admin") return null;

  return (
    <a
      href="/ask"
      onClick={(e) => {
        e.preventDefault();
        navigate("/ask");
      }}
      className={cn(
        "group flex flex-col justify-between gap-3 bg-surface border border-outline-variant/60 rounded-xl p-5 sm:p-6 hover:border-accent/40 active:scale-[0.98] transition-all focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none",
        className,
      )}
    >
      <div className="flex items-center gap-2.5">
        <span className="w-8 h-8 rounded-full bg-accent/15 text-accent flex items-center justify-center shrink-0">
          <NotebookPen className="w-4 h-4" aria-hidden="true" />
        </span>
        <span className="font-serif text-lg text-on-surface font-semibold">{t("toAsk.title", "To ask")}</span>
        <span className="ml-auto text-2xl font-semibold text-on-surface tabular-nums leading-none">
          {openCount.count}
        </span>
      </div>
      {openCount.tops.length > 0 && (
        <div className="flex flex-col gap-0.5 text-sm text-on-surface">
          {openCount.tops.map((top) => (
            <div key={top.uid} className="flex items-center gap-2 py-0.5">
              <span className="truncate">{top.name}</span>
              <span className="ml-auto text-on-surface-variant tabular-nums">{top.open}</span>
            </div>
          ))}
          {openCount.more > 0 && (
            <span className="text-xs text-on-surface-variant">
              {t("toAsk.pointer_more", "+ {n} more").replace("{n}", String(openCount.more))}
            </span>
          )}
        </div>
      )}
      <div className="flex items-end justify-between gap-3">
        <span className="text-xs text-on-surface-variant">{t("toAsk.pointer_label", "to ask")}</span>
        <span className="inline-flex items-center gap-1 text-xs font-medium text-accent group-hover:underline">
          {t("toAsk.open_page", "Open To ask")}
          <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
        </span>
      </div>
    </a>
  );
}
