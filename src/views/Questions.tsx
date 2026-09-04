// "Questions for the team" as its own destination (#646/#647).
//
// This used to be a row in the Messages rail, rendered with the chat grammar:
// a stream of bubbles and a composer pinned to the bottom. Everywhere else in
// Messages that composer means "reply to what's open"; there it posted a NEW
// question, and for a full-timer it was pre-set to file that question under a
// trainee's name. People typed answers into it and created questions.
//
// A question isn't a conversation with anybody, so it stops living beside
// conversations. Here it is a board of cards. There is no ambient input: you
// answer ON a question, and asking is a panel you open on purpose.
import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { MessageCircleQuestion, Plus, Send, Pencil, Clock, Check, X, CornerUpLeft, Trash2, AlertTriangle } from 'lucide-react';
import { db } from '../lib/firebase';
import { useAuth } from '../components/AuthProvider';
import { useI18n } from '../components/LanguageProvider';
import PageContainer from '../components/layout/PageContainer';
import { cn, getUserInitials, relTime, firstName } from '../lib/utils';
import { AppUser } from '../types';
import {
  AskMessage,
  subscribeAsks,
  askVisibleFor,
  askRepliesOf,
  askAnswered,
  askOrigin,
  askWaitedWords,
  addAsk,
  addAskFor,
  addAskReply,
  deleteAsk,
  deleteAskReply,
} from '../lib/asks';

type Filter = 'waiting' | 'answered' | 'mine' | 'all';

const AVATAR = 'rounded-full grid place-items-center font-semibold bg-accent-soft text-accent border border-outline-variant/40 shrink-0';

/** The origin mark (#611) — asked here, or written down in person. */
function OriginMark({ m, me }: { m: AskMessage; me: string }) {
  const org = askOrigin(m, me);
  return (
    <div className={cn('flex items-center gap-1.5 mt-2 text-xs', org.written ? 'text-accent' : 'text-on-surface-variant')}>
      {org.written ? <Pencil className="w-3 h-3 shrink-0" /> : <MessageCircleQuestion className="w-3 h-3 shrink-0" />}
      {org.text}
    </div>
  );
}

interface QuestionCardProps {
  m: AskMessage;
  allAsks: AskMessage[];
  me: string;
  meName: string;
  isFullTimer: boolean;
  onToast: (msg: string) => void;
  // #646: when My Day deep-links to this card, the composer must already be
  // open on mount. Closing the card clears the focus so the back button does
  // not return to the focused view.
  initialOpen?: boolean;
  onClose?: () => void;
}

