import React from 'react';
import type { EntryPoint } from '../../lib/bibleStudy';
import { useLanguage } from '../LanguageProvider';

/**
 * The three states a resolution can land in with no week to show (ADR 0011
 * §3). They are distinct on purpose: the reason differs, and so does what the
 * reader should walk away believing. Shared by the public scan route and by
 * "This week's study" (#946) so a Trainee and a student get the same words.
 */
export type StudyEmptyStateProps = {
  kind: 'no-active-study' | 'never-published';
  entryPoint: EntryPoint | null;
  /** A staff permalink naming a Study that does not exist. */
  isPermalink?: boolean;
};

const StudyEmptyState: React.FC<StudyEmptyStateProps> = ({ kind, entryPoint, isPermalink }) => {
  const { t } = useLanguage();

  if (kind === 'no-active-study') {
    if (isPermalink) {
      return (
        <div className="flex flex-col items-center justify-center p-6 text-center flex-1">
          <h1 className="font-serif text-2xl mb-2 font-medium">{t('study.week_not_found')}</h1>
          <p className="text-on-surface-variant text-sm max-w-sm">
            {t('study.week_not_found_body')}
          </p>
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center justify-center p-6 text-center flex-1">
        <p className="text-xs font-semibold tracking-wider uppercase text-on-surface-variant mb-3">
          {t('study.between_terms')}
        </p>
        <h1 className="font-serif text-2xl mb-2 font-medium">{t('study.nothing_running')}</h1>
        <p className="text-on-surface-variant text-sm max-w-sm">
          {entryPoint?.name
            ? t('study.nothing_running_named').replace('{name}', entryPoint.name)
            : t('study.nothing_running_unnamed')}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center p-6 text-center flex-1">
      <p className="text-xs font-semibold tracking-wider uppercase text-on-surface-variant mb-3">
        {t('study.nothing_yet')}
      </p>
      <h1 className="font-serif text-2xl mb-2 font-medium">{t('study.never_published')}</h1>
      <p className="text-on-surface-variant text-sm max-w-sm">{t('study.never_published_body')}</p>
    </div>
  );
};

export default StudyEmptyState;
