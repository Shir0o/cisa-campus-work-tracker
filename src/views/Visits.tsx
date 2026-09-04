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
import { isRealPerson } from '../lib/permissions';
import { useAuth } from '../components/AuthProvider';
import { useMediaQuery } from '../lib/useMediaQuery';
import { usePreserveScroll } from '../lib/usePreserveScroll';
import PageContainer from '../components/layout/PageContainer';
import { useLanguage } from '../components/LanguageProvider';
import { DataLoadError } from '../components/ui/DataLoadError';
import ContactDetailsModal from '../components/modals/ContactDetailsModal';
import LogVisitModal from '../components/modals/LogVisitModal';
import { VisitGroup } from '../components/visits/VisitCard';
import VisitsMobile from './VisitsMobile';
import type { AppUser, Contact, Visit } from '../types';

export default function Visits() {
  const { t } = useLanguage();
  const { user } = useAuth();
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
            .filter((u) => u.role === 'admin' && u.approved !== false && isRealPerson(u)),
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

  // People detail is a full page (the design's ContactDetail), not a popup.
  usePreserveScroll(!!selectedContact);
  if (selectedContact) {
    return (
      <ContactDetailsModal
        isOpen
        onClose={() => setSelectedContact(null)}
        contact={selectedContact}
      />
    );
  }

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
    </>
  );

  if (error) {
    return <DataLoadError label={error} />;
  }

  if (isMobile) {
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
    uid: user?.uid,
  };

  return (
    <PageContainer variant="wide">
      <header className="flex items-start gap-6 flex-wrap mb-2">
        <div className="min-w-0">
          <div className="font-sans text-[11px]   text-on-surface-variant mb-2">
            {t('visits.where_weve_been')}
          </div>
          <h1 className="font-serif page-title text-on-surface">{t('visits.title')}</h1>
          <p className="text-base text-on-surface-variant leading-relaxed mt-2 max-w-2xl">
            {groups.thisWeek.length > 0 ? (
              <>
                {t('visits.weve_been_round_to')}{' '}
                <span className="text-on-surface font-semibold">
                  {groups.thisWeek.length} {groups.thisWeek.length === 1 ? t('visits.home') : t('visits.homes')}
                </span>{' '}
                {t('visits.this_week')}
                {groups.lastWeek.length > 0 && <>, {groups.lastWeek.length} {t('visits.last_week')}</>}. {t('visits.going_to_where')}
              </>
            ) : (
              <>
                {t('visits.no_visits_this_week')}
              </>
            )}
          </p>
        </div>
        <button
          onClick={() => openLog()}
          className="ml-auto inline-flex items-center gap-2 px-5 h-10 rounded-full bg-primary text-on-primary text-sm font-medium shrink-0"
        >
          <Plus className="w-4 h-4" /> {t('visits.log_a_visit')}
        </button>
      </header>

      {loading ? (
        <div className="text-center py-16 text-on-surface-variant">{t('visits.gathering')}</div>
      ) : (
        <>
          {overdue.length > 0 && (
            <section className="mt-10">
              <div className="flex items-baseline gap-4 flex-wrap mb-4">
                <h2 className="font-serif text-[23px] text-on-surface">{t('visits.havent_been_round')}</h2>
                <span className="text-sm text-on-surface-variant">
                  {t('visits.youve_been_to_theirs')}
                </span>
              </div>
              {/* The design's `.reach`: a two-column row that lifts on hover. */}
              <div className="flex flex-col gap-3">
                {overdue.map(({ contact, visit, daysAgo }) => (
                  <div
                    key={contact.id}
                    className="grid grid-cols-1 sm:grid-cols-[1fr_auto] items-center gap-[18px] px-5 py-[18px] rounded-[14px] bg-surface border border-outline-variant  transition-[border-color,transform,box-shadow] duration-150 hover:border-primary/30 hover:-translate-y-px "
                  >
                    <div className="flex items-start gap-4 min-w-0">
                      <span className="w-10 h-10 rounded-full bg-primary/10 text-accent grid place-items-center text-xs font-semibold shrink-0">
                        {initialsOf(contact.name)}
                      </span>
                      <div className="min-w-0">
                        <div className="text-[17px] font-semibold text-on-surface">{contact.name}</div>
                        <p className="text-sm text-on-surface-variant leading-relaxed mt-1 max-w-2xl">
                          {/* TODO(#730 follow-up): the previous fallback was `contact.location`,
                              which has been retired from the contact model. For now we surface
                              a "no location noted" label when the visit itself has no `where`;
                              a real follow-up should land a `visitAddress` field on the Visit
                              doc (or move `where` to be required at visit-log time). */}
                          {t('visits.last_visit_days_ago').replace('{n}', String(daysAgo))} · {visit.where || t('visits.no_location_noted')}
                          {visit.followUp && (
                            <>
                              {' · '}
                              {t('visits.you_said_youd').replace(
                                '{followUp}',
                                visit.followUp.charAt(0).toLowerCase() + visit.followUp.slice(1),
                              )}
                            </>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => openContact(contact.id)}
                        className="px-4 h-9 rounded-full border border-outline-variant text-sm text-on-surface hover:border-primary/30 transition-colors"
                      >
                        {t('visits.open')}
                      </button>
                      <button
                        onClick={() => openLog(contact.id)}
                        className="px-4 h-9 rounded-full bg-primary text-on-primary text-sm font-medium"
                      >
                        {t('visits.log_a_visit')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <VisitGroup title={t('visits.this_week_group')} sub={t('visits.tap_a_visit')} list={groups.thisWeek} {...groupProps} />
          <VisitGroup title={t('visits.last_week_group')} list={groups.lastWeek} {...groupProps} />
          <VisitGroup title={t('visits.earlier')} list={groups.earlier} {...groupProps} />

          {visits.length === 0 && (
            <div className="mt-10 p-8 rounded-3xl bg-surface border border-outline-variant text-center">
              <House className="w-7 h-7 text-on-surface-variant mx-auto mb-4" />
              <p className="text-base text-on-surface-variant leading-relaxed max-w-lg mx-auto">
                {t('visits.nothing_here_yet')}
              </p>
              <button
                onClick={() => openLog()}
                className="mt-5 inline-flex items-center gap-2 px-5 h-10 rounded-full bg-primary text-on-primary text-sm font-medium"
              >
                <Plus className="w-4 h-4" /> {t('visits.log_a_visit')}
              </button>
            </div>
          )}

          <footer className="mt-12 bg-surface rounded-3xl border border-outline-variant/60 px-6 py-5 flex items-end gap-10 flex-wrap">
            {[
              { n: stats.visits, l: t('visits.visits_count') },
              { n: stats.peopleSeen, l: t('visits.people_weve_sat_with') },
              { n: stats.wentOut, l: t('visits.of_us_have_gone_out') },
            ].map((f) => (
              <div key={f.l} className="flex flex-col gap-1">
                <span className="text-2xl leading-none text-on-surface">{f.n}</span>
                <span className="text-xs text-on-surface-variant">{f.l}</span>
              </div>
            ))}
            <span className="ml-auto text-sm italic text-on-surface-variant">
              {t('visits.counted_notice')}
            </span>
          </footer>
        </>
      )}

      {modals}
    </PageContainer>
  );
}
