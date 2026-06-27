import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../../lib/firebase";
import { useAuth } from "../../components/AuthProvider";
import { Contact, PrayerRecord, Stage } from "../../types";
import { Skeleton } from "../../components/ui/Skeleton";
import { DataLoadError } from "../../components/ui/DataLoadError";
import ContactDetailsModal from "../../components/modals/ContactDetailsModal";
import PageContainer from "../../components/layout/PageContainer";
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

// Trainee landing: the students in your care + the prayers you're carrying.
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

  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);

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

  // Prayers you're carrying — shared prayers on your people (not archived) +
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
  const openContact = (c: Contact | undefined | null) => {
    if (!c) return;
    setSelectedContact(c);
    setIsDetailsModalOpen(true);
  };

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
          You're walking with{" "}
          <b className="text-on-surface font-semibold">
            {myPeople.length} {myPeople.length === 1 ? "student" : "students"}
          </b>{" "}
          this season. Here's your circle, and what you're carrying in prayer.
        </p>
      </header>

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
            {myPeople.map(({ contact, days, note }) => (
              <ReachCard
                key={contact.id}
                contact={contact}
                days={days}
                note={note}
                stages={stages}
                onOpen={() => openContact(contact)}
                onMessage={() => openMessage(contact.phone)}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-on-surface-variant py-2">
            No one's in your care yet — add a contact to gather your circle here.
          </p>
        )}
      </section>

      {/* ── Prayers you're carrying ── */}
      <section className="mt-12">
        <SectionHead
          title="Prayers you're carrying"
          sub="Yours to hold this week — for your people, and just between you and God."
        />
        <div className={cardClass}>
          {contactPrayers.map((p, i) => (
            <TeamPrayerRow
              key={p.id}
              prayer={p}
              contact={contactById(p.contactId)}
              first={i === 0}
              onUpdateStatus={(id, status) =>
                updatePrayerStatus(id, status, { uid, name: user?.displayName })
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

      <ContactDetailsModal
        isOpen={isDetailsModalOpen}
        onClose={() => setIsDetailsModalOpen(false)}
        contact={selectedContact}
      />
    </PageContainer>
  );
}
