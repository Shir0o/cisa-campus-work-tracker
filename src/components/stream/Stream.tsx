import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, Ellipsis, Footprints, Loader2, Pencil, Pin, Reply, SquareCheckBig, X } from "lucide-react";
import { cn } from "../../lib/utils";
import { useLanguage } from "../LanguageProvider";
import { useTranslate } from "../../hooks/useTranslate";
import { buildStream, buildThread, type StreamRow, type StreamViewer, type ThreadSummary } from "../../lib/stream";
import type { MentionUser } from "../../lib/mentions";
import StreamComposer from "./StreamComposer";
import type { StreamAdapter, StreamMenuAction, StreamSourceMessage } from "./types";

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
  /** Inside a card: 28px avatars and the tighter rhythm (G1). */
  compact?: boolean;
  /** Messages to mark "Just posted" — the viewer's own, for a moment. */
  highlightIds?: ReadonlySet<string> | null;
  /** What the surface draws under a message's body — a chat's attachments. */
  renderExtra?: (message: M) => React.ReactNode;
  /** What the surface draws beside a message's Thread chip — an
   *  announcement's Got it and read receipts. */
  renderActions?: (message: M, ctx: { openThread: () => void; replies: number }) => React.ReactNode;
  /** Show bodies in the reader's language, as chat always has. */
  translate?: boolean;
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

