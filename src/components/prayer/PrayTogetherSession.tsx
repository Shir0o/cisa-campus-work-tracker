import React, { useEffect, useState } from 'react';
import { Contact, PrayerRecord } from '../../types';
import { getUserInitials } from '../../lib/utils';
import { useLanguage } from '../LanguageProvider';
import { usePrayerSession } from '../../lib/prayerSession';
import { getContactGrade } from '../../lib/prayers';

// One person's card in the Pray-together session (#551).
// `prayers` are that person's OPEN prayers (pending/ongoing) only.

export interface PraySessionPerson {
  contact: Contact;
  prayers: PrayerRecord[];
}

function SessionAvatar({ contact }: { contact: Contact }) {
  const initials = contact.initials || getUserInitials(contact.name);
  if (contact.avatar) {
    return <img src={contact.avatar} alt={contact.name} className="w-14 h-14 rounded-full object-cover shrink-0" />;
  }
  return (
    <div className="w-14 h-14 rounded-full bg-primary-container text-on-primary-container font-semibold flex items-center justify-center shrink-0 text-base">
      {initials}
    </div>
  );
}

// "asked today" / "asked yesterday" / "asked N days ago"
function askedRel(p: PrayerRecord, t: (k: string, fb?: string) => string): string {
  const days = Math.floor((Date.now() - new Date(p.date).getTime()) / 86_400_000);
  if (days <= 0) return t('prayers.session_asked_today');
  if (days === 1) return t('prayers.session_asked_yesterday');
  return t('prayers.session_asked_days').replace('{n}', String(days));
}

