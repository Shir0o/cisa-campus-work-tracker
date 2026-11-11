import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { AtSign, FileText, Lock, Paperclip, Send, X } from "lucide-react";
import { cn } from "../../lib/utils";
import { useCommand } from "../../lib/commands";
import { useMediaQuery } from "../../lib/useMediaQuery";
import { useLanguage } from "../LanguageProvider";
import { MentionAutocomplete } from "../common/MentionAutocomplete";
import {
  extractMentionCandidate,
  filterMentionCandidates,
  reconcileMentionedUsers,
  type MentionMatch,
  type MentionUser,
} from "../../lib/mentions";
import { joinNames } from "../../../packages/core/src/mentions";
import type { StreamStagedItem } from "./types";

// The one composer box (C1–C3): the audience above, then the box — the text,
// and a tools row of @, the shortcut hint and send. ⌘/Ctrl+Enter sends; Enter
// picks a mention. Every message is a plain comment: an @mention is the only
// "for you" signal, and while the draft names someone a quiet line above the
// box says who will get it on their list.

type SubmitResult = void | Promise<void>;

interface StreamComposerProps {
  audience?: string;
  locked?: boolean;
  placeholder?: string;
  hint: string;
  label: string;
  submitLabel: string;
  candidates: MentionUser[];
  autoFocus?: boolean;
  maxLength?: number;
  /** C5: what is staged to go with the post, above the text; each removable. */
  staged?: StreamStagedItem[];
  /** The paperclip — only where the source takes attachments. */
  onAttach?: () => void;
  onUnstage?: (key: string) => void;
  /** A promise makes the box wait: the draft clears when it resolves (unless it
   *  was edited meanwhile) and stays where it was if it rejects, so a failed
   *  send loses nothing. A send pressed while one is pending is held back; the
   *  draft stays for the next press. */
  onSubmit: (input: { body: string; mentionedUserIds: string[] }) => SubmitResult;
}

function initials(name: string): string {
  const parts = (name || "?").trim().split(/\s+/);
  return (parts.length >= 2 ? `${parts[0][0]}${parts[1][0]}` : (parts[0] || "?").slice(0, 2)).toUpperCase();
}

