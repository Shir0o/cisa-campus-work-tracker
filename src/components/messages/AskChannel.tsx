import React, { useState, useEffect, useRef } from 'react';
import {
  MessageSquare,
  Send,
  Pencil,
  ChevronLeft,
  X
} from 'lucide-react';
import {
  collection,
  query,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { cn, getUserInitials, relTime, firstName } from '../../lib/utils';
import {
  AskMessage,
  subscribeAsks,
  subscribeMyAsks,
  askVisibleFor,
  askUnreadFor,
  askTakenBy,
  askWaitedWords,
  askRepliesOf,
  askAnswered,
  addAsk,
  addAskFor,
  addAskReply
} from '../../lib/asks';
import { AppUser } from '../../types';

export const ASK_CONV_ID = 'ASK';

export interface AskChannelRowProps {
  me: string;
  role: string;
  isFullTimer: boolean;
  active: boolean;
  onClick: () => void;
  asks?: AskMessage[];
}

export function AskChannelRow({
  me,
  isFullTimer,
  active,
  onClick,
  asks: externalAsks,
}: AskChannelRowProps) {
  const [internalAsks, setInternalAsks] = useState<AskMessage[]>([]);

  useEffect(() => {
    if (externalAsks !== undefined) return;
    const unsub = subscribeAsks(setInternalAsks, undefined, {
      uid: me,
      isAdmin: isFullTimer,
    });
    return unsub;
  }, [me, isFullTimer, externalAsks]);

  const allAsks = externalAsks !== undefined ? externalAsks : internalAsks;
  const isRead = (key: string) => {
    return !!localStorage.getItem(`read_${key}`);
  };

  const qs = askVisibleFor(allAsks, me, isFullTimer);
  const unread = askUnreadFor(allAsks, me, isFullTimer, isRead);
  const waiting = qs.filter((m) => !askAnswered(allAsks, m)).length;

  const sub = isFullTimer
    ? (waiting ? `${waiting} waiting on an answer` : "Everyone's questions, answered")
    : (qs.length ? "Your questions to the team" : "Ask the team anything");

  return (
    <div
      className={cn("msgs-item msgs-askrow", active && "active", unread > 0 && "unread")}
      onClick={onClick}
    >
      <span className="msgs-cluster ask">
        <MessageSquare className="w-4 h-4" />
      </span>
      <div className="msgs-item-main">
        <div className="msgs-item-top">
          <span className="msgs-item-name">Questions for the team</span>
          {qs.length > 0 && (
            <span className="msgs-item-time">{relTime(qs[0].at)}</span>
          )}
        </div>
        <div className="msgs-item-bot">
          <span className="msgs-item-preview">{sub}</span>
          {unread > 0 && <span className="msgs-unread-dot"></span>}
        </div>
      </div>
    </div>
  );
}

interface AskMsgProps {
  m: AskMessage;
  allAsks: AskMessage[];
  me: string;
  onOpen: () => void;
  open: boolean;
}

export function AskMsg({ m, allAsks, onOpen, open }: AskMsgProps) {
  const pen = askTakenBy(m);
  const replies = askRepliesOf(allAsks, m.id);
  const answered = askAnswered(allAsks, m);
  const last = replies[replies.length - 1];

  const uniqueReplierNames = Array.from(new Set(replies.map((r) => r.fromName || r.from))).slice(0, 3);

  return (
    <div className={cn("msgb aska", open && "open")}>
      <div className="w-7 h-7 rounded-full bg-primary/10 text-accent font-semibold flex items-center justify-center text-[10px] shrink-0 border border-outline-variant/20">
        {getUserInitials(m.fromName || 'Someone')}
      </div>
      <div className="msgb-col">
        <div className="msgb-name">
          {m.fromName || 'Someone'} <span className="aska-role">In training</span>
        </div>
        <div className="msgb-row">
          <div className="msgb-bubble">{m.body}</div>
        </div>
        {pen && (
          <div className="aska-pen">
            <Pencil className="w-3 h-3 shrink-0" />
            Asked in person · written down by {firstName(pen.name)}
          </div>
        )}
        <div className="msgb-foot">
          <span className="msgb-when">{relTime(m.at)}</span>
          {!answered && (
            <span className="aska-waiting">
              {askWaitedWords(m)} · nobody's answered yet
            </span>
          )}
        </div>
        <button
          type="button"
          className={cn("msgb-thread", answered && "has")}
          onClick={onOpen}
        >
          {replies.length > 0 && (
            <span className="msgb-thread-who">
              {uniqueReplierNames.map((name, i) => (
                <div
                  key={i}
                  className="w-5 h-5 rounded-full bg-primary/20 text-accent font-semibold flex items-center justify-center text-[9px] border border-surface shadow-sm"
                >
                  {getUserInitials(name)}
                </div>
              ))}
            </span>
          )}
          <span className="msgb-thread-l">
            {replies.length === 0
              ? 'Answer this'
              : replies.length === 1
              ? '1 answer'
              : `${replies.length} answers`}
          </span>
          {last && (
            <span className="msgb-thread-when">last {relTime(last.at)}</span>
          )}
        </button>
      </div>
    </div>
  );
}

interface AskMsgPlainProps {
  m: AskMessage;
  reply?: boolean;
}

export function AskMsgPlain({ m, reply }: AskMsgPlainProps) {
  const pen = askTakenBy(m);
  return (
    <div className={cn("msgb aska-plain", reply && "is-reply")}>
      <div className="w-7 h-7 rounded-full bg-primary/10 text-accent font-semibold flex items-center justify-center text-[10px] shrink-0 border border-outline-variant/20">
        {getUserInitials(m.fromName || 'Someone')}
      </div>
      <div className="msgb-col">
        <div className="msgb-name">{m.fromName || 'Someone'}</div>
        <div className="msgb-row">
          <div className="msgb-bubble">{m.body}</div>
        </div>
        {pen && (
          <div className="aska-pen">
            <Pencil className="w-3 h-3 shrink-0" />
            written down by {firstName(pen.name)}
          </div>
        )}
        <div className="msgb-foot">
          <span className="msgb-when">{relTime(m.at)}</span>
        </div>
      </div>
    </div>
  );
}

export interface AskThreadPaneProps {
  id: string;
  allAsks: AskMessage[];
  me: string;
  meName: string;
  isFullTimer: boolean;
  onClose: () => void;
  onToast?: (msg: string) => void;
}

export function AskThreadPane({
  id,
  allAsks,
  me,
  meName,
  isFullTimer,
  onClose,
  onToast,
}: AskThreadPaneProps) {
  const q = allAsks.find((m) => m.id === id);
  const [draft, setDraft] = useState('');
  const replies = q ? askRepliesOf(allAsks, q.id) : [];
  const canAnswer = isFullTimer || (q && q.from === me);

  if (!q) return null;

  const first = firstName(q.fromName || 'Someone');

  const send = async () => {
    const b = draft.trim();
    if (!b) return;
    await addAskReply(q.id, { from: me, fromName: meName, body: b }, q.owner, q.from !== me ? q.from : null);
    localStorage.setItem(`read_ask:${q.id}`, Date.now().toString());
    setDraft('');
    if (onToast) {
      onToast(q.from === me ? 'Added to your question.' : `Answered ${first}.`);
    }
  };

  return (
    <div className="msgs-pane">
      <div className="msgs-pane-head">
        <div>
          <div className="msgs-pane-title">The answers</div>
          <div className="msgs-pane-sub">{q.fromName || 'Someone'} asked · {askWaitedWords(q)}</div>
        </div>
        <button type="button" className="icon-btn" onClick={onClose}>
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="msgs-pane-stream">
        <AskMsgPlain m={q} />
        {replies.length === 0 && (
          <div className="msgs-pane-none">
            No answers yet. The first one clears it for every full-timer.
          </div>
        )}
        {replies.map((r) => (
          <AskMsgPlain key={r.id} m={r} reply />
        ))}
      </div>
      {canAnswer ? (
        <div className="msgs-composer msgs-pane-composer">
          <div className="msgs-composer-row">
            <textarea
              className="li-input msgs-ta"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={
                q.from === me
                  ? 'Add to your question…'
                  : `Answer ${first} the way you'd say it out loud.`
              }
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault();
                  void send();
                }
              }}
            />
            <button
              type="button"
              className="msgs-send"
              disabled={!draft.trim()}
              onClick={() => void send()}
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : (
        <div className="msgs-readonly">
          <span>A full-timer will answer this.</span>
        </div>
      )}
    </div>
  );
}

