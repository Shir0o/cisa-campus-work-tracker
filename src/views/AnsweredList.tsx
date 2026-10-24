import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, onSnapshot, orderBy } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { Heart, Image as ImageIcon } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Contact, PrayerRecord } from '../types';
import { cn } from '../lib/utils';
import PageContainer from '../components/layout/PageContainer';
import { DataLoadError } from '../components/ui/DataLoadError';
import ContactDetailsModal from '../components/modals/ContactDetailsModal';
import { useLanguage } from '../components/LanguageProvider';
import { usePreserveScroll } from '../lib/usePreserveScroll';
import { Translate } from '../components/Translate';

const TONES: ('accent' | 'violet' | 'amber' | 'sage')[] = ['accent', 'violet', 'amber', 'sage'];
function getToneForId(id: string): 'accent' | 'violet' | 'amber' | 'sage' {
  let sum = 0;
  for (let i = 0; i < id.length; i++) sum += id.charCodeAt(i);
  return TONES[sum % TONES.length];
}

/** `Oct 18` — the shape the prayer controls write into `answeredAt`. */
const MONTH_DAY = /^([A-Za-z]{3,9})\.?\s+(\d{1,2})$/;

/**
 * Parse a stored prayer date.
 *
 * `answeredAt` is written as a *display* string (`Oct 18`) by the prayer
 * controls, so `new Date('Oct 18')` reads it as 2001 and every answer made in
 * the app dropped out of "this year" and landed under "Earlier". A display
 * string is therefore read in the current year — or last year, if that would
 * put the answer in the future. Date-only ISO strings are local midnight, not
 * UTC (a UTC midnight is the previous day west of Greenwich).
 */
export function parsePrayerDate(
  value: string | null | undefined,
  now: Date = new Date(),
): Date | null {
  const raw = (value || '').trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return new Date(`${raw}T00:00:00`);

  const stored = MONTH_DAY.exec(raw);
  if (stored) {
    const thisYear = new Date(`${stored[1]} ${stored[2]}, ${now.getFullYear()}`);
    if (isNaN(thisYear.getTime())) return null;
    if (thisYear.getTime() <= now.getTime() + 24 * 60 * 60 * 1000) return thisYear;
    return new Date(`${stored[1]} ${stored[2]}, ${now.getFullYear() - 1}`);
  }

  const parsed = new Date(raw);
  return isNaN(parsed.getTime()) ? null : parsed;
}

/** Short day, with the year only when it is not this one. */
function formatDay(date: Date, locale: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  }).format(date);
}

interface AnsweredRow {
  prayer: PrayerRecord;
  answered: Date | null;
}

interface AnsweredCardProps {
  row: AnsweredRow;
  contact?: Contact;
  locale: string;
  t: (key: string, fallback?: string) => string;
  onOpen: (contact: Contact) => void;
}

function AnsweredCard({ row, contact, locale, t, onOpen }: AnsweredCardProps) {
  const { prayer: p, answered } = row;
  const name = contact?.name || t('answered.whole_team');
  const initial = name.trim().charAt(0).toUpperCase();
  const tone = getToneForId(p.id);
  const asked = parsePrayerDate(p.date);
  const answeredLabel = answered ? formatDay(answered, locale) : t('answered.recently');
  const askedLabel = asked ? formatDay(asked, locale) : t('answered.recently');

  const open = () => contact && onOpen(contact);

  return (
    <article
      onClick={open}
      className={cn('ans-card', `tone-${tone}`, contact && 'is-clickable')}
    >
      {contact ? (
        // The portrait is the card's one control, so a keyboard or screen
        // reader has a named way into the person (the card itself is a mouse
        // target only).
        <button
          type="button"
          className={cn('ans-photo', `tone-${tone}`)}
          aria-label={name}
          onClick={(e) => {
            e.stopPropagation();
            onOpen(contact);
          }}
        >
          <span className="ans-initial">{initial}</span>
          {contact.avatar && (
            <img
              src={contact.avatar}
              alt={name}
              className="absolute inset-0 w-full h-full object-cover"
            />
          )}
        </button>
      ) : (
        <div className={cn('ans-photo', `tone-${tone}`)}>
          <span className="ans-initial">{initial}</span>
        </div>
      )}
      <div className="ans-card-body">
        <div className="ans-who">{name}</div>
        <Translate as="p" className="ans-how" text={p.answer || p.burden} />
        {(p.answeredPhotos || []).length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {p.answeredPhotos!.map((ph) =>
              ph.url ? (
                <img
                  key={ph.path}
                  src={ph.url}
                  alt={ph.name || t('answered.photo')}
                  className="w-16 h-16 object-cover rounded-sm border border-outline-variant"
                />
              ) : (
                <span
                  key={ph.path}
                  title={ph.name}
                  className="w-16 h-16 grid place-items-center rounded-sm border border-outline-variant text-on-surface-variant"
                >
                  <ImageIcon className="w-4 h-4" />
                </span>
              ),
            )}
          </div>
        )}
        <div className="ans-arc">
          <Translate as="span" className="ans-item" text={p.burden} />
          <span className="ans-dates">
            <span>
              {t('answered.asked')} {askedLabel}
            </span>
            <span className="ans-sep" />
            <span className="ans-ans">
              {t('answered.answered')} {answeredLabel}
            </span>
          </span>
        </div>
      </div>
    </article>
  );
}

