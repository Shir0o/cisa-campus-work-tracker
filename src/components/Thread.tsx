import React, { useEffect, useRef, useState } from "react";
import {
  Bell,
  Heart,
  MessageSquare,
  Pencil,
  Send,
  type LucideIcon,
} from "lucide-react";
import { cn, relTime } from "../lib/utils";
import { useAuth } from "./AuthProvider";
import { isTrainee } from "../lib/walking";
import {
  THREAD_KINDS,
  THREAD_REACTIONS,
  type ThreadKind,
  type ThreadTone,
  addThreadMessage,
  threadsFor,
  toggleReaction,
  useThreads,
} from "../lib/threads";

// "Walking together" — a light vertical conversation between a trainee and the
// full-timer walking with them, on a contact (interactionId null) or on one
// logged interaction. Reuses the History/notification tonal-node look. No word
// "mentor" anywhere.

const KIND_ICON: Record<ThreadKind, LucideIcon> = {
  note: Pencil,
  comment: MessageSquare,
  question: MessageSquare,
  encouragement: Heart,
  nudge: Bell,
};

const TONE_NODE: Record<ThreadTone, string> = {
  accent: "text-stage-accent bg-stage-accent-soft",
  teal: "text-stage-teal bg-stage-teal-soft",
  amber: "text-stage-amber bg-stage-amber-soft",
  violet: "text-stage-violet bg-stage-violet-soft",
  warn: "text-warning bg-warning/10",
};

const TONE_TEXT: Record<ThreadTone, string> = {
  accent: "text-stage-accent",
  teal: "text-stage-teal",
  amber: "text-stage-amber",
  violet: "text-stage-violet",
  warn: "text-warning",
};

// Compose kinds shift with who's looking: a trainee leans note/question; the
// full-timer leans comment/encourage/nudge. Both can post anything.
const TRAINEE_KINDS: ThreadKind[] = ["note", "question", "comment", "encouragement"];
const FULLTIMER_KINDS: ThreadKind[] = ["comment", "encouragement", "question", "nudge"];

const firstName = (name?: string) => (name || "Someone").trim().split(/\s+/)[0];

interface ThreadProps {
  contactId: string;
  interactionId?: string | null;
  meStaffId: string;
  // The other party in the walk — pinged on the bell when a message is posted.
  recipientUid?: string | null;
  contactName?: string;
  compact?: boolean;
}

