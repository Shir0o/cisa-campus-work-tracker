// The two questions that decide a person's kind (#1152, ADR 0030).
//
// Two plain questions rather than a three-way picker: a picker cannot express
// a local who is not in the church life, and a control that silently cannot
// represent someone is worse than asking twice. Shared by the new-contact form
// and contact detail so the wording and the derived label can never drift.
//
// Callers gate this on isAdmin — the kind is a Full-timer's decision, and the
// Firestore rules refuse it from anyone else.
import React from 'react';
import { contactKind, kindLabelKey } from '../../lib/contactKind';
import { useLanguage } from '../LanguageProvider';

export default function KindFields({
  inChurchLife,
  isStudent,
  onChange,
  showDerived = true,
}: {
  inChurchLife: boolean;
  isStudent: boolean;
  onChange: (next: { inChurchLife: boolean; isStudent: boolean }) => void;
  /** The "reads as …" line. Useful while adding someone, noise while editing
   *  a person whose kind is already on screen in the head. */
  showDerived?: boolean;
}) {
  const { t } = useLanguage();
  const row =
    'flex items-center gap-3 px-4 h-11 rounded-xl bg-surface-container-high border border-outline text-sm text-on-surface cursor-pointer';

  return (
    <>
      <label className={row}>
        <input
          type="checkbox"
          checked={inChurchLife}
          onChange={(e) => onChange({ inChurchLife: e.target.checked, isStudent })}
          className="accent-primary w-4 h-4"
        />
        <span>{t('contactKind.in_church_life')}</span>
      </label>
      <label className={row}>
        <input
          type="checkbox"
          checked={isStudent}
          onChange={(e) => onChange({ inChurchLife, isStudent: e.target.checked })}
          className="accent-primary w-4 h-4"
        />
        <span>{t('contactKind.is_student')}</span>
      </label>
      {showDerived && (
        <p className="text-xs text-on-surface-variant px-1">
          {t('contactKind.reads_as').replace(
            '{kind}',
            t(kindLabelKey(contactKind({ inChurchLife, isStudent }))),
          )}
        </p>
      )}
    </>
  );
}
