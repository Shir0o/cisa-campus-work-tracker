import React, { useState, useEffect, useCallback } from 'react';
import { collection, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { motion, AnimatePresence } from 'motion/react';
import { Send, Loader2, Clock, CheckCircle, Ban, Sparkles, AlertTriangle, MessageSquare, ChevronDown, Globe } from 'lucide-react';
import { useAuth } from '../components/AuthProvider';
import { useLanguage } from '../components/LanguageProvider';
import { kindMeta, outcomeCopy, outcomeLabel, TONE_CLASSES } from '../lib/feedbackKinds';
import { isAppOwner } from '../lib/permissions';
import { Feedback, FeedbackReply } from '../types';
import PageContainer from '../components/layout/PageContainer';

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
        setLoadError(false);
      },
      (err) => {
        // A silent failure here is what made this page look empty rather than
        // broken for everyone but a Full-timer. Say so instead.
        console.error('Failed to subscribe to your notes:', err);
        setLoadError(true);
      }
    );

    return () => unsubscribe();
  }, [user?.uid]);

  return (
    <PageContainer variant="reading" className="max-w-2xl space-y-6" id="my-notes-page">
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

      {!loadError && notes.length === 0 && (
        <div className="bg-surface-container border border-outline-variant rounded-xl p-8 text-center space-y-2">
          <div className="w-12 h-12 mx-auto bg-primary/10 text-accent rounded-full grid place-items-center text-2xl">✦</div>
          <p className="text-sm text-on-surface-variant max-w-sm mx-auto leading-relaxed">
            {t('feedback.no_notes_yet')}
          </p>
        </div>
      )}

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
  const { user } = useAuth();
  const { t } = useLanguage();

  const [replies, setReplies] = useState<FeedbackReply[]>([]);
  const [threadError, setThreadError] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

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

  const send = useCallback(async () => {
    const body = draft.trim();
    if (!body || sending || !user) return;

    setSending(true);
    setSendError(null);
    try {
      let token: string | null = null;
      try {
        if (typeof user.getIdToken === 'function') token = await user.getIdToken();
      } catch (tokenErr) {
        console.error('Failed to get Firebase ID token:', tokenErr);
      }

      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const response = await fetch('/api/feedback/reply', {
        method: 'POST',
        headers,
        body: JSON.stringify({ id: noteId, body }),
      });
      if (!response.ok) throw new Error(`Server returned ${response.status} ${response.statusText}`);

      setDraft('');
    } catch (error) {
      console.error('Failed to post a follow-up:', error);
      setSendError(t('feedback.follow_up_failed'));
    } finally {
      setSending(false);
    }
  }, [draft, sending, user, noteId, t]);

  return (
    <div className="space-y-3 pt-3">
      {threadError && (
        <p role="alert" className="text-xs text-on-surface-variant">
          {t('feedback.follow_ups_load_failed')}
        </p>
      )}

      {replies.length === 0 && !threadError && (
        <p className="text-xs text-on-surface-variant/80">{t('feedback.no_follow_ups')}</p>
      )}

      {replies.map((reply) => {
        const mine = reply.authorRole === 'submitter';
        // On the owner's own Notes a relayed comment is stored raw with the
        // restatement beside it, so the submitter's view has something to show.
        const shown = asSubmitter ? reply.launderedBody || reply.body : reply.body;
        return (
          <div
            key={reply.id}
            className={`text-xs rounded-lg p-3 space-y-1 ${
              mine ? 'bg-surface border border-outline-variant' : 'bg-surface-variant/60'
            }`}
          >
            <div className="font-semibold text-on-surface-variant">
              {mine ? t('feedback.you') : reply.authorName || t('feedback.the_team')}
            </div>
            <p className="text-on-surface whitespace-pre-wrap leading-relaxed">{shown}</p>
          </div>
        );
      })}

      <div className="space-y-2 pt-1">
        <textarea
          rows={3}
          maxLength={5000}
          value={draft}
          disabled={sending}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t('feedback.follow_up_placeholder')}
          aria-label={t('feedback.follow_up_placeholder')}
          className="w-full bg-surface border border-outline-variant rounded-sm p-3 text-sm text-on-surface placeholder:text-on-surface-variant/60 focus:ring-2 focus:ring-primary focus:outline-none transition-shadow resize-none disabled:opacity-60"
        />

        {/* The thread mirrors onto a public issue tracker. Someone typing into
            what looks like a private app has no way to know that. */}
        <p className="flex items-start gap-1.5 text-[11px] text-on-surface-variant/80 leading-relaxed">
          <Globe className="w-3 h-3 mt-0.5 shrink-0" />
          <span>{t('feedback.reply_is_public')}</span>
        </p>

        {sendError && (
          <p role="alert" className="text-[11px] text-stage-amber">
            {sendError}
          </p>
        )}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={send}
            disabled={sending || !draft.trim()}
            className="py-2 px-5 bg-primary text-on-primary font-semibold rounded-full text-xs flex items-center gap-2 hover:opacity-95 transition-opacity disabled:opacity-50"
          >
            {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            <span>{sending ? t('feedback.sending') : t('feedback.send')}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