export function Avatar({ uid, name, size, initials }: { uid: string; name: string; size?: "xs"; initials?: string }) {
  return (
    <span className={cn("strm-av", `strm-tone-${toneOf(uid)}`, size && `strm-av-${size}`)} data-stream-avatar="" aria-hidden>
      {initials ?? initialsOf(name)}
    </span>
  );
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The body, with each @mention of a candidate picked out. */
function Body({ text: raw, candidates, translate }: { text: string; candidates: MentionUser[]; translate?: boolean }) {
  const { translatedText: text } = useTranslate(raw, { enabled: !!translate });
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

/** A parent's chip: who replied, how many, and when the last one was. Drawn
 *  under the message in a stream, and on an Interaction's log entry. */
export function ThreadChip({ summary, open, onClick }: { summary: ThreadSummary; open?: boolean; onClick: () => void }) {
  const { t } = useLanguage();
  const f = useFormatters();
  return (
    <button type="button" className={cn("strm-thr", open && "on")} aria-pressed={!!open} onClick={onClick}>
      <span className="strm-minis" aria-hidden>
        {summary.repliers.map((r) => (
          <Avatar key={r.uid} uid={r.uid} name={r.name} size="xs" />
        ))}
      </span>
      <b>{summary.count === 1 ? t("stream.replies_one") : t("stream.replies_many").replace("{n}", String(summary.count))}</b>
      <span className="strm-last">{t("stream.last_reply").replace("{when}", f.ago(summary.lastReplyAt))}</span>
    </button>
  );
}

interface RowProps<M extends StreamSourceMessage> {
  row: StreamRow<M>;
  when: string;
  candidates: MentionUser[];
  canReply: boolean;
  /** Just written by the viewer: wears a marker beside the name for a moment. */
  justPosted?: boolean;
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
  /** Source extras (#1259): each optional, each off by default. */
  badge?: string | null;
  gone?: string | null;
  deleteLabel?: string;
  deleteConfirm?: { prompt: string; yes: string; no: string };
  moreActions?: StreamMenuAction[];
  extra?: React.ReactNode;
  actions?: React.ReactNode;
  translate?: boolean;
}

function Row<M extends StreamSourceMessage>({
  row,
  when,
  candidates,
  canReply,
  justPosted,
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
  badge,
  gone,
  deleteLabel,
  deleteConfirm,
  moreActions,
  extra,
  actions,
  translate,
}: RowProps<M>) {
  const { t } = useLanguage();
  const f = useFormatters();
  const { message: m, tag, ask, askActions, thread } = row;
  // A message that was just posted names its author so the marker has a place.
  const continuation = row.continuation && !justPosted;
  const [menu, setMenu] = useState(false);
  const [confirming, setConfirming] = useState(false);
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
  const closeMenu = () => {
    setMenu(false);
    setConfirming(false);
  };
  const chip = showChip && thread && <ThreadChip summary={thread} open={threadOpen} onClick={() => onOpenThread?.(false)} />;

  return (
    <div className={cn("strm-m", continuation && "strm-cont", menu && "strm-m-menu")} data-stream-row={m.id}>
      {!continuation && <Avatar uid={m.from} name={m.fromName} initials={m.initials} />}
      <div className="strm-mb">
        {!continuation && (
          <div className="strm-mh">
            <span className="strm-who">{m.fromName}</span>
            {badge && <span className="strm-tag strm-tag-role">{badge}</span>}
            {!gone && tag === "question" && <span className="strm-tag strm-tag-q">{t("stream.tag_question")}</span>}
            {!gone && tag === "ask" && (
              <span className={cn("strm-tag", ask?.status === "withdrawn" ? "strm-tag-muted" : "strm-tag-ask")}>
                {t("stream.tag_ask")}
              </span>
            )}
            {justPosted && <span className="strm-tag strm-tag-just">{t("stream.just_posted")}</span>}
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
        ) : gone ? (
          <p className="strm-tx strm-gone">{gone}</p>
        ) : (
          <>
            {m.body && (
              <p className="strm-tx">
                <Body text={m.body} candidates={candidates} translate={translate} />
              </p>
            )}
            {extra}
          </>
        )}
        {!gone && ask && (
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
        {!editing && !gone && (m.editedAt || canEdit) && (
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
        {!gone && actions ? (
          <div className="strm-acts">
            {actions}
            {chip}
          </div>
        ) : (
          chip
        )}
      </div>
      {!gone && (
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
          onClick={() => (menu ? closeMenu() : setMenu(true))}
        >
          <Ellipsis className="w-4 h-4" />
        </button>
        {menu && (
          <div className="strm-menu" role="menu" onKeyDown={(e) => e.key === "Escape" && closeMenu()}>
            {confirming && deleteConfirm ? (
              <>
                <p className="strm-menu-note">{deleteConfirm.prompt}</p>
                <button
                  type="button"
                  role="menuitem"
                  className="strm-danger"
                  onClick={() => {
                    onDelete();
                    closeMenu();
                  }}
                >
                  {deleteConfirm.yes}
                </button>
                <button type="button" role="menuitem" onClick={() => setConfirming(false)}>
                  {deleteConfirm.no}
                </button>
              </>
            ) : (
              <>
                {moreActions?.map((a) => (
                  <button
                    key={a.label}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      a.run();
                      closeMenu();
                    }}
                  >
                    {a.label}
                  </button>
                ))}
                {canCopy && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      void navigator.clipboard.writeText(m.body);
                      closeMenu();
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
                      if (deleteConfirm) return setConfirming(true);
                      onDelete();
                      closeMenu();
                    }}
                  >
                    {deleteLabel ?? t("stream.delete_message")}
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>
      )}
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
  compact,
  highlightIds,
  renderExtra,
  renderActions,
  translate,
}: StreamProps<M>) {
  const { t } = useLanguage();
  const f = useFormatters();
  const [open, setOpen] = useState<{ id: string; focus: boolean } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const { messages, capabilities: can, mentionCandidates } = adapter;
  // An adapter that is one Thread (an Interaction's) is always open on it, and
  // there is no stream behind it to go back to.
  const pinned = adapter.thread ?? null;
  const openId = pinned ? pinned.parentId : (open?.id ?? null);

  // "Today" and "Open N days" are read against a clock that ticks each
  // minute, so a drawer left open across midnight relabels itself.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  // Messages the source holds first leave date order, each under its strip
  // (an announcement's pinned post, #1243).
  const held = adapter.pinnedLabel
    ? messages.filter((m) => !m.parentId && adapter.pinnedLabel!(m)).sort((a, b) => a.at.localeCompare(b.at))
    : [];
  const heldIds = new Set(held.map((m) => m.id));
  const items = buildStream({
    messages: held.length ? messages.filter((m) => !heldIds.has(m.id)) : messages,
    viewer,
    now,
    lastReadAt: adapter.lastReadAt,
  });
  const heldRows = held.map((m) => buildThread({ messages, viewer, now }, m.id)!.parent);
  const thread = openId ? buildThread({ messages, viewer, now }, openId) : null;
  const replacing = (threadMode === "replace" || !!pinned) && !!thread;
  const topCount = items.length + heldRows.length;

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
    justPosted: !!highlightIds?.has(row.message.id),
    onMakeTodo: onMakeTodo ? () => onMakeTodo(row.message) : undefined,
    onDelete: () => void adapter.delete(row.message),
    onCloseAsk: (how: "followedUp" | "neverMind") => void adapter.closeAsk(row.message, how),
    gone: adapter.goneLabel?.(row.message) ?? null,
    deleteLabel: adapter.deleteLabel?.(row.message),
    deleteConfirm: adapter.deleteConfirm,
    moreActions: adapter.moreActions?.(row.message),
    extra: renderExtra?.(row.message),
    translate,
  });

  /** A row of the stream itself: its badge, its Thread, the surface's actions. */
  const streamRow = (row: StreamRow<M>, when: string) => {
    const openThread = (focus: boolean) => setOpen({ id: row.message.id, focus });
    if (adapter.notice?.(row.message)) {
      return (
        <p key={row.message.id} role="note" className="strm-notice" data-stream-row={row.message.id}>
          {row.message.body}
        </p>
      );
    }
    return (
      <Row
        key={row.message.id}
        row={row}
        when={when}
        canReply={can.canReply}
        showChip
        threadOpen={open?.id === row.message.id}
        onOpenThread={openThread}
        badge={adapter.badge?.(row.message)}
        actions={renderActions?.(row.message, { openThread: () => openThread(true), replies: row.thread?.count ?? 0 })}
        {...rowProps(row)}
      />
    );
  };

  const replaceMode = threadMode === "replace" || !!pinned;
  const threadPane = thread && (
    <section className="strm-thread" aria-label={t("stream.thread_title")}>
      <div className={cn("strm-th-head", replaceMode && !pinned && "back")}>
        {replaceMode && !pinned && (
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
          <p>{pinned ? pinned.subtitle : t("stream.thread_where").replace("{where}", adapter.where)}</p>
        </div>
        {!replaceMode ? (
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
        {pinned ? (
          <div className="strm-quote">
            <div className="strm-qh">
              <Footprints className="w-3.5 h-3.5" aria-hidden />
              {pinned.quote.label}
            </div>
            <p className="strm-tx">{pinned.quote.body}</p>
          </div>
        ) : (
          <Row row={thread.parent} when={f.dateTime(thread.parent.message.at)} canReply={false} showChip={false} {...rowProps(thread.parent)} />
        )}
        {pinned && thread.replies.length === 0 && adapter.empty && <p className="strm-empty">{adapter.empty}</p>}
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
          placeholder={adapter.replyPlaceholder ?? t("stream.reply_placeholder")}
          hint={t("stream.reply_hint")}
          label={t("stream.reply_label")}
          submitLabel={t("stream.send_reply")}
          candidates={mentionCandidates}
          autoFocus={pinned ? thread.replies.length === 0 : open?.focus}
          onSubmit={({ body, mentionedUserIds }) => void adapter.reply(thread.parent.message, { body, mentionedUserIds })}
        />
      )}
    </section>
  );

  const root = cn("strm", compact && "strm-compact");
  if (replacing) return <div className={root}>{threadPane}</div>;

  const main = (
    <>
      {header}
      <div className="strm-list" ref={listRef} data-stream-list="">
        <div className="strm-flow">
          {topCount === 0 && adapter.empty && <p className="strm-empty">{adapter.empty}</p>}
          {heldRows.map((row) => (
            <React.Fragment key={`pin:${row.message.id}`}>
              <div className="strm-pinstrip">
                <Pin className="w-3.5 h-3.5" aria-hidden />
                {adapter.pinnedLabel!(row.message)}
              </div>
              {streamRow(row, f.dateTime(row.message.at))}
            </React.Fragment>
          ))}
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
              streamRow(item, f.time(item.message.at))
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
            staged={can.attachments ? adapter.staged : undefined}
            onAttach={can.attachments ? adapter.attach : undefined}
            onUnstage={adapter.unstage}
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
      <div className={cn(root, "strm-beside")}>
        <div className="strm-main">{main}</div>
        {threadPane && <div className="strm-pane">{threadPane}</div>}
      </div>
    );
  }
  return <div className={root}>{main}</div>;
}
