import React, { useLayoutEffect, useMemo, useRef, useState } from "react";
import { MessageSquare, Send, Trash2 } from "lucide-react";
import { cn, relTime } from "../lib/utils";
import { useCommand } from "../lib/commands";
import { useAuth } from "./AuthProvider";
import {
  THREAD_REACTIONS,
  addThreadMessage,
  deleteThreadMessage,
  repliesOf,
  threadsFor,
  toggleReaction,
  useThreads,
  type ThreadMessage,
  type ThreadStakeholders,
} from "../lib/threads";
import { MentionAutocomplete } from "./common/MentionAutocomplete";
import {
  extractMentionCandidate,
  filterMentionCandidates,
  reconcileMentionedUsers,
  type MentionUser,
} from "../lib/mentions";
import { isFullTimer } from "../lib/walking";
import {
  COMPOSE_KINDS,
  ComposeKindPicker,
  type ComposeKind,
} from "./ComposeKindPicker";
import { useLanguage } from "./LanguageProvider";

export const firstName = (name?: string) => (name || "Someone").trim().split(/\s+/)[0];

/** The messages to render: the ones a caller already holds, or a subscription
 *  of our own. A caller that passes them in opens no live query — "Around the
 *  team" already subscribes to every thread in the product, and mounting this
 *  renderer per card must not open a second one each time (#1012). */
function useThreadMessages(
  contactId: string,
  supplied?: ThreadMessage[] | null,
): ThreadMessage[] {
  const subscribed = useThreads(supplied ? null : contactId);
  return supplied ?? subscribed;
}
const getInitials = (name?: string) => {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
};

export interface TeamMemberLike {
  id: string;
  name: string;
  role?: string;
  initials?: string;
}

interface ThreadProps {
  contactId: string;
  interactionId?: string | null;
  meStaffId: string;
  recipientUid?: string | null;
  contactName?: string;
  compact?: boolean;
  scope?: "team" | null;
  pane?: boolean;
  teamMembers?: TeamMemberLike[];
  contactStakeholders?: ThreadStakeholders | null;
  /** The messages to render, supplied by a caller that already holds them.
   *  When given, this renderer subscribes to nothing: "Around the team"
   *  already subscribes to every thread in the product and passes the slice
   *  down, so mounting it on a card must not open a second live query per
   *  card — nor drag Firestore into a page-level test seam (#1012). Omit it
   *  and the renderer subscribes for itself, as the contact page does. */
  messages?: ThreadMessage[] | null;
  /** Told what was just posted, so a caller can show it immediately rather
   *  than wait for a round trip. `landed` resolves to the id the write
   *  actually got, which is how a caller recognises its own document when the
   *  subscription delivers it (#1012). */
  onPosted?: (message: ThreadMessage, landed: Promise<string | null>) => void;
  /** Messages to mark briefly as new — the writer's own, just posted. */
  highlightIds?: ReadonlySet<string> | null;
  highlightLabel?: string;
}


interface ThrRowProps {
  m: ThreadMessage;
  meStaffId: string;
  contactId: string;
  children?: React.ReactNode;
  /** Marked briefly as new, so the writer's eye finds their own message
   *  without hunting for it (#1012). */
  justPosted?: boolean;
  justPostedLabel?: string;
}

