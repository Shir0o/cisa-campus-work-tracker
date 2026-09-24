// Visits — a record of having gone to where someone lives, with a second
// reading: "Who we haven't seen".
//
// Logged after the fact, full-timers only, usually a pair, sometimes several
// people at once. The page reads as a small history of going out, with a
// toggle up top switching to the roster of the homes we go round to — absence
// into care, the same shape as Gatherings. The source of truth for a visit
// lives here; the person's card shows it as an interaction and links back.
// The page opens on the reading, and never remembers which one was last used.
import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { House, Plus } from 'lucide-react';
import { db, handleFirestoreError, logActivity, OperationType } from '../lib/firebase';
import { deleteVisit, groupVisits, subscribeVisits, visitStats } from '../lib/visits';
import { subscribeHomes } from '../lib/homes';
import { isRealPerson } from '../lib/permissions';
import { useAuth } from '../components/AuthProvider';
import { useMediaQuery } from '../lib/useMediaQuery';
import { usePreserveScroll } from '../lib/usePreserveScroll';
import PageContainer from '../components/layout/PageContainer';
import { useLanguage } from '../components/LanguageProvider';
import { DataLoadError } from '../components/ui/DataLoadError';
import ContactDetailsModal from '../components/modals/ContactDetailsModal';
import LogVisitModal from '../components/modals/LogVisitModal';
import HomesModal from '../components/modals/HomesModal';
import WhoWeHaventSeen from '../components/visits/WhoWeHaventSeen';
import { VisitGroup } from '../components/visits/VisitCard';
import VisitsMobile from './VisitsMobile';
import type { AppUser, Contact, Home, Visit } from '../types';

export default function Visits() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const isMobile = useMediaQuery('(max-width: 768px)');

  const [visits, setVisits] = useState<Visit[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [staff, setStaff] = useState<AppUser[]>([]);
  const [homes, setHomes] = useState<Home[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [tab, setTab] = useState<'reading' | 'log'>('reading');
  const [openId, setOpenId] = useState<string | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [homesOpen, setHomesOpen] = useState(false);
  const [editing, setEditing] = useState<Visit | null>(null);
  const [seedContactId, setSeedContactId] = useState<string | null>(null);
  const [seedHomeId, setSeedHomeId] = useState<string | null>(null);
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

    const unsubscribeHomes = subscribeHomes(
      (list) => setHomes(list),
      (e) => onLoadError(e, 'homes'),
    );

    return () => {
      unsubscribeContacts();
      unsubscribeStaff();
      unsubscribeVisits();
      unsubscribeHomes();
    };
  }, []);

  const groups = useMemo(() => groupVisits(visits), [visits]);
  const stats = useMemo(() => visitStats(visits), [visits]);

  const openLog = (contactId?: string) => {
    setSeedContactId(contactId ?? null);
    setSeedHomeId(null);
    setLogOpen(true);
  };

  const openLogForHome = (home: Home) => {
    setSeedHomeId(home.id);
    setSeedContactId(null);
    setLogOpen(true);
  };

  const closeLog = () => {
    setLogOpen(false);
    setSeedContactId(null);
    setSeedHomeId(null);
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
        homes={homes}
        initialContactId={seedContactId}
        initialHomeId={seedHomeId}
      />
      <LogVisitModal
        isOpen={editing !== null}
        onClose={() => setEditing(null)}
        contacts={contacts}
        staff={staff}
        homes={homes}
        visit={editing}
      />
      <HomesModal
        isOpen={homesOpen}
        onClose={() => setHomesOpen(false)}
        homes={homes}
        contacts={contacts}
        visits={visits}
        onHomeSaved={() => setHomesOpen(false)}
      />
    </>
  );

  if (error) {
    return <DataLoadError label={error} />;
  }

  const groupProps = {
    openId,
    setOpenId,
    onOpenContact: openContact,
    onEdit: setEditing,
    onRemove: removeVisit,
    uid: user?.uid,
  };

  const toggle = (
    <div className="flex items-center gap-1 p-1 rounded-full bg-surface-container-low border border-outline-variant">
      <button
        onClick={() => setTab('reading')}
        aria-pressed={tab === 'reading'}
        className={tab === 'reading'
          ? 'px-4 h-8 rounded-full bg-primary text-on-primary text-sm font-medium'
          : 'px-4 h-8 rounded-full text-on-surface-variant text-sm hover:text-on-surface transition-colors'}
      >
        {t('visits.who_we_havent_seen')}
      </button>
      <button
        onClick={() => setTab('log')}
        aria-pressed={tab === 'log'}
        className={tab === 'log'
          ? 'px-4 h-8 rounded-full bg-primary text-on-primary text-sm font-medium'
          : 'px-4 h-8 rounded-full text-on-surface-variant text-sm hover:text-on-surface transition-colors'}
      >
        {t('visits.the_log')}
      </button>
    </div>
  );

  if (isMobile) {
    return (
      <>
        <VisitsMobile
          visits={visits}
          groups={groups}
          stats={stats}
          homes={homes}
          contacts={contacts}
          tab={tab}
          toggle={toggle}
          openId={openId}
          setOpenId={setOpenId}
          onOpenContact={openContact}
          onLog={openLog}
          onLogForHome={openLogForHome}
          onEdit={setEditing}
          onRemove={removeVisit}
          onManageHomes={() => setHomesOpen(true)}
        />
        {modals}
      </>
    );
  }

  return (
    <PageContainer variant="wide">
      <header className="flex items-start gap-6 flex-wrap mb-2">
        <div className="min-w-0">
          <div className="font-sans text-[11px]   text-on-surface-variant mb-2">
            {t('visits.where_weve_been')}
          </div>
          <h1 className="font-serif page-title text-on-surface">{t('visits.title')}</h1>
          <p className="text-base text-on-surface-variant leading-relaxed mt-2 max-w-2xl">
            {tab === 'log' && groups.thisWeek.length > 0 ? (
              <>
                {t('visits.weve_been_round_to')}{' '}
                <span className="text-on-surface font-semibold">
                  {groups.thisWeek.length} {groups.thisWeek.length === 1 ? t('visits.home') : t('visits.homes')}
                </span>{' '}
                {t('visits.this_week')}
                {groups.lastWeek.length > 0 && <>, {groups.lastWeek.length} {t('visits.last_week')}</>}.
              </>
            ) : (
              <>
                {t('visits.going_to_where')}
              </>
            )}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-3 shrink-0">
          {toggle}
          <button
            onClick={() => openLog()}
            className="inline-flex items-center gap-2 px-5 h-10 rounded-full bg-primary text-on-primary text-sm font-medium shrink-0"
          >
            <Plus className="w-4 h-4" /> {t('visits.log_a_visit')}
          </button>
        </div>
      </header>

      {loading ? (
        <div className="text-center py-16 text-on-surface-variant">{t('visits.gathering')}</div>
      ) : tab === 'reading' ? (
        <div className="mt-4">
          <WhoWeHaventSeen
            homes={homes}
            contacts={contacts}
            visits={visits}
            onLogVisit={openLogForHome}
            onManageHomes={() => setHomesOpen(true)}
          />
        </div>
      ) : (
        <>
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