import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, collectionGroup, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { Check, Plus, UserPlus, MessageSquare, Pencil, X, MoreHorizontal } from "lucide-react";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { useOptionalLayout } from "../App";
import { cn } from "../lib/utils";
import { useAuth } from "../components/AuthProvider";
import { useLanguage } from "../components/LanguageProvider";
import type { Contact, Event, Interaction } from "../types";
import { parseMs } from "../components/landing/helpers";
import { reachByContact } from "../lib/reach";
import { TEAMS, teamLabelKey, rosterOnTeam } from "../lib/teams";
import {
  addThreadMessage,
  contactStakeholdersOf,
  subscribeAllThreads,
  type ThreadMessageWithContact,
} from "../lib/threads";
import {
  buildToAsk,
  GENERAL_GROUP,
  newToAskUpdate,
  subscribeToAskNotepad,
  saveToAskNotepad,
  setToAskAskedAt,
  setToAskRewording,
  deleteToAskOverride,
  replaceToAskDrafted,
  dismissToAskLine,
  postToAskLineUpdate,
  toAskThreadTarget,
  toAskUpdateDestinations,
  type AskNoteLine,
  type ToAskGroup,
  type ToAskLine,
  type ToAskNotepad,
  type ToAskTeamFilter,
  type ToAskUpdateDest,
  type ToAskView,
} from "../lib/toAsk";
import {
  clearedText,
  destHint,
  destLabel,
  draftText,
  signalChip,
  toAskInteractionsOf,
  toAskMessagesOf,
  toAskPeopleOf,
  toAskTraineesOf,
  updateAgo,
  updateWhere,
  type Translate,
} from "../lib/toAskView";
import { addContactInteraction } from "../hooks/useContactStory";
import { formatDateTime } from "../lib/contactComposer";
import { useUndoSnack } from "../hooks/useUndoSnack";
import { UndoSnackbar } from "../components/UndoSnackbar";
import PageContainer from "../components/layout/PageContainer";

// ── To ask (#1649) ──────────────────────────────────────────────────────────
// A Full-timer's private notepad of things to ask Trainees in person, at /ask.
// The page is a thin renderer over the shared @cisa/core derivation: the same
// grouped list and the same count the My Day pointer card shows. Drafted lines
// stay tied to the signal that produced them (ADR 0046), so a line ticks itself
// off when its signal clears. No Trainee and no other Full-timer ever sees it.

const nowIso = () => new Date().toISOString();

