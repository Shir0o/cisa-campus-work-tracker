import React, { useRef, useState } from "react";
import { MessageSquare, Send } from "lucide-react";
import { cn, relTime } from "../lib/utils";
import { useAuth } from "./AuthProvider";
import {
  THREAD_REACTIONS,
  addThreadMessage,
  repliesOf,
  threadsFor,
  toggleReaction,
  useThreads,
  type ThreadMessage,
} from "../lib/threads";

const firstName = (name?: string) => (name || "Someone").trim().split(/\s+/)[0];
const getInitials = (name?: string) => {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
};

interface ThreadProps {
  contactId: string;
  interactionId?: string | null;
  meStaffId: string;
  recipientUid?: string | null;
  contactName?: string;
  compact?: boolean;
  scope?: "team" | null;
}

interface ThrRowProps {
  m: ThreadMessage;
  meStaffId: string;
  contactId: string;
  children?: React.ReactNode;
}

function ThrRow({ m, meStaffId, contactId, children }: ThrRowProps) {
  const mine = m.from === meStaffId;

  const reactions = m.reactions || [];
  const tally: Record<string, number> = {};
  for (const r of reactions) tally[r.emoji] = (tally[r.emoji] || 0) + 1;
  const reactedByMe = (emoji: string) =>
    reactions.some((r) => r.emoji === emoji && r.by === meStaffId);
  const unused = THREAD_REACTIONS.filter((e) => !tally[e]);

  return (
    <div className={cn("flex gap-3", mine && "flex-row-reverse")}>
      <div
        className="w-8 h-8 rounded-full bg-stage-accent/20 text-stage-accent font-semibold text-xs grid place-items-center flex-none"
        aria-hidden
      >
        {getInitials(m.fromName)}
      </div>

      <div className={cn("min-w-0 flex-1", mine && "text-right")}>
        <div className="flex items-baseline gap-2 flex-wrap text-xs text-on-surface-variant mb-1">
          <span className="font-semibold text-on-surface">
            {mine ? "You" : firstName(m.fromName)}
          </span>
          <span>{relTime(m.at)}</span>
        </div>

        <div
          className={cn(
            "p-3 rounded-2xl text-sm leading-relaxed text-on-surface whitespace-pre-wrap border text-left inline-block max-w-full",
            mine
              ? "bg-stage-accent-soft border-stage-accent/20 rounded-tr-none"
              : "bg-surface-container-high border-outline-variant/30 rounded-tl-none",
          )}
        >
          {m.body}
        </div>

        <div className="mt-1 flex items-center gap-1.5 flex-wrap">
          {Object.keys(tally).map((emoji) => (
            <button
              key={emoji}
              onClick={() => toggleReaction(contactId, m.id, meStaffId, emoji)}
              title="React"
              className={cn(
                "inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs transition-colors",
                reactedByMe(emoji)
                  ? "border-accent-line bg-primary/10 text-accent"
                  : "border-outline-variant/50 text-on-surface-variant hover:border-outline-variant",
              )}
            >
              <span>{emoji}</span>
              <span className="font-semibold tabular-nums">{tally[emoji]}</span>
            </button>
          ))}
          {unused.length > 0 && (
            <span className="inline-flex items-center gap-0.5 opacity-60 hover:opacity-100 transition-opacity">
              {unused.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => toggleReaction(contactId, m.id, meStaffId, emoji)}
                  title="Add reaction"
                  className="w-6 h-6 grid place-items-center rounded-full text-xs text-on-surface-variant hover:bg-surface-container-high transition-colors"
                >
                  {emoji}
                </button>
              ))}
            </span>
          )}
        </div>

        {children}
      </div>
    </div>
  );
}

interface ThreadMsgProps {
  m: ThreadMessage;
  meStaffId: string;
  contactId: string;
  recipientUid?: string | null;
  contactName?: string;
}

