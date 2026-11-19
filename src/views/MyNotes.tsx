import React, { useState, useEffect } from 'react';
import { collection, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Clock, CheckCircle, Ban, Sparkles, AlertTriangle } from 'lucide-react';
import { useAuth } from '../components/AuthProvider';
import { useLanguage } from '../components/LanguageProvider';
import { kindMeta, outcomeCopy, outcomeLabel, TONE_CLASSES } from '../lib/feedbackKinds';
import { Feedback } from '../types';
import PageContainer from '../components/layout/PageContainer';
import { Skeleton } from '../components/ui/Skeleton';

/**
 * "Your reports" — the submitter's own side of the feedback loop.
 *
 * A report comes back here with what became of it: the fixed sentence for its
 * outcome. Replies and their GitHub mirror are cut, so this page is read-only.
 */
export default function MyNotes() {
  const { user } = useAuth();
  const { t } = useLanguage();

  const [notes, setNotes] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!user?.uid) return;

    const q = query(
      collection(db, 'feedback'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items: Feedback[] = [];
        snapshot.forEach((d) => {
          const data = d.data();
          items.push({
            id: d.id,
            ...data,
            createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt || new Date().toISOString(),
          } as Feedback);
        });
        setNotes(items);
        setLoading(false);
        setLoadError(false);
      },
      (err) => {
        // A silent failure here is what made this page look empty rather than
        // broken for everyone but a Full-timer. Say so instead.
        console.error('Failed to subscribe to your notes:', err);
        setLoading(false);
        setLoadError(true);
      }
    );

    return () => unsubscribe();
  }, [user?.uid]);

  return (
    <PageContainer variant="reading" className="max-w-4xl space-y-6" id="my-notes-page">
      <div>
        <h1 className="font-serif page-title font-medium tracking-tight text-on-background">
          {t('feedback.your_notes')}
        </h1>
        <p className="text-sm text-on-surface-variant max-w-prose">
          {t('feedback.your_notes_intro')}
        </p>
      </div>

      {loadError && (
        <div
          role="alert"
          className="flex items-start gap-2.5 bg-surface-container border border-outline-variant rounded-xl p-4 text-sm text-on-surface-variant"
        >
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-stage-amber" />
          <span>{t('feedback.notes_load_failed')}</span>
        </div>
      )}

      {loading ? (
        <div data-testid="my-notes-loading-skeletons" className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-surface-container border border-outline-variant p-4.5 rounded-xl space-y-3"
            >
              <div className="flex items-center justify-between gap-3">
                <Skeleton className="h-5 w-20 rounded" />
                <Skeleton className="h-4 w-24 rounded" />
              </div>
              <Skeleton className="h-4 w-3/4 rounded" />
              <Skeleton className="h-4 w-1/2 rounded" />
              <div className="pt-2 border-t border-outline-variant/40 flex items-center justify-between">
                <Skeleton className="h-4 w-36 rounded" />
                <Skeleton className="h-4 w-20 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : !loadError && notes.length === 0 ? (
        <div className="bg-surface-container border border-outline-variant rounded-xl p-8 text-center space-y-2">
          <div className="w-12 h-12 mx-auto bg-primary/10 text-accent rounded-full grid place-items-center text-2xl">✦</div>
          <p className="text-sm text-on-surface-variant max-w-sm mx-auto leading-relaxed">
            {t('feedback.no_notes_yet')}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {notes.map((note) => (
            <NoteCard key={note.id} note={note} />
          ))}
        </div>
      )}
    </PageContainer>
  );
}

function NoteCard({ note }: { note: Feedback }) {
  const { t, language } = useLanguage();
  const meta = kindMeta(note.kind ?? 'thought');
  const tone = TONE_CLASSES[meta.tone];

  const formattedDate = (() => {
    try {
      return new Date(note.createdAt).toLocaleDateString(language, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return note.createdAt;
    }
  })();

  const OUTCOME_ICONS = {
    shipped: <Sparkles className="w-3.5 h-3.5" />,
    'not-planned': <Ban className="w-3.5 h-3.5" />,
    'already-there': <CheckCircle className="w-3.5 h-3.5" />,
  } as const;

  const OUTCOME_TEXT = {
    shipped: 'text-green-700 dark:text-green-400',
    'not-planned': 'text-neutral-600 dark:text-neutral-400',
    'already-there': 'text-accent',
  } as const;

  return (
    <div className="bg-surface-container border border-outline-variant p-4.5 rounded-xl space-y-3 relative overflow-hidden">
      <div className={`absolute top-0 left-0 bottom-0 w-1 ${tone.bar}`} />

      <div className="flex items-center justify-between gap-3 text-xs pl-1">
        <span className={`inline-flex items-center gap-1 font-semibold py-0.5 px-2 rounded ${tone.chip}`}>
          {t(`feedback.kind_${meta.id}`, meta.label)}
        </span>
        <span className="text-on-surface-variant">{formattedDate}</span>
      </div>

      <p className="text-sm text-on-surface whitespace-pre-wrap break-words leading-relaxed pl-1">{note.message}</p>

      <div className="pt-2 border-t border-outline-variant/40 pl-1 text-xs">
        {note.outcome ? (
          <div className="space-y-1">
            <div className={`flex items-center gap-1.5 font-semibold ${OUTCOME_TEXT[note.outcome]}`}>
              {OUTCOME_ICONS[note.outcome]}
              {t(`feedback.outcome_${note.outcome.replace(/-/g, '_')}`, outcomeLabel(note.outcome))}
            </div>
            <p className="text-on-surface-variant leading-relaxed">
              {/* The fixed sentence is the guarantee that something always
                  arrives; nothing written in a pull request stands in for it. */}
              {t(`feedback.outcome_copy_${note.outcome.replace(/-/g, '_')}`, outcomeCopy(note.outcome))}
            </p>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-on-surface-variant">
            <Clock className="w-3.5 h-3.5" />
            {/* Deliberately promises no future event: a Note with no linked
                issue can never reach an outcome, and only a Full-timer can
                cure that. */}
            <span>{t('feedback.no_news_yet')}</span>
          </div>
        )}
      </div>
    </div>
  );
}