export default function PrayTogetherSession({
  held,
  uid,
  onClose,
}: {
  held: PraySessionPerson[];
  uid: string | null;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const { carriedToday, carry } = usePrayerSession(uid);
  const [i, setI] = useState(0);
  const [done, setDone] = useState(false);
  const last = i === held.length - 1;
  const person = held[i];
  const mine = !!person && carriedToday(person.contact.id);
  const carriedCount = held.filter((h) => carriedToday(h.contact.id)).length;

  const markAndOn = () => {
    if (!person) return;
    carry(person.contact.id);
    if (last) setDone(true);
    else setI(i + 1);
  };

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (done) return;
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (last) setDone(true);
        else setI(i + 1);
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setI(Math.max(0, i - 1));
      }
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        markAndOn();
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });

  if (!person) return null;

  // ── End of session ──
  if (done) {
    const title =
      carriedCount === 0
        ? t('prayers.session_nothing')
        : carriedCount === held.length
          ? t('prayers.session_all').replace('{n}', String(carriedCount))
          : t('prayers.session_some').replace('{n}', String(carriedCount)).replace('{m}', String(held.length));
    return (
      <div data-testid="pray-together-session" className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <div className="w-full max-w-[620px] max-h-[88vh] bg-surface rounded-3xl border border-outline-variant shadow-2xl overflow-hidden flex flex-col text-on-surface">
          <div className="p-8 text-center overflow-auto">
            <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-accent-strong/15 text-accent-strong flex items-center justify-center text-2xl">
              ✓
            </div>
            <h2 className="font-serif text-2xl text-on-surface">{title}</h2>
            <p className="text-sm text-on-surface-variant mt-2 max-w-md mx-auto">
              {carriedCount === 0 ? t('prayers.session_none_body') : t('prayers.session_some_body')}
            </p>
            {carriedCount > 0 && (
              <div className="flex gap-2 justify-center flex-wrap mt-5">
                {held.filter((h) => carriedToday(h.contact.id)).map((h) => (
                  <SessionAvatar key={h.contact.id} contact={h.contact} />
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 p-5 border-t border-outline-variant bg-surface">
            <div className="flex-1" />
            <button
              onClick={() => {
                setI(0);
                setDone(false);
              }}
              className="px-4 py-2 rounded-full border border-outline-variant text-sm text-on-surface hover:bg-surface-variant transition-colors"
            >
              {t('prayers.session_go_again')}
            </button>
            <button
              onClick={onClose}
              className="px-5 py-2 rounded-full bg-primary text-on-primary text-sm font-medium hover:opacity-90 transition-opacity"
            >
              {t('actions.close')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── One person at a time ──
  return (
    <div data-testid="pray-together-session" className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-[620px] max-h-[88vh] bg-surface rounded-3xl border border-outline-variant shadow-2xl overflow-hidden flex flex-col text-on-surface">
        <div className="flex items-center gap-3 px-5 py-4">
          <span className="text-sm font-medium">{t('prayers.session_title')}</span>
          <span className="ml-auto text-[13px] text-on-surface-variant">
            {i + 1} {t('prayers.session_of')} {held.length}
          </span>
          <button
            onClick={onClose}
            aria-label={t('actions.close')}
            className="w-8 h-8 grid place-items-center rounded-full text-on-surface-variant hover:bg-surface-variant hover:text-on-surface"
          >
            ×
          </button>
        </div>
        <div className="h-1 mx-5 rounded-full bg-outline-variant/70 overflow-hidden">
          <div className="h-full bg-accent-strong rounded-full" style={{ width: `${((i + 1) / held.length) * 100}%` }} />
        </div>

        <div className="p-6 overflow-auto flex-1" key={person.contact.id}>
          <div className="flex gap-3.5 items-center">
            <SessionAvatar contact={person.contact} />
            <div>
              <h2 className="text-xl font-semibold text-on-surface">{person.contact.name}</h2>
              <div className="text-[13px] text-on-surface-variant mt-0.5">
                {[person.contact.role, getContactGrade(person.contact), person.contact.metVia].filter(Boolean).join(' · ')}
              </div>
            </div>
          </div>
          {person.contact.tags && person.contact.tags.length > 0 && (
            <div className="flex gap-1.5 flex-wrap mt-4">
              {person.contact.tags.map((tag) => (
                <span key={tag} className="inline-flex items-center h-6 px-3 rounded-full text-xs font-medium bg-surface-variant text-on-surface-variant border border-outline-variant">
                  {tag}
                </span>
              ))}
            </div>
          )}

          <div className="h-px bg-outline-variant my-5" />

          <div className="flex flex-col gap-2.5">
            {person.prayers.map((p) => (
              <div key={p.id} className="p-3.5 rounded-2xl bg-surface-variant/60 border border-outline-variant/60">
                <div className="text-[15px] font-medium text-on-surface">{p.burden}</div>
                <div className="text-xs text-on-surface-variant mt-1.5">{t('prayers.session_asked')} {askedRel(p, t)}</div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-center gap-2 flex-wrap">
            <span className="text-xs text-on-surface-variant">{t('prayers.session_so_far').replace('{n}', String(carriedCount))}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 p-5 border-t border-outline-variant bg-surface">
          <button
            onClick={() => setI(Math.max(0, i - 1))}
            disabled={i === 0}
            className="px-4 py-2 rounded-full border border-outline-variant text-sm text-on-surface hover:bg-surface-variant transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ← {t('actions.back')}
          </button>
          <div className="flex-1 flex justify-center">
            {mine ? (
              <span className="inline-flex items-center gap-1.5 h-11 px-5 rounded-full border border-success/40 bg-success/10 text-success text-sm font-medium">
                ✓ {t('prayers.session_prayed')}
              </span>
            ) : (
              <button
                onClick={markAndOn}
                className="inline-flex items-center gap-1.5 h-11 px-5 rounded-full bg-accent-strong text-white text-sm font-medium hover:opacity-90 transition-opacity"
              >
                {t('prayers.session_i_prayed_for').replace('{name}', person.contact.name.split(' ')[0])}
              </button>
            )}
          </div>
          <button
            onClick={() => (last ? setDone(true) : setI(i + 1))}
            className="px-4 py-2 rounded-full border border-outline-variant text-sm text-on-surface hover:bg-surface-variant transition-colors"
          >
            {last ? t('prayers.session_finish') : t('prayers.session_skip')}
          </button>
        </div>
      </div>
    </div>
  );
}