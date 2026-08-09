// Visits — a record of having gone to where someone lives.
//
// Logged after the fact, full-timers only, usually a pair, sometimes several
// people at once. The page reads as a small history of going out, led by the
// homes we haven't been round to in a while — absence into care, the same shape
// as Gatherings. The source of truth for a visit lives here; the person's card
// shows it as an interaction and links back.
import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { House, Plus } from 'lucide-react';
import { db, handleFirestoreError, logActivity, OperationType } from '../lib/firebase';
import { deleteVisit, groupVisits, initialsOf, overdueVisits, subscribeVisits, visitStats } from '../lib/visits';
import { useAuth } from '../components/AuthProvider';
import { useMediaQuery } from '../lib/useMediaQuery';
import PageContainer from '../components/layout/PageContainer';
import { DataLoadError } from '../components/ui/DataLoadError';
import ContactDetailsModal from '../components/modals/ContactDetailsModal';
import LogVisitModal from '../components/modals/LogVisitModal';
import { VisitGroup } from '../components/visits/VisitCard';
import VisitsMobile from './VisitsMobile';
import type { AppUser, Contact, Visit } from '../types';

export default function Visits() {
  useAuth();
  const isMobile = useMediaQuery('(max-width: 768px)');

  const [visits, setVisits] = useState<Visit[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [staff, setStaff] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [openId, setOpenId] = useState<string | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [editing, setEditing] = useState<Visit | null>(null);
  const [seedContactId, setSeedContactId] = useState<string | null>(null);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);

  useEffect(() => {
    // Clear state before handleFirestoreError (which throws), so the skeleton always
    // clears and the failure surfaces instead of a stuck/partial view.
    const onLoadError = (e: unknown, path: string) => {
      setError('visits');
      setLoading(false);
      handleFirestoreError(e, OperationType.LIST, path);
    };

    const unsubscribeContacts = onSnapshot(
      query(collection(db, 'contacts')),
      (snapshot) => setContacts(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as Contact[]),
      (e) => onLoadError(e, 'contacts'),
    );

    // Only full-timers go on visits, so only full-timers are offered as "who went".
    const unsubscribeStaff = onSnapshot(
      query(collection(db, 'users')),
      (snapshot) =>
        setStaff(
          snapshot.docs
            .map((d) => ({ uid: d.id, ...d.data() }) as AppUser)
            .filter((u) => u.role === 'admin' && u.approved !== false),
        ),
      (e) => onLoadError(e, 'users'),
    );

    const unsubscribeVisits = subscribeVisits(
      (list) => {
        setVisits(list);
        setLoading(false);
      },
      (e) => onLoadError(e, 'visits'),
    );

    return () => {
      unsubscribeContacts();
      unsubscribeStaff();
      unsubscribeVisits();
    };
  }, []);

  const groups = useMemo(() => groupVisits(visits), [visits]);
  const overdue = useMemo(() => overdueVisits(visits, contacts), [visits, contacts]);
  const stats = useMemo(() => visitStats(visits), [visits]);

  const openLog = (contactId?: string) => {
    setSeedContactId(contactId ?? null);
    setLogOpen(true);
  };

  const closeLog = () => {
    setLogOpen(false);
    setSeedContactId(null);
  };

  const openContact = (contactId: string) => {
    const contact = contacts.find((c) => c.id === contactId);
    if (contact) setSelectedContact(contact);
  };

  const removeVisit = async (visit: Visit) => {
    setOpenId(null);
    try {
      await deleteVisit(visit);
      void logActivity({
        action: 'removed a visit to',
        targetType: 'contact',
        targetId: visit.contactIds[0],
        targetName: (visit.contactNames || []).join(', '),
        type: 'event',
        description: visit.where || 'home',
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `visits/${visit.id}`);
    }
  };

  const modals = (
    <>
      <LogVisitModal
        isOpen={logOpen}
        onClose={closeLog}
        contacts={contacts}
        staff={staff}
        initialContactId={seedContactId}
      />
      <LogVisitModal
        isOpen={editing !== null}
        onClose={() => setEditing(null)}
        contacts={contacts}
        staff={staff}
        visit={editing}
      />
      <ContactDetailsModal
        isOpen={selectedContact !== null}
        onClose={() => setSelectedContact(null)}
        contact={selectedContact}
      />
    </>
  );

  if (isMobile && !loading && !error) {
    return (
      <>
        <VisitsMobile
          visits={visits}
          groups={groups}
          overdue={overdue}
          stats={stats}
          openId={openId}
          setOpenId={setOpenId}
          onOpenContact={openContact}
          onLog={openLog}
          onEdit={setEditing}
          onRemove={removeVisit}
        />
        {modals}
      </>
    );
  }

  const groupProps = {
    openId,
    setOpenId,
    onOpenContact: openContact,
    onEdit: setEditing,
    onRemove: removeVisit,
  };

  return (
    <PageContainer variant="wide">
      <header className="flex items-start gap-6 flex-wrap mb-2">
        <div className="min-w-0">
          <div className="font-sans text-[11px] uppercase tracking-[0.08em] text-on-surface-variant mb-2">
            Where we've been
          </div>
          <h1 className="font-serif page-title text-on-surface">Visits</h1>
          <p className="text-base text-on-surface-variant leading-relaxed mt-2 max-w-2xl">
            {groups.thisWeek.length > 0 ? (
              <>
                We've been round to{' '}
                <span className="text-on-surface font-medium">
                  {groups.thisWeek.length} {groups.thisWeek.length === 1 ? 'home' : 'homes'}
                </span>{' '}
                this week
                {groups.lastWeek.length > 0 && <>, {groups.lastWeek.length} last week</>}. Going to where someone lives
                says something a coffee can't.
              </>
            ) : (
              <>
                No visits logged this week yet. Going to where someone lives says something a coffee can't — write one
                down while you still remember the room.
              </>
            )}
          </p>
        </div>
        <button
          onClick={() => openLog()}
          className="ml-auto inline-flex items-center gap-2 px-5 h-10 rounded-full bg-primary text-on-primary text-sm font-medium shrink-0"
        >
          <Plus className="w-4 h-4" /> Log a visit
        </button>
      </header>

      {error ? (
        <DataLoadError label={error} />
      ) : loading ? (
        <div className="text-center py-16 text-on-surface-variant">Gathering where we've been…</div>
      ) : (
        <>
          {overdue.length > 0 && (
            <section className="mt-10">
              <div className="flex items-baseline gap-4 flex-wrap mb-4">
                <h2 className="font-serif text-[23px] text-on-surface">We haven't been round in a while</h2>
                <span className="text-sm text-on-surface-variant">
                  You've been to theirs before — it's been a few weeks.
                </span>
              </div>
              <div className="flex flex-col gap-3">
                {overdue.map(({ contact, visit, daysAgo }) => (
                  <div
                    key={contact.id}
                    className="flex items-center gap-4 flex-wrap p-5 rounded-2xl bg-surface border border-outline-variant"
                  >
                    <span className="w-10 h-10 rounded-full bg-primary/10 text-primary grid place-items-center text-xs font-bold shrink-0">
                      {initialsOf(contact.name)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[17px] font-semibold text-on-surface">{contact.name}</div>
                      <p className="text-sm text-on-surface-variant leading-relaxed mt-1 max-w-2xl">
                        Last visit {daysAgo} days ago · {visit.where || contact.location}
                        {visit.followUp && (
                          <> · you said you'd {visit.followUp.charAt(0).toLowerCase() + visit.followUp.slice(1)}</>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => openContact(contact.id)}
                        className="px-4 h-9 rounded-full border border-outline-variant text-sm text-on-surface hover:border-primary/30 transition-colors"
                      >
                        Open
                      </button>
                      <button
                        onClick={() => openLog(contact.id)}
                        className="px-4 h-9 rounded-full bg-primary text-on-primary text-sm font-medium"
                      >
                        Log a visit
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <VisitGroup title="This week" sub="Tap a visit to read it back." list={groups.thisWeek} {...groupProps} />
          <VisitGroup title="Last week" list={groups.lastWeek} {...groupProps} />
          <VisitGroup title="Earlier" list={groups.earlier} {...groupProps} />

          {visits.length === 0 && (
            <div className="mt-10 p-8 rounded-2xl bg-surface border border-outline-variant text-center">
              <House className="w-7 h-7 text-on-surface-variant mx-auto mb-4" />
              <p className="text-base text-on-surface-variant leading-relaxed max-w-lg mx-auto">
                Nothing here yet. A visit gets written down after you've been — who you saw, where, and what you'd want
                to remember in a month.
              </p>
              <button
                onClick={() => openLog()}
                className="mt-5 inline-flex items-center gap-2 px-5 h-10 rounded-full bg-primary text-on-primary text-sm font-medium"
              >
                <Plus className="w-4 h-4" /> Log a visit
              </button>
            </div>
          )}

          <footer className="mt-12 pt-6 border-t border-outline-variant flex items-end gap-10 flex-wrap">
            {[
              { n: stats.visits, l: 'visits' },
              { n: stats.peopleSeen, l: "people we've sat with" },
              { n: stats.wentOut, l: 'of us have gone out' },
            ].map((f) => (
              <div key={f.l} className="flex flex-col gap-1">
                <span className="font-serif text-2xl leading-none text-on-surface">{f.n}</span>
                <span className="text-xs text-on-surface-variant">{f.l}</span>
              </div>
            ))}
            <span className="ml-auto text-sm italic text-on-surface-variant">
              Counted only so we notice whose door we haven't knocked on.
            </span>
          </footer>
        </>
      )}

      {modals}
    </PageContainer>
  );
}
