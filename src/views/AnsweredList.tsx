import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, onSnapshot, orderBy } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { Heart } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Contact, PrayerRecord } from '../types';
import { cn } from '../lib/utils';
import PageContainer from '../components/layout/PageContainer';
import { DataLoadError } from '../components/ui/DataLoadError';
import ContactDetailsModal from '../components/modals/ContactDetailsModal';
import { usePreserveScroll } from '../lib/usePreserveScroll';
import { Translate } from '../components/Translate';

const TONES: ('accent' | 'violet' | 'amber' | 'sage')[] = ['accent', 'violet', 'amber', 'sage'];
function getToneForId(id: string): 'accent' | 'violet' | 'amber' | 'sage' {
  let sum = 0;
  for (let i = 0; i < id.length; i++) sum += id.charCodeAt(i);
  return TONES[sum % TONES.length];
}

function formatDate(isoString: string) {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) throw new Error('Invalid Date');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return 'Recently';
  }
}

export default function AnsweredList() {
  const navigate = useNavigate();
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

  // Grouped answered prayers
  const { recent, earlier, totalThisYear } = useMemo(() => {
    const year = new Date().getFullYear();
    const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;
    
    let thisYearCount = 0;
    const rec: PrayerRecord[] = [];
    const ear: PrayerRecord[] = [];

    prayers.forEach((p) => {
      const dateMs = new Date(p.answeredAt || p.updatedAt || p.date).getTime();
      const pYear = new Date(p.answeredAt || p.updatedAt || p.date).getFullYear();
      
      if (pYear === year) {
        thisYearCount++;
      }

      if (dateMs >= ninetyDaysAgo) {
        rec.push(p);
      } else {
        ear.push(p);
      }
    });

    // Sort by answered date (newest first)
    const sortByDate = (a: PrayerRecord, b: PrayerRecord) => {
      const tA = new Date(a.answeredAt || a.updatedAt || a.date).getTime();
      const tB = new Date(b.answeredAt || b.updatedAt || b.date).getTime();
      return tB - tA;
    };

    return {
      recent: rec.sort(sortByDate),
      earlier: ear.sort(sortByDate),
      totalThisYear: thisYearCount,
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

  return (
    <PageContainer variant="wide">
      <header className="ans-head">
        <div className="ans-eyebrow">
          <span className="ans-lit" /> Answered
        </div>
        <div className="ans-head-row">
          <div>
            <h1 className="ans-h1">Answered</h1>
            <p className="ans-sub">
              A record of the prayers this ministry has watched God answer. Every one of them a small testimony.
            </p>
          </div>
          <div className="ans-count">
            <div className="ans-count-n">{totalThisYear}</div>
            <div className="ans-count-l">
              answered
              <br />
              this year
            </div>
          </div>
        </div>
        <div className="ans-toggle">
          <button className="ans-toggle-opt" onClick={() => navigate('/prayer')}>
            On our hearts
          </button>
          <button className="ans-toggle-opt on">Answered</button>
        </div>
      </header>

      {prayers.length === 0 ? (
        <div className="text-center py-20 bg-surface rounded-3xl border border-outline-variant/60">
          <Heart className="w-12 h-12 text-on-surface-variant opacity-25 mx-auto mb-4" />
          <h3 className="font-serif text-xl text-on-surface">No answered prayers recorded yet</h3>
          <p className="text-sm text-on-surface-variant mt-1">
            As prayers are marked answered and testimonies are written, they will blossom here.
          </p>
        </div>
      ) : (
        <div className="space-y-12">
          {recent.length > 0 && (
            <section className="ans-group">
              <div className="ans-group-h">
                <span className="ans-group-label">Recent answers</span>
                <span className="ans-group-count">{recent.length}</span>
                <span className="ans-group-rule" />
              </div>
              <div className="ans-wall">
                {recent.map((p) => {
                  const contact = contactMap.get(p.contactId);
                  const name = contact?.name || 'Whole Team';
                  const initial = name.trim().charAt(0).toUpperCase();
                  const tone = getToneForId(p.id);
                  
                  return (
                    <article
                      key={p.id}
                      onClick={() => contact && setProfileContact(contact)}
                      className={cn(
                        'ans-card',
                        `tone-${tone}`,
                        contact && 'is-clickable'
                      )}
                    >
                      <div className={cn('ans-photo', `tone-${tone}`)}>
                        <span className="ans-initial">{initial}</span>
                        {contact?.avatar && (
                          <img
                            src={contact.avatar}
                            alt={name}
                            className="absolute inset-0 w-full h-full object-cover"
                          />
                        )}
                      </div>
                      <div className="ans-card-body">
                        <div className="ans-who">{name}</div>
                        <Translate as="p" className="ans-how" text={p.answer || p.burden} />
                        <div className="ans-arc">
                          <Translate as="span" className="ans-item" text={p.burden} />
                          <span className="ans-dates">
                            <span>asked {formatDate(p.date)}</span>
                            <span className="ans-sep" />
                            <span className="ans-ans">answered {p.answeredAt || formatDate(p.answeredAt || p.updatedAt)}</span>
                          </span>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          )}

          {earlier.length > 0 && (
            <section className="ans-group">
              <div className="ans-group-h">
                <span className="ans-group-label">Earlier this year</span>
                <span className="ans-group-count">{earlier.length}</span>
                <span className="ans-group-rule" />
              </div>
              <div className="ans-wall">
                {earlier.map((p) => {
                  const contact = contactMap.get(p.contactId);
                  const name = contact?.name || 'Whole Team';
                  const initial = name.trim().charAt(0).toUpperCase();
                  const tone = getToneForId(p.id);

                  return (
                    <article
                      key={p.id}
                      onClick={() => contact && setProfileContact(contact)}
                      className={cn(
                        'ans-card',
                        `tone-${tone}`,
                        contact && 'is-clickable'
                      )}
                    >
                      <div className={cn('ans-photo', `tone-${tone}`)}>
                        <span className="ans-initial">{initial}</span>
                        {contact?.avatar && (
                          <img
                            src={contact.avatar}
                            alt={name}
                            className="absolute inset-0 w-full h-full object-cover"
                          />
                        )}
                      </div>
                      <div className="ans-card-body">
                        <div className="ans-who">{name}</div>
                        <Translate as="p" className="ans-how" text={p.answer || p.burden} />
                        <div className="ans-arc">
                          <Translate as="span" className="ans-item" text={p.burden} />
                          <span className="ans-dates">
                            <span>asked {formatDate(p.date)}</span>
                            <span className="ans-sep" />
                            <span className="ans-ans">answered {p.answeredAt || formatDate(p.answeredAt || p.updatedAt)}</span>
                          </span>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      )}
    </PageContainer>
  );
}