export interface AskChannelProps {
  me: string;
  meName: string;
  role: string;
  isFullTimer: boolean;
  isMobile: boolean;
  onToast?: (msg: string) => void;
  onBack?: () => void;
}

export function AskChannel({
  me,
  meName,
  isFullTimer,
  isMobile,
  onToast,
  onBack,
}: AskChannelProps) {
  const [asks, setAsks] = useState<AskMessage[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [mode, setMode] = useState<'for' | 'own'>(isFullTimer ? 'for' : 'own');
  const [trainees, setTrainees] = useState<AppUser[]>([]);
  const [forWho, setForWho] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const streamRef = useRef<HTMLDivElement>(null);

  // Subscribe to asks
  useEffect(() => {
    const unsub = subscribeAsks(setAsks, undefined, {
      uid: me,
      isAdmin: isFullTimer,
    });
    return unsub;
  }, [me, isFullTimer]);

  // Subscribe to trainees / operators roster for "Who asked it?"
  useEffect(() => {
    if (!isFullTimer) return;
    const q = query(collection(db, 'users'));
    const unsub = onSnapshot(q, (snap) => {
      const docs = snap?.docs || [];
      const all = docs.map((d) => ({ uid: d.id, ...d.data() } as AppUser));
      const filtered = all.filter((u) => {
        const isTraineeRole = u.role === 'manager' || u.role === 'operator';
        const notBot = !(u.email || '').startsWith('cisa-');
        return isTraineeRole && notBot && u.approved;
      });
      setTrainees(filtered);
      if (filtered.length > 0 && !forWho) {
        setForWho(filtered[0].uid);
      }
    });
    return unsub;
  }, [isFullTimer, forWho]);

  const qs = askVisibleFor(asks, me, isFullTimer).slice().sort(
    (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()
  );

  useEffect(() => {
    if (streamRef.current) {
      streamRef.current.scrollTop = streamRef.current.scrollHeight;
    }
  }, [qs.length]);

  const post = async () => {
    const b = draft.trim();
    if (!b) return;

    if (mode === 'for' && forWho) {
      const trainee = trainees.find((t) => t.uid === forWho);
      const askerName = trainee?.displayName || 'Trainee';
      await addAskFor({
        askerId: forWho,
        askerName,
        takenBy: me,
        takenByName: meName,
        body: b,
      });
      if (onToast) {
        onToast(`Written down for ${firstName(askerName)} — every full-timer can see it.`);
      }
    } else {
      await addAsk({
        from: me,
        fromName: meName,
        body: b,
      });
      if (onToast) {
        onToast('Asked the team.');
      }
    }
    setDraft('');
  };

  return (
    <>
      <div className="msgs-thread flex flex-col flex-1 h-full bg-surface-container-lowest min-w-0">
        <div className="msgs-thread-head">
          {isMobile && (
            <button type="button" className="icon-btn" onClick={onBack}>
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}
          <span className="msgs-cluster ask">
            <MessageSquare className="w-4 h-4" />
          </span>
          <div className="msgs-thread-id min-w-0 flex-1">
            <div className="msgs-thread-title">Questions for the team</div>
            <div className="msgs-thread-sub">
              Not about one person. Nothing here is ever resolved — a question waits until someone answers it.
            </div>
          </div>
        </div>

        <div className="msgs-stream" ref={streamRef}>
          {qs.length === 0 && (
            <div className="msgs-empty">
              <span className="ntf-empty-ico">
                <MessageSquare className="w-5 h-5 text-accent" />
              </span>
              <div className="ntf-empty-title">Nothing asked yet</div>
              <div className="ntf-empty-sub">A question with no person attached belongs here.</div>
            </div>
          )}
          {qs.map((m) => (
            <AskMsg
              key={m.id}
              m={m}
              allAsks={asks}
              me={me}
              open={openId === m.id}
              onOpen={() => {
                setOpenId(m.id);
                localStorage.setItem(`read_ask:${m.id}`, Date.now().toString());
              }}
            />
          ))}
        </div>

        <div className="msgs-composer aska-composer">
          {isFullTimer && (
            <div className="aska-modes">
              <button
                type="button"
                className={cn("msgs-pill", mode === 'for' && "on")}
                onClick={() => setMode('for')}
              >
                Someone asked me
              </button>
              <button
                type="button"
                className={cn("msgs-pill", mode === 'own' && "on")}
                onClick={() => setMode('own')}
              >
                My own question
              </button>
            </div>
          )}

          {mode === 'for' && isFullTimer && (
            <div className="aska-who">
              <span className="aska-who-l">Who asked it?</span>
              {trainees.map((s) => (
                <button
                  type="button"
                  key={s.uid}
                  className={cn("aska-whobtn", forWho === s.uid && "on")}
                  onClick={() => setForWho(s.uid)}
                >
                  <div className="avatar w-5 h-5 rounded-full bg-primary/20 text-accent font-semibold flex items-center justify-center text-[9px]">
                    {getUserInitials(s.displayName)}
                  </div>
                  {firstName(s.displayName)}
                </button>
              ))}
            </div>
          )}

          <div className="msgs-composer-row">
            <textarea
              className="li-input msgs-ta"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={
                mode === 'for'
                  ? 'In their words, as close as you can remember…'
                  : 'Ask the team something real…'
              }
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault();
                  void post();
                }
              }}
            />
            <button
              type="button"
              className="msgs-send"
              disabled={!draft.trim() || (mode === 'for' && !forWho)}
              onClick={() => void post()}
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
          {mode === 'for' && isFullTimer && (
            <p className="aska-note">
              It goes in under their name, marked as asked in person — every full-timer sees it.
            </p>
          )}
        </div>
      </div>

      {openId && (
        <AskThreadPane
          id={openId}
          allAsks={asks}
          me={me}
          meName={meName}
          isFullTimer={isFullTimer}
          onClose={() => setOpenId(null)}
          onToast={onToast}
        />
      )}
    </>
  );
}
