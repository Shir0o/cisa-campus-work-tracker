import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, Ellipsis, Loader2, Pencil, Reply, SquareCheckBig, X } from "lucide-react";
import { cn } from "../../lib/utils";
import { useLanguage } from "../LanguageProvider";
import { buildStream, buildThread, type StreamRow, type StreamViewer } from "../../lib/stream";
import type { MentionUser } from "../../lib/mentions";
import StreamComposer from "./StreamComposer";
import type { StreamAdapter, StreamSourceMessage } from "./types";

// One written stream in the grammar ADR 0033 settled: Slack-literal rows,
// everyone left-aligned, day dividers, a hover toolbar, a Thread chip, and the
// one-box composer pinned at the foot. Everything source-specific comes from
// the adapter; this component never touches Firestore.

export interface StreamProps<M extends StreamSourceMessage = StreamSourceMessage> {
  adapter: StreamAdapter<M>;
  viewer: StreamViewer;
  /** Decided by the container, not the viewport: a Thread opens beside the
   *  stream where there is width, and replaces it (with back) where there
   *  isn't — the contact drawer, an Around card. */
  threadMode: "replace" | "beside";
  /** The surface's own header, drawn above the stream. A Thread that replaces
   *  the stream brings its own. */
  header?: React.ReactNode;
  /** Shut the whole surface — the replacing Thread's close control. */
  onClose?: () => void;
  /** Drawn under the composer — a line the composer can't say alone. */
  footer?: React.ReactNode;
  onMakeTodo?: (message: M) => void;
}

const TONES = 8;
function toneOf(uid: string): number {
  let h = 0;
  for (let i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) >>> 0;
  return h % TONES;
}

function initialsOf(name: string): string {
  const parts = (name || "?").trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return (parts[0] || "?").slice(0, 2).toUpperCase();
}