function QuestionCard({ m, allAsks, me, meName, isFullTimer, onToast, initialOpen, onClose }: QuestionCardProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(Boolean(initialOpen));
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmingReplyDelete, setConfirmingReplyDelete] = useState<string | null>(null);
  const [deletingReply, setDeletingReply] = useState<string | null>(null);

  const replies = askRepliesOf(allAsks, m.id);
  const answered = askAnswered(allAsks, m);
  const mine = m.from === me;
  // A trainee can add to their own question; only a full-timer answers someone else's.
  const canAnswer = isFullTimer || mine;
  // Delete is the asker's (their own question) or a full-timer's (anyone's).
  const canDelete = isFullTimer || mine;
  // Per-reply delete mirrors the question rule: the asker of the question owns
  // every reply (carries the asker's `owner`), and any full-timer can clean up.
  const canDeleteReply = canDelete;
  const who = firstName(m.fromName || 'Someone');

  const close = () => {
    setOpen(false);
    onClose?.();
  };

  const remove = async () => {
    if (deleting) return;
    setDeleting(true);
    // deleteAsk swallows its own errors (handleFirestoreError), like every other
    // write on this page; on success the subscription drops this card.
    await deleteAsk(m.id);
    close();
    onToast(t('ask.deleted_toast', 'Question deleted.'));
  };

  const removeReply = async (replyId: string) => {
    if (deletingReply) return;
    setDeletingReply(replyId);
    // deleteAskReply swallows its own errors; the subscription drops the reply.
    await deleteAskReply(replyId);
    setConfirmingReplyDelete(null);
    setDeletingReply(null);
    onToast(t('ask.delete_reply_toast', 'Answer deleted.'));
  };

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await addAskReply(m.id, { from: me, fromName: meName, body }, m.owner, mine ? null : m.from);
      setDraft('');
      close();
      onToast(
        mine ? t('ask.added_toast', 'Added to your question.') : t('ask.answered_toast', 'Answered {first}.').replace('{first}', who),
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <article
      className={cn(
        'rounded-3xl bg-surface p-5 border transition-colors break-inside-avoid mb-4',
        open ? 'border-accent-line ring-4 ring-accent-soft' : 'border-outline-variant',
      )}
    >
      <div className="flex items-center gap-2.5">
        <span className={cn(AVATAR, 'w-7 h-7 text-[10px]')}>{getUserInitials(m.fromName || 'Someone')}</span>
        <span className="text-sm font-semibold text-on-surface">{m.fromName || 'Someone'}</span>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant bg-surface-container border border-outline-variant rounded-full px-2 py-0.5">
          {t('ask.role_trainee', 'Trainee')}
        </span>
        <span className="flex-1" />
        {answered ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-success bg-success-container rounded-full px-2.5 py-1">
            <Check className="w-3 h-3" />
            {replies.length === 1
              ? t('ask.one_answer', '1 answer')
              : t('ask.n_answers', '{n} answers').replace('{n}', String(replies.length))}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-warning bg-warning-container rounded-full px-2.5 py-1">
            <Clock className="w-3 h-3" />
            {askWaitedWords(m)}
          </span>
        )}
        {canDelete && (
          <button
            type="button"
            aria-label={t('ask.delete_aria', 'Delete this question')}
            title={t('ask.delete_aria', 'Delete this question')}
            onClick={() => setConfirmingDelete(true)}
            className={cn(
              'grid place-items-center w-7 h-7 rounded-lg transition-colors shrink-0',
              confirmingDelete
                ? 'text-error bg-error/10'
                : 'text-on-surface-variant hover:text-error hover:bg-error/10',
            )}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      <p className="text-base leading-relaxed text-on-surface mt-3 text-pretty">{m.body}</p>
      <OriginMark m={m} me={me} />

      <div className="h-px bg-outline-variant my-4" />

      {replies.length > 0 && (
        <div className="flex flex-col gap-3 mb-3">
          {replies.map((r) => (
            <div key={r.id} className="flex gap-2.5">
              <span className={cn(AVATAR, 'w-6 h-6 text-[9px]')}>{getUserInitials(r.fromName || 'Someone')}</span>
              <div className="min-w-0 flex-1">
                {confirmingReplyDelete === r.id ? (
                  <div className="rounded-xl bg-error-container/40 border border-error-container p-3">
                    <div className="flex gap-2">
                      <AlertTriangle className="w-3.5 h-3.5 text-error shrink-0 mt-0.5" />
                      <p className="text-xs text-on-surface text-pretty">
                        <span className="font-semibold">{t('ask.delete_reply_confirm', 'Delete this answer?')}</span>{' '}
                        {t('ask.delete_reply_body', "It comes off the question for the whole team. This can't be undone.")}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 mt-2.5 pl-[22px]">
                      <button
                        type="button"
                        disabled={deletingReply === r.id}
                        onClick={() => void removeReply(r.id)}
                        className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg bg-error text-on-error text-xs font-semibold disabled:opacity-40 disabled:cursor-default"
                      >
                        <Trash2 className="w-3 h-3" />
                        {t('ask.delete_reply', 'Delete answer')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingReplyDelete(null)}
                        className="h-7 px-2.5 rounded-lg border border-outline-variant text-xs font-semibold text-on-surface-variant hover:text-on-surface"
                      >
                        {t('ask.delete_reply_keep', 'Keep it')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-baseline gap-2">
                      <span className="text-xs font-semibold text-on-surface-variant">{r.fromName || 'Someone'}</span>
                      <span className="text-[11px] text-on-surface-variant">{relTime(r.at)}</span>
                      <span className="flex-1" />
                      {canDeleteReply && (
                        <button
                          type="button"
                          aria-label={t('ask.delete_reply_aria', 'Delete this answer')}
                          title={t('ask.delete_reply_aria', 'Delete this answer')}
                          onClick={() => setConfirmingReplyDelete(r.id)}
                          className="grid place-items-center w-6 h-6 rounded-md text-on-surface-variant hover:text-error hover:bg-error/10 transition-colors shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <p className="text-sm leading-relaxed text-on-surface-variant mt-0.5 text-pretty">{r.body}</p>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {confirmingDelete ? (
        <div className="rounded-2xl bg-error-container/40 border border-error-container p-4">
          <div className="flex gap-2.5">
            <AlertTriangle className="w-4 h-4 text-error shrink-0 mt-0.5" />
            <p className="text-sm text-on-surface text-pretty">
              <span className="font-semibold">{t('ask.delete_confirm', 'Delete this question?')}</span>{' '}
              {replies.length > 0
                ? t(
                    'ask.delete_confirm_body_answers',
                    "The answers on it go too, and it comes off the board for the whole team. This can't be undone.",
                  )
                : t('ask.delete_confirm_body', "It comes off the board for the whole team. This can't be undone.")}
            </p>
          </div>
          <div className="flex items-center gap-2.5 mt-3 pl-[26px]">
            <button
              type="button"
              disabled={deleting}
              onClick={() => void remove()}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-error text-on-error text-sm font-semibold disabled:opacity-40 disabled:cursor-default"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {t('ask.delete_question', 'Delete question')}
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              className="h-8 px-3 rounded-lg border border-outline-variant text-sm font-semibold text-on-surface-variant hover:text-on-surface"
            >
              {t('ask.delete_keep', 'Keep it')}
            </button>
          </div>
        </div>
      ) : !canAnswer ? (
        <p className="text-xs italic text-on-surface-variant">
          {t('ask.fulltimer_will_answer', 'A full-timer will answer this.')}
        </p>
      ) : open ? (
        <div>
          <label className="block text-xs font-semibold text-accent mb-1.5" htmlFor={`answer-${m.id}`}>
            {mine
              ? t('ask.add_to_your_question', 'Add to your question')
              : t('ask.your_answer_to', 'Your answer to {first}').replace('{first}', who)}
          </label>
          <textarea
            id={`answer-${m.id}`}
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={
              mine
                ? t('ask.add_placeholder', 'Add to your question…')
                : t('ask.answer_placeholder', "Answer {first} the way you'd say it out loud.").replace('{first}', who)
            }
            className="w-full min-h-[72px] resize-y rounded-lg bg-surface border border-outline-variant px-3 py-2 text-sm text-on-surface outline-none focus:border-accent-line focus:ring-4 focus:ring-accent-soft"
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                void send();
              }
            }}
          />
          <div className="flex items-center gap-3 mt-2.5">
            <button
              type="button"
              disabled={!draft.trim() || sending}
              onClick={() => void send()}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-primary text-on-primary text-sm font-semibold disabled:opacity-40 disabled:cursor-default"
            >
              <Send className="w-3.5 h-3.5" />
              {mine ? t('ask.add', 'Add') : t('ask.send_answer', 'Send answer')}
            </button>
            <button
              type="button"
              onClick={() => { setDraft(''); close(); }}
              className="text-sm text-on-surface-variant hover:text-on-surface"
            >
              {t('actions.cancel', 'Cancel')}
            </button>
            {!mine && (
              <span className="text-xs text-on-surface-variant">
                {t('ask.clears_for_everyone', 'Clears it for every full-timer.')}
              </span>
            )}
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-sm font-semibold text-accent bg-accent-soft border border-accent-line hover:brightness-95"
        >
          <CornerUpLeft className="w-3.5 h-3.5" />
          {mine
            ? t('ask.add_to_your_question', 'Add to your question')
            : t('ask.answer', 'Answer {first}').replace('{first}', who)}
        </button>
      )}
    </article>
  );
}

export default function Questions() {
  const { user, role, impersonateTarget } = useAuth();
  const { t } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // #646: My Day deep-links here with the question it wants answered. Read
  // either the in-router state (writer) or the ?focus= query (shareable), and
  // prefer state when both are present so a fresh push wins.
  const focusedId = (location.state as { focusQuestionId?: string } | null)?.focusQuestionId
    || searchParams.get('focus');
  const clearFocus = () => {
    if (focusedId == null) return;
    navigate(location.pathname, { replace: true });
  };
  // Firestore rules key off the REAL authenticated uid, never the simulated one (#603).
  const me = user?.uid || '';
  const meName = impersonateTarget ? impersonateTarget.name : user?.displayName || 'Member';
  const isFullTimer = role === 'admin';
  // Staff — full-timer or trainee — read the whole team's archive (#645). The
  // route is staff-only, so this is always true here; it is named rather than
  // inlined so the asks API reads the same way it does everywhere else.
  const isStaff = role === 'admin' || role === 'manager';

  const [asks, setAsks] = useState<AskMessage[]>([]);
  const [filter, setFilter] = useState<Filter>('waiting');
  const [askOpen, setAskOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Ask panel
  const [mode, setMode] = useState<'own' | 'for'>('own');
  const [trainees, setTrainees] = useState<AppUser[]>([]);
  const [forWho, setForWho] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);

  useEffect(() => subscribeAsks(setAsks, undefined, { uid: me, isStaff }), [me, isStaff]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  // The roster for "Someone asked me". Deliberately NOT pre-selected: the old
  // channel auto-picked the first trainee, so a stray send filed a question in
  // their name.
  useEffect(() => {
    if (!isFullTimer || !askOpen) return;
    const unsub = onSnapshot(query(collection(db, 'users')), (snap) => {
      const all = (snap?.docs || []).map((d) => ({ uid: d.id, ...d.data() }) as AppUser);
      setTrainees(
        all.filter(
          (u) => (u.role === 'manager' || u.role === 'operator') && !(u.email || '').startsWith('cisa-') && u.approved,
        ),
      );
    });
    return unsub;
  }, [isFullTimer, askOpen]);

  const questions = useMemo(() => askVisibleFor(asks, me, isStaff), [asks, me, isStaff]);

  const counts = useMemo(
    () => ({
      waiting: questions.filter((m) => !askAnswered(asks, m)).length,
      answered: questions.filter((m) => askAnswered(asks, m)).length,
      mine: questions.filter((m) => m.from === me).length,
      all: questions.length,
    }),
    [questions, asks, me],
  );

  const shown = useMemo(() => {
    if (filter === 'waiting') return questions.filter((m) => !askAnswered(asks, m));
    if (filter === 'answered') return questions.filter((m) => askAnswered(asks, m));
    if (filter === 'mine') return questions.filter((m) => m.from === me);
    return questions;
  }, [questions, asks, filter, me]);

  const post = async () => {
    const body = draft.trim();
    if (!body || posting) return;
    if (mode === 'for' && !forWho) return;
    setPosting(true);
    try {
      if (mode === 'for' && forWho) {
        const trainee = trainees.find((t) => t.uid === forWho);
        const askerName = trainee?.displayName || 'Trainee';
        await addAskFor({ askerId: forWho, askerName, takenBy: me, takenByName: meName, body });
        setToast(
          t('ask.written_for_toast', 'Written down for {first} — every full-timer can see it.').replace(
            '{first}',
            firstName(askerName),
          ),
        );
      } else {
        await addAsk({ from: me, fromName: meName, body });
        setToast(t('ask.asked_toast', 'Asked. The team can see it.'));
      }
      setDraft('');
      setForWho(null);
      setAskOpen(false);
    } finally {
      setPosting(false);
    }
  };

  const FILTERS: { id: Filter; label: string; n: number }[] = [
    { id: 'waiting', label: t('ask.filter_waiting', 'Waiting'), n: counts.waiting },
    { id: 'answered', label: t('ask.filter_answered', 'Answered'), n: counts.answered },
    { id: 'mine', label: t('ask.filter_mine', 'Asked by me'), n: counts.mine },
    { id: 'all', label: t('ask.filter_all', 'All'), n: counts.all },
  ];

  return (
    <PageContainer variant="wide">
      <header className="flex flex-wrap items-end gap-4 mb-5">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl lg:text-[26px] font-medium tracking-tight text-on-surface">
            {t('ask.questions_for_team', 'Questions for the team')}
          </h1>
          <p className="text-sm text-on-surface-variant mt-1.5 max-w-[78ch] text-pretty">
            {t(
              'ask.page_sub',
              "Questions that aren't about one person. Nothing here resolves — a question waits until someone answers it, and the first answer clears it for every full-timer.",
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAskOpen((o) => !o)}
          className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-primary text-on-primary text-sm font-semibold shrink-0"
        >
          {askOpen ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {askOpen ? t('actions.close', 'Close') : t('ask.ask_the_team', 'Ask the team')}
        </button>
      </header>

      {askOpen && (
        <section className="rounded-3xl bg-surface border border-accent-line ring-4 ring-accent-soft p-5 mb-5">
          {isFullTimer && (
            <div className="flex flex-wrap gap-2 mb-3">
              {(['own', 'for'] as const).map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setMode(id)}
                  className={cn(
                    'text-xs font-medium rounded-full border px-3 py-1.5 transition-colors',
                    mode === id
                      ? 'bg-primary border-primary text-on-primary'
                      : 'bg-surface border-outline-variant text-on-surface-variant hover:text-on-surface',
                  )}
                >
                  {id === 'own'
                    ? t('ask.my_own_question', 'My own question')
                    : t('ask.someone_asked_me', 'Someone asked me')}
                </button>
              ))}
            </div>
          )}

          {isFullTimer && mode === 'for' && (
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className="text-xs text-on-surface-variant">{t('ask.who_asked', 'Who asked it?')}</span>
              {trainees.map((s) => (
                <button
                  key={s.uid}
                  type="button"
                  onClick={() => setForWho(s.uid)}
                  className={cn(
                    'inline-flex items-center gap-2 h-9 pl-1.5 pr-3 rounded-full border text-[13px] transition-colors',
                    forWho === s.uid
                      ? 'border-primary bg-primary text-on-primary'
                      : 'border-outline-variant bg-surface text-on-surface-variant hover:text-on-surface',
                  )}
                >
                  <span className={cn(forWho === s.uid ? 'bg-on-primary/20 text-on-primary' : AVATAR, 'w-6 h-6 text-[9px] rounded-full grid place-items-center font-semibold shrink-0')}>{getUserInitials(s.displayName)}</span>
                  {firstName(s.displayName)}
                </button>
              ))}
            </div>
          )}

          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={
              mode === 'for'
                ? t('ask.for_placeholder', 'In their words, as close as you can remember…')
                : t('ask.composer_placeholder', "What do you want to ask? Say it how you'd say it out loud.")
            }
            className="w-full min-h-[84px] resize-y rounded-lg bg-surface border border-outline-variant px-3 py-2 text-sm text-on-surface outline-none focus:border-accent-line focus:ring-4 focus:ring-accent-soft"
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                void post();
              }
            }}
          />
          <div className="flex items-center gap-3 mt-3">
            <button
              type="button"
              disabled={!draft.trim() || posting || (mode === 'for' && !forWho)}
              onClick={() => void post()}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-primary text-on-primary text-sm font-semibold disabled:opacity-40 disabled:cursor-default"
            >
              <Send className="w-3.5 h-3.5" />
              {mode === 'for' ? t('ask.write_it_down', 'Write it down') : t('ask.ask_the_team', 'Ask the team')}
            </button>
            {mode === 'for' && (
              <span className="text-xs text-on-surface-variant text-pretty">
                {forWho
                  ? t('ask.goes_under_their_name', 'It goes in under their name, marked as asked in person.')
                  : t('ask.pick_who_first', 'Pick who asked it first — it goes in under their name.')}
              </span>
            )}
          </div>
        </section>
      )}

      <div className="flex flex-wrap gap-2 mb-4">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={cn(
              'inline-flex items-center gap-1.5 text-[13px] font-medium rounded-full border px-3 py-1.5 transition-colors',
              filter === f.id
                ? 'bg-primary border-primary text-on-primary'
                : 'bg-surface border-outline-variant text-on-surface-variant hover:text-on-surface',
            )}
          >
            {f.label}
            <span className="tabular-nums opacity-70">{f.n}</span>
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="flex flex-col items-center gap-2 text-center py-16 px-10">
          <span className="w-11 h-11 rounded-full grid place-items-center bg-accent-soft text-accent">
            <MessageCircleQuestion className="w-5 h-5" />
          </span>
          <div className="text-lg font-medium text-on-surface">
            {filter === 'waiting'
              ? t('ask.empty_waiting_title', 'Nothing waiting')
              : t('ask.empty_none_title', 'Nothing asked yet')}
          </div>
          <p className="text-sm text-on-surface-variant max-w-[44ch] text-pretty">
            {filter === 'waiting'
              ? t('ask.empty_waiting_sub', 'Every question has an answer on it.')
              : t('ask.empty_none_sub', 'A question with no person attached belongs here.')}
          </p>
        </div>
      ) : (
        <div className="columns-1 lg:columns-2 gap-4">
          {shown.map((m) => (
            <QuestionCard
              key={m.id}
              m={m}
              allAsks={asks}
              me={me}
              meName={meName}
              isFullTimer={isFullTimer}
              onToast={setToast}
              initialOpen={focusedId === m.id}
              onClose={focusedId === m.id ? clearFocus : undefined}
            />
          ))}
        </div>
      )}

      {toast && (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-full bg-on-surface text-surface px-4 py-2.5 text-sm shadow-lg"
        >
          {toast}
        </div>
      )}
    </PageContainer>
  );
}