export default function Ask() {
  const { user, effectiveUserId, role, isImpersonating } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const layout = useOptionalLayout();
  const uid = effectiveUserId || user?.uid || "u1";

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [threads, setThreads] = useState<ThreadMessageWithContact[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [notepad, setNotepad] = useState<ToAskNotepad>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [draftTextValue, setDraftTextValue] = useState("");
  // The line whose "Post an update" composer is open, and the phone menu.
  const [composing, setComposing] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [trayOpen, setTrayOpen] = useState(false);
  const { undoSnack, showUndoSnack, closeUndoSnack } = useUndoSnack(6000);
  // Which feeds have delivered at least once — the drafted write-back waits
  // for all of them (see below).
  const [arrived, setArrived] = useState<ReadonlySet<string>>(() => new Set());
  const markArrived = (feed: string) =>
    setArrived((s) => (s.has(feed) ? s : new Set(s).add(feed)));
  const loaded = arrived.size === 5;

  useEffect(() => {
    const unsubContacts = onSnapshot(
      query(collection(db, "contacts")),
      (snap) => {
        setContacts(snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) }) as Contact));
        markArrived("contacts");
      },
      (e) => handleFirestoreError(e, OperationType.LIST, "contacts"),
    );
    const unsubInteractions = onSnapshot(
      query(collectionGroup(db, "interactions"), orderBy("createdAt", "desc"), limit(500)),
      (snap) => {
        setInteractions(
          snap.docs.map(
            (d) => ({ id: d.id, ...(d.data() as object), contactId: d.ref.path.split("/")[1] }) as Interaction,
          ),
        );
        markArrived("interactions");
      },
      (e) => handleFirestoreError(e, OperationType.LIST, "interactions (collectionGroup)"),
    );
    const unsubEvents = onSnapshot(
      query(collection(db, "events")),
      (snap) => {
        setEvents(snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) }) as Event));
        markArrived("events");
      },
      (e) => handleFirestoreError(e, OperationType.LIST, "events"),
    );
    const unsubThreads = subscribeAllThreads(
      (next) => {
        setThreads(next);
        markArrived("threads");
      },
      undefined,
      { includeTeam: true },
    );
    return () => {
      unsubContacts();
      unsubInteractions();
      unsubEvents();
      unsubThreads();
    };
  }, []);

  // Undo runs after later snapshots, so it rewrites from the latest notepad.
  const notepadRef = useRef(notepad);
  useEffect(() => {
    notepadRef.current = notepad;
  }, [notepad]);

  useEffect(() => {
    if (!uid) return;
    return subscribeToAskNotepad(uid, (next) => {
      setNotepad(next);
      markArrived("notepad");
    });
  }, [uid]);

  const nameByUid = useMemo(() => {
    const m: Record<string, string> = {};
    for (const r of rosterOnTeam(null)) m[r.uid] ??= r.name;
    for (const c of contacts) if (c.createdBy && c.createdByName) m[c.createdBy] ??= c.createdByName;
    for (const i of interactions) {
      const u = i.reachedById ?? i.userId ?? i.createdById;
      const n = i.reachedByName ?? i.userName ?? i.createdByName;
      if (u && n) m[u] ??= n;
    }
    for (const m2 of threads) if (m2.from && m2.fromName) m[m2.from] ??= m2.fromName;
    return m;
  }, [contacts, interactions, threads]);

  const people = useMemo(() => toAskPeopleOf(contacts), [contacts]);
  const messages = useMemo(() => toAskMessagesOf(threads), [threads]);
  const traineeInput = useMemo(() => toAskTraineesOf(nameByUid), [nameByUid]);
  const reach = useMemo(
    () =>
      reachByContact({
        interactions: interactions.map((i) => ({
          contactId: i.contactId ?? "",
          ms: parseMs(i.dateTime || i.createdAt) ?? Number.NaN,
        })),
        gatherings: events,
        contacts,
      }),
    [interactions, events, contacts],
  );

  const filter: ToAskTeamFilter = notepad.teamFilter ?? "all";
  const view: ToAskView = useMemo(
    () =>
      buildToAsk({
        uid,
        now: Date.now(),
        filter,
        people,
        reach,
        trainees: traineeInput,
        messages,
        interactions: toAskInteractionsOf(interactions),
        notepad,
      }),
    [uid, filter, people, reach, traineeInput, messages, interactions, notepad],
  );

  // Persist the drafted keys the derivation has seen, so a line that clears
  // without ever being touched can still say what cleared it for a week.
  // Replace semantics, so a key the derivation dropped goes too; written only
  // when the key sets differ, so the snapshot of this write never re-fires it.
  // Waits for every feed and the notepad, or a half-loaded derivation would
  // replace the stored map with a partial one.
  useEffect(() => {
    if (!uid || !loaded) return;
    const stored = Object.keys(notepad.drafted ?? {});
    const next = Object.keys(view.drafted);
    const storedSet = new Set(stored);
    const changed = stored.length !== next.length || next.some((k) => !storedSet.has(k));
    if (changed) void replaceToAskDrafted(uid, view.drafted);
  }, [uid, loaded, view.drafted, notepad.drafted]);

  const contactMap = useMemo(() => {
    const m = new Map<string, Contact>();
    for (const c of contacts) m.set(c.id, c);
    return m;
  }, [contacts]);

  const markAsked = (line: ToAskLine) => {
    if (line.kind === "handwritten") {
      const lines = (notepad.lines ?? []).map((l) =>
        l.id === line.key.replace(/^note:/, "") ? { ...l, askedAt: nowIso() } : l,
      );
      void saveToAskNotepad(uid, { lines });
      return;
    }
    void setToAskAskedAt(uid, line.key, nowIso());
  };

  const undoAsked = (line: ToAskLine) => {
    if (line.kind === "handwritten") {
      const lines = (notepad.lines ?? []).map((l) =>
        l.id === line.key.replace(/^note:/, "") ? { ...l, askedAt: null } : l,
      );
      void saveToAskNotepad(uid, { lines });
      return;
    }
    if (typeof notepad.overrides?.[line.key]?.text === "string") void setToAskAskedAt(uid, line.key, null);
    else void deleteToAskOverride(uid, line.key);
  };

  const commitReword = (line: ToAskLine) => {
    setEditing(null);
    if (line.kind === "handwritten") {
      const lines = (notepad.lines ?? []).map((l) =>
        l.id === line.key.replace(/^note:/, "") ? { ...l, text: draftTextValue } : l,
      );
      void saveToAskNotepad(uid, { lines });
      return;
    }
    void setToAskRewording(uid, line.key, draftTextValue);
  };

  const addLine = (group: string, text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const line: AskNoteLine = {
      id: `n-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      text: trimmed,
      group,
      contactId: null,
      createdAt: nowIso(),
    };
    void saveToAskNotepad(uid, { lines: [...(notepad.lines ?? []), line] });
  };

  const shown = (line: ToAskLine) =>
    line.reworded || line.kind === "handwritten"
      ? line.text
      : line.signal
        ? draftText(line.signal, t)
        : line.text;

  const dismiss = (line: ToAskLine) => {
    setComposing(null);
    void dismissToAskLine(uid, notepad, line.key, nowIso());
    const who = line.contactId ? contactMap.get(line.contactId)?.name : undefined;
    const name = who || line.signal?.contactName || shown(line);
    showUndoSnack(
      (line.kind === "handwritten"
        ? t("toAsk.dismissed_snack_note", "Dismissed “{name}”.")
        : t("toAsk.dismissed_snack", "Dismissed “{name}”. It comes back if anything new happens.")
      ).replace("{name}", name),
      () => bringBack(line.key),
    );
  };

  const bringBack = (key: string) => void dismissToAskLine(uid, notepadRef.current, key, null);

  const loggerName =
    user?.displayName || user?.email?.split("@")[0] || t("modals.contactDetails.anonymous", "Someone");

  /** Keep the update on the line, then write it where else it was sent: the
   *  contact's page (logged for the group's Trainee) or the Thread. */
  const postUpdate = (
    line: ToAskLine,
    group: ToAskGroup,
    text: string,
    dest: ToAskUpdateDest,
    alsoAsked: boolean,
  ) => {
    const body = text.trim();
    if (!body) return;
    setComposing(null);
    const update = newToAskUpdate(body, dest);
    void postToAskLineUpdate(uid, notepad, line.key, update, { askedAt: alsoAsked ? update.at : null });
    const contact = line.contactId ? contactMap.get(line.contactId) : undefined;
    if (!user || !contact) return;
    if (dest === "contact") {
      const reacher =
        group.kind === "trainee" && !isImpersonating && group.id !== user.uid
          ? { id: group.id, name: group.name }
          : null;
      addContactInteraction(contact, {
        content: body,
        dateTime: formatDateTime(new Date()),
        type: "interaction",
        userId: user.uid,
        userName: loggerName,
        userPhoto: user.photoURL || "",
        reacher,
        t,
      }).catch((e) => handleFirestoreError(e, OperationType.CREATE, `contacts/${contact.id}/interactions`));
    } else if (dest === "thread") {
      const target = toAskThreadTarget(line.key, messages);
      if (!target) return;
      void addThreadMessage(
        target.contactId,
        {
          interactionId: target.interactionId,
          parentId: target.parentId,
          scope: target.scope,
          from: user.uid,
          fromName: loggerName,
          kind: "comment",
          body,
        },
        { contactName: contact.name, stakeholders: contactStakeholdersOf(contact) },
      );
    }
  };

  const clearDone = () => void saveToAskNotepad(uid, { clearedBefore: nowIso() });
  const setFilter = (next: ToAskTeamFilter) => void saveToAskNotepad(uid, { teamFilter: next });

  const openContact = (contactId: string | null | undefined) => {
    if (!contactId) return;
    const c = contactMap.get(contactId);
    if (c && layout?.setSelectedContact) {
      layout.setSelectedContact(c);
      return;
    }
    navigate(`/people/${contactId}`);
  };

  if (role !== "admin") return null;

  const label = (group: { kind: string; name: string }) =>
    group.kind === "general"
      ? t("toAsk.general", "General")
      : group.kind === "none"
        ? t("toAsk.no_trainee_tied", "No Trainee tied")
        : group.name;

  return (
    <PageContainer variant="wide">
      <header className="flex flex-col gap-3 mb-5">
        <p className="text-[11px] uppercase tracking-wider font-semibold text-on-surface-variant m-0">
          {t("toAsk.eyebrow", "Only you see this page")}
        </p>
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <div className="flex items-baseline gap-2.5">
            <h1 className="font-serif text-2xl lg:text-3xl text-on-surface font-semibold m-0">
              {t("toAsk.title", "To ask")}
            </h1>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-accent/15 text-accent">
              {t("toAsk.open_count", "{n} open").replace("{n}", String(view.openCount))}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div role="group" aria-label={t("whatsNew.filter_by_team")} className="inline-flex flex-wrap gap-1 p-1 rounded-full bg-surface-container-low border border-outline-variant">
              <button
                type="button"
                onClick={() => setFilter("all")}
                aria-pressed={filter === "all"}
                className={cn(
                  "text-[13px] px-3 py-1.5 rounded-full transition-colors cursor-pointer",
                  filter === "all" ? "bg-background text-on-surface" : "text-on-surface-variant hover:text-on-surface",
                )}
              >
                {t("toAsk.all_teams", "All teams")}
              </button>
              {TEAMS.map((tm) => (
                <button
                  key={tm.id}
                  type="button"
                  onClick={() => setFilter(tm.id as ToAskTeamFilter)}
                  aria-pressed={filter === tm.id}
                  className={cn(
                    "text-[13px] px-3 py-1.5 rounded-full transition-colors cursor-pointer",
                    filter === tm.id ? "bg-background text-on-surface" : "text-on-surface-variant hover:text-on-surface",
                  )}
                >
                  {t(teamLabelKey(tm.id), tm.label)}
                </button>
              ))}
            </div>
            {view.clearedCount > 0 && (
              <button
                type="button"
                onClick={clearDone}
                className="px-3.5 py-2 rounded-full border border-outline-variant bg-background text-[13px] font-medium text-on-surface hover:bg-surface-variant transition-colors cursor-pointer"
              >
                {t("toAsk.clear_done", "Clear done · {n}").replace("{n}", String(view.clearedCount))}
              </button>
            )}
            {view.dismissed.length > 0 && (
              <button
                type="button"
                onClick={() => setTrayOpen((o) => !o)}
                aria-expanded={trayOpen}
                className="px-3.5 py-2 rounded-full border border-dashed border-outline-variant bg-transparent text-[13px] font-medium text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
              >
                {t("toAsk.dismissed_count", "Dismissed · {n}").replace("{n}", String(view.dismissed.length))}
              </button>
            )}
          </div>
        </div>
        <p className="text-sm text-on-surface-variant m-0 max-w-2xl">{t("toAsk.sub")}</p>
      </header>

      {view.groups.length === 0 ? (
        <div className="bg-surface border border-outline-variant/60 rounded-3xl px-6 py-11 text-center">
          <h3 className="font-serif text-xl text-on-surface font-semibold m-0">{t("toAsk.empty_title")}</h3>
          <p className="text-sm text-on-surface-variant m-0 mt-1.5">{t("toAsk.empty_sub")}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {view.groups.map((group) => (
            <section
              key={group.id}
              aria-label={label(group)}
              className="bg-surface border border-outline-variant/60 rounded-3xl p-5"
            >
              <div className="flex items-center gap-3 pb-3">
                <span className="w-9 h-9 rounded-full bg-surface-container-high text-on-surface-variant flex items-center justify-center text-xs font-semibold">
                  {group.kind === "general" ? "··" : group.kind === "none" ? "?" : group.name.slice(0, 2)}
                </span>
                <span className="font-serif text-lg text-on-surface font-semibold">{label(group)}</span>
                {group.team && (
                  <span className="text-[11px] text-on-surface-variant border border-outline-variant rounded-full px-2 py-0.5">
                    {t(teamLabelKey(group.team), group.team)}
                  </span>
                )}
                <span className="ml-auto text-xs text-on-surface-variant tabular-nums">
                  {t("toAsk.open_count", "{n} open").replace("{n}", String(group.open))}
                </span>
              </div>
              {group.kind === "none" && (
                <p className="text-xs text-on-surface-variant m-0 mb-2 -mt-1">{t("toAsk.no_trainee_hint")}</p>
              )}
              <div className="flex flex-col gap-1">
                {group.lines.map((line) => {
                  const who = line.contactId ? contactMap.get(line.contactId) : undefined;
                  const struck = line.state !== "open";
                  const rowKey = group.id + ":" + line.key;
                  const startReword = () => {
                    setEditing(rowKey);
                    setDraftTextValue(shown(line));
                  };
                  const startUpdate = () => setComposing(rowKey);
                  return (
                    <div
                      key={rowKey}
                      className={cn(
                        "bg-surface-container-lowest rounded-2xl",
                        composing === rowKey && "ring-[1.5px] ring-primary",
                      )}
                    >
                    <div className="flex items-start gap-2 pl-1 pr-3 py-2">
                      <button
                        type="button"
                        aria-label={struck ? t("toAsk.asked_undo", "Asked — undo") : t("toAsk.mark_asked", "Mark asked")}
                        onClick={() => (struck ? undoAsked(line) : markAsked(line))}
                        className="w-11 h-11 flex-none grid place-items-center rounded-full hover:bg-surface-variant transition-colors cursor-pointer"
                      >
                        <span
                          className={cn(
                            "w-5 h-5 rounded-md border grid place-items-center",
                            line.state === "cleared"
                              ? "bg-stage-green text-on-primary border-stage-green"
                              : struck
                                ? "bg-primary text-on-primary border-primary"
                                : "border-outline text-transparent",
                          )}
                        >
                          <Check className="w-3 h-3" strokeWidth={3} />
                        </span>
                      </button>
                      <div className="flex-1 min-w-0 pt-2">
                        {editing === rowKey ? (
                          <input
                            autoFocus
                            value={draftTextValue}
                            onChange={(e) => setDraftTextValue(e.target.value)}
                            onBlur={() => commitReword(line)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commitReword(line);
                              if (e.key === "Escape") setEditing(null);
                            }}
                            aria-label={t("toAsk.line_label", "Line")}
                            className="w-full bg-transparent border-b border-outline-variant outline-none text-[15px] text-on-surface py-1"
                          />
                        ) : (
                          <p className={cn("m-0 text-[15px] leading-snug text-on-surface", struck && "line-through text-on-surface-variant")}>
                            {shown(line)}
                          </p>
                        )}
                        {line.updates.length > 0 && (
                          <div className="flex flex-col gap-1.5 mt-2">
                            {line.updates.map((u) => (
                              <div key={u.id} className="bg-background rounded-xl px-3 py-2">
                                <p className="m-0 text-[11px] text-on-surface-variant">
                                  {t("toAsk.your_update", "Your update · {ago} · {where}")
                                    .replace("{ago}", updateAgo(u.at, Date.now(), t))
                                    .replace("{where}", updateWhere(u.dest, t))}
                                </p>
                                <p className="m-0 mt-0.5 text-sm text-on-surface whitespace-pre-wrap">{u.text}</p>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="flex items-center gap-2 flex-wrap mt-1.5 text-xs text-on-surface-variant">
                          {who && (
                            <button
                              type="button"
                              onClick={() => openContact(line.contactId)}
                              className="inline-flex items-center gap-1.5 text-on-surface-variant hover:text-on-surface cursor-pointer"
                            >
                              {who.name}
                            </button>
                          )}
                          <span className="px-2 py-0.5 rounded-full bg-surface-container-high">
                            {line.kind === "handwritten"
                              ? t("toAsk.your_note", "Your note")
                              : line.state === "cleared" && line.clearedBy
                                ? clearedText(line.clearedBy, t)
                                : line.signal
                                  ? signalChip(line.signal, t)
                                  : ""}
                          </span>
                        </div>
                      </div>
                      {line.state === "open" && (
                        <>
                        <div className="hidden sm:flex items-center gap-1 pt-1.5">
                          <button
                            type="button"
                            aria-label={t("toAsk.reword", "Reword")}
                            title={t("toAsk.reword", "Reword")}
                            onClick={startReword}
                            className="w-8 h-8 grid place-items-center rounded-full text-on-surface-variant hover:bg-surface-variant transition-colors cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            aria-label={t("toAsk.post_update", "Post an update")}
                            aria-expanded={composing === rowKey}
                            onClick={startUpdate}
                            className="group/upd inline-flex items-center gap-1.5 min-w-8 h-8 px-2 rounded-full text-on-surface-variant hover:bg-surface-variant hover:text-on-surface focus-visible:bg-surface-variant transition-colors cursor-pointer"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                            <span className="hidden group-hover/upd:inline group-focus-visible/upd:inline text-xs font-medium">
                              {t("toAsk.update", "Update")}
                            </span>
                          </button>
                          <button
                            type="button"
                            aria-label={t("toAsk.dismiss", "Dismiss")}
                            title={t("toAsk.dismiss", "Dismiss")}
                            onClick={() => dismiss(line)}
                            className="w-8 h-8 grid place-items-center rounded-full text-on-surface-variant hover:bg-surface-variant transition-colors cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                          {group.kind === "none" && line.contactId && (
                            <button
                              type="button"
                              onClick={() => openContact(line.contactId)}
                              className="inline-flex items-center gap-1.5 px-3 h-8 rounded-full border border-outline-variant text-xs font-medium text-on-surface hover:bg-surface-variant transition-colors cursor-pointer"
                            >
                              <UserPlus className="w-3.5 h-3.5" />
                              {t("toAsk.delegate", "Delegate")}
                            </button>
                          )}
                        </div>
                        <div className="relative sm:hidden">
                          <button
                            type="button"
                            aria-label={t("toAsk.more_actions", "More actions")}
                            aria-haspopup="menu"
                            aria-expanded={menuFor === rowKey}
                            onClick={() => setMenuFor(menuFor === rowKey ? null : rowKey)}
                            className="w-11 h-11 grid place-items-center rounded-full text-on-surface-variant hover:bg-surface-variant transition-colors cursor-pointer"
                          >
                            <MoreHorizontal className="w-4 h-4" />
                          </button>
                          {menuFor === rowKey && (
                            <LineMenu
                              t={t}
                              contactName={who?.name ?? null}
                              onClose={() => setMenuFor(null)}
                              onUpdate={startUpdate}
                              onReword={startReword}
                              onOpen={line.contactId ? () => openContact(line.contactId) : null}
                              onDismiss={() => dismiss(line)}
                            />
                          )}
                        </div>
                        </>
                      )}
                    </div>
                    {composing === rowKey && line.state === "open" && (
                      <UpdateComposer
                        t={t}
                        dests={toAskUpdateDestinations(line).filter(
                          (d) =>
                            (d !== "contact" || !!who) &&
                            (d !== "thread" || !!toAskThreadTarget(line.key, messages)),
                        )}
                        contactName={who?.name ?? line.signal?.contactName ?? null}
                        traineeName={group.kind === "trainee" ? group.name : null}
                        onCancel={() => setComposing(null)}
                        onPost={(text, dest, alsoAsked) => postUpdate(line, group, text, dest, alsoAsked)}
                      />
                    )}
                    </div>
                  );
                })}
              </div>
              <AddLine
                label={
                  group.id === GENERAL_GROUP
                    ? t("toAsk.add_line_general", "Add a line for everyone…")
                    : t("toAsk.add_line", "Add a line for {name}…").replace("{name}", label(group))
                }
                onAdd={(text) => addLine(group.kind === "general" ? GENERAL_GROUP : group.id, text)}
              />
            </section>
          ))}
        </div>
      )}

      {trayOpen && view.dismissed.length > 0 && (
        <section
          aria-label={t("toAsk.dismissed_title", "Dismissed")}
          className="mt-5 border border-dashed border-outline-variant rounded-3xl p-5"
        >
          <h2 className="font-serif text-lg text-on-surface font-semibold m-0">
            {t("toAsk.dismissed_title", "Dismissed")}
          </h2>
          <p className="text-xs text-on-surface-variant m-0 mt-1 mb-3">
            {t("toAsk.dismissed_note", "A drafted line comes back if something new happens with that person.")}
          </p>
          <div className="flex flex-col gap-1">
            {view.dismissed.map((d) => (
              <div key={d.key} className="flex items-center gap-3 rounded-2xl px-3 py-2">
                <div className="flex-1 min-w-0">
                  <p className="m-0 text-[15px] leading-snug text-on-surface-variant">{shown(d.line)}</p>
                  <p className="m-0 mt-1 text-xs text-on-surface-variant">
                    {label({ kind: d.groupKind, name: d.groupName })}
                    {" · "}
                    {d.line.kind === "handwritten"
                      ? t("toAsk.your_note", "Your note")
                      : d.line.state === "cleared" && d.line.clearedBy
                        ? clearedText(d.line.clearedBy, t)
                        : d.line.signal
                          ? signalChip(d.line.signal, t)
                          : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => bringBack(d.key)}
                  className="flex-none h-11 px-4 rounded-[14px] border border-outline-variant bg-background text-[13px] font-medium text-on-surface hover:bg-surface-variant transition-colors cursor-pointer"
                >
                  {t("toAsk.bring_back", "Bring back")}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <UndoSnackbar undoSnack={undoSnack} onClose={closeUndoSnack} />
    </PageContainer>
  );
}

/** The phone's one "⋯" menu for an open line. */
function LineMenu({
  t,
  contactName,
  onClose,
  onUpdate,
  onReword,
  onOpen,
  onDismiss,
}: {
  t: Translate;
  contactName: string | null;
  onClose: () => void;
  onUpdate: () => void;
  onReword: () => void;
  onOpen: (() => void) | null;
  onDismiss: () => void;
}) {
  const pick = (fn: () => void) => () => {
    onClose();
    fn();
  };
  const item =
    "w-full min-h-11 px-3 py-2 rounded-xl text-left text-sm text-on-surface hover:bg-surface-variant transition-colors cursor-pointer";
  return (
    <>
      <div className="fixed inset-0 z-10" aria-hidden onClick={onClose} />
      <div
        role="menu"
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
        className="absolute right-0 top-12 z-20 w-64 bg-background border border-outline-variant rounded-2xl shadow-lg p-1.5 flex flex-col"
      >
        <button type="button" role="menuitem" autoFocus className={item} onClick={pick(onUpdate)}>
          {t("toAsk.post_update", "Post an update")}
        </button>
        <button type="button" role="menuitem" className={item} onClick={pick(onReword)}>
          {t("toAsk.reword", "Reword")}
        </button>
        {onOpen && (
          <button type="button" role="menuitem" className={item} onClick={pick(onOpen)}>
            {t("toAsk.open_contact", "Open {name}").replace("{name}", contactName || t("toAsk.this_person", "This person"))}
          </button>
        )}
        <button type="button" role="menuitem" className={item} onClick={pick(onDismiss)}>
          <span className="block">{t("toAsk.dismiss", "Dismiss")}</span>
          <span className="block text-xs text-on-surface-variant">
            {t("toAsk.dismiss_sub", "Hides it until something new happens")}
          </span>
        </button>
      </div>
    </>
  );
}

/** "Post an update": a short note about a line, and where else it goes. */
function UpdateComposer({
  t,
  dests,
  contactName,
  traineeName,
  onCancel,
  onPost,
}: {
  t: Translate;
  dests: ToAskUpdateDest[];
  contactName: string | null;
  traineeName: string | null;
  onCancel: () => void;
  onPost: (text: string, dest: ToAskUpdateDest, alsoAsked: boolean) => void;
}) {
  const [text, setText] = useState("");
  const [dest, setDest] = useState<ToAskUpdateDest>("line");
  const [alsoAsked, setAlsoAsked] = useState(true);
  const names = { contact: contactName, trainee: traineeName };
  const placeholder =
    traineeName && contactName
      ? t("toAsk.update_placeholder", "What did {trainee} say about {contact}?")
          .replace("{trainee}", traineeName)
          .replace("{contact}", contactName)
      : contactName
        ? t("toAsk.update_placeholder_contact", "What did you hear about {contact}?").replace("{contact}", contactName)
        : t("toAsk.update_placeholder_plain", "What's the update?");
  return (
    <div
      className="flex flex-col gap-2.5 px-4 pb-4 pt-1"
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
      }}
    >
      <p className="text-[11px] uppercase tracking-wider font-semibold text-on-surface-variant m-0">
        {t("toAsk.post_update", "Post an update")}
      </p>
      <textarea
        autoFocus
        rows={2}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        aria-label={t("toAsk.post_update", "Post an update")}
        className="w-full rounded-sm border border-outline-variant bg-background px-3.5 py-2.5 text-[14.5px] text-on-surface placeholder:text-on-surface-variant/60 outline-none focus:border-on-surface focus:ring-[3px] focus:ring-on-surface/10 resize-none"
      />
      {dests.length > 1 && (
        <div role="group" aria-label={t("toAsk.update_dest", "Where it goes")} className="flex flex-wrap gap-1.5">
          {dests.map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={dest === d}
              onClick={() => setDest(d)}
              className={cn(
                "min-h-11 sm:min-h-0 px-[15px] py-1.5 rounded-full border text-[13px] font-medium transition-colors cursor-pointer",
                dest === d
                  ? "bg-primary text-on-primary border-primary"
                  : "bg-background text-on-surface-variant border-outline-variant hover:text-on-surface",
              )}
            >
              {destLabel(d, names, t)}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <label className="inline-flex items-center gap-2 min-h-11 text-[13px] text-on-surface cursor-pointer">
          <input
            type="checkbox"
            checked={alsoAsked}
            onChange={(e) => setAlsoAsked(e.target.checked)}
            className="w-4 h-4 accent-primary"
          />
          {t("toAsk.also_asked", "Also tick it asked")}
        </label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="h-11 px-[22px] rounded-[14px] text-sm font-medium text-on-surface-variant hover:bg-on-surface/[0.08] transition-colors cursor-pointer"
          >
            {t("toAsk.cancel", "Cancel")}
          </button>
          <button
            type="button"
            disabled={!text.trim()}
            onClick={() => onPost(text, dest, alsoAsked)}
            className="h-11 px-[22px] rounded-[14px] bg-primary text-on-primary text-sm font-medium hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity cursor-pointer"
          >
            {t("toAsk.post", "Post update")}
          </button>
        </div>
      </div>
      <p className="text-xs text-on-surface-variant m-0">{destHint(dest, names, t)}</p>
    </div>
  );
}

function AddLine({ label, onAdd }: { label: string; onAdd: (text: string) => void }) {
  const [text, setText] = useState("");
  return (
    <div className="flex items-center gap-2.5 min-h-11 mt-2 px-4 rounded-2xl border border-dashed border-outline-variant text-on-surface-variant">
      <Plus className="w-4 h-4 flex-none" />
      <input
        aria-label={label}
        placeholder={label}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && text.trim()) {
            onAdd(text);
            setText("");
          }
        }}
        className="flex-1 bg-transparent outline-none text-sm text-on-surface py-2"
      />
    </div>
  );
}
