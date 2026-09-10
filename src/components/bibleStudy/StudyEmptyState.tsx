import React from 'react';
import type { EntryPoint } from '../../lib/bibleStudy';

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
  if (kind === 'no-active-study') {
    if (isPermalink) {
      return (
        <div className="flex flex-col items-center justify-center p-6 text-center flex-1">
          <h1 className="font-serif text-2xl mb-2 font-medium">Week not found</h1>
          <p className="text-on-surface-variant text-sm max-w-sm">
            This link doesn't point at a published week.
          </p>
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center justify-center p-6 text-center flex-1">
        <p className="text-xs font-semibold tracking-wider uppercase text-on-surface-variant mb-3">
          Between terms
        </p>
        <h1 className="font-serif text-2xl mb-2 font-medium">Nothing running right now</h1>
        <p className="text-on-surface-variant text-sm max-w-sm">
          {entryPoint?.name
            ? `${entryPoint.name} picks up again when the next study starts. `
            : 'The study picks up again when the next one starts. '}
          Keep this code — it will be the same one.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center p-6 text-center flex-1">
      <p className="text-xs font-semibold tracking-wider uppercase text-on-surface-variant mb-3">
        Nothing yet
      </p>
      <h1 className="font-serif text-2xl mb-2 font-medium">
        The study has never published a week
      </h1>
      <p className="text-on-surface-variant text-sm max-w-sm">
        A brand-new study, or a code shown before the first week went up. There is nothing to
        fall back to.
      </p>
    </div>
  );
};

export default StudyEmptyState;