export default function StreamComposer({
  audience,
  locked,
  placeholder,
  hint,
  label,
  submitLabel,
  candidates,
  autoFocus,
  maxLength,
  staged,
  onAttach,
  onUnstage,
  onSubmit,
}: StreamComposerProps) {
  const hasStaged = !!staged && staged.length > 0;
  const { t } = useLanguage();
  const id = useId();
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  // The mention list anchors to the box; held in state so render never reads the ref.
  const [anchor, setAnchor] = useState<HTMLTextAreaElement | null>(null);
  const setBox = useCallback((el: HTMLTextAreaElement | null) => {
    taRef.current = el;
    setAnchor(el);
  }, []);
  const [draft, setDraft] = useState("");
  const [mention, setMention] = useState<MentionMatch | null>(null);
  const [selected, setSelected] = useState(0);
  const [picked, setPicked] = useState<Array<{ uid: string; name: string }>>([]);
  const [busy, setBusy] = useState(false);
  // The draft as of the last render, so a write that lands later can tell
  // whether the box still holds what was sent (#1573).
  const draftRef = useRef(draft);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const matches = useMemo(
    () => (mention ? filterMentionCandidates(candidates, mention.query, false) : []),
    [mention, candidates],
  );
  const choosing = !!mention && matches.length > 0;

  const change = (value: string, cursor: number) => {
    setDraft(value);
    setMention(extractMentionCandidate(value, cursor));
    setSelected(0);
  };

  const pick = (user: MentionUser) => {
    if (!mention) return;
    const before = draft.slice(0, mention.atIndex);
    const after = draft.slice(mention.atIndex + 1 + mention.query.length);
    setDraft(`${before}@${user.name} ${after}`);
    setPicked((prev) => [...prev, { uid: user.uid, name: user.name }]);
    setMention(null);
    const caret = before.length + user.name.length + 2;
    setTimeout(() => {
      taRef.current?.focus();
      taRef.current?.setSelectionRange(caret, caret);
    }, 0);
  };

  const startMention = () => {
    const next = draft && !/\s$/.test(draft) ? `${draft} @` : `${draft}@`;
    change(next, next.length);
    taRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!choosing) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((i) => (i + 1) % matches.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((i) => (i - 1 + matches.length) % matches.length);
    } else if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      pick(matches[selected]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setMention(null);
    }
  };

  const submit = () => {
    const body = draft.trim();
    if (busy) return;
    if (!body && !hasStaged) {
      taRef.current?.focus();
      return;
    }
    const clear = () => {
      // Text typed while the write saved is a newer draft: keep it, and the
      // mentions that go with it (#1573).
      if (draftRef.current.trim() !== body) return;
      setDraft("");
      setPicked([]);
      setMention(null);
    };
    // Mentions reconcile against the body as sent (ADR 0007): a name picked
    // and then edited out notifies nobody.
    const result = onSubmit({ body, mentionedUserIds: reconcileMentionedUsers(body, picked) });
    if (result && typeof result.then === "function") {
      setBusy(true);
      // A rejection keeps the draft; whoever returned the promise says why.
      result.then(clear, () => undefined).finally(() => setBusy(false));
      return;
    }
    clear();
  };

  useCommand({
    id: `stream.compose:${id}`,
    scope: "compose",
    description: submitLabel,
    shortcut: { key: "Enter", mod: true },
    minRole: "operator",
    when: (e) => e.target === taRef.current,
    available: () => !choosing,
    handler: submit,
  });

  // Who the draft names, as it stands: a name picked and then edited out is
  // nobody's (ADR 0007).
  const named = reconcileMentionedUsers(draft, picked);
  const namedLine =
    named.length > 0
      ? t("stream.mention_list_line").replace(
          "{names}",
          joinNames(
            named.map((uid) => (picked.find((p) => p.uid === uid)?.name || "").trim().split(/\s+/)[0]),
            t("stream.names_and"),
          ),
        )
      : null;
  // "⌘↵ to post" is a keyboard hint. Below the phone breakpoint the pane is a
  // thumb-driven composer with no Command key, so the hint is not rendered at
  // all rather than left for CSS to hide (#1781).
  const showHint = useMediaQuery("(min-width: 721px)");

  return (
    <div className="strm-composer" data-stream-composer="">
      {choosing && (
        <MentionAutocomplete candidates={matches} selectedIndex={selected} onSelect={pick} anchorEl={anchor} />
      )}
      {audience && (
        <div className="strm-aud">
          {locked && <Lock className="w-3 h-3" aria-hidden />}
          {audience}
        </div>
      )}
      {namedLine && (
        <div className="strm-aud strm-aud-list" data-stream-mention-line="">
          <AtSign className="w-3 h-3" aria-hidden />
          {namedLine}
        </div>
      )}
      <div className="strm-cbox">
        {hasStaged && (
          <div className="strm-staged" role="list" aria-label={t("stream.staged")}>
            {staged!.map((s) => (
              <span key={s.key} className="strm-stg" role="listitem">
                {s.kind === "contact" ? (
                  <span className="strm-stg-av" aria-hidden>
                    {initials(s.label)}
                  </span>
                ) : (
                  <span className="strm-stg-fi" aria-hidden>
                    <FileText className="w-3.5 h-3.5" />
                  </span>
                )}
                <span className="strm-stg-name">{s.label}</span>
                <button
                  type="button"
                  className="strm-tool"
                  aria-label={t("stream.remove_staged").replace("{name}", s.label)}
                  title={t("stream.remove_staged").replace("{name}", s.label)}
                  onClick={() => onUnstage?.(s.key)}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            ))}
          </div>
        )}
        <label className="sr-only" htmlFor={id}>
          {label}
        </label>
        <textarea
          id={id}
          ref={setBox}
          value={draft}
          rows={1}
          placeholder={placeholder}
          autoFocus={autoFocus}
          maxLength={maxLength}
          onChange={(e) => change(e.target.value, e.target.selectionStart || 0)}
          onKeyDown={onKeyDown}
          className="strm-ta"
        />
        <div className="strm-ctools">
          {onAttach && (
            <button type="button" className="strm-tool" aria-label={t("stream.attach")} title={t("stream.attach")} onClick={onAttach}>
              <Paperclip className="w-4 h-4" />
            </button>
          )}
          {candidates.length > 0 && (
            <button type="button" className="strm-tool" aria-label={t("stream.mention")} onClick={startMention}>
              <AtSign className="w-4 h-4" />
            </button>
          )}
          {showHint && <span className="strm-hint">{hint}</span>}
          <button
            type="button"
            className="strm-send"
            aria-label={submitLabel}
            title={submitLabel}
            disabled={(!draft.trim() && !hasStaged) || busy}
            onClick={submit}
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
