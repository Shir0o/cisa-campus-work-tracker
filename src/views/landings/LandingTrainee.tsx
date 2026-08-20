import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { HelpCircle, Bell, Check } from "lucide-react";
import { db, handleFirestoreError, OperationType } from "../../lib/firebase";
import { cn, relTime } from "../../lib/utils";
import { useAuth } from "../../components/AuthProvider";
import { Contact, PrayerRecord, Stage } from "../../types";
import { Skeleton } from "../../components/ui/Skeleton";
import { DataLoadError } from "../../components/ui/DataLoadError";
import ContactDetailsModal from "../../components/modals/ContactDetailsModal";
import PageContainer from "../../components/layout/PageContainer";
import { usePreserveScroll } from "../../lib/usePreserveScroll";
import { SectionHead } from "../../components/landing/primitives";
import { ReachCard } from "../../components/landing/ReachCard";
import {
  TeamPrayerRow,
  PersonalPrayerRow,
  AddPersonalPrayer,
} from "../../components/landing/PrayerRows";
import { cardClass, getGreeting, parseMs, daysSince } from "../../components/landing/helpers";
import {
  subscribePersonalPrayers,
  addPersonalPrayer,
  updatePersonalPrayer,
  deletePersonalPrayer,
  type PersonalPrayer,
} from "../../lib/personalPrayers";
import { updatePrayerStatus } from "../../lib/prayers";
import { openMessage } from "../../lib/messaging";
import { fullTimerOf } from "../../lib/walking";
import { subscribeAllThreads, type ThreadMessageWithContact } from "../../lib/threads";
import { traineeWaitingItems, type InboxItem } from "../../lib/inbox";
import { useInboxReads } from "../../lib/inboxReads";
import FirstRunCard from "../../components/landing/FirstRunCard";

