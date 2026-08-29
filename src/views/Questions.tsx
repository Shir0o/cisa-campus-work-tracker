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
import { collection, onSnapshot, query } from 'firebase/firestore';
import { MessageCircleQuestion, Plus, Send, Pencil, Clock, Check, X, CornerUpLeft } from 'lucide-react';
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
}

function QuestionCard({ m, allAsks, me, meName, isFullTimer, onToast }: QuestionCardProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const replies = askRepliesOf(allAsks, m.id);
  const answered = askAnswered(allAsks, m);
  const mine = m.from === me;
  // A trainee can add to their own question; only a full-timer answers someone else's.
  const canAnswer = isFullTimer || mine;
  const who = firstName(m.fromName || 'Someone');

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await addAskReply(m.id, { from: me, fromName: meName, body }, m.owner, mine ? null : m.from);
      setDraft('');
      setOpen(false);
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
        'rounded-3xl bg-surface p-5 border transition-colors',
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
      </div>

      <p className="text-base leading-relaxed text-on-surface mt-3 text-pretty">{m.body}</p>
      <OriginMark m={m} me={me} />

      <div className="h-px bg-outline-variant my-4" />

      {replies.length > 0 && (
        <div className="flex flex-col gap-3 mb-3">
          {replies.map((r) => (
            <div key={r.id} className="flex gap-2.5">
              <span className={cn(AVATAR, 'w-6 h-6 text-[9px]')}>{getUserInitials(r.fromName || 'Someone')}</span>
              <div className="min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-semibold text-on-surface-variant">{r.fromName || 'Someone'}</span>
                  <span className="text-[11px] text-on-surface-variant">{relTime(r.at)}</span>
                </div>
                <p className="text-sm leading-relaxed text-on-surface-variant mt-0.5 text-pretty">{r.body}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {!canAnswer ? (
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
              onClick={() => { setOpen(false); setDraft(''); }}
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
                      ? 'bg-accent-soft border-accent-line text-accent'
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
                      ? 'border-accent bg-accent-soft text-on-surface'
                      : 'border-outline-variant bg-surface text-on-surface-variant hover:text-on-surface',
                  )}
                >
                  <span className={cn(AVATAR, 'w-6 h-6 text-[9px]')}>{getUserInitials(s.displayName)}</span>
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
                ? 'bg-accent-soft border-accent-line text-accent'
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
        <div className="grid gap-4 lg:grid-cols-2 items-start">
          {shown.map((m) => (
            <QuestionCard
              key={m.id}
              m={m}
              allAsks={asks}
              me={me}
              meName={meName}
              isFullTimer={isFullTimer}
              onToast={setToast}
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