function ThrRow({ m, meStaffId, contactId, children, justPosted, justPostedLabel }: ThrRowProps) {
  const mine = m.from === meStaffId;
  const { isAdmin } = useAuth();
  const canDelete = mine || isAdmin;

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
          {justPosted && justPostedLabel && (
            <span className="px-1.5 py-px rounded-full bg-accent/15 text-accent font-semibold text-[10px] uppercase tracking-wide">
              {justPostedLabel}
            </span>
          )}
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
          {canDelete && (
            <button
              onClick={() => deleteThreadMessage(contactId, m.id)}
              aria-label="Delete message"
              title="Delete message"
              className="w-6 h-6 grid place-items-center rounded-full text-on-surface-variant/60 hover:text-error hover:bg-surface-container-high transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
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
  teamMembers?: TeamMemberLike[];
  contactStakeholders?: ThreadStakeholders | null;
  /** Supplied by a caller that already holds them — see `ThreadProps`. */
  messages?: ThreadMessage[] | null;
  highlightIds?: ReadonlySet<string> | null;
  highlightLabel?: string;
}

function ThreadMsg({
  m,
  meStaffId,
  contactId,
  recipientUid,
  contactName,
  teamMembers = [],
  contactStakeholders,
  messages: propsMessages,
  highlightIds,
  highlightLabel,
}: ThreadMsgProps) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const allMessages = useThreadMessages(contactId, propsMessages);
  const replies = repliesOf(allMessages, m.id);
  const [replying, setReplying] = useState(false);
  const [draft, setDraft] = useState("");
  const replyRef = useRef<HTMLTextAreaElement>(null);

  // Mention autocomplete state
  const [mentionMatch, setMentionMatch] = useState<{ query: string; atIndex: number } | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedUsers, setSelectedUsers] = useState<Array<{ uid: string; name: string }>>([]);

  const mentionCandidates = useMemo(() => {
    if (!mentionMatch) return [];
    const candidates: MentionUser[] = teamMembers.map((tm) => {
      const isFt = tm.role === "Full-timer" || tm.role === "admin" || tm.role === "full_timer" || isFullTimer(tm.id);
      return {
        uid: tm.id,
        name: tm.name,
        role: isFt ? "admin" : "manager",
      };
    });
    return filterMentionCandidates(candidates, mentionMatch.query, m.scope === "team");
  }, [mentionMatch, teamMembers, m.scope]);

  const handleDraftChange = (val: string, cursorPos: number) => {
    setDraft(val);
    const match = extractMentionCandidate(val, cursorPos);
    setMentionMatch(match);
    setSelectedIndex(0);
  };

  const handleSelectMention = (targetUser: MentionUser) => {
    if (!mentionMatch) return;
    const before = draft.slice(0, mentionMatch.atIndex);
    const after = draft.slice(mentionMatch.atIndex + 1 + mentionMatch.query.length);
    const nextText = `${before}@${targetUser.name} ${after}`;
    setDraft(nextText);
    setSelectedUsers((prev) => [...prev, { uid: targetUser.uid, name: targetUser.name }]);
    setMentionMatch(null);
    setTimeout(() => {
      if (replyRef.current) {
        const nextPos = before.length + targetUser.name.length + 2;
        replyRef.current.focus();
        replyRef.current.setSelectionRange(nextPos, nextPos);
      }
    }, 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!mentionMatch || mentionCandidates.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((idx) => (idx + 1) % mentionCandidates.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((idx) => (idx - 1 + mentionCandidates.length) % mentionCandidates.length);
    } else if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      handleSelectMention(mentionCandidates[selectedIndex]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setMentionMatch(null);
    }
  };

  const sendReply = () => {
    const body = draft.trim();
    if (!body) return;
    const mentionedUserIds = reconcileMentionedUsers(body, selectedUsers);
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
        ...(mentionedUserIds.length > 0 ? { mentionedUserIds } : {}),
      },
      {
        to: recipientUid,
        contactName,
        ...(contactStakeholders ? { stakeholders: contactStakeholders } : {}),
      },
    );

    setDraft("");
    setSelectedUsers([]);
    setMentionMatch(null);
    setReplying(false);
  };

  useCommand({
    id: `thread.reply:${m.id}`,
    scope: "compose",
    description: "Reply in thread",
    shortcut: { key: "Enter", mod: true },
    minRole: "operator",
    when: (e) => e.target === replyRef.current,
    available: () => replying && (!mentionMatch || mentionCandidates.length === 0),
    handler: sendReply,
  });

  return (
    <div className="space-y-2">
      <ThrRow
        m={m}
        meStaffId={meStaffId}
        contactId={contactId}
        justPosted={!!highlightIds?.has(m.id)}
        justPostedLabel={highlightLabel}
      >
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
            <ThrRow
              key={r.id}
              m={r}
              meStaffId={meStaffId}
              contactId={contactId}
              justPosted={!!highlightIds?.has(r.id)}
              justPostedLabel={highlightLabel}
            />
          ))}

          {replying && (
            <div className="pt-2 relative">
              {mentionMatch && mentionCandidates.length > 0 && (
                <MentionAutocomplete
                  candidates={mentionCandidates}
                  selectedIndex={selectedIndex}
                  onSelect={handleSelectMention}
                  anchorEl={replyRef.current}
                />
              )}
              <textarea
                ref={replyRef}
                value={draft}
                onChange={(e) => handleDraftChange(e.target.value, e.target.selectionStart || 0)}
                onKeyDown={handleKeyDown}
                placeholder="Write a reply…"
                rows={2}
                autoFocus
                className="w-full p-2.5 rounded-xl bg-surface-container-high border border-outline-variant/40 text-sm text-on-surface placeholder:text-on-surface-variant/50 resize-none focus:outline-none focus:border-primary/40 transition-colors"
              />
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <span className="text-[11px] text-on-surface-variant/60">⌘↵ to reply</span>
                <button
                  onClick={sendReply}
                  disabled={!draft.trim()}
                  className="inline-flex items-center gap-1 px-2.5 min-h-11 sm:min-h-0 sm:h-7 rounded-full bg-primary text-on-primary text-xs font-medium hover:opacity-90 transition disabled:opacity-50"
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
  pane = false,
  teamMembers = [],
  contactStakeholders,
  messages: propsMessages,
  onPosted,
  highlightIds,
  highlightLabel,
}: ThreadProps) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const allMessages = useThreadMessages(contactId, propsMessages);
  const messages = threadsFor(allMessages, interactionId, scope);

  const [draft, setDraft] = useState("");
  // What is being written (#813). THREAD_KINDS has carried five kinds since it
  // was written and this composer hardcoded "comment" at both post sites, so a
  // Full-timer has never been able to ask a question on a contact and
  // `NOTIFY_TITLE.question` has never rendered. Three are offered: the two the
  // team asked for, plus the plain comment that was the only option.
  const [composeKind, setComposeKind] = useState<ComposeKind>("comment");
  const taRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Mention autocomplete state
  const [mentionMatch, setMentionMatch] = useState<{ query: string; atIndex: number } | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedUsers, setSelectedUsers] = useState<Array<{ uid: string; name: string }>>([]);

  const mentionCandidates = useMemo(() => {
    if (!mentionMatch) return [];
    const candidates: MentionUser[] = teamMembers.map((tm) => {
      const isFt = tm.role === "Full-timer" || tm.role === "admin" || tm.role === "full_timer" || isFullTimer(tm.id);
      return {
        uid: tm.id,
        name: tm.name,
        role: isFt ? "admin" : "manager",
      };
    });
    return filterMentionCandidates(candidates, mentionMatch.query, scope === "team");
  }, [mentionMatch, teamMembers, scope]);

  const handleDraftChange = (val: string, cursorPos: number) => {
    setDraft(val);
    const match = extractMentionCandidate(val, cursorPos);
    setMentionMatch(match);
    setSelectedIndex(0);
  };

  const handleSelectMention = (targetUser: MentionUser) => {
    if (!mentionMatch) return;
    const before = draft.slice(0, mentionMatch.atIndex);
    const after = draft.slice(mentionMatch.atIndex + 1 + mentionMatch.query.length);
    const nextText = `${before}@${targetUser.name} ${after}`;
    setDraft(nextText);
    setSelectedUsers((prev) => [...prev, { uid: targetUser.uid, name: targetUser.name }]);
    setMentionMatch(null);
    setTimeout(() => {
      if (taRef.current) {
        const nextPos = before.length + targetUser.name.length + 2;
        taRef.current.focus();
        taRef.current.setSelectionRange(nextPos, nextPos);
      }
    }, 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!mentionMatch || mentionCandidates.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((idx) => (idx + 1) % mentionCandidates.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((idx) => (idx - 1 + mentionCandidates.length) % mentionCandidates.length);
    } else if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      handleSelectMention(mentionCandidates[selectedIndex]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setMentionMatch(null);
    }
  };

  // A fill pane owns its scroll, so it has to place itself: open on — and stay
  // pinned to — the newest message. The flow call sites ride the page's single
  // content scroller and must not be yanked (#780).
  useLayoutEffect(() => {
    if (!pane) return;
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [pane, messages.length]);

  const post = () => {
    const body = draft.trim();
    if (!body) {
      taRef.current?.focus();
      return;
    }
    const mentionedUserIds = reconcileMentionedUsers(body, selectedUsers);
    const kind = canPickKind ? composeKind : "comment";
    const fromName = user?.displayName || "Someone";
    const landed = addThreadMessage(
      contactId,
      {
        interactionId,
        scope,
        from: meStaffId,
        fromName,
        kind,
        body,
        ...(mentionedUserIds.length > 0 ? { mentionedUserIds } : {}),
      },
      {
        to: recipientUid,
        contactName,
        ...(contactStakeholders ? { stakeholders: contactStakeholders } : {}),
      },
    );
    void landed;

    // The message a caller can show at once, before the write returns. It
    // carries a placeholder id and the promise of the real one, so the caller
    // can recognise its own document when the subscription delivers it.
    onPosted?.(
      {
        id: `pending:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
        interactionId,
        parentId: null,
        scope,
        from: meStaffId,
        fromName,
        kind,
        body,
        at: new Date().toISOString(),
        reactions: [],
        ...(mentionedUserIds.length > 0 ? { mentionedUserIds } : {}),
      },
      landed,
    );

    setDraft("");
    setSelectedUsers([]);
    setMentionMatch(null);
    setComposeKind("comment");
  };

  useCommand({
    id: "thread.post",
    scope: "compose",
    description: "Post a comment",
    shortcut: { key: "Enter", mod: true },
    minRole: "operator",
    when: (e) => e.target === taRef.current,
    available: () => !mentionMatch || mentionCandidates.length === 0,
    handler: post,
  });

  // The Full-timers tab is staff reasoning together about how to care for a
  // person; a follow-up ask belongs on the Conversation, where everyone tied can
  // see it. So the picker is offered on the open thread only.
  const canPickKind = scope !== "team";
  const placeholder = canPickKind
    ? t(COMPOSE_KINDS[composeKind].placeholder)
    : t("thread.placeholder_full_timers");

  return (
    <div className={cn("flex flex-col", pane && "cd-pane-thread")} data-thread-pane={pane ? "" : undefined}>
      <div
        ref={listRef}
        data-thread-list=""
        className={cn(
          messages.length > 0 && "flex flex-col",
          messages.length > 0 && (compact ? "space-y-3" : "space-y-4"),
          messages.length === 0 && "hidden",
        )}
      >
        {messages.map((m) => (
          <ThreadMsg
            key={m.id}
            m={m}
            meStaffId={meStaffId}
            contactId={contactId}
            recipientUid={recipientUid}
            contactName={contactName}
            teamMembers={teamMembers}
            contactStakeholders={contactStakeholders}
            messages={propsMessages}
            highlightIds={highlightIds}
            highlightLabel={highlightLabel}
          />
        ))}
      </div>
      {messages.length === 0 && (
        <div className="text-sm italic text-on-surface-variant/70 pb-3">
          {interactionId
            ? t("thread.empty_interaction")
            : scope === "team"
              ? t("thread.empty_full_timers")
              : t("thread.empty_conversation")}
        </div>
      )}

      {/* Compose */}
      <div data-thread-composer="" className={cn("relative", messages.length > 0 && "mt-4")}>
        {mentionMatch && mentionCandidates.length > 0 && (
          <MentionAutocomplete
            candidates={mentionCandidates}
            selectedIndex={selectedIndex}
            onSelect={handleSelectMention}
            anchorEl={taRef.current}
          />
        )}
        {canPickKind && <ComposeKindPicker value={composeKind} onChange={setComposeKind} />}

        <textarea
          ref={taRef}
          value={draft}
          onChange={(e) => handleDraftChange(e.target.value, e.target.selectionStart || 0)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={compact ? 2 : 3}
          className="w-full p-3 rounded-xl bg-surface-container-high border border-outline-variant/40 text-sm text-on-surface placeholder:text-on-surface-variant/50 resize-none focus:outline-none focus:border-primary/40 transition-colors"
        />

        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-[11px] text-on-surface-variant/60">⌘↵ to post</span>
          <button
            onClick={post}
            disabled={!draft.trim()}
            className="inline-flex items-center gap-1.5 px-3 min-h-11 sm:min-h-0 sm:h-8 rounded-full bg-primary text-on-primary text-xs font-medium hover:opacity-90 active:scale-95 transition disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" /> {t("thread.send_post")}
          </button>
        </div>
      </div>
    </div>
  );
}