export default function AnsweredList() {
  const navigate = useNavigate();
  const { t, language } = useLanguage();
  const [prayers, setPrayers] = useState<PrayerRecord[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profileContact, setProfileContact] = useState<Contact | null>(null);

  const onLoadError = (e: unknown, path: string) => {
    setError('the answered prayer list');
    setLoading(false);
    handleFirestoreError(e, OperationType.LIST, path);
  };

  useEffect(() => {
    const unsubContacts = onSnapshot(
      query(collection(db, 'contacts'), orderBy('name', 'asc')),
      (snapshot) => {
        setContacts(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as Contact[]);
      },
      (e) => onLoadError(e, 'contacts')
    );

    const unsubPrayers = onSnapshot(
      query(collection(db, 'prayers')),
      (snapshot) => {
        const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as PrayerRecord[];
        setPrayers(data.filter((p) => p.status === 'answered'));
        setLoading(false);
      },
      (e) => onLoadError(e, 'prayers')
    );

    return () => {
      unsubContacts();
      unsubPrayers();
    };
  }, []);

  const contactMap = useMemo(() => {
    const map = new Map<string, Contact>();
    contacts.forEach((c) => map.set(c.id, c));
    return map;
  }, [contacts]);

  // Grouped answered prayers. One parsed date per prayer drives the group, the
  // sort and the "this year" count, so the three cannot disagree.
  const { recent, earlier, totalThisYear } = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const ninetyDaysAgo = now.getTime() - 90 * 24 * 60 * 60 * 1000;

    const rows: AnsweredRow[] = prayers
      .map((prayer) => ({
        prayer,
        answered:
          parsePrayerDate(prayer.answeredAt, now) ??
          parsePrayerDate(prayer.updatedAt, now) ??
          parsePrayerDate(prayer.date, now),
      }))
      .sort((a, b) => (b.answered?.getTime() ?? 0) - (a.answered?.getTime() ?? 0));

    return {
      recent: rows.filter((r) => (r.answered?.getTime() ?? 0) >= ninetyDaysAgo),
      earlier: rows.filter((r) => ninetyDaysAgo > (r.answered?.getTime() ?? 0)),
      totalThisYear: rows.filter((r) => r.answered?.getFullYear() === year).length,
    };
  }, [prayers]);

  // People detail is a full page (the design's ContactDetail), not a popup.
  usePreserveScroll(!!profileContact);
  if (profileContact) {
    return (
      <ContactDetailsModal
        isOpen
        onClose={() => setProfileContact(null)}
        contact={profileContact}
      />
    );
  }

  if (error) {
    return <DataLoadError label={error} />;
  }

  if (loading && contacts.length === 0) {
    return (
      <PageContainer variant="wide">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-surface-container-high rounded-full w-1/4" />
          <div className="h-4 bg-surface-container-high rounded-full w-1/2" />
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 mt-12">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-64 bg-surface-container-high rounded-2xl" />
            ))}
          </div>
        </div>
      </PageContainer>
    );
  }

  const renderCard = (row: AnsweredRow) => (
    <AnsweredCard
      key={row.prayer.id}
      row={row}
      contact={contactMap.get(row.prayer.contactId)}
      locale={language}
      t={t}
      onOpen={setProfileContact}
    />
  );

  return (
    <PageContainer variant="wide">
      <header className="ans-head">
        <div className="ans-head-row">
          <div>
            <h1 className="ans-h1">{t('answered.title')}</h1>
            <p className="ans-sub">
              {t('answered.subtitle')}
            </p>
          </div>
          <div className="ans-count">
            <div className="ans-count-n">{totalThisYear}</div>
            <div className="ans-count-l">
              {t('answered.answered_count')} <br />
              {t('answered.this_year')}
            </div>
          </div>
        </div>
        <div className="ans-toggle">
          <button className="ans-toggle-opt" onClick={() => navigate('/prayer')}>
            {t('answered.on_our_hearts')}
          </button>
          <button className="ans-toggle-opt on" aria-current="page">
            {t('answered.title')}
          </button>
        </div>
      </header>

      {prayers.length === 0 ? (
        <div className="text-center py-16 bg-surface rounded-xl">
          <Heart className="w-12 h-12 text-on-surface-variant opacity-25 mx-auto mb-4" />
          <h3 className="font-serif text-xl text-on-surface">{t('answered.no_prayers_title')}</h3>
          <p className="text-sm text-on-surface-variant mt-1">
            {t('answered.no_prayers_body')}
          </p>
        </div>
      ) : (
        <div className="space-y-12">
          {recent.length > 0 && (
            <section className="ans-group">
              <div className="ans-group-h">
                <h2 className="ans-group-label">{t('answered.recent_answers')}</h2>
                <span className="ans-group-count">{recent.length}</span>
                <span className="ans-group-rule" />
              </div>
              <div className="ans-wall">{recent.map(renderCard)}</div>
            </section>
          )}

          {earlier.length > 0 && (
            <section className="ans-group">
              <div className="ans-group-h">
                <h2 className="ans-group-label">{t('answered.earlier_answers')}</h2>
                <span className="ans-group-count">{earlier.length}</span>
                <span className="ans-group-rule" />
              </div>
              <div className="ans-wall">{earlier.map(renderCard)}</div>
            </section>
          )}
        </div>
      )}
    </PageContainer>
  );
}