function ThreadMsg({ m, meStaffId, contactId, recipientUid, contactName }: ThreadMsgProps) {
  const { user } = useAuth();
  const allMessages = useThreads(contactId);
  const replies = repliesOf(allMessages, m.id);
  const [replying, setReplying] = useState(false);
  const [draft, setDraft] = useState("");

  const sendReply = () => {
    const body = draft.trim();
    if (!body) return;
    void addThreadMessage(
      contactId,
      {
        interactionId: m.interactionId,
        parentId: m.id,
        scope: m.scope,
        from: meStaffId,
        fromName: user?.displayName || "Someone",
        kind: "comment",
        body,
      },
      { to: recipientUid, contactName },
    );
    setDraft("");
    setReplying(false);
  };

  return (
    <div className="space-y-2">
      <ThrRow m={m} meStaffId={meStaffId} contactId={contactId}>
        <button
          onClick={() => setReplying(!replying)}
          className="mt-1 inline-flex items-center gap-1 text-xs text-accent font-medium hover:underline"
        >
          <MessageSquare className="w-3 h-3" />
          {replying ? "Cancel reply" : replies.length > 0 ? `${replies.length} ${replies.length === 1 ? "reply" : "replies"}` : "Reply"}
        </button>
      </ThrRow>

      {(replies.length > 0 || replying) && (
        <div className="pl-6 border-l-2 border-outline-variant/30 space-y-3 mt-2">
          {replies.map((r) => (
            <ThrRow key={r.id} m={r} meStaffId={meStaffId} contactId={contactId} />
          ))}

          {replying && (
            <div className="pt-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Write a reply…"
                rows={2}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    sendReply();
                  }
                }}
                className="w-full p-2.5 rounded-xl bg-surface-container-high border border-outline-variant/40 text-sm text-on-surface placeholder:text-on-surface-variant/50 resize-none focus:outline-none focus:border-primary/40 transition-colors"
              />
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <span className="text-[11px] text-on-surface-variant/60">⌘↵ to reply</span>
                <button
                  onClick={sendReply}
                  disabled={!draft.trim()}
                  className="inline-flex items-center gap-1 px-2.5 h-7 rounded-full bg-primary text-on-primary text-xs font-medium hover:opacity-90 transition disabled:opacity-50"
                >
                  <Send className="w-3 h-3" /> Reply
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Thread({
  contactId,
  interactionId = null,
  meStaffId,
  recipientUid = null,
  contactName,
  compact = false,
  scope = null,
}: ThreadProps) {
  const { user } = useAuth();
  const allMessages = useThreads(contactId);
  const messages = threadsFor(allMessages, interactionId, scope);

  const [draft, setDraft] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);

  const post = () => {
    const body = draft.trim();
    if (!body) {
      taRef.current?.focus();
      return;
    }
    void addThreadMessage(
      contactId,
      {
        interactionId,
        scope,
        from: meStaffId,
        fromName: user?.displayName || "Someone",
        kind: "comment",
        body,
      },
      { to: recipientUid, contactName },
    );
    setDraft("");
  };

  const placeholder =
    scope === "team"
      ? "Add to the team's discussion…"
      : compact
        ? "Add a comment…"
        : "Add a comment…";

  return (
    <div className="flex flex-col">
      {messages.length === 0 ? (
        <div className="text-sm italic text-on-surface-variant/70 pb-3">
          {compact
            ? "No comments on this interaction yet."
            : scope === "team"
              ? "Nothing here yet — start the team's discussion below."
              : "Nothing here yet — leave the first comment below."}
        </div>
      ) : (
        <div className={cn("flex flex-col space-y-4", compact && "space-y-3")}>
          {messages.map((m) => (
            <ThreadMsg
              key={m.id}
              m={m}
              meStaffId={meStaffId}
              contactId={contactId}
              recipientUid={recipientUid}
              contactName={contactName}
            />
          ))}
        </div>
      )}

      {/* Compose */}
      <div className={cn(messages.length > 0 && "mt-4")}>
        <textarea
          ref={taRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          rows={compact ? 2 : 3}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              post();
            }
          }}
          className="w-full p-3 rounded-xl bg-surface-container-high border border-outline-variant/40 text-sm text-on-surface placeholder:text-on-surface-variant/50 resize-none focus:outline-none focus:border-primary/40 transition-colors"
        />

        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-[11px] text-on-surface-variant/60">⌘↵ to post</span>
          <button
            onClick={post}
            disabled={!draft.trim()}
            className="inline-flex items-center gap-1.5 px-3 h-8 rounded-full bg-primary text-on-primary text-xs font-medium hover:opacity-90 active:scale-95 transition disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" /> Comment
          </button>
        </div>
      </div>
    </div>
  );
}

