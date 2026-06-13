import React, { useEffect, useMemo, useState } from "react";
import { ArrowRight, Mail, HeartHandshake, ClipboardList, Check, Sunrise } from "lucide-react";
import { motion } from "motion/react";
import { useNavigate } from "react-router-dom";
import { format, isValid } from "date-fns";
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  limit,
  where,
  collectionGroup,
  doc,
  updateDoc,
} from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { cn, getUserInitials } from "../lib/utils";
import { useAuth } from "../components/AuthProvider";
import { Contact, PrayerRecord, Event, Stage } from "../types";
import { Skeleton } from "../components/ui/Skeleton";
import ContactDetailsModal from "../components/modals/ContactDetailsModal";

const DAY_MS = 86_400_000;

// ── small inline helpers (shared shape with Dashboard's) ──
const parseMs = (s?: string | null): number | null => {
  if (!s) return null;
  const t = new Date(s).getTime();
  return Number.isNaN(t) ? null : t;
};
const daysSince = (ms: number) => Math.max(0, Math.floor((Date.now() - ms) / DAY_MS));
const connectedLabel = (d: number) =>
  d === 0 ? "Connected today" : d === 1 ? "Last connected yesterday" : `Last connected ${d} days ago`;
const truncate = (s: string | undefined, n: number) =>
  s && s.length > n ? s.slice(0, n).replace(/\s+\S*$/, "") + "…" : s || "";

// Humanize a task's due date into a chip + tone.
type DueTone = "overdue" | "soon" | "normal";
const dueChip = (dueDate?: string | null): { label: string; tone: DueTone } | null => {
  const ms = parseMs(dueDate);
  if (ms == null) return null;
  const due = new Date(ms);
  due.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((due.getTime() - today.getTime()) / DAY_MS);
  if (diff < 0) return { label: "Overdue", tone: "overdue" };
  if (diff === 0) return { label: "Due today", tone: "soon" };
  if (diff === 1) return { label: "Due tomorrow", tone: "soon" };
  if (diff <= 6) return { label: `Due ${format(due, "EEEE")}`, tone: diff <= 2 ? "soon" : "normal" };
  return { label: `Due ${format(due, "MMM d")}`, tone: "normal" };
};

interface MyTask {
  id: string;
  title: string;
  dueDate?: string;
  priority?: string;
  contactId?: string;
  contactName?: string;
  assigneeId?: string | null;
  status: "pending" | "completed" | "canceled";
}

function Avatar({ contact, size = "md" }: { contact: Contact; size?: "sm" | "md" }) {
  const dim = size === "sm" ? "w-8 h-8 text-xs" : "w-11 h-11 text-sm";
  const initials = contact.initials || getUserInitials(contact.name);
  if (contact.avatar) {
    return (
      <img
        src={contact.avatar}
        alt={contact.name}
        className={cn(dim, "rounded-full object-cover shrink-0")}
      />
    );
  }
  return (
    <div
      className={cn(
        dim,
        "rounded-full bg-primary-container text-on-primary-container font-semibold flex items-center justify-center shrink-0",
      )}
    >
      {initials}
    </div>
  );
}

