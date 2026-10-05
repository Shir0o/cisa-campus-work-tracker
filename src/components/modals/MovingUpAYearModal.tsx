import React, { useState } from 'react';
import { doc, writeBatch } from 'firebase/firestore';
import { X } from 'lucide-react';
import { db, handleFirestoreError, OperationType, logActivity } from '../../lib/firebase';
import { YEARS } from '../../lib/contactYear';
import { kindLabelKey } from '../../lib/contactKind';
import {
  planYearConfirmation,
  proposeYear,
  schoolYearOf,
  yearConfirmationStory,
  type YearChoice,
} from '../../lib/movingUpAYear';
import { useAuth } from '../AuthProvider';
import { useLanguage } from '../LanguageProvider';
import Select from '../ui/Select';
import type { Contact } from '../../types';

interface MovingUpAYearModalProps {
  /** Years to confirm: the students not yet confirmed this school year. */
  people: Contact[];
  now: Date;
  onClose: () => void;
}

// The picker's values: a year from the list (or the person's own off-list
// text, kept as their same year), or graduated / left school.
const LISTED = YEARS.filter((y) => y !== 'Other');
const encode = (choice: YearChoice | null) =>
  !choice ? '' : choice.type === 'graduated' ? 'graduated' : `year:${choice.year}`;
const decode = (value: string): YearChoice | null =>
  value === 'graduated' ? { type: 'graduated' } : value.startsWith('year:') ? { type: 'year', year: value.slice(5) } : null;

/**
 * Moving up a year (#1351): every unconfirmed student with the app's proposal
 * already chosen, so moving everyone up is one step, and any row can be changed
 * — the same year, another year, or graduated / left school. Anyone with no
 * proposal (Graduate, Other, no year) waits for a hand-picked choice and is
 * left unconfirmed until they get one. Full-timers only.
 */
export default function MovingUpAYearModal({ people, now, onClose }: MovingUpAYearModalProps) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [choices, setChoices] = useState<Record<string, string>>(() =>
    Object.fromEntries(people.map((p) => [p.id, encode(proposeYear(p, now))])),
  );
  const [saving, setSaving] = useState(false);
  const chosen = people.filter((p) => choices[p.id]);

  const handleConfirm = async () => {
    if (chosen.length === 0 || saving || !user?.uid) return;
    setSaving(true);
    try {
      const at = new Date().toISOString();
      const batch = writeBatch(db);
      const stories: { person: Contact; description: string }[] = [];
      chosen.forEach((person) => {
        const choice = decode(choices[person.id])!;
        batch.update(doc(db, 'contacts', person.id), {
          ...planYearConfirmation(person, choice, { by: user.uid, at, now }),
          updatedAt: at,
          updatedBy: user.uid,
          updatedByName: user.displayName || user.email?.split('@')[0] || 'Unknown User',
        });
        const description = yearConfirmationStory(person, choice, (k) => t(kindLabelKey(k)));
        if (description) stories.push({ person, description });
      });
      await batch.commit();
      stories.forEach(({ person, description }) =>
        logActivity({
          action: 'confirmed the year for',
          targetId: person.id,
          targetName: person.name,
          targetType: 'contact',
          type: 'edit',
          description,
        }),
      );
      onClose();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'contacts');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="moving-up-a-year-title"
        className="relative w-full max-w-lg bg-surface-container-high rounded-3xl shadow-2xl overflow-hidden border border-outline-variant max-h-[85vh] flex flex-col"
      >
        <div className="p-6 border-b border-outline-variant flex items-start justify-between gap-4">
          <div>
            <h2 id="moving-up-a-year-title" className="font-serif text-2xl text-on-surface">
              {t('movingUpAYear.title')}
            </h2>
            <p className="text-sm text-on-surface-variant mt-1">
              {t('movingUpAYear.subtitle')
                .replace('{n}', String(people.length))
                .replace('{year}', schoolYearOf(now))}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full hover:bg-surface-variant text-on-surface-variant transition-colors"
            aria-label={t('modals.close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <ul className="p-4 sm:p-6 overflow-y-auto space-y-2">
          {people.map((person) => {
            const current = (person.year ?? '').trim();
            const offList = current && !LISTED.includes(current);
            return (
              <li
                key={person.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-outline-variant/60 bg-surface px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="font-medium text-on-surface truncate">{person.name}</p>
                  <p className="text-xs text-on-surface-variant">{current || t('movingUpAYear.no_year')}</p>
                </div>
                <Select
                  data-testid={`year-choice-${person.id}`}
                  aria-label={t('movingUpAYear.choice_for').replace('{name}', person.name)}
                  value={choices[person.id]}
                  onChange={(e) => setChoices((prev) => ({ ...prev, [person.id]: e.target.value }))}
                  wrapperClassName="w-full sm:w-auto"
                  className="h-10 text-sm"
                >
                  <option value="" disabled>{t('movingUpAYear.choose')}</option>
                  {offList && (
                    <option value={`year:${current}`}>
                      {t('movingUpAYear.same_year').replace('{year}', current)}
                    </option>
                  )}
                  {LISTED.map((year) => (
                    <option key={year} value={`year:${year}`}>
                      {year === current ? t('movingUpAYear.same_year').replace('{year}', year) : year}
                    </option>
                  ))}
                  <option value="graduated">{t('movingUpAYear.graduated')}</option>
                </Select>
              </li>
            );
          })}
        </ul>

        <div className="p-6 border-t border-outline-variant flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-12 rounded-full font-medium text-on-surface-variant hover:bg-surface-variant transition-colors"
          >
            {t('directory.cancel')}
          </button>
          <button
            type="button"
            disabled={chosen.length === 0 || saving}
            onClick={handleConfirm}
            className="flex-1 h-12 bg-primary text-on-primary rounded-full font-medium hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {t('movingUpAYear.confirm').replace('{n}', String(chosen.length))}
          </button>
        </div>
      </div>
    </div>
  );
}
