// A chat room's messages as the written-stream model reads them (ADR 0033 §6):
// the chat adapter's pure half. The screens hand the result to the core stream
// model (`buildStream` / `buildThread`); what is pinned, taken back or
// acknowledged stays on each message's `source`, for the row to say.
import type { ChatMessage, StreamMessage } from '@cisa/core';

/** A chat message as the stream model reads it, with the message it came from. */
export interface ChatStreamMessage extends StreamMessage {
  source: ChatMessage;
}

interface Who {
  me: string;
  nameOf: (uid: string, fallback: string) => string;
  t: (key: string) => string;
}

const firstOf = (name: string) => name.trim().split(/\s+/)[0] ?? name;

/** A message's time as ISO. A pending server time (null until the write lands)
 *  reads as now. */
function atOf(ts: unknown): string {
  if (typeof ts === 'string' && !Number.isNaN(Date.parse(ts))) return new Date(ts).toISOString();
  return new Date().toISOString();
}

export function toChatStreamMessage(m: ChatMessage): ChatStreamMessage {
  return {
    id: m.id,
    parentId: m.parentId ?? null,
    // A system notice's `senderId` is whoever acted; its own author keeps the
    // actor's next message from reading as a continuation of it.
    from: m.type === 'system' ? `system:${m.id}` : m.senderId,
    fromName: m.senderName,
    body: m.text ?? '',
    at: atOf(m.timestamp),
    source: m,
  };
}

/** An announcement's pinned posts, oldest first — drawn above the stream, each
 *  under its strip. Top-level and live only; other rooms have no strip. */
export function heldPosts(messages: ChatStreamMessage[], isAnnouncement: boolean): ChatStreamMessage[] {
  if (!isAnnouncement) return [];
  return messages
    .filter((m) => !m.parentId && m.source.pinned && !m.source.deleted)
    .sort((a, b) => a.at.localeCompare(b.at));
}

/** The strip over a pinned post: "Pinned by {name} · stays at the top until
 *  they unpin it". A post pinned before `pinnedBy`, or from the create wizard,
 *  credits its author. */
export function pinnedLabelOf(m: ChatStreamMessage, { me, nameOf, t }: Who): string {
  const s = m.source;
  if (s.pinnedBy === me) return t('mobile.messages.pinned_by_you');
  const name = s.pinnedBy ? nameOf(s.pinnedBy, s.senderName) : s.senderName;
  return t('mobile.messages.pinned_by').replace('{name}', name);
}

/** What stands in a taken-back message's place, or null while it is live. */
export function goneLabelOf(m: ChatStreamMessage, { me, nameOf, t }: Who): string | null {
  const gone = m.source.deleted;
  if (!gone) return null;
  if (gone.by === me) return t(m.from === me ? 'mobile.messages.gone_you_took_back' : 'mobile.messages.gone_you_removed');
  if (gone.by === m.from) return t('mobile.messages.gone_took_back').replace('{name}', firstOf(m.fromName));
  return t('mobile.messages.gone_removed_by').replace('{name}', firstOf(nameOf(gone.by, gone.by)));
}

export const isPostAcknowledged = (m: ChatMessage, uid: string) => !!m.acknowledged?.includes(uid);

/** The announcement posts a viewer still owes a read receipt (#1243, #1277):
 *  top-level, live, not a system notice, and not already in `readBy`. The web's
 *  read-on-view candidates, minus the centred notices it never observes. */
export function unreadAnnouncementPosts(messages: ChatStreamMessage[], uid: string): ChatStreamMessage[] {
  return messages.filter(
    (m) => !m.parentId && !m.source.deleted && m.source.type !== 'system' && !(m.source.readBy ?? []).includes(uid),
  );
}

/** A laid-out row: its id, top and height, in the stream's own coordinates. */
export interface RowBox {
  id: string;
  top: number;
  height: number;
}

/** Which rows sit inside the viewport, given each row's laid-out box and the
 *  scroll window. The window is shrunk 10% top and bottom — the web's
 *  read-on-view `rootMargin` — so a post must be properly on screen, not caught
 *  at an edge. Nothing is in view until the viewport has been measured. */
export function rowsInView(boxes: RowBox[], scrollY: number, viewportH: number): string[] {
  if (viewportH <= 0) return [];
  const top = scrollY + viewportH * 0.1;
  const bottom = scrollY + viewportH * 0.9;
  return boxes
    .filter((b) => {
      const startsBelowTop = top < b.top + b.height;
      const endsAboveBottom = b.top < bottom;
      return startsBelowTop && endsAboveBottom;
    })
    .map((b) => b.id);
}

/** The room's last-read (this device's, in ms) as the stream model's
 *  `lastReadAt`; null if the room was never opened. */
export const readMarkOf = (ms: number | null): string | null => (ms == null ? null : new Date(ms).toISOString());

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A body split into plain runs and @mentions of the room's people. A picked
 *  mention carries the full name; one typed by hand is often just the first
 *  name, in any case. Display only — who is notified is settled elsewhere. */
export function mentionParts(text: string, names: string[]): { text: string; mention: boolean }[] {
  const all = [...new Set(names.flatMap((n) => [n.trim(), n.trim().split(/\s+/)[0]]).filter(Boolean))].sort(
    (a, b) => b.length - a.length,
  );
  if (all.length === 0) return [{ text, mention: false }];
  const re = new RegExp(`(@(?:${all.map(escapeRe).join('|')})(?![\\p{L}\\p{N}_]))`, 'giu');
  return text
    .split(re)
    .map((part, i) => ({ text: part, mention: i % 2 === 1 }))
    .filter((p) => p.text !== '');
}
