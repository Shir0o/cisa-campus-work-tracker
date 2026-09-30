import React, { useCallback, useId, useMemo, useRef, useState } from "react";
import { AtSign, Lock, Send } from "lucide-react";
import { cn } from "../../lib/utils";
import { useCommand } from "../../lib/commands";
import { useLanguage } from "../LanguageProvider";
import { MentionAutocomplete } from "../common/MentionAutocomplete";
import {
  extractMentionCandidate,
  filterMentionCandidates,
  reconcileMentionedUsers,
  type MentionMatch,
  type MentionUser,
} from "../../lib/mentions";
import { COMPOSE_KINDS, COMPOSE_ORDER } from "../ComposeKindPicker";
import type { StreamComposeKind } from "./types";

// The one composer box (C1–C3): the audience above, then the box — kind chips
// inside it where the source has kinds, the text, and a tools row of @, the
// shortcut hint and send. ⌘/Ctrl+Enter sends; Enter picks a mention.

type SubmitResult = void | Promise<void>;

interface StreamComposerProps {
  /** Offer Comment · Question · Ask a follow-up inside the box. */
  kinds: boolean;
  audience?: string;
  askAudience?: string;
  locked?: boolean;
  /** Placeholder for a source without kinds (a reply, say). */
  placeholder?: string;
  hint: string;
  label: string;
  submitLabel: string;
  candidates: MentionUser[];
  autoFocus?: boolean;
  maxLength?: number;
  /** A promise makes the box wait: the draft clears when it resolves and stays
   *  where it was if it rejects, so a failed send loses nothing. */
  onSubmit: (input: { body: string; kind: StreamComposeKind; mentionedUserIds: string[] }) => SubmitResult;
}

export default function StreamComposer({
  kinds,
  audience,
  askAudience,
  locked,
  placeholder,
  hint,
  label,
  submitLabel,
  candidates,
  autoFocus,
  maxLength,
  onSubmit,
}: StreamComposerProps) {
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
  const [kind, setKind] = useState<StreamComposeKind>("comment");
  const [mention, setMention] = useState<MentionMatch | null>(null);
  const [selected, setSelected] = useState(0);
  const [picked, setPicked] = useState<Array<{ uid: string; name: string }>>([]);
  const [busy, setBusy] = useState(false);

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
    if (!body) {
      taRef.current?.focus();
      return;
    }
    const clear = () => {
      setDraft("");
      setPicked([]);
      setMention(null);
      setKind("comment");
    };
    // Mentions reconcile against the body as sent (ADR 0007): a name picked
    // and then edited out notifies nobody.
    const result = onSubmit({ body, kind: kinds ? kind : "comment", mentionedUserIds: reconcileMentionedUsers(body, picked) });
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

  const line = kind === "nudge" && askAudience ? askAudience : audience;
  const ph = kinds ? t(COMPOSE_KINDS[kind].placeholder) : placeholder;

  return (
    <div className="strm-composer" data-stream-composer="">
      {choosing && (
        <MentionAutocomplete candidates={matches} selectedIndex={selected} onSelect={pick} anchorEl={anchor} />
      )}
      {line && (
        <div className="strm-aud">
          {locked && <Lock className="w-3 h-3" aria-hidden />}
          {line}
        </div>
      )}
      <div className="strm-cbox">
        {kinds && (
          <div className="strm-kinds" role="group" aria-label={t("thread.compose_kind_group")}>
            {COMPOSE_ORDER.map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={kind === k}
                onClick={() => setKind(k)}
                className={cn("strm-kind", kind === k && "on", kind === k && k === "nudge" && "ask")}
              >
                {t(COMPOSE_KINDS[k].label)}
              </button>
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
          rows={kind === "comment" ? 1 : 2}
          placeholder={ph}
          autoFocus={autoFocus}
          maxLength={maxLength}
          onChange={(e) => change(e.target.value, e.target.selectionStart || 0)}
          onKeyDown={onKeyDown}
          className="strm-ta"
        />
        <div className="strm-ctools">
          {candidates.length > 0 && (
            <button type="button" className="strm-tool" aria-label={t("stream.mention")} onClick={startMention}>
              <AtSign className="w-4 h-4" />
            </button>
          )}
          <span className="strm-hint">{hint}</span>
          <button
            type="button"
            className="strm-send"
            aria-label={submitLabel}
            title={submitLabel}
            disabled={!draft.trim() || busy}
            onClick={submit}
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