export default function Thread({
  contactId,
  interactionId = null,
  meStaffId,
  recipientUid = null,
  contactName,
  compact = false,
}: ThreadProps) {
  const { user } = useAuth();
  const allMessages = useThreads(contactId);
  const messages = threadsFor(allMessages, interactionId);

  const composeKinds = isTrainee(meStaffId) ? TRAINEE_KINDS : FULLTIMER_KINDS;
  const [kind, setKind] = useState<ThreadKind>(composeKinds[0]);
  const [draft, setDraft] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Keep the selected kind valid if the viewer's available kinds change.
  useEffect(() => {
    if (!composeKinds.includes(kind)) setKind(composeKinds[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meStaffId]);

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
        from: meStaffId,
        fromName: user?.displayName || "Someone",
        kind,
        body,
      },
      { to: recipientUid, contactName },
    );
    setDraft("");
  };

  const placeholder =
    kind === "question"
      ? `Ask ${isTrainee(meStaffId) ? "your full-timer" : "them"} a question…`
      : kind === "encouragement"
        ? "Say something encouraging…"
        : kind === "nudge"
          ? "Nudge a follow-up…"
          : kind === "note"
            ? "Leave a note…"
            : "Add a comment…";

  return (
    <div className="flex flex-col">
      {messages.length === 0 ? (
        <div className="text-sm italic text-on-surface-variant/70 pb-3">
          {compact
            ? "No notes on this conversation yet."
            : "Nothing here yet — start the conversation below."}
        </div>
      ) : (
        <div className={cn("flex flex-col", compact ? "gap-3" : "gap-4")}>
          {messages.map((m) => {
            const meta = THREAD_KINDS[m.kind] ?? THREAD_KINDS.comment;
            const Icon = KIND_ICON[m.kind] ?? MessageSquare;
            const mine = m.from === meStaffId;

            const tally: Record<string, number> = {};
            for (const r of m.reactions) tally[r.emoji] = (tally[r.emoji] || 0) + 1;
            const reactedByMe = (emoji: string) =>
              m.reactions.some((r) => r.emoji === emoji && r.by === meStaffId);
            const unused = THREAD_REACTIONS.filter((e) => !tally[e]);

            return (
              <div key={m.id} className={cn("flex", compact ? "gap-2.5" : "gap-3")}>
                <span
                  className={cn(
                    "flex-none grid place-items-center rounded-[9px] mt-0.5",
                    compact ? "w-[26px] h-[26px]" : "w-[30px] h-[30px]",
                    TONE_NODE[meta.tone],
                  )}
                  aria-hidden
                >
                  <Icon className={compact ? "w-3.5 h-3.5" : "w-[15px] h-[15px]"} />
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-on-surface">
                      {mine ? "You" : firstName(m.fromName)}
                    </span>
                    <span
                      className={cn(
                        "text-[10.5px] font-bold uppercase tracking-wider",
                        TONE_TEXT[meta.tone],
                      )}
                    >
                      {meta.label}
                    </span>
                    <span className="text-[11.5px] text-on-surface-variant">
                      {relTime(m.at)}
                    </span>
                  </div>

                  <div
                    className={cn(
                      "mt-1 p-3 rounded-2xl rounded-tl-none text-sm leading-relaxed text-on-surface whitespace-pre-wrap border",
                      mine
                        ? "bg-stage-accent-soft border-stage-accent/20"
                        : "bg-surface-container-high border-outline-variant/30",
                      m.kind === "nudge" && "border-l-2 border-l-warning",
                    )}
                  >
                    {m.body}
                  </div>

                  <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                    {Object.keys(tally).map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() => toggleReaction(contactId, m.id, meStaffId, emoji)}
                        title="React"
                        className={cn(
                          "inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs transition-colors",
                          reactedByMe(emoji)
                            ? "border-primary/40 bg-primary/10 text-primary"
                            : "border-outline-variant/50 text-on-surface-variant hover:border-outline-variant",
                        )}
                      >
                        <span>{emoji}</span>
                        <span className="font-semibold tabular-nums">{tally[emoji]}</span>
                      </button>
                    ))}
                    {unused.length > 0 && (
                      <span className="inline-flex items-center gap-0.5">
                        {unused.map((emoji) => (
                          <button
                            key={emoji}
                            onClick={() =>
                              toggleReaction(contactId, m.id, meStaffId, emoji)
                            }
                            title="Add reaction"
                            className="w-6 h-6 grid place-items-center rounded-full text-sm text-on-surface-variant/40 hover:bg-surface-container-high hover:text-on-surface transition-colors"
                          >
                            {emoji}
                          </button>
                        ))}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Compose */}
      <div className={cn(messages.length > 0 && "mt-4")}>
        <div className="flex flex-wrap gap-1.5">
          {composeKinds.map((kk) => (
            <button
              key={kk}
              onClick={() => setKind(kk)}
              className={cn(
                "px-2.5 py-1 rounded-full border text-xs font-medium transition-colors",
                kind === kk
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-outline-variant text-on-surface-variant hover:text-on-surface",
              )}
            >
              {THREAD_KINDS[kk].label}
            </button>
          ))}
        </div>

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
          className="w-full mt-2 p-3 rounded-xl bg-surface-container-high border border-outline-variant/40 text-sm text-on-surface placeholder:text-on-surface-variant/50 resize-none focus:outline-none focus:border-primary/40 transition-colors"
        />

        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-[11px] text-on-surface-variant/60">⌘↵ to post</span>
          <button
            onClick={post}
            disabled={!draft.trim()}
            className="inline-flex items-center gap-1.5 px-3 h-8 rounded-full bg-primary text-on-primary text-xs font-bold hover:opacity-90 active:scale-95 transition disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" /> Post
          </button>
        </div>
      </div>
    </div>
  );
}