export default function MyDay() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const firstName = user?.displayName?.split(" ")[0] || "friend";
  const uid = user?.uid;

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [prayers, setPrayers] = useState<PrayerRecord[]>([]);
  const [tasks, setTasks] = useState<MyTask[]>([]);
  const [touches, setTouches] = useState<{ contactId: string; ms: number; note: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const [prayedToday, setPrayedToday] = useState<Record<string, boolean>>({});
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);

  useEffect(() => {
    const unsubContacts = onSnapshot(
      query(collection(db, "contacts")),
      (snap) => {
        setContacts(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Contact[]);
        setLoading(false);
      },
      (e) => handleFirestoreError(e, OperationType.LIST, "contacts"),
    );

    const unsubStages = onSnapshot(
      query(collection(db, "stages"), orderBy("order", "asc")),
      (snap) => setStages(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Stage[]),
      (e) => handleFirestoreError(e, OperationType.LIST, "stages"),
    );

    const unsubEvents = onSnapshot(
      query(collection(db, "events")),
      (snap) => setEvents(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Event[]),
      (e) => handleFirestoreError(e, OperationType.LIST, "events"),
    );

    const unsubPrayers = onSnapshot(
      query(collection(db, "prayers")),
      (snap) => setPrayers(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as PrayerRecord[]),
      (e) => handleFirestoreError(e, OperationType.LIST, "prayers"),
    );

    // Last-touch signal: most recent interaction/comment per contact (createdAt is ISO).
    const ingest = (
      snap: { docs: { id: string; data: () => unknown; ref: { path: string } }[] },
      noteKey: "content" | "text",
    ) =>
      snap.docs.map((d) => {
        const data = d.data() as Record<string, unknown>;
        return {
          contactId: d.ref.path.split("/")[1],
          ms: new Date((data.createdAt as string) ?? "").getTime(),
          note: ((data[noteKey] as string) ?? "").trim(),
        };
      });

    let interactionTouches: { contactId: string; ms: number; note: string }[] = [];
    let commentTouches: { contactId: string; ms: number; note: string }[] = [];
    const publish = () =>
      setTouches([...interactionTouches, ...commentTouches].filter((t) => !Number.isNaN(t.ms)));

    const unsubInteractions = onSnapshot(
      query(collectionGroup(db, "interactions"), orderBy("createdAt", "desc"), limit(500)),
      (snap) => {
        interactionTouches = ingest(snap as never, "content");
        publish();
      },
      (e) => handleFirestoreError(e, OperationType.LIST, "interactions (collectionGroup)"),
    );

    const unsubComments = onSnapshot(
      query(collectionGroup(db, "comments"), orderBy("createdAt", "desc"), limit(500)),
      (snap) => {
        commentTouches = ingest(snap as never, "text");
        publish();
      },
      (e) => handleFirestoreError(e, OperationType.LIST, "comments (collectionGroup)"),
    );

    return () => {
      unsubContacts();
      unsubStages();
      unsubEvents();
      unsubPrayers();
      unsubInteractions();
      unsubComments();
    };
  }, []);

  // Tasks assigned to me — separate subscription (depends on uid).
  useEffect(() => {
    if (!uid) return;
    const unsub = onSnapshot(
      query(collection(db, "tasks"), where("assigneeId", "==", uid)),
      (snap) => setTasks(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as MyTask[]),
      (e) => handleFirestoreError(e, OperationType.LIST, "tasks"),
    );
    return () => unsub();
  }, [uid]);

  const stageColor = (label?: string) =>
    stages.find((s) => s.label === label)?.color || "bg-surface-variant text-on-surface-variant";

  // most-recent touch (+ its note) per contact
  const lastTouchByContact = useMemo(() => {
    const map = new Map<string, { ms: number; note: string }>();
    for (const t of touches) {
      const cur = map.get(t.contactId);
      if (!cur || t.ms > cur.ms) map.set(t.contactId, { ms: t.ms, note: t.note });
    }
    return map;
  }, [touches]);

  // The contacts that are "mine" — the ones I welcomed (created).
  const myContactIds = useMemo(() => {
    const set = new Set<string>();
    for (const c of contacts) if (uid && c.createdBy === uid) set.add(c.id);
    return set;
  }, [contacts, uid]);

  // Leaders I'm walking with — my contacts, longest-since-connected first.
  const myLeaders = useMemo(() => {
    return contacts
      .filter((c) => myContactIds.has(c.id))
      .map((c) => {
        const touch = lastTouchByContact.get(c.id);
        const ms = touch?.ms ?? parseMs(c.createdAt);
        const days = ms == null ? Infinity : daysSince(ms);
        return { contact: c, days, note: touch?.note || c.notes || "" };
      })
      .sort((a, b) => b.days - a.days);
  }, [contacts, myContactIds, lastTouchByContact]);

  // The leader I've gone longest without sitting with (for the prose nudge).
  const staleLeader = useMemo(
    () => myLeaders.find((l) => Number.isFinite(l.days) && l.days >= 7),
    [myLeaders],
  );

  // On my plate — tasks assigned to me (pending shown first, completed kept struck).
  const plate = useMemo(() => {
    const active = tasks.filter((t) => t.status !== "canceled");
    const rank = (t: MyTask) => (t.status === "completed" ? 1 : 0);
    return active.sort((a, b) => {
      if (rank(a) !== rank(b)) return rank(a) - rank(b);
      return (parseMs(a.dueDate) ?? Infinity) - (parseMs(b.dueDate) ?? Infinity);
    });
  }, [tasks]);
  const leftToDo = useMemo(() => tasks.filter((t) => t.status === "pending").length, [tasks]);

  // This week — events dated within the next 7 days, soonest first.
  const thisWeek = useMemo(() => {
    const now = Date.now();
    const horizon = now + 7 * DAY_MS;
    return events
      .map((ev) => ({ ev, ms: parseMs(ev.date) }))
      .filter((x): x is { ev: Event; ms: number } => x.ms != null)
      .filter((x) => x.ms >= now - DAY_MS && x.ms <= horizon)
      .sort((a, b) => a.ms - b.ms || (a.ev.order ?? 0) - (b.ev.order ?? 0));
  }, [events]);

  // Prayers I'm carrying — open prayers on my contacts, oldest first.
  const myOpenPrayers = useMemo(
    () =>
      prayers
        .filter((p) => p.status === "pending" || p.status === "ongoing")
        .filter((p) => p.contactId && myContactIds.has(p.contactId)),
    [prayers, myContactIds],
  );
  const carrying = useMemo(
    () =>
      [...myOpenPrayers]
        .sort((a, b) => (parseMs(a.date) ?? 0) - (parseMs(b.date) ?? 0))
        .slice(0, 4),
    [myOpenPrayers],
  );

  const contactById = (id?: string) => contacts.find((c) => c.id === id);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  const openContact = (c: Contact | undefined | null) => {
    if (!c) return;
    setSelectedContact(c);
    setIsDetailsModalOpen(true);
  };

  const toggleTask = async (t: MyTask) => {
    const next = t.status === "completed" ? "pending" : "completed";
    try {
      await updateDoc(doc(db, "tasks", t.id), { status: next });
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, "tasks");
    }
  };

  if (loading) {
    return (
      <div className="p-6 md:p-8 space-y-8 animate-pulse max-w-5xl">
        <div className="space-y-3">
          <Skeleton className="h-4 w-64 opacity-70" />
          <Skeleton className="h-10 w-72" />
          <Skeleton className="h-16 w-full max-w-2xl opacity-70" />
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  const SectionHead = ({
    title,
    sub,
    linkLabel,
    onLink,
  }: {
    title: string;
    sub?: string;
    linkLabel?: string;
    onLink?: () => void;
  }) => (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-4">
      <h2 className="font-serif text-2xl text-on-surface">{title}</h2>
      {sub && <span className="text-sm text-on-surface-variant">{sub}</span>}
      {linkLabel && (
        <button
          onClick={onLink}
          className="ml-auto text-sm font-medium text-primary hover:underline inline-flex items-center gap-1"
        >
          {linkLabel} <ArrowRight className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );

  const StageChip = ({ stage }: { stage?: string }) =>
    stage ? (
      <span
        className={cn(
          "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap",
          stageColor(stage),
        )}
      >
        {stage}
      </span>
    ) : null;

  const dueToneClass: Record<DueTone, string> = {
    overdue: "text-error",
    soon: "text-primary",
    normal: "text-on-surface-variant",
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="p-6 md:p-8 max-w-5xl"
    >
      {/* ── Greeting + the state of your own day, in prose ── */}
      <header className="flex flex-col sm:flex-row sm:items-end gap-4 sm:gap-6">
        <div className="flex-1">
          <p className="text-sm text-on-surface-variant inline-flex items-center gap-1.5">
            <Sunrise className="w-4 h-4 text-primary" />
            {format(new Date(), "EEEE, MMMM d")} · Your day
          </p>
          <h1 className="font-serif text-3xl sm:text-4xl text-on-surface mt-1">
            {getGreeting()}, {firstName}.
          </h1>
          <p className="text-base text-on-surface-variant leading-relaxed mt-3 max-w-2xl">
            You're walking with{" "}
            <b className="text-on-surface font-semibold">
              {myLeaders.length} {myLeaders.length === 1 ? "person" : "people"}
            </b>{" "}
            you've welcomed, and there{" "}
            {leftToDo === 1 ? "is" : "are"}{" "}
            <span className="text-on-surface font-medium">{leftToDo}</span>{" "}
            {leftToDo === 1 ? "thing" : "things"} that{" "}
            {leftToDo === 1 ? "is" : "are"} yours to tend this week.
            {staleLeader && (
              <>
                {" "}
                It's been{" "}
                <b className="text-on-surface font-semibold">
                  {Math.max(1, Math.round(staleLeader.days / 7))} weeks
                </b>{" "}
                since you sat with {staleLeader.contact.name.split(" ")[0]} — maybe today.
              </>
            )}{" "}
            And <span className="text-on-surface font-medium">{myOpenPrayers.length}</span>{" "}
            {myOpenPrayers.length === 1 ? "prayer is" : "prayers are"} still yours to carry.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => navigate("/prayer")}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-outline-variant text-sm font-medium text-on-surface hover:bg-surface-variant transition-colors"
          >
            <HeartHandshake className="w-4 h-4" /> Pray together
          </button>
          <button
            onClick={() => navigate("/coordination")}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary text-on-primary text-sm font-medium hover:opacity-90 transition-opacity"
          >
            <ClipboardList className="w-4 h-4" /> The team's board
          </button>
        </div>
      </header>

      {/* ── On your plate — the actionable heart of the day ── */}
      <section className="mt-12">
        <SectionHead
          title="On your plate"
          sub={
            leftToDo > 0
              ? `${leftToDo} small ${leftToDo === 1 ? "thing" : "things"}, yours to carry this week.`
              : "All clear — nothing waiting on you."
          }
        />
        {plate.length > 0 ? (
          <div className="bg-surface rounded-2xl border border-outline-variant/60 px-5">
            {plate.map((t, i) => {
              const isDone = t.status === "completed";
              const due = isDone ? null : dueChip(t.dueDate);
              return (
                <div
                  key={t.id}
                  className={cn(
                    "flex items-start gap-3.5 py-4",
                    i > 0 && "border-t border-outline-variant/40",
                  )}
                >
                  <button
                    onClick={() => toggleTask(t)}
                    title={isDone ? "Done — tap to reopen" : "Mark done"}
                    aria-pressed={isDone}
                    className={cn(
                      "mt-0.5 w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition-colors",
                      isDone
                        ? "bg-primary border-primary text-on-primary"
                        : "border-outline hover:border-primary",
                    )}
                  >
                    {isDone && <Check className="w-3 h-3" />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div
                      className={cn(
                        "text-on-surface",
                        isDone && "line-through text-on-surface-variant",
                      )}
                    >
                      {t.title}
                    </div>
                    {t.contactId && t.contactName && (
                      <button
                        onClick={() => openContact(contactById(t.contactId))}
                        className="text-sm text-primary font-medium hover:underline mt-0.5"
                      >
                        {t.contactName}
                      </button>
                    )}
                  </div>
                  {due && (
                    <span
                      className={cn(
                        "text-xs font-medium whitespace-nowrap shrink-0 mt-0.5",
                        dueToneClass[due.tone],
                      )}
                    >
                      {due.label}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-on-surface-variant py-2">
            Nothing on your plate right now — a rare, quiet moment.
          </p>
        )}
      </section>

      {/* ── The leaders you're walking with ── */}
      <section className="mt-12">
        <SectionHead
          title="The leaders you're walking with"
          sub="The people you've personally welcomed."
          linkLabel="See everyone"
          onLink={() => navigate("/directory")}
        />
        {myLeaders.length > 0 ? (
          <div className="space-y-3">
            {myLeaders.slice(0, 6).map(({ contact, days, note }) => (
              <div
                key={contact.id}
                onClick={() => openContact(contact)}
                className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-4 bg-surface rounded-2xl border border-outline-variant/60 p-5 hover:border-primary/40 transition-colors cursor-pointer"
              >
                <div className="flex gap-4 min-w-0">
                  <Avatar contact={contact} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-on-surface">{contact.name}</span>
                      <StageChip stage={contact.stage} />
                    </div>
                    <div className="text-sm text-primary font-medium mt-0.5">
                      {Number.isFinite(days) ? connectedLabel(days) : "Not connected yet"}
                    </div>
                    {note && (
                      <p className="text-sm text-on-surface-variant leading-relaxed mt-2">
                        {truncate(note, 120)}
                      </p>
                    )}
                  </div>
                </div>
                <div
                  className="flex sm:flex-col gap-2 items-start sm:items-end"
                  onClick={(e) => e.stopPropagation()}
                >
                  {contact.email && (
                    <a
                      href={`mailto:${contact.email}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-outline-variant text-xs font-medium text-on-surface hover:bg-surface-variant transition-colors"
                    >
                      <Mail className="w-3.5 h-3.5" /> Email
                    </a>
                  )}
                  <button
                    onClick={() => openContact(contact)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-primary text-on-primary text-xs font-medium hover:opacity-90 transition-opacity"
                  >
                    Open
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-on-surface-variant py-2">
            No one's in your care yet — the people you welcome will gather here.
          </p>
        )}
      </section>

      {/* ── Your week — the soonest gathering, featured, then the rest ── */}
      <section className="mt-12">
        <SectionHead
          title="Your week"
          sub="Where you're needed."
          linkLabel="Full calendar"
          onLink={() => navigate("/attendance")}
        />
        {thisWeek.length > 0 ? (
          <div className="space-y-4">
            {(() => {
              const [{ ev: lead, ms: leadMs }, ...rest] = thisWeek;
              const d = new Date(leadMs);
              return (
                <>
                  <div className="bg-surface rounded-2xl border border-outline-variant/60 p-6 flex items-center gap-5">
                    <div className="text-center w-14 shrink-0">
                      <div className="font-serif text-4xl text-on-surface leading-none">
                        {isValid(d) ? format(d, "d") : "–"}
                      </div>
                      <div className="text-xs uppercase tracking-wide text-on-surface-variant mt-1">
                        {isValid(d) ? format(d, "MMM") : ""}
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium text-primary uppercase tracking-wide">
                        {isValid(d) ? format(d, "EEEE") : ""} · up next
                      </div>
                      <div className="font-serif text-2xl text-on-surface mt-0.5 truncate">
                        {lead.name}
                      </div>
                      <div className="text-sm text-on-surface-variant mt-1">
                        {[lead.type, lead.location].filter(Boolean).join(" · ") ||
                          "On the calendar"}
                      </div>
                    </div>
                  </div>

                  {rest.length > 0 && (
                    <div className="bg-surface rounded-2xl border border-outline-variant/60 px-5">
                      {rest.map(({ ev, ms }, i) => {
                        const rd = new Date(ms);
                        return (
                          <div
                            key={ev.id}
                            className={cn(
                              "flex items-center gap-4 py-4",
                              i > 0 && "border-t border-outline-variant/40",
                            )}
                          >
                            <div className="text-center w-11 shrink-0">
                              <div className="font-serif text-2xl text-on-surface leading-none">
                                {isValid(rd) ? format(rd, "d") : "–"}
                              </div>
                              <div className="text-[11px] uppercase tracking-wide text-on-surface-variant mt-1">
                                {isValid(rd) ? format(rd, "MMM") : ""}
                              </div>
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="font-medium text-on-surface truncate">{ev.name}</div>
                              <div className="text-xs text-on-surface-variant mt-0.5">
                                {isValid(rd) ? format(rd, "EEEE") : ""}
                                {ev.location ? ` · ${ev.location}` : ""}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        ) : (
          <p className="text-sm text-on-surface-variant py-2">
            Nothing on the calendar this week yet.
          </p>
        )}
      </section>

      {/* ── Prayers you're carrying ── */}
      <section className="mt-12">
        <SectionHead
          title="Prayers you're carrying"
          sub="Held by you this week."
          linkLabel="All prayers"
          onLink={() => navigate("/prayer")}
        />
        {carrying.length > 0 ? (
          <div className="bg-surface rounded-2xl border border-outline-variant/60 px-5">
            {carrying.map((p, i) => {
              const c = contactById(p.contactId);
              const heldMs = parseMs(p.date);
              const isPrayed = !!prayedToday[p.id];
              return (
                <div
                  key={p.id}
                  className={cn(
                    "flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 py-4",
                    i > 0 && "border-t border-outline-variant/40",
                  )}
                >
                  <div className="min-w-0">
                    {c && (
                      <button
                        onClick={() => openContact(c)}
                        className="text-sm font-medium text-primary hover:underline"
                      >
                        for {c.name}
                      </button>
                    )}
                    <p className="text-sm text-on-surface-variant leading-relaxed mt-1">
                      {truncate(p.burden, 150)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 sm:flex-col sm:items-end">
                    {heldMs != null && (
                      <span className="text-xs text-on-surface-variant whitespace-nowrap">
                        held {daysSince(heldMs)} days
                      </span>
                    )}
                    <button
                      onClick={() => setPrayedToday((s) => ({ ...s, [p.id]: true }))}
                      disabled={isPrayed}
                      className={cn(
                        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors",
                        isPrayed
                          ? "bg-tertiary-container text-on-tertiary-container cursor-default"
                          : "border border-outline-variant text-on-surface hover:bg-surface-variant",
                      )}
                    >
                      {isPrayed ? (
                        <>
                          <Check className="w-3.5 h-3.5" /> Prayed today
                        </>
                      ) : (
                        <>
                          <HeartHandshake className="w-3.5 h-3.5" /> I prayed
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-on-surface-variant py-2">
            No prayers in your care right now.
          </p>
        )}
      </section>

      {/* ── Quiet figures: present, but never the headline ── */}
      <div className="mt-14 pt-6 border-t border-outline-variant/50 flex flex-wrap items-end gap-x-10 gap-y-4">
        <Figure n={myLeaders.length} label="leaders you carry" />
        <Figure n={myOpenPrayers.length} label="prayers you hold" />
        <Figure n={leftToDo} label="to tend this week" />
        <Figure n={thisWeek.length} label="gatherings you're part of" />
        <span className="text-sm text-on-surface-variant italic ml-auto">
          Numbers are just a way of noticing people.
        </span>
      </div>

      <ContactDetailsModal
        isOpen={isDetailsModalOpen}
        onClose={() => setIsDetailsModalOpen(false)}
        contact={selectedContact}
      />
    </motion.div>
  );
}

function Figure({ n, label }: { n: number | string; label: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-serif text-2xl text-on-surface leading-none">{n}</span>
      <span className="text-xs text-on-surface-variant">{label}</span>
    </div>
  );
}
