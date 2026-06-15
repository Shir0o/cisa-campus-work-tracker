import React, { useEffect, useMemo, useState } from "react";
import { ArrowRight, Plus, HeartHandshake, Mail } from "lucide-react";
import { motion } from "motion/react";
import { useNavigate } from "react-router-dom";
import { format, parseISO, isValid } from "date-fns";
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  limit,
  collectionGroup,
} from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { cn, getUserInitials } from "../lib/utils";
import { useAuth } from "../components/AuthProvider";
import { useLayout } from "../App";
import { Contact, PrayerRecord, Event, Stage } from "../types";
import { Skeleton } from "../components/ui/Skeleton";
import ContactDetailsModal from "../components/modals/ContactDetailsModal";

const DAY_MS = 86_400_000;

// ── small inline helpers (mirror the docs mock's daysOpen / connectedLabel / truncate) ──
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

export default function Dashboard() {
  const { user } = useAuth();
  const { openNewContact } = useLayout();
  const navigate = useNavigate();
  const firstName = user?.displayName?.split(" ")[0] || "friend";

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [prayers, setPrayers] = useState<PrayerRecord[]>([]);
  const [touches, setTouches] = useState<
    { contactId: string; ms: number; note: string }[]
  >([]);
  const [loading, setLoading] = useState(true);

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
      setTouches(
        [...interactionTouches, ...commentTouches].filter((t) => !Number.isNaN(t.ms)),
      );

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

  const stageColor = (label?: string) =>
    stages.find((s) => s.label === label)?.color ||
    "bg-surface-variant text-on-surface-variant";

  // most-recent touch (+ its note) per contact
  const lastTouchByContact = useMemo(() => {
    const map = new Map<string, { ms: number; note: string }>();
    for (const t of touches) {
      const cur = map.get(t.contactId);
      if (!cur || t.ms > cur.ms) map.set(t.contactId, { ms: t.ms, note: t.note });
    }
    return map;
  }, [touches]);

  // People to reach out to — last touch (interaction/comment, else createdAt) ≥ 5 days ago
  const needsFollowup = useMemo(() => {
    return contacts
      .map((c) => {
        const touch = lastTouchByContact.get(c.id);
        const ms = touch?.ms ?? parseMs(c.createdAt);
        if (ms == null) return null;
        return { contact: c, days: daysSince(ms), note: touch?.note || c.notes || "" };
      })
      .filter((x): x is { contact: Contact; days: number; note: string } => !!x && x.days >= 5)
      .sort((a, b) => b.days - a.days);
  }, [contacts, lastTouchByContact]);

  // New faces — created within the last 14 days, newest first
  const newFaces = useMemo(() => {
    return contacts
      .map((c) => ({ contact: c, ms: parseMs(c.createdAt) }))
      .filter((x): x is { contact: Contact; ms: number } => x.ms != null)
      .filter((x) => daysSince(x.ms) <= 14)
      .sort((a, b) => b.ms - a.ms);
  }, [contacts]);

  // This week — events dated within the next 7 days
  const thisWeek = useMemo(() => {
    const now = Date.now();
    const horizon = now + 7 * DAY_MS;
    return events
      .map((ev) => ({ ev, ms: parseMs(ev.date) }))
      .filter((x): x is { ev: Event; ms: number } => x.ms != null)
      .filter((x) => x.ms >= now - DAY_MS && x.ms <= horizon)
      .sort((a, b) => a.ms - b.ms || (a.ev.order ?? 0) - (b.ev.order ?? 0));
  }, [events]);

  // Prayers we're carrying — open = pending | ongoing
  const openPrayers = useMemo(
    () => prayers.filter((p) => p.status === "pending" || p.status === "ongoing"),
    [prayers],
  );
  const carrying = useMemo(
    () =>
      openPrayers
        .filter((p) => p.contactId)
        .sort((a, b) => (parseMs(a.date) ?? 0) - (parseMs(b.date) ?? 0))
        .slice(0, 4),
    [openPrayers],
  );

  const contactById = (id?: string) => contacts.find((c) => c.id === id);

  // Quiet figures
  const attendanceRate = useMemo(() => {
    let present = 0;
    let total = 0;
    for (const c of contacts) {
      if (!c.attendance) continue;
      for (const v of Object.values(c.attendance)) {
        total++;
        if (v === true || v === 'late') present++;
      }
    }
    return total > 0 ? Math.round((present / total) * 100) : null;
  }, [contacts]);

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

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="p-6 md:p-8 max-w-5xl"
    >
      {/* ── Greeting + state of things, in prose ── */}
      <header className="flex flex-col sm:flex-row sm:items-end gap-4 sm:gap-6">
        <div className="flex-1">
          <p className="text-sm text-on-surface-variant">
            {format(new Date(), "EEEE, MMMM d")}
          </p>
          <h1 className="font-serif text-3xl sm:text-4xl text-on-surface mt-1">
            {getGreeting()}, {firstName}.
          </h1>
          <p className="text-base text-on-surface-variant leading-relaxed mt-3 max-w-2xl">
            <b className="text-on-surface font-semibold">
              {contacts.length} {contacts.length === 1 ? "person" : "people"}
            </b>{" "}
            in your care
            {newFaces.length > 0 && (
              <>
                {" "}
                — <span className="text-on-surface font-medium">{newFaces.length}</span> new in
                the last two weeks
              </>
            )}
            . You haven't connected with{" "}
            <span className="text-on-surface font-medium">{needsFollowup.length}</span> of them in
            over a week, and{" "}
            <span className="text-on-surface font-medium">{openPrayers.length}</span>{" "}
            {openPrayers.length === 1 ? "prayer is" : "prayers are"} still open across the team.
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
            onClick={() => openNewContact()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary text-on-primary text-sm font-medium hover:opacity-90 transition-opacity"
          >
            <Plus className="w-4 h-4" /> Add someone
          </button>
        </div>
      </header>

      {/* ── People to reach out to (the heart of the page) ── */}
      <section className="mt-12">
        <SectionHead
          title="People to reach out to"
          sub="It's been a little while since you last connected."
          linkLabel="See everyone"
          onLink={() => navigate("/directory")}
        />
        {needsFollowup.length > 0 ? (
          <div className="space-y-3">
            {needsFollowup.slice(0, 4).map(({ contact, days, note }) => (
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
                      {connectedLabel(days)}
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
            No one's overdue for a hello — you're all caught up.
          </p>
        )}
      </section>

      {/* ── New faces + This week ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-12">
        <section>
          <SectionHead title="New faces" sub="Joined in the last two weeks" />
          <div className="bg-surface rounded-2xl border border-outline-variant/60 px-5">
            {newFaces.length > 0 ? (
              newFaces.slice(0, 5).map(({ contact, ms }, i) => (
                <div
                  key={contact.id}
                  onClick={() => openContact(contact)}
                  className={cn(
                    "flex items-center gap-3.5 py-4 cursor-pointer",
                    i > 0 && "border-t border-outline-variant/40",
                  )}
                >
                  <Avatar contact={contact} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-on-surface truncate">{contact.name}</div>
                    <div className="text-xs text-on-surface-variant mt-0.5 truncate">
                      {[contact.role, contact.location].filter(Boolean).join(" · ")}
                      {(contact.role || contact.location) && " · "}
                      joined {daysSince(ms)}d ago
                    </div>
                  </div>
                  <StageChip stage={contact.stage} />
                </div>
              ))
            ) : (
              <p className="text-sm text-on-surface-variant py-5">
                No new faces in the last two weeks.
              </p>
            )}
          </div>
        </section>

        <section>
          <SectionHead
            title="This week"
            linkLabel="Calendar"
            onLink={() => navigate("/attendance")}
          />
          <div className="bg-surface rounded-2xl border border-outline-variant/60 px-5">
            {thisWeek.length > 0 ? (
              thisWeek.slice(0, 4).map(({ ev, ms }, i) => {
                const d = new Date(ms);
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
                        {isValid(d) ? format(d, "d") : "–"}
                      </div>
                      <div className="text-[11px] uppercase tracking-wide text-on-surface-variant mt-1">
                        {isValid(d) ? format(d, "MMM") : ""}
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-on-surface truncate">{ev.name}</div>
                      <div className="text-xs text-on-surface-variant mt-0.5">
                        {isValid(d) ? format(d, "EEEE") : ""}
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-on-surface-variant py-5">
                Nothing on the calendar this week yet.
              </p>
            )}
          </div>
        </section>
      </div>

      {/* ── Prayers we're carrying ── */}
      <section className="mt-12">
        <SectionHead
          title="Prayers we're carrying"
          sub="Held by the team this week"
          linkLabel="All prayers"
          onLink={() => navigate("/prayer")}
        />
        <div className="bg-surface rounded-2xl border border-outline-variant/60 px-5">
          {carrying.length > 0 ? (
            carrying.map((p, i) => {
              const c = contactById(p.contactId);
              const heldMs = parseMs(p.date);
              return (
                <div
                  key={p.id}
                  className={cn(
                    "flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 py-4",
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
                  {heldMs != null && (
                    <span className="text-xs text-on-surface-variant whitespace-nowrap shrink-0 sm:pt-0.5">
                      held {daysSince(heldMs)} days
                    </span>
                  )}
                </div>
              );
            })
          ) : (
            <p className="text-sm text-on-surface-variant py-5">No open prayers right now.</p>
          )}
        </div>
      </section>

      {/* ── Quiet figures: present, but never the headline ── */}
      <div className="mt-14 pt-6 border-t border-outline-variant/50 flex flex-wrap items-end gap-x-10 gap-y-4">
        <Figure n={contacts.length} label="in our care" />
        <Figure n={newFaces.length} label="newly arrived" />
        {attendanceRate != null && <Figure n={`${attendanceRate}%`} label="showing up" />}
        <Figure n={openPrayers.length} label="prayers open" />
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
