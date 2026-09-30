import React, { useState, useEffect } from 'react';
import { collection, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { motion, AnimatePresence } from 'motion/react';
import { Clock, CheckCircle, Ban, Sparkles, AlertTriangle, MessageSquare, ChevronDown, Globe } from 'lucide-react';
import { useAuth } from '../components/AuthProvider';
import { useLanguage } from '../components/LanguageProvider';
import { kindMeta, outcomeCopy, outcomeLabel, TONE_CLASSES } from '../lib/feedbackKinds';
import { isAppOwner } from '../lib/permissions';
import { Feedback, FeedbackReply } from '../types';
import PageContainer from '../components/layout/PageContainer';
import { Skeleton } from '../components/ui/Skeleton';
import Stream from '../components/stream/Stream';
import { followUpAdapter } from '../components/stream/followUpAdapter';

/**
 * "Your notes" — the submitter's own side of the feedback loop (ADR 0019).
 *
 * This page used to be a second composer. It is now the place a Note comes
 * back to you: what became of it, and the Follow-up thread that lets either
 * side ask a question. Submitting happens only through the FAB.
 *
 * Two renderings live here. Everyone sees the submitter's one: the outcome
 * message written at close and the laundered restatement of anything said on
 * the linked issue. The owner sees the tracker raw by default, and switches to
 * the submitter's rendering through the existing owner view ("see it as they
 * do") rather than a control of this page's own.
 */
export default function MyNotes() {
  const { user, ownerViewRole } = useAuth();
  const { t } = useLanguage();

  const [notes, setNotes] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [openNoteId, setOpenNoteId] = useState<string | null>(null);

  // The owner reads it raw unless they have switched into someone else's view.
  const asSubmitter = !isAppOwner(user?.email) || ownerViewRole !== null;

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
            <NoteCard
              key={note.id}
              note={note}
              asSubmitter={asSubmitter}
              expanded={openNoteId === note.id}
              onToggle={() => setOpenNoteId(openNoteId === note.id ? null : note.id)}
            />
          ))}
        </div>
      )}
    </PageContainer>
  );
}

function NoteCard({
  note,
  asSubmitter,
  expanded,
  onToggle,
}: {
  note: Feedback;
  asSubmitter: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { t } = useLanguage();
  const meta = kindMeta(note.kind ?? 'thought');
  const tone = TONE_CLASSES[meta.tone];

  const formattedDate = (() => {
    try {
      return new Date(note.createdAt).toLocaleDateString(undefined, {
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
          {meta.label}
        </span>
        <span className="text-on-surface-variant">{formattedDate}</span>
      </div>

      <p className="text-sm text-on-surface whitespace-pre-wrap leading-relaxed pl-1">{note.message}</p>

      <div className="pt-2 border-t border-outline-variant/40 pl-1 text-xs">
        {note.outcome ? (
          <div className="space-y-1">
            <div className={`flex items-center gap-1.5 font-semibold ${OUTCOME_TEXT[note.outcome]}`}>
              {OUTCOME_ICONS[note.outcome]}
              {outcomeLabel(note.outcome)}
            </div>
            <p className="text-on-surface-variant leading-relaxed">
              {/* The written-at-close message when there is one; the canned
                  sentence is the guarantee that something always arrives. */}
              {asSubmitter ? (note.outcomeMessage || outcomeCopy(note.outcome)) : outcomeCopy(note.outcome)}
            </p>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-on-surface-variant/80">
            <Clock className="w-3.5 h-3.5" />
            {/* Deliberately promises no future event: a Note with no linked
                issue can never reach an outcome, and only a Full-timer can
                cure that. */}
            <span>{t('feedback.no_news_yet')}</span>
          </div>
        )}
      </div>

      <div className="pl-1">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>{t('feedback.follow_ups')}</span>
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="thread"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden pl-1"
          >
            <FollowUpThread noteId={note.id} asSubmitter={asSubmitter} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function FollowUpThread({ noteId, asSubmitter }: { noteId: string; asSubmitter: boolean }) {
  const { user, role } = useAuth();
  const { t } = useLanguage();

  const [replies, setReplies] = useState<FeedbackReply[]>([]);
  const [threadError, setThreadError] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'feedback', noteId, 'replies'), orderBy('createdAt', 'asc'));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items: FeedbackReply[] = [];
        snapshot.forEach((d) => {
          const data = d.data();
          items.push({
            id: d.id,
            ...data,
            createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt || new Date().toISOString(),
            ...(data.editedAt ? { editedAt: data.editedAt.toDate?.()?.toISOString() || data.editedAt } : {}),
          } as FeedbackReply);
        });
        setReplies(items);
        setThreadError(false);
      },
      (err) => {
        console.error(`Failed to subscribe to follow-ups on ${noteId}:`, err);
        setThreadError(true);
      }
    );
    return () => unsubscribe();
  }, [noteId]);

  const adapter = followUpAdapter({
    noteId,
    replies,
    me: { uid: user?.uid ?? '', name: user?.displayName ?? '', role },
    asSubmitter,
    getIdToken: user && typeof user.getIdToken === 'function' ? () => user.getIdToken() : undefined,
    t,
  });

  return (
    <div className="pt-3">
      {threadError && (
        <p role="alert" className="text-xs text-on-surface-variant pb-2">
          {t('feedback.follow_ups_load_failed')}
        </p>
      )}
      <div className="strm-inline">
        <Stream
          adapter={adapter}
          viewer={{ uid: user?.uid ?? '', role }}
          threadMode="replace"
          footer={
            // The thread mirrors onto a public issue tracker. Someone typing
            // into what looks like a private app has no way to know that.
            <p className="strm-foot">
              <Globe className="w-3 h-3 mt-0.5 shrink-0" aria-hidden />
              <span>{t('feedback.reply_is_public')}</span>
            </p>
          }
        />
      </div>
    </div>
  );
}
