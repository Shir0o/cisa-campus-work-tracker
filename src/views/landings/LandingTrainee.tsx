import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { HelpCircle, Bell, Check, RotateCcw } from "lucide-react";
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
import { isFullTimer } from "../../lib/walking";
import { subscribeTiedThreads, type ThreadMessageWithContact } from "../../lib/threads";
import { traineeWaitingItems, type InboxItem } from "../../lib/inbox";
import { useInboxReads } from "../../lib/inboxReads";
import { subscribeTiedSubcollection } from "../../lib/contactQueries";
import FirstRunCard from "../../components/landing/FirstRunCard";
import AskTheTeam from "../../components/landing/AskTheTeam";
import { useLayout } from "../../App";
import { useI18n } from "../../components/LanguageProvider";

// One thing the full-timer has put on the trainee's plate: a nudge to follow up
// or a question awaiting a reply. "Open" jumps into the contact's conversation.
function WaitingRow({
  item,
  contactName,
  writerFirst,
  read,
  onOpen,
  onHandled,
}: {
  item: InboxItem;
  contactName: string;
  writerFirst: string;
  read: boolean;
  onOpen: () => void;
  onHandled: () => void;
}) {
  const { t } = useI18n();
  const isNudge = item.kind === "nudge";
  const Icon = isNudge ? Bell : HelpCircle;
  const cls = isNudge ? "text-warning bg-warning/10" : "text-stage-amber bg-stage-amber-soft";
  const title = isNudge
    ? `${writerFirst} nudged a follow-up about ${contactName}`
    : `${writerFirst} asked about ${contactName}`;

  return (
    <div
      className={cn(
        "bg-surface rounded-xl border p-5 transition-colors",
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
              <span className="flex-none mt-1.5 w-[7px] h-[7px] rounded-full bg-primary" role="img" aria-label={t("ask.unread", "Unread")} />
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={onOpen}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-[14px] bg-primary text-on-primary text-xs font-medium hover:opacity-90 transition-opacity"
            >
              Open {contactName.split(/\s+/)[0]}
            </button>
            {/* Names the action it performs; the state itself shows in the card's
                border and the unread dot. */}
            <button
              onClick={onHandled}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[14px] border border-outline-variant text-on-surface-variant text-xs font-medium hover:bg-surface-variant transition-colors"
            >
              {read ? (
                <>
                  <RotateCcw className="w-3.5 h-3.5" /> Reopen
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" /> Mark handled
                </>
              )}
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
  const { user, effectiveUserId, effectiveUserName } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const { openLogInteraction, openNewContact } = useLayout();
  const uid = effectiveUserId || user?.uid;
  const firstName = (effectiveUserName || user?.displayName || user?.email)?.split(" ")[0] || "friend";

  // Stamped with the reader it was read for, so a persona switch discards the
  // previous identity's people during render rather than showing them until the
  // new subscription lands (#1039).
  const [contactsRead, setContactsRead] = useState<{ reader: string; list: Contact[] } | null>(null);
  const contacts = useMemo(
    () => (contactsRead?.reader === uid ? contactsRead.list : []),
    [contactsRead, uid],
  );
  const [stages, setStages] = useState<Stage[]>([]);
  const [prayers, setPrayers] = useState<PrayerRecord[]>([]);
  const [personalPrayers, setPersonalPrayers] = useState<PersonalPrayer[]>([]);
  const loading = contactsRead?.reader !== uid;
  const [errorRead, setErrorRead] = useState<{ reader: string; label: string } | null>(null);
  const error = errorRead?.reader === uid ? errorRead.label : null;

  const [threads, setThreads] = useState<ThreadMessageWithContact[]>([]);
  // How the thread read last ended, stamped with its reader so a persona switch
  // drops it; bumping the attempt resubscribes.
  const [threadsRead, setThreadsRead] = useState<{ reader: string; ok: boolean } | null>(null);
  const threadsLoaded = threadsRead?.reader === uid && threadsRead.ok;
  const threadsFailed = threadsRead?.reader === uid && !threadsRead.ok;
  const [threadsAttempt, setThreadsAttempt] = useState(0);
  // How many conversations this reader has logged, for the first-run checklist.
  // Stamped with the reader so a persona switch drops the previous count.
  const [loggedRead, setLoggedRead] = useState<{ reader: string; count: number } | null>(null);
  const loggedCount = loggedRead?.reader === uid ? loggedRead.count : 0;
  const [selection, setSelection] = useState<{ reader: string; contact: Contact } | null>(null);
  const selectedContact = selection?.reader === uid ? selection.contact : null;
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [initialTab, setInitialTab] = useState<"thread" | undefined>(undefined);
  const [initialInteractionId, setInitialInteractionId] = useState<string | null>(null);
  const inbox = useInboxReads();

  // Keyed on the reader, not on mount: "See it as they do" swaps the effective
  // identity while the page stays up, and a subscription opened once would keep
  // showing the previous persona's people (#1039). No identity yet means no
  // query at all, rather than one carrying an undefined uid.
  useEffect(() => {
    if (!uid) return;
    // Stamped with the reader, like the read itself: a refused read belongs to
    // the persona it was refused for and must not pin the error screen over the
    // next one (#1039).
    const onLoadError = (e: unknown, path: string) => {
      setErrorRead({ reader: uid, label: "your home" });
      handleFirestoreError(e, OperationType.LIST, path);
    };
    const unsubContacts = onSnapshot(
      // Trainee-only surface: scope the read to the reader's own ties so the
      // tightened rules (#1024 phase 4) accept the query.
      query(collection(db, "contacts"), where("visibleTo", "array-contains", uid)),
      (snap) => {
        setContactsRead({
          reader: uid,
          list: snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Contact[],
        });
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
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    return subscribePersonalPrayers(uid, setPersonalPrayers);
  }, [uid]);

  // Thread messages on the people this trainee can see — powers "What's
  // waiting on you" and the weighed-in status. The rules deny a Trainee the
  // threads collection group (it spans people outside their visibleTo), so this
  // reads each visible person's. A failed read shows one inline line with a
  // Retry in place of the section, so it never reads as "nothing waiting" and
  // never takes the rest of the home down with it.
  useEffect(() => {
    if (!uid) return;
    return subscribeTiedThreads(
      uid,
      (messages) => {
        setThreadsRead({ reader: uid, ok: true });
        // Trainees never see Full-timer-only Discussion scope.
        setThreads(messages.filter((m) => m.scope !== "team"));
      },
      () => setThreadsRead({ reader: uid, ok: false }),
    );
  }, [uid, threadsAttempt]);

  // Interactions on the people this trainee can see, narrowed to the ones they
  // wrote: the first-run "write up a conversation" step reads this, not notes.
  // A failed read leaves the step unticked.
  useEffect(() => {
    if (!uid) return;
    return subscribeTiedSubcollection(
      uid,
      "interactions",
      (docs) =>
        setLoggedRead({
          reader: uid,
          count: docs.filter((d) => (d.data() as { userId?: string }).userId === uid).length,
        }),
      () => setLoggedRead({ reader: uid, count: 0 }),
    );
  }, [uid]);

  // Your people — the contacts you created or co-created, longest-since-seen first.
  const myPeople = useMemo(() => {
    return contacts
      .filter((c) => uid && (c.createdBy === uid || (c.coCreators && c.coCreators.includes(uid))))
      .map((c) => {
        const contactLastMs = parseMs(c.lastContactedDate) ?? parseMs(c.lastSeen);
        const ms = Number.isFinite(contactLastMs) && (contactLastMs as number) > 0 ? (contactLastMs as number) : parseMs(c.createdAt);
        const days = ms == null ? Infinity : daysSince(ms);
        return { contact: c, days, note: c.notes || "" };
      })
      .sort((a, b) => b.days - a.days);
  }, [contacts, uid]);
  const myIds = useMemo(() => new Set(myPeople.map((p) => p.contact.id)), [myPeople]);

  // Prayers you're holding — shared prayers on your people that are still open
  // (not answered or archived) + your own private personal prayers. #464.
  const contactPrayers = useMemo(
    () =>
      prayers
        .filter(
          (p) =>
            p.contactId &&
            myIds.has(p.contactId) &&
            p.status !== "answered" &&
            p.status !== "unanswered",
        )
        .sort((a, b) => (parseMs(a.date) ?? 0) - (parseMs(b.date) ?? 0)),
    [prayers, myIds],
  );
  const activePersonalPrayers = useMemo(
    () =>
      personalPrayers.filter(
        (p) => p.status !== "answered" && p.status !== "archived",
      ),
    [personalPrayers],
  );

  const myContacts = useMemo(() => myPeople.map((p) => p.contact), [myPeople]);
  const contactById = (id?: string) => contacts.find((c) => c.id === id);

  // What's waiting on you — nudges/questions from any full-timer, newest-first.
  // No pairing (#549): the writer's name is resolved per message, not one
  // assigned full-timer.
  const nameByUid = useMemo(() => {
    const m: Record<string, string> = {};
    for (const t of threads) if (t.from && t.fromName) m[t.from] ??= t.fromName;
    return m;
  }, [threads]);
  const firstOf = (uid?: string | null) => (nameByUid[uid ?? ""] || "The team").split(/\s+/)[0];

  const waiting = useMemo(
    () => (uid ? traineeWaitingItems(uid, threads, myIds) : []),
    [uid, threads, myIds],
  );
  const waitingUnread = waiting.filter((it) => !inbox.isRead(uid ?? "", it.id)).length;

  // The "weighed in" / "Awaiting a look" status is gone (#813). It measured
  // whether a Full-timer had POSTED, while promising that looking was what was
  // being counted — and its other half read `contact.reviewed`, a field with
  // four readers and no writer, so it could never resolve. Reviewing is now
  // explicitly private: a Trainee learns nothing about a Full-timer's attention
  // unless the Full-timer deliberately sends something, which already shows up
  // as a question, a note or an encouragement.

  const openContact = (
    c: Contact | undefined | null,
    opts?: { tab?: "thread"; interactionId?: string | null },
  ) => {
    if (!c || !uid) return;
    setSelection({ reader: uid, contact: c });
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
          setSelection(null);
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
          {waiting.length > 0
            ? "Here's what the team's flagged for you, the people you've brought in, and what we're praying for."
            : "Here's your circle, and what we're praying for."
          }
        </p>
      </header>

      <FirstRunCard
        role="trainee"
        userId={uid}
        context={{
          contactsCount: myPeople.length,
          interactionsCount: loggedCount,
          messagesCount: threads.filter((m) => m.from === uid).length,
          prayersCount:
            personalPrayers.length + prayers.filter((p) => p.updatedBy === uid).length,
          // A follow-up ask this reader closed; an asker retracting their own
          // ask (closedBy === from) is not a follow-up.
          todosCompletedCount: threads.filter((m) => m.closedBy === uid && m.from !== uid).length,
        }}
        className="mt-8"
      />

      {/* ── What's waiting on you — your full-timer's nudges & questions ── */}
      {threadsFailed ? (
        <p className="mt-12 text-sm text-on-surface-variant">
          Couldn't load what's waiting on you.{" "}
          <button
            type="button"
            onClick={() => {
              setThreadsRead(null);
              setThreadsAttempt((n) => n + 1);
            }}
            className="font-semibold text-primary hover:underline cursor-pointer"
          >
            Retry
          </button>
        </p>
      ) : waiting.length === 0 ? (
        threadsLoaded && (
          <p className="mt-12 text-sm text-on-surface-variant">{t("ask.nothing_waiting", "Nothing's waiting on you.")}</p>
        )
      ) : (
        <section className="mt-12">
          <SectionHead
            title="What's waiting on you"
            sub="A word from the team — things to pick up when you can."
            action={
              waitingUnread > 0 ? (
                <span className="text-xs font-semibold text-accent bg-accent-soft rounded-full px-2.5 py-1">
                  <span aria-hidden>{waitingUnread}</span>
                  <span className="sr-only">{waitingUnread} unread</span>
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
                  writerFirst={firstOf(item.by)}
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
            {myPeople.slice(0, 5).map(({ contact, days, note }) => (
              <ReachCard
                key={contact.id}
                contact={contact}
                days={days}
                note={note}
                stages={stages}
                onOpen={() => openContact(contact)}
                onMessage={() => openMessage(contact.phone)}
                onLog={() => openLogInteraction(contact.id)}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-on-surface-variant py-2">
            No one's in your care yet —{" "}
            <button
              type="button"
              onClick={() => openNewContact()}
              className="font-semibold text-primary hover:underline cursor-pointer"
            >
              add a contact
            </button>{" "}
            to gather your circle here.
          </p>
        )}
      </section>

      {/* ── Prayers we're praying for ── */}
      <section className="mt-12">
        <SectionHead
          title="Prayers we're praying for"
          sub="Yours to carry this week — for your people, and just between you and God."
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

      {/* ── Ask the team (#545) — questions that aren't about a person ── */}
      <AskTheTeam meUid={uid} />
    </PageContainer>
  );
}