function Avatar({ uid, name, size, initials }: { uid: string; name: string; size?: "xs"; initials?: string }) {
  return (
    <span className={cn("strm-av", `strm-tone-${toneOf(uid)}`, size && `strm-av-${size}`)} data-stream-avatar="" aria-hidden>
      {initials ?? initialsOf(name)}
    </span>
  );
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The body, with each @mention of a candidate picked out. */
function Body({ text, candidates }: { text: string; candidates: MentionUser[] }) {
  const re = useMemo(() => {
    const names = candidates.map((c) => c.name).filter(Boolean).sort((a, b) => b.length - a.length);
    return names.length ? new RegExp(`(@(?:${names.map(escapeRe).join("|")}))`, "g") : null;
  }, [candidates]);
  if (!re) return <>{text}</>;
  return (
    <>
      {text.split(re).map((part, i) =>
        i % 2 === 1 ? (
          <span key={i} className="strm-at" data-stream-mention="">
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </>
  );
}

function useFormatters() {
  const { t, language } = useLanguage();
  const locale = language === "es" ? "es" : "en-US";
  return useMemo(() => {
    const time = (iso: string) => new Date(iso).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
    const dateTime = (iso: string) =>
      new Date(iso).toLocaleString(locale, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    const rel = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
    /** "2 hours ago", "yesterday", "3 days ago", then a date. */
    const ago = (iso: string) => {
      const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
      if (mins < 60) return rel.format(-Math.max(0, mins), "minute");
      const hours = Math.round(mins / 60);
      if (hours < 24) return rel.format(-hours, "hour");
      const days = Math.round(hours / 24);
      if (days < 7) return rel.format(-days, "day");
      return new Date(iso).toLocaleDateString(locale, { month: "short", day: "numeric" });
    };
    const day = (key: string, relative: "today" | "yesterday" | "earlier") => {
      if (relative === "today") return t("stream.today");
      if (relative === "yesterday") return t("stream.yesterday");
      const [y, m, d] = key.split("-").map(Number);
      const date = new Date(y, m - 1, d);
      const opts: Intl.DateTimeFormatOptions = { weekday: "long", month: "long", day: "numeric" };
      if (y !== new Date().getFullYear()) opts.year = "numeric";
      return date.toLocaleDateString(locale, opts);
    };
    /** A reply's time: the clock on the parent's day, else the date too. */
    const replyTime = (iso: string, parentIso: string) =>
      new Date(iso).toDateString() === new Date(parentIso).toDateString() ? time(iso) : dateTime(iso);
    return { time, dateTime, ago, day, replyTime };
  }, [t, locale]);
}

interface RowProps<M extends StreamSourceMessage> {
  row: StreamRow<M>;
  when: string;
  candidates: MentionUser[];
  canReply: boolean;
  /** The chip of the Thread that is open (beside mode). */
  threadOpen?: boolean;
  /** Draw the chip — not on the parent inside its own Thread. */
  showChip: boolean;
  onOpenThread?: (focus: boolean) => void;
  onMakeTodo?: () => void;
  /** The model allows it and the adapter doesn't forbid it. */
  deletable: boolean;
  /** The adapter lets this viewer rewrite this message. */
  canEdit?: boolean;
  onEdit?: (body: string) => unknown;
  editLabel?: string;
  editFailure?: string;
  maxLength?: number;
  onDelete: () => void;
  onCloseAsk: (how: "followedUp" | "neverMind") => void;
}

function Row<M extends StreamSourceMessage>({
  row,
  when,
  candidates,
  canReply,
  threadOpen,
  showChip,
  onOpenThread,
  onMakeTodo,
  deletable,
  canEdit,
  onEdit,
  editLabel,
  editFailure,
  maxLength,
  onDelete,
  onCloseAsk,
}: RowProps<M>) {
  const { t } = useLanguage();
  const f = useFormatters();
  const { message: m, continuation, tag, ask, askActions, thread } = row;
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState(false);

  const save = async () => {
    const body = draft.trim();
    if (!body || saving || !onEdit) return;
    setSaving(true);
    setEditError(false);
    try {
      await onEdit(body);
      setEditing(false);
    } catch (err) {
      console.error("Failed to save an edit:", err);
      setEditError(true);
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!menu) return;
    const away = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [menu]);

  const canCopy = typeof navigator !== "undefined" && !!navigator.clipboard;

  return (
    <div className={cn("strm-m", continuation && "strm-cont", menu && "strm-m-menu")} data-stream-row={m.id}>
      {!continuation && <Avatar uid={m.from} name={m.fromName} initials={m.initials} />}
      <div className="strm-mb">
        {!continuation && (
          <div className="strm-mh">
            <span className="strm-who">{m.fromName}</span>
            {tag === "question" && <span className="strm-tag strm-tag-q">{t("stream.tag_question")}</span>}
            {tag === "ask" && (
              <span className={cn("strm-tag", ask?.status === "withdrawn" ? "strm-tag-muted" : "strm-tag-ask")}>
                {t("stream.tag_ask")}
              </span>
            )}
            <span className="strm-when">{when}</span>
          </div>
        )}
        {editing ? (
          <div className="strm-edit">
            <textarea
              rows={3}
              maxLength={maxLength}
              value={draft}
              disabled={saving}
              aria-label={editLabel ?? t("stream.edit_label")}
              onChange={(e) => setDraft(e.target.value)}
              className="strm-edit-ta"
            />
            {editError && editFailure && (
              <p role="alert" className="strm-err">
                {editFailure}
              </p>
            )}
            <div className="strm-edit-btns">
              <button type="button" className="strm-btn strm-btn-ghost" disabled={saving} onClick={() => setEditing(false)}>
                {t("actions.cancel")}
              </button>
              <button type="button" className="strm-btn strm-btn-pri" disabled={saving || !draft.trim()} onClick={() => void save()}>
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />}
                {t("actions.save")}
              </button>
            </div>
          </div>
        ) : (
          <p className="strm-tx">
            <Body text={m.body} candidates={candidates} />
          </p>
        )}
        {ask && (
          <div className="strm-status">
            {ask.status === "open" && (
              <>
                <span className="strm-s-open">
                  {ask.daysOpen === 0
                    ? t("stream.ask_open_today")
                    : ask.daysOpen === 1
                      ? t("stream.ask_open_one")
                      : t("stream.ask_open_many").replace("{n}", String(ask.daysOpen))}
                </span>
                {askActions.includes("followedUp") && (
                  <button type="button" className="strm-btn strm-btn-pri" onClick={() => onCloseAsk("followedUp")}>
                    {t("stream.ask_followed_up")}
                  </button>
                )}
                {askActions.includes("neverMind") && (
                  <button type="button" className="strm-btn strm-btn-ghost" onClick={() => onCloseAsk("neverMind")}>
                    {t("stream.ask_never_mind")}
                  </button>
                )}
              </>
            )}
            {ask.status === "followedUp" && (
              <span className="strm-s-done">
                <Check className="w-3.5 h-3.5" aria-hidden />
                {t("stream.ask_done").replace("{name}", ask.by.name).replace("{when}", f.ago(ask.at))}
              </span>
            )}
            {ask.status === "withdrawn" && (
              <span className="strm-s-gone">
                {t("stream.ask_withdrawn").replace("{name}", ask.by.name).replace("{when}", f.ago(ask.at))}
              </span>
            )}
          </div>
        )}
        {!editing && (m.editedAt || canEdit) && (
          <div className="strm-status">
            {m.editedAt && <span className="strm-edited">{t("stream.edited")}</span>}
            {canEdit && (
              <button
                type="button"
                className="strm-btn strm-btn-ghost strm-btn-sm"
                onClick={() => {
                  setDraft(m.body);
                  setEditError(false);
                  setEditing(true);
                }}
              >
                <Pencil className="w-3.5 h-3.5" aria-hidden />
                {t("stream.edit")}
              </button>
            )}
          </div>
        )}
        {showChip && thread && (
          <button
            type="button"
            className={cn("strm-thr", threadOpen && "on")}
            aria-pressed={!!threadOpen}
            onClick={() => onOpenThread?.(false)}
          >
            <span className="strm-minis" aria-hidden>
              {thread.repliers.map((r) => (
                <Avatar key={r.uid} uid={r.uid} name={r.name} size="xs" />
              ))}
            </span>
            <b>{thread.count === 1 ? t("stream.replies_one") : t("stream.replies_many").replace("{n}", String(thread.count))}</b>
            <span className="strm-last">{t("stream.last_reply").replace("{when}", f.ago(thread.lastReplyAt))}</span>
          </button>
        )}
      </div>
      <div className="strm-tools" role="toolbar" aria-label={t("stream.message_actions")} ref={menuRef}>
        {canReply && onOpenThread && (
          <button type="button" className="strm-tool" aria-label={t("stream.reply_in_thread")} title={t("stream.reply_in_thread")} onClick={() => onOpenThread(true)}>
            <Reply className="w-4 h-4" />
          </button>
        )}
        {onMakeTodo && (
          <button type="button" className="strm-tool" aria-label={t("stream.make_todo")} title={t("stream.make_todo")} onClick={onMakeTodo}>
            <SquareCheckBig className="w-4 h-4" />
          </button>
        )}
        <button
          type="button"
          className={cn("strm-tool", menu && "on")}
          aria-label={t("stream.more_actions")}
          title={t("stream.more_actions")}
          aria-haspopup="menu"
          aria-expanded={menu}
          onClick={() => setMenu((v) => !v)}
        >
          <Ellipsis className="w-4 h-4" />
        </button>
        {menu && (
          <div className="strm-menu" role="menu" onKeyDown={(e) => e.key === "Escape" && setMenu(false)}>
            {canCopy && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  void navigator.clipboard.writeText(m.body);
                  setMenu(false);
                }}
              >
                {t("stream.copy_text")}
              </button>
            )}
            {deletable && (
              <button
                type="button"
                role="menuitem"
                className="strm-danger"
                onClick={() => {
                  onDelete();
                  setMenu(false);
                }}
              >
                {t("stream.delete_message")}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Stream<M extends StreamSourceMessage>({
  adapter,
  viewer,
  threadMode,
  header,
  onClose,
  footer,
  onMakeTodo,
}: StreamProps<M>) {
  const { t } = useLanguage();
  const f = useFormatters();
  const [open, setOpen] = useState<{ id: string; focus: boolean } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const { messages, capabilities: can, mentionCandidates } = adapter;

  // "Today" and "Open N days" are read against a clock that ticks each
  // minute, so a drawer left open across midnight relabels itself.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  const items = buildStream({ messages, viewer, now, lastReadAt: adapter.lastReadAt });
  const thread = open ? buildThread({ messages, viewer, now }, open.id) : null;
  const replacing = threadMode === "replace" && !!thread;
  const topCount = items.length;

  // Open on — and stay with — the newest message (G4).
  useLayoutEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [topCount, replacing]);

  const [postError, setPostError] = useState<string | null>(null);
  const failure = adapter.failure;
  const words = adapter.composer;

  const rowProps = (row: StreamRow<M>) => ({
    candidates: mentionCandidates,
    deletable: row.canDelete && (adapter.canDelete ? adapter.canDelete(row.message) : true),
    canEdit: !!adapter.edit && !!adapter.canEdit?.(row.message),
    onEdit: adapter.edit ? (body: string) => adapter.edit!(row.message, body) : undefined,
    editLabel: words?.editLabel,
    editFailure: failure?.edit,
    maxLength: words?.maxLength,
    onMakeTodo: onMakeTodo ? () => onMakeTodo(row.message) : undefined,
    onDelete: () => void adapter.delete(row.message),
    onCloseAsk: (how: "followedUp" | "neverMind") => void adapter.closeAsk(row.message, how),
  });

  const threadPane = thread && (
    <section className="strm-thread" aria-label={t("stream.thread_title")}>
      <div className={cn("strm-th-head", threadMode === "replace" && "back")}>
        {threadMode === "replace" && (
          <button
            type="button"
            className="strm-icon-btn"
            aria-label={t("stream.back_to").replace("{name}", adapter.name)}
            title={t("stream.back_to").replace("{name}", adapter.name)}
            onClick={() => setOpen(null)}
          >
            <ArrowLeft className="w-[18px] h-[18px]" />
          </button>
        )}
        <div className="strm-th-title">
          <h3>{t("stream.thread_title")}</h3>
          <p>{t("stream.thread_where").replace("{where}", adapter.where)}</p>
        </div>
        {threadMode === "beside" ? (
          <button type="button" className="strm-icon-btn" aria-label={t("stream.close_thread")} title={t("stream.close_thread")} onClick={() => setOpen(null)}>
            <X className="w-[18px] h-[18px]" />
          </button>
        ) : (
          onClose && (
            <button type="button" className="strm-icon-btn" aria-label={t("stream.close")} title={t("stream.close")} onClick={onClose}>
              <X className="w-[18px] h-[18px]" />
            </button>
          )
        )}
      </div>
      <div className="strm-list strm-top" data-stream-list="">
        <Row row={thread.parent} when={f.dateTime(thread.parent.message.at)} canReply={false} showChip={false} {...rowProps(thread.parent)} />
        {thread.replies.length > 0 && (
          <div className="strm-rc">
            {thread.replies.length === 1
              ? t("stream.replies_one")
              : t("stream.replies_many").replace("{n}", String(thread.replies.length))}
          </div>
        )}
        {thread.replies.map((r) => (
          <Row key={r.message.id} row={r} when={f.replyTime(r.message.at, thread.parent.message.at)} canReply={false} showChip={false} {...rowProps(r)} />
        ))}
      </div>
      {can.canReply && (
        <StreamComposer
          key={thread.parent.message.id}
          kinds={false}
          placeholder={t("stream.reply_placeholder")}
          hint={t("stream.reply_hint")}
          label={t("stream.reply_label")}
          submitLabel={t("stream.send_reply")}
          candidates={mentionCandidates}
          autoFocus={open?.focus}
          onSubmit={({ body, mentionedUserIds }) => void adapter.reply(thread.parent.message, { body, mentionedUserIds })}
        />
      )}
    </section>
  );

  if (replacing) return <div className="strm">{threadPane}</div>;

  const main = (
    <>
      {header}
      <div className="strm-list" ref={listRef} data-stream-list="">
        <div className="strm-flow">
          {items.length === 0 && adapter.empty && <p className="strm-empty">{adapter.empty}</p>}
          {items.map((item) =>
            item.type === "day" ? (
              <div key={`day:${item.day}`} role="separator" className="strm-day">
                {f.day(item.day, item.relative)}
              </div>
            ) : item.type === "new" ? (
              <div key="new" role="separator" className="strm-newline">
                {t("stream.new")}
              </div>
            ) : (
              <Row
                key={item.message.id}
                row={item}
                when={f.time(item.message.at)}
                canReply={can.canReply}
                showChip
                threadOpen={open?.id === item.message.id}
                onOpenThread={(focus) => setOpen({ id: item.message.id, focus })}
                {...rowProps(item)}
              />
            ),
          )}
        </div>
      </div>
      {can.canPost && (
        <>
          {postError && (
            <p role="alert" className="strm-err strm-err-composer">
              {postError}
            </p>
          )}
          <StreamComposer
            kinds={can.kinds}
            audience={adapter.audience}
            askAudience={adapter.askAudience}
            locked={adapter.locked}
            placeholder={words?.placeholder}
            hint={words?.hint ?? t("stream.post_hint")}
            label={words?.label ?? t("stream.compose_label")}
            submitLabel={words?.submitLabel ?? t("stream.post")}
            candidates={mentionCandidates}
            maxLength={words?.maxLength}
            onSubmit={(input) => {
              if (!failure) {
                void adapter.post(input);
                return;
              }
              // A confirmed write: the composer keeps the draft until it lands.
              setPostError(null);
              return Promise.resolve(adapter.post(input)).then(
                () => undefined,
                (err) => {
                  console.error("Failed to post:", err);
                  setPostError(failure.post);
                  throw err;
                },
              );
            }}
          />
        </>
      )}
      {footer}
    </>
  );

  if (threadMode === "beside") {
    return (
      <div className="strm strm-beside">
        <div className="strm-main">{main}</div>
        {threadPane && <div className="strm-pane">{threadPane}</div>}
      </div>
    );
  }
  return <div className="strm">{main}</div>;
}