// One thing the full-timer has put on the trainee's plate: a nudge to follow up
// or a question awaiting a reply. "Open" jumps into the contact's conversation.
function WaitingRow({
  item,
  contactName,
  ftFirst,
  read,
  onOpen,
  onHandled,
}: {
  item: InboxItem;
  contactName: string;
  ftFirst: string;
  read: boolean;
  onOpen: () => void;
  onHandled: () => void;
}) {
  const isNudge = item.kind === "nudge";
  const Icon = isNudge ? Bell : HelpCircle;
  const cls = isNudge ? "text-warning bg-warning/10" : "text-stage-amber bg-stage-amber-soft";
  const title = isNudge
    ? `${ftFirst} nudged a follow-up about ${contactName}`
    : `${ftFirst} asked about ${contactName}`;

  return (
    <div
      className={cn(
        "bg-surface rounded-3xl border p-5 transition-colors",
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
                <span className="font-semibold text-on-surface">{title}</span>
                <span className="text-[11.5px] text-on-surface-variant">{relTime(item.at)}</span>
              </div>
              {item.body && (
                <p className="text-sm text-on-surface-variant leading-relaxed mt-1">{item.body}</p>
              )}
            </div>
            {!read && (
              <span className="flex-none mt-1.5 w-[7px] h-[7px] rounded-full bg-primary" aria-label="Unread" />
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={onOpen}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-primary text-on-primary text-xs font-medium hover:opacity-90 transition-opacity"
            >
              Open {contactName.split(/\s+/)[0]}
            </button>
            <button
              onClick={onHandled}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-colors",
                read
                  ? "border-accent-line bg-primary/10 text-accent"
                  : "border-outline-variant text-on-surface-variant hover:bg-surface-variant",
              )}
            >
              <Check className="w-3.5 h-3.5" /> {read ? "Handled" : "Mark handled"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Trainee landing: what the full-timer's flagged + the students in your care +
// the prayers you're holding.
export default function LandingTrainee() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const uid = user?.uid;
  const firstName = user?.displayName?.split(" ")[0] || "friend";

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [prayers, setPrayers] = useState<PrayerRecord[]>([]);
  const [personalPrayers, setPersonalPrayers] = useState<PersonalPrayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [threads, setThreads] = useState<ThreadMessageWithContact[]>([]);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [initialTab, setInitialTab] = useState<"thread" | undefined>(undefined);
  const [initialInteractionId, setInitialInteractionId] = useState<string | null>(null);
  const inbox = useInboxReads();

  const onLoadError = (e: unknown, path: string) => {
    setError("your home");
    setLoading(false);
    handleFirestoreError(e, OperationType.LIST, path);
  };

  useEffect(() => {
    const unsubContacts = onSnapshot(
      query(collection(db, "contacts")),
      (snap) => {
        setContacts(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Contact[]);
        setLoading(false);
      },
      (e) => onLoadError(e, "contacts"),
    );
    const unsubStages = onSnapshot(
      query(collection(db, "stages"), orderBy("order", "asc")),
      (snap) => setStages(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Stage[]),
      (e) => onLoadError(e, "stages"),
    );
    const unsubPrayers = onSnapshot(
      query(collection(db, "prayers")),
      (snap) => setPrayers(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as PrayerRecord[]),
      (e) => onLoadError(e, "prayers"),
    );
    return () => {
      unsubContacts();
      unsubStages();
      unsubPrayers();
    };
  }, []);

  useEffect(() => {
    if (!uid) return;
    return subscribePersonalPrayers(uid, setPersonalPrayers);
  }, [uid]);

  // Thread messages across all contacts — powers "What's waiting on you" and the
  // weighed-in status. Needs the threads collection-group rule deployed; until
  // then it's permission-denied and stays empty (section simply doesn't render),
  // so degrade quietly rather than surfacing a load error.
  useEffect(() => subscribeAllThreads(setThreads), []);

  // Your people — the contacts you created, longest-since-seen first.
  const myPeople = useMemo(() => {
    return contacts
      .filter((c) => uid && c.createdBy === uid)
      .map((c) => {
        const ms = parseMs(c.lastSeen) ?? parseMs(c.createdAt);
        const days = ms == null ? Infinity : daysSince(ms);
        return { contact: c, days, note: c.notes || "" };
      })
      .sort((a, b) => b.days - a.days);
  }, [contacts, uid]);
  const myIds = useMemo(() => new Set(myPeople.map((p) => p.contact.id)), [myPeople]);

  // Prayers you're holding — shared prayers on your people (not archived) +
  // your own private personal prayers.
  const contactPrayers = useMemo(
    () =>
      prayers
        .filter((p) => p.contactId && myIds.has(p.contactId) && p.status !== "unanswered")
        .sort((a, b) => (parseMs(a.date) ?? 0) - (parseMs(b.date) ?? 0)),
    [prayers, myIds],
  );
  const activePersonalPrayers = useMemo(
    () => personalPrayers.filter((p) => p.status !== "archived"),
    [personalPrayers],
  );

  const myContacts = useMemo(() => myPeople.map((p) => p.contact), [myPeople]);
  const contactById = (id?: string) => contacts.find((c) => c.id === id);

  // What's waiting on you — your full-timer's nudges/questions, newest-first.
  const ft = fullTimerOf(uid);
  const ftFirst = useMemo(
    () => (threads.find((m) => m.from === ft)?.fromName || "your full-timer").split(/\s+/)[0],
    [threads, ft],
  );
  const waiting = useMemo(
    () => (uid ? traineeWaitingItems(uid, threads) : []),
    [uid, threads],
  );
  const waitingUnread = waiting.filter((it) => !inbox.isRead(uid ?? "", it.id)).length;

  // Which of your people the full-timer has weighed in on (any thread reply, or
  // an explicit review) — drives the "weighed in" / "awaiting a look" status.
  const weighedIn = useMemo(() => {
    const set = new Set<string>();
    for (const m of threads) if (ft && m.from === ft) set.add(m.contactId);
    return set;
  }, [threads, ft]);

  const openContact = (
    c: Contact | undefined | null,
    opts?: { tab?: "thread"; interactionId?: string | null },
  ) => {
    if (!c) return;
    setSelectedContact(c);
    setInitialTab(opts?.tab);
    setInitialInteractionId(opts?.interactionId ?? null);
    setIsDetailsModalOpen(true);
  };

  // People detail is a full page (the design's ContactDetail), not a popup.
  usePreserveScroll(!!(isDetailsModalOpen && selectedContact));
  if (isDetailsModalOpen && selectedContact) {
    return (
      <ContactDetailsModal
        isOpen
        onClose={() => {
          setIsDetailsModalOpen(false);
          setSelectedContact(null);
          setInitialInteractionId(null);
        }}
        contact={selectedContact}
        initialTab={initialTab}
        initialInteractionId={initialInteractionId}
      />
    );
  }

  if (error) return <DataLoadError label={error} />;

  if (loading) {
    return (
      <PageContainer variant="wide" className="space-y-8 animate-pulse">
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
      </PageContainer>
    );
  }

  return (
    <PageContainer variant="wide">
      <header>
        <p className="text-sm text-on-surface-variant">
          {format(new Date(), "EEEE, MMMM d")} · Your season on staff
        </p>
        <h1 className="font-serif text-3xl sm:text-4xl text-on-surface mt-1">
          {getGreeting()}, {firstName}.
        </h1>
        <p className="text-base text-on-surface-variant leading-relaxed mt-3 max-w-2xl">
          You're caring for{" "}
          <b className="text-on-surface font-semibold">
            {myPeople.length} {myPeople.length === 1 ? "student" : "students"}
          </b>{" "}
          this season.{" "}
          {ft
            ? `Here's what ${ftFirst}'s flagged for you, the people you've brought in, and what you're holding in prayer.`
            : "Here's your circle, and what you're holding in prayer."}
        </p>
      </header>

      <FirstRunCard
        role="trainee"
        userId={uid}
        context={{
          contactsCount: myPeople.length,
          interactionsCount: myPeople.filter((p) => p.note).length,
          messagesCount: threads.filter((m) => m.from === uid).length,
          prayersCount: personalPrayers.length + prayers.length,
          todosCompletedCount: myPeople.filter((p) => p.note).length,
        }}
        className="mt-8"
      />

      {/* ── What's waiting on you — your full-timer's nudges & questions ── */}
      {waiting.length > 0 && (
        <section className="mt-12">
          <SectionHead
            title="What's waiting on you"
            sub={`A word from ${ftFirst} — things to pick up when you can.`}
            action={
              waitingUnread > 0 ? (
                <span className="text-xs font-semibold text-accent bg-accent-soft rounded-full px-2.5 py-1">
                  {waitingUnread}
                </span>
              ) : undefined
            }
          />
          <div className="flex flex-col gap-3">
            {waiting.map((item) => {
              const contact = contactById(item.contactId);
              return (
                <WaitingRow
                  key={item.id}
                  item={item}
                  contactName={contact?.name || "someone"}
                  ftFirst={ftFirst}
                  read={inbox.isRead(uid ?? "", item.id)}
                  onOpen={() => {
                    if (contact)
                      openContact(contact, {
                        tab: "thread",
                        interactionId: item.interactionId ?? null,
                      });
                    if (uid) inbox.markRead(uid, item.id);
                  }}
                  onHandled={() =>
                    uid &&
                    (inbox.isRead(uid, item.id)
                      ? inbox.markUnread(uid, item.id)
                      : inbox.markRead(uid, item.id))
                  }
                />
              );
            })}
          </div>
        </section>
      )}

      {/* ── Your people ── */}
      <section className="mt-12">
        <SectionHead
          title="Your people"
          sub="The students in your care."
          linkLabel="See all"
          onLink={() => navigate("/directory")}
        />
        {myPeople.length > 0 ? (
          <div className="flex flex-col gap-3">
            {myPeople.map(({ contact, days, note }) => {
              const seen = weighedIn.has(contact.id) || !!contact.reviewed;
              return (
                <ReachCard
                  key={contact.id}
                  contact={contact}
                  days={days}
                  note={note}
                  stages={stages}
                  onOpen={() => openContact(contact)}
                  onMessage={() => openMessage(contact.phone)}
                  statusNode={
                    ft ? (
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 text-[11px] font-medium rounded-full px-2 py-0.5",
                          seen
                            ? "text-success bg-success/10"
                            : "text-on-surface-variant bg-surface-variant",
                        )}
                      >
                        {seen ? `${ftFirst} weighed in` : "Awaiting a look"}
                      </span>
                    ) : undefined
                  }
                />
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-on-surface-variant py-2">
            No one's in your care yet — add a contact to gather your circle here.
          </p>
        )}
      </section>

      {/* ── Prayers you're holding ── */}
      <section className="mt-12">
        <SectionHead
          title="Prayers you're holding"
          sub="Yours to hold this week — for your people, and just between you and God."
        />
        <div className={cardClass}>
          {contactPrayers.map((p, i) => (
            <TeamPrayerRow
              key={p.id}
              prayer={p}
              contact={contactById(p.contactId)}
              first={i === 0}
              onUpdateStatus={(id, status, answer, answeredAt) =>
                updatePrayerStatus(id, status, { uid, name: user?.displayName }, answer, answeredAt)
              }
              onOpenContact={openContact}
              onOpenPrayerLog={() => navigate("/prayer")}
            />
          ))}
          {activePersonalPrayers.map((p, i) => (
            <PersonalPrayerRow
              key={p.id}
              prayer={p}
              first={i === 0 && contactPrayers.length === 0}
              contacts={myContacts}
              onUpdate={(id, patch) => uid && updatePersonalPrayer(uid, id, patch)}
              onDelete={(id) => uid && deletePersonalPrayer(uid, id)}
              onOpenContact={openContact}
            />
          ))}
          {contactPrayers.length === 0 && activePersonalPrayers.length === 0 && (
            <p className="text-sm text-on-surface-variant py-4">
              No prayers yet — add the first thing on your heart below.
            </p>
          )}
          <AddPersonalPrayer
            contacts={myContacts}
            onAdd={(title, contactId) => uid && addPersonalPrayer(uid, { title, contactId })}
          />
        </div>
      </section>

      <p className="mt-14 text-sm text-on-surface-variant italic">
        Small, steady faithfulness is the whole job.
      </p>
    </PageContainer>
  );
}
