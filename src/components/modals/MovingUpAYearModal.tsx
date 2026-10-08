import React, { useMemo, useState } from 'react';
import { doc, writeBatch } from 'firebase/firestore';
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
import { PopupFrame } from '../ui/PopupFrame';
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
  const initial = useMemo(
    () => Object.fromEntries(people.map((p) => [p.id, encode(proposeYear(p))])),
    [people],
  );
  const [choices, setChoices] = useState<Record<string, string>>(initial);
  const [saving, setSaving] = useState(false);
  const chosen = people.filter((p) => choices[p.id]);
  const dirty = people.some((p) => choices[p.id] !== initial[p.id]);

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
    <PopupFrame
      open
      onClose={onClose}
      size="md"
      eyebrow={t('movingUpAYear.years_to_confirm')}
      title={t('movingUpAYear.title')}
      subtitle={t('movingUpAYear.subtitle')
        .replace('{n}', String(people.length))
        .replace('{year}', schoolYearOf(now))}
      dirty={dirty}
      discardQuestion={t('movingUpAYear.discard')}
      cancelLabel={t('directory.cancel')}
      onCancel={onClose}
      primary={{
        label: t('movingUpAYear.confirm').replace('{n}', String(chosen.length)),
        onClick: handleConfirm,
        disabled: chosen.length === 0,
        saving,
        savingLabel: t('movingUpAYear.saving'),
      }}
    >
      <ul className="space-y-2 px-4 py-5 sm:px-6">
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
    </PopupFrame>
  );
}
