// To ask (#1649) — a Full-timer's private notepad of things to ask Trainees in
// person. A **clock in, a value out** derivation in the pattern of the Around
// the team (`aroundTeam.ts`) and reminder (`reminders.ts`) rules, and the
// behaviour oracle both surfaces render: no Firestore here.
//
// Four existing signals draft lines on their own — **Not reached yet** (from
// the existing whole-team unreached-contacts rule), a **Follow-up ask** still
// open after three campus calendar days, a **question** with no reply after the
// same three days (both from the reminder rule's constants and clock), and a
// text with nothing logged back for seven days (#1670). A drafted line stays
// tied to its signal instance for its whole life,
// even once reworded (ADR 0046): the line is keyed by contact + signal kind +
// the ask or message id, so when Jae logs an Interaction the line clears
// itself rather than being asked about again.
//
// Two private actions sit beside the Asked tick. **Dismiss** hides a line from
// its group without ticking it (`dismissedAt`); a drafted line comes back on
// its own once its signal starts after the dismissal. **Post an update** keeps
// a short note on the line (`updates`), and may also be written to the
// contact's page or the Thread by the surface — see `ToAskUpdateDest`.
import { parseMs } from "./myday";
import {
  isTiedTo,
  unreachedContacts,
  type ReachPerson,
  type ReachReading,
} from "./reach";
import { campusCalendarDaysSince, REMIND_AFTER_CALENDAR_DAYS } from "./reminders";
import { isOpenMention } from "./mentions";

/** The team filter, as on Around the team. */
export type ToAskTeamFilter = "all" | "campus" | "yp";

/** Ticked or cleared lines stay struck through this long, then drop. */
export const STRUCK_VISIBLE_DAYS = 7;

/** The Interaction types that count as writing to a person — the composer's
 *  `chat`/`email` and Quick Capture's older `text`. A logged meeting or call is
 *  a conversation had, not a message waiting on an answer, so neither starts a
 *  signal (#1670). */
export const OUTREACH_INTERACTION_TYPES: readonly string[] = ["chat", "text", "email"];

/** How long a text waits for anything to be logged back before To ask drafts a
 *  line about it (#1670). Seven campus calendar days — longer than the
 *  three-day ask and question rules, because a person answering is slower than
 *  a teammate answering. */
export const NO_REPLY_AFTER_CALENDAR_DAYS = 7;

const DAY_MS = 86_400_000;

/** One Trainee a person can be asked about, and the team they are on. */
export interface ToAskTrainee {
  uid: string;
  name: string;
  team?: string | null;
}

/** A person, with the name the notepad shows and the ties grouping reads. */
export interface ToAskPerson extends ReachPerson {
  name?: string | null;
}

/** A message from a contact's Thread — asks (`nudge`), questions and replies. */
export interface ToAskThreadMessage {
  id: string;
  contactId: string;
  interactionId?: string | null;
  from: string;
  fromName?: string | null;
  kind: string;
  body: string;
  at: string;
  /** A Follow-up ask is cleared once someone followed up or the asker withdrew. */
  closedAt?: string | null;
  closedByName?: string | null;
  /** The message this one replies to; absent on a top-level message. */
  parentId?: string | null;
  /** `"team"` for the Full-timers stream, so a reply lands beside it. */
  scope?: "team" | null;
  /** Teammates @mentioned: an open mention waits on them like an ask. */
  mentionedUserIds?: string[] | null;
}

/** An Interaction, reduced to what names whoever cleared a Not-reached line. */
export interface ToAskInteraction {
  /** The interaction's own id — it names the "text with no reply" instance
   *  (#1670). Absent on a row read before the id was carried. */
  id?: string | null;
  contactId: string;
  ms: number;
  userId?: string | null;
  userName?: string | null;
  type?: string | null;
}

/** Where a posted update goes. Every update is kept on its line (private to
 *  the Full-timer); the other two say where else the surface also wrote it:
 *  - `"line"`: only the line.
 *  - `"contact"`: also logged as an Interaction on the contact's page, on the
 *    tied Trainee's behalf (`reachedById`), so it reaches them like any log.
 *  - `"thread"`: also posted as a reply to the Thread message an `ask` or
 *    `question` line is about (see `toAskThreadTarget`). */
export type ToAskUpdateDest = "line" | "contact" | "thread";

/** A short note the Full-timer posted about a line. */
export interface ToAskUpdate {
  id: string;
  text: string;
  /** ISO the update was posted. */
  at: string;
  dest: ToAskUpdateDest;
}

/** A hand-written line the Full-timer owns. */
export interface AskNoteLine {
  id: string;
  text: string;
  /** A Trainee uid, or `"general"`. */
  group: string;
  contactId?: string | null;
  createdAt: string;
  askedAt?: string | null;
  /** ISO the line was dismissed. A hand-written line stays dismissed until it
   *  is brought back. */
  dismissedAt?: string | null;
  /** Posted updates, oldest first. */
  updates?: ToAskUpdate[];
}

/** What the Full-timer did to a drafted signal instance. */
export interface AskNoteOverride {
  /** Their own words for the line. */
  text?: string;
  /** The private Asked tick — the signal stays open. */
  askedAt?: string;
  /** ISO the line was dismissed. Applies only while the signal started at or
   *  before it: something new (a later start) brings the line back. */
  dismissedAt?: string;
  /** Posted updates, oldest first. */
  updates?: ToAskUpdate[];
}

/** The private notepad, one document per Full-timer. */
export interface ToAskNotepad {
  lines?: AskNoteLine[];
  overrides?: Record<string, AskNoteOverride>;
  /** Signal keys the notepad has drafted, so a cleared one can still say what
   *  cleared it for a week. Written back from `ToAskView.drafted`. */
  drafted?: Record<string, { at: string }>;
  /** Lines struck at or before this mark have been cleared with "Clear done". */
  clearedBefore?: string | null;
  teamFilter?: ToAskTeamFilter;
}

export interface ToAskInput {
  /** The Full-timer reading the page. */
  uid: string;
  now: number | Date;
  filter?: ToAskTeamFilter | null;
  people: readonly ToAskPerson[];
  reach: ReadonlyMap<string, ReachReading>;
  trainees: readonly ToAskTrainee[];
  /** Every Thread message the page holds — open and cleared. */
  messages: readonly ToAskThreadMessage[];
  interactions?: readonly ToAskInteraction[];
  notepad?: ToAskNotepad | null;
}

export type ToAskSignalKind = "notReached" | "ask" | "question" | "noReply" | "mention";
export type ToAskLineKind = "handwritten" | ToAskSignalKind;
export type ToAskLineState = "open" | "asked" | "cleared";

/** The structured signal behind a drafted line, for the renderer's own words. */
export interface ToAskSignalMeta {
  kind: ToAskSignalKind;
  contactName: string;
  /** The asker's first name, for "Kate's follow-up ask" / "your question". */
  askerName?: string | null;
  /** Who sent the text, for a "no reply" line (#1670). */
  reacherName?: string | null;
  /** True when the reader asked it. */
  mine?: boolean;
  /** Whole campus calendar days since the signal started. */
  days: number;
}

export interface ToAskClearedBy {
  reason: "reached" | "askClosed" | "answered" | "mentionClosed";
  at: string;
  name?: string | null;
  /** The Interaction type, e.g. `text`, `call`. */
  verb?: string | null;
}

export interface ToAskLine {
  key: string;
  kind: ToAskLineKind;
  /** The line's own words (the Full-timer's, or the app's default draft). */
  text: string;
  /** True when the Full-timer replaced the app's draft with their own words. */
  reworded: boolean;
  state: ToAskLineState;
  contactId?: string | null;
  signalKey?: string;
  /** ISO the signal started (drafted lines), or the line was written. */
  at: string;
  /** ISO the line was ticked Asked or cleared; null while open. */
  struckAt?: string | null;
  askedAt?: string | null;
  clearedBy?: ToAskClearedBy | null;
  signal?: ToAskSignalMeta | null;
  /** Updates the Full-timer posted about this line, oldest first. */
  updates: ToAskUpdate[];
}

export interface ToAskGroup {
  /** A Trainee uid, `"general"`, or `"none"`. */
  id: string;
  kind: "general" | "trainee" | "none";
  traineeUid?: string | null;
  name: string;
  team?: string | null;
  /** How many open lines the group holds — never asked, never cleared. */
  open: number;
  lines: ToAskLine[];
}

export interface ToAskTopTrainee {
  uid: string;
  name: string;
  open: number;
}

/** A line Dismiss hid from its group, for the "Dismissed" tray. */
export interface ToAskDismissed {
  key: string;
  /** The line as its group would show it: text, kind, signal meta, updates. */
  line: ToAskLine;
  /** The group it was hidden from — for a person tied to two Trainees, the
   *  first one the team filter shows. */
  groupId: string;
  groupKind: ToAskGroup["kind"];
  /** The same display name as `ToAskGroup.name`. */
  groupName: string;
  dismissedAt: string;
}

export interface ToAskView {
  groups: ToAskGroup[];
  /** The page pill and the My Day pointer card, by construction: open lines,
   *  counted once per signal key. */
  openCount: number;
  /** Struck lines shown — the "Clear done" button's number. */
  clearedCount: number;
  /** Trainee groups with open lines, busiest first — the pointer card's rows. */
  topTrainees: ToAskTopTrainee[];
  /** The drafted keys to persist back, so a later clear can say what cleared it. */
  drafted: Record<string, { at: string }>;
  /** Dismissed lines, newest dismissal first, once per key. Never counted in
   *  `openCount`, a group's `open`, `clearedCount` or `topTrainees`. */
  dismissed: ToAskDismissed[];
}

export const GENERAL_GROUP = "general";
export const NO_TRAINEE_GROUP = "none";

const iso = (ms: number | null | undefined): string =>
  ms == null || !Number.isFinite(ms) ? "" : new Date(ms).toISOString();

const signalKey = (kind: ToAskSignalKind, contactId: string, messageId?: string): string =>
  messageId ? `${kind}|${contactId}|${messageId}` : `${kind}|${contactId}`;

/** A drafted line's key, read back: the signal kind, the contact, and the
 *  instance (a Thread message id for `ask`/`question`, an Interaction id or ISO
 *  for `noReply`). Null for a hand-written key (`note:<id>`). */
export function parseToAskKey(
  key: string,
): { kind: ToAskSignalKind; contactId: string; messageId?: string } | null {
  const [kind, contactId, messageId] = key.split("|");
  if (kind !== "notReached" && kind !== "ask" && kind !== "question" && kind !== "noReply" && kind !== "mention") return null;
  if (!contactId) return null;
  return { kind, contactId, messageId };
}

const firstName = (name?: string | null): string =>
  (name || "").trim().split(/\s+/)[0] || "Someone";

/** The same, or null when nobody is named — a text whose sender is unknown. */
const firstOf = (name?: string | null): string | null =>
  (name || "").trim().split(/\s+/)[0] || null;

interface OpenSignal {
  key: string;
  kind: ToAskSignalKind;
  at: string;
  contactId: string;
  contactName: string;
  askerName?: string | null;
  reacherName?: string | null;
  mine?: boolean;
}

/** Every signal instance currently open for the roster. */
function openSignals(input: ToAskInput, nowMs: number): OpenSignal[] {
  const { people, reach, messages, uid } = input;
  const personById = new Map<string, ToAskPerson>();
  for (const p of people) personById.set(p.id, p);
  const nameOf = (contactId: string) => personById.get(contactId)?.name || "Someone";
  const nameByUid = new Map<string, string>();
  for (const t of input.trainees) nameByUid.set(t.uid, t.name);
  for (const m of messages) if (m.from && m.fromName) nameByUid.set(m.from, m.fromName);

  const signals: OpenSignal[] = [];

  // 1. Not reached yet — the existing whole-team rule, so the 30-day window
  //    matches My Day's card exactly.
  for (const p of unreachedContacts(people, reach, { scope: "team", viewerUid: uid, nowMs })) {
    signals.push({
      key: signalKey("notReached", p.id),
      kind: "notReached",
      at: iso(p.createdAtMs) || iso(nowMs),
      contactId: p.id,
      contactName: nameOf(p.id),
    });
  }

  // 2 & 3. The reminder rule's two signals. A Follow-up ask is a `nudge`; a
  //    question is answered once someone else replies to it (ADR 0033) — a
  //    reply is a message whose parentId is the question's id. Only top-level
  //    messages can start a signal.
  const repliesTo = new Map<string, ToAskThreadMessage[]>();
  for (const m of messages) {
    if (!m.parentId) continue;
    const list = repliesTo.get(m.parentId);
    if (list) list.push(m);
    else repliesTo.set(m.parentId, [m]);
  }
  for (const m of messages) {
    if (m.parentId) continue;
    if (m.kind === "nudge") {
      if (m.closedAt) continue;
      if (campusCalendarDaysSince(m.at, nowMs) < REMIND_AFTER_CALENDAR_DAYS) continue;
      signals.push({
        key: signalKey("ask", m.contactId, m.id),
        kind: "ask",
        at: m.at,
        contactId: m.contactId,
        contactName: nameOf(m.contactId),
        askerName: firstName(m.fromName || nameByUid.get(m.from)),
        mine: m.from === uid,
      });
    } else if (isOpenMention(m)) {
      // An @mention still open after the ask's three days: nobody it named
      // has replied or said Done.
      if (campusCalendarDaysSince(m.at, nowMs) < REMIND_AFTER_CALENDAR_DAYS) continue;
      signals.push({
        key: signalKey("mention", m.contactId, m.id),
        kind: "mention",
        at: m.at,
        contactId: m.contactId,
        contactName: nameOf(m.contactId),
        askerName: firstName(m.fromName || nameByUid.get(m.from)),
        mine: m.from === uid,
      });
    } else if (m.kind === "question") {
      const replied = (repliesTo.get(m.id) ?? []).some((r) => r.from !== m.from);
      if (replied) continue;
      if (campusCalendarDaysSince(m.at, nowMs) < REMIND_AFTER_CALENDAR_DAYS) continue;
      signals.push({
        key: signalKey("question", m.contactId, m.id),
        kind: "question",
        at: m.at,
        contactId: m.contactId,
        contactName: nameOf(m.contactId),
        askerName: firstName(m.fromName || nameByUid.get(m.from)),
        mine: m.from === uid,
      });
    }
  }

  // 4. A text with nothing logged back (#1670). The instance is the newest
  //    outreach Interaction — a later text replaces an earlier one, because
  //    asking about the older message would be asking about something already
  //    superseded. Reach already folds in every Interaction and every
  //    Gathering, so a later anything (a call, a meeting, a Friday night)
  //    clears it, while the text's own date is only the floor. Anyone written
  //    to is drafted whatever their kind: a follow-up is exactly as useful for
  //    a student met last week as for a brand-new Contact.
  const newestOutreach = new Map<string, ToAskInteraction>();
  const newestInteractionMS = new Map<string, number>();
  for (const i of input.interactions ?? []) {
    if (!i.contactId || !Number.isFinite(i.ms)) continue;
    const seen = newestInteractionMS.get(i.contactId);
    if (seen == null || i.ms > seen) newestInteractionMS.set(i.contactId, i.ms);
    if (!i.type) continue;
    if (!OUTREACH_INTERACTION_TYPES.includes(i.type)) continue;
    const current = newestOutreach.get(i.contactId);
    if (!current || i.ms > current.ms) newestOutreach.set(i.contactId, i);
  }
  for (const [contactId, i] of newestOutreach) {
    if (!personById.has(contactId)) continue;
    const lastSeen = Math.max(
      reach.get(contactId)?.ms ?? -Infinity,
      newestInteractionMS.get(contactId) ?? -Infinity,
    );
    if (lastSeen > i.ms) continue;
    if (campusCalendarDaysSince(iso(i.ms), nowMs) < NO_REPLY_AFTER_CALENDAR_DAYS) continue;
    signals.push({
      key: signalKey("noReply", contactId, i.id ?? iso(i.ms)),
      kind: "noReply",
      at: iso(i.ms),
      contactId,
      contactName: nameOf(contactId),
      reacherName: firstOf(i.userName || nameByUid.get(i.userId ?? "")),
      mine: !!i.userId && i.userId === uid,
    });
  }

  return signals;
}

/** Why a drafted signal instance is gone, and when — or null if it cannot be
 *  told (the person aged out of the window, the message was purged). */
function clearedInfo(
  key: string,
  ctx: {
    reach: ReadonlyMap<string, ReachReading>;
    messages: readonly ToAskThreadMessage[];
    interactions: readonly ToAskInteraction[];
  },
): ToAskClearedBy | null {
  const parsed = parseToAskKey(key);
  if (!parsed) return null;
  const { kind, contactId, messageId } = parsed;

  if (kind === "notReached" || kind === "noReply") {
    const reading = ctx.reach.get(contactId);
    const newest = ctx.interactions
      .filter((i) => i.contactId === contactId)
      .sort((a, b) => b.ms - a.ms)[0];
    if (kind === "noReply") {
      // The text's own reach is the signal, not a clearing: something after it
      // has to have been logged, by an Interaction of any kind or a Gathering.
      // The first thing after the text is what ended that instance.
      const floor = outreachFloor(ctx.interactions, messageId);
      if (floor == null) return null;
      const after = ctx.interactions
        .filter((i) => i.contactId === contactId && i.ms > floor)
        .sort((a, b) => a.ms - b.ms)[0];
      const lastSeen = Math.max(reading?.ms ?? -Infinity, newest?.ms ?? -Infinity);
      if (!(lastSeen > floor)) return null;
      return {
        reason: "reached",
        at: iso(after?.ms ?? lastSeen),
        name: after?.userName ?? null,
        verb: after?.type ?? null,
      };
    }
    if (!reading?.reached) return null;
    return {
      reason: "reached",
      at: iso(readingsMs(reading, newest?.ms)) || iso(newest?.ms ?? null),
      name: newest?.userName ?? null,
      verb: newest?.type ?? null,
    };
  }

  const message = ctx.messages.find((m) => m.id === messageId);
  if (!message) return null;

  if (kind === "ask") {
    if (!message.closedAt) return null;
    return { reason: "askClosed", at: message.closedAt, name: message.closedByName ?? null };
  }

  if (kind === "mention") {
    if (!message.closedAt) return null;
    return { reason: "mentionClosed", at: message.closedAt, name: message.closedByName ?? null };
  }

  // question
  const reply = ctx.messages
    .filter(
      (r) => r.parentId === message.id && r.from !== message.from,
    )
    .sort((a, b) => (parseMs(a.at) ?? 0) - (parseMs(b.at) ?? 0))[0];
  if (!reply) return null;
  return { reason: "answered", at: reply.at, name: reply.fromName ?? null };
}

function readingsMs(reading: ReachReading, fallbackMs?: number): number | null {
  return reading.ms ?? fallbackMs ?? null;
}

/** The Interaction a "no reply" key names: found by id, or by its ISO date on
 *  a row that carried no id. */
function outreachInstance(
  interactions: readonly ToAskInteraction[],
  instance: string | undefined,
): ToAskInteraction | null {
  if (!instance) return null;
  const byId = interactions.find((i) => i.id === instance);
  if (byId) return byId;
  const ms = parseMs(instance);
  if (!Number.isFinite(ms)) return null;
  return interactions.find((i) => i.ms === ms) ?? null;
}

/** When the texted instance started. */
function outreachFloor(
  interactions: readonly ToAskInteraction[],
  instance: string | undefined,
): number | null {
  const hit = outreachInstance(interactions, instance);
  const ms = hit ? hit.ms : instance ? parseMs(instance) : null;
  return ms != null && Number.isFinite(ms) ? ms : null;
}

function defaultDraftText(signal: ToAskSignalMeta): string {
  if (signal.kind === "notReached") return `${signal.contactName} — not reached yet`;
  if (signal.kind === "noReply") {
    const who = signal.mine ? "you" : signal.reacherName || "Someone";
    return `${signal.contactName} — ${who} texted them and heard nothing back`;
  }
  const owner = signal.mine ? "your" : `${signal.askerName}'s`;
  if (signal.kind === "mention") return `${signal.contactName} — ${owner} mention is still open`;
  return signal.kind === "ask"
    ? `${signal.contactName} — ${owner} follow-up ask is still open`
    : `${signal.contactName} — ${owner} question has no reply`;
}

/** The id of a hand-written line from its key (`note:<id>`), or null for a
 *  drafted key. */
export function toAskNoteId(key: string): string | null {
  return key.startsWith("note:") ? key.slice("note:".length) : null;
}

/** Where an update about this line may go, in the order the composer offers
 *  them: always the line; the contact's page when the line names a contact;
 *  the Thread for an `ask` or `question` line. */
export function toAskUpdateDestinations(
  line: Pick<ToAskLine, "kind" | "contactId">,
): ToAskUpdateDest[] {
  const dests: ToAskUpdateDest[] = ["line"];
  if (line.contactId) dests.push("contact");
  if (line.kind === "ask" || line.kind === "question" || line.kind === "mention") dests.push("thread");
  return dests;
}

/** A new update, ready to store. The text is trimmed; the id is unique enough
 *  for one Full-timer's notepad. */
export function newToAskUpdate(
  text: string,
  dest: ToAskUpdateDest,
  now: number | Date = Date.now(),
): ToAskUpdate {
  const ms = typeof now === "number" ? now : now.getTime();
  return {
    id: `u-${ms}-${Math.random().toString(36).slice(2, 7)}`,
    text: text.trim(),
    at: new Date(ms).toISOString(),
    dest,
  };
}

/** Where a `"thread"` update is posted: a reply to the message the line's
 *  signal is about, in that message's own stream (`scope`) and interaction.
 *  Null for any other kind of line, or when the message is not in hand. */
export function toAskThreadTarget(
  key: string,
  messages: readonly ToAskThreadMessage[],
): { contactId: string; parentId: string; interactionId: string | null; scope: "team" | null } | null {
  const parsed = parseToAskKey(key);
  if (!parsed || (parsed.kind !== "ask" && parsed.kind !== "question" && parsed.kind !== "mention") || !parsed.messageId) return null;
  const message = messages.find((m) => m.id === parsed.messageId);
  if (!message) return null;
  return {
    contactId: message.contactId,
    parentId: message.id,
    interactionId: message.interactionId ?? null,
    scope: message.scope === "team" ? "team" : null,
  };
}

/** Whether a drafted line's dismissal still holds: it was dismissed, and the
 *  signal did not start after that. */
function dismissalHolds(dismissedAt: string | null | undefined, signalAt: string): boolean {
  const dismissedMs = parseMs(dismissedAt);
  if (dismissedMs == null) return false;
  const atMs = parseMs(signalAt);
  return !(atMs != null && atMs > dismissedMs);
}

/** The notepad, derived. Pure: the clock, the roster, the messages and the
 *  stored notepad in; the grouped list, the count and what to persist out. */
export function buildToAsk(input: ToAskInput): ToAskView {
  const nowMs = typeof input.now === "number" ? input.now : input.now.getTime();
  const notepad = input.notepad ?? {};
  const overrides = notepad.overrides ?? {};
  const storedDrafted = notepad.drafted ?? {};
  const clearedBefore = notepad.clearedBefore ?? null;
  const clearedBeforeMs = parseMs(clearedBefore);
  const struckWindowMs = STRUCK_VISIBLE_DAYS * DAY_MS;
  const filter = input.filter && input.filter !== "all" ? input.filter : null;

  const personById = new Map<string, ToAskPerson>();
  for (const p of input.people) personById.set(p.id, p);
  const traineeByUid = new Map<string, ToAskTrainee>();
  for (const t of input.trainees) traineeByUid.set(t.uid, t);

  const interactions = input.interactions ?? [];
  /** Every drafted key, whatever the team filter hides — persisted back. */
  const drafted: Record<string, { at: string }> = {};
  const signals = openSignals(input, nowMs);
  const signalByKey = new Map<string, OpenSignal>();
  for (const s of signals) signalByKey.set(s.key, s);

  /** A Trainee group keyed by uid, created lazily in roster order. */
  const groupLines = new Map<string, ToAskLine[]>();
  const pushLine = (groupId: string, line: ToAskLine) => {
    const list = groupLines.get(groupId);
    if (list) list.push(line);
    else groupLines.set(groupId, [line]);
  };

  const struck = (atIso: string): boolean => {
    const at = parseMs(atIso);
    if (at == null) return false;
    if (clearedBeforeMs != null && at <= clearedBeforeMs) return false;
    return nowMs - at < struckWindowMs;
  };

  /** Where a group id would show, or null when the team filter hides it. */
  const groupMeta = (
    groupId: string,
  ): { kind: ToAskGroup["kind"]; name: string } | null => {
    if (groupId === GENERAL_GROUP) return { kind: "general", name: "General" };
    if (groupId === NO_TRAINEE_GROUP) return { kind: "none", name: "No Trainee tied" };
    const trainee = traineeByUid.get(groupId);
    if (filter && trainee?.team !== filter) return null;
    return { kind: "trainee", name: trainee?.name || groupId };
  };

  const dismissedByKey = new Map<string, ToAskDismissed>();
  /** Hide a line from its groups and list it once in the tray instead. */
  const pushDismissed = (groupIds: string[], line: ToAskLine, dismissedAt: string) => {
    if (dismissedByKey.has(line.key)) return;
    for (const groupId of groupIds) {
      const meta = groupMeta(groupId);
      if (!meta) continue;
      dismissedByKey.set(line.key, {
        key: line.key,
        line,
        groupId,
        groupKind: meta.kind,
        groupName: meta.name,
        dismissedAt,
      });
      return;
    }
  };

  const groupIdsFor = (person: ToAskPerson | undefined): string[] => {
    const tied = input.trainees.filter((t) => isTiedTo(person, t.uid));
    return tied.length === 0 ? [NO_TRAINEE_GROUP] : tied.map((t) => t.uid);
  };

  // ── Hand-written lines ─────────────────────────────────────────────────────
  const seenNoteKeys = new Set<string>();
  let clearedCount = 0;
  for (const note of notepad.lines ?? []) {
    const key = `note:${note.id}`;
    if (seenNoteKeys.has(key)) continue;
    seenNoteKeys.add(key);
    const askedAt = note.askedAt ?? null;
    if (askedAt && !struck(askedAt)) continue; // ticked a week ago — gone
    const line: ToAskLine = {
      key,
      kind: "handwritten",
      text: note.text,
      reworded: false,
      state: askedAt ? "asked" : "open",
      contactId: note.contactId ?? null,
      at: note.createdAt,
      struckAt: askedAt,
      askedAt,
      clearedBy: null,
      signal: null,
      updates: note.updates ?? [],
    };
    if (note.dismissedAt) {
      pushDismissed([note.group || GENERAL_GROUP], line, note.dismissedAt);
      continue;
    }
    if (askedAt) clearedCount += 1;
    pushLine(note.group || GENERAL_GROUP, line);
  }

  // ── Drafted lines (open signals) ───────────────────────────────────────────
  for (const s of signals) {
    const override = overrides[s.key];
    const person = personById.get(s.contactId);
    const meta: ToAskSignalMeta = {
      kind: s.kind,
      contactName: s.contactName,
      askerName: s.askerName ?? null,
      reacherName: s.reacherName ?? null,
      mine: s.mine ?? false,
      days: campusCalendarDaysSince(s.at, nowMs),
    };
    const askedAt = override?.askedAt ?? null;
    const reworded = !!override?.text;
    const line: ToAskLine = {
      key: s.key,
      kind: s.kind,
      text: reworded ? override!.text! : defaultDraftText(meta),
      reworded,
      state: askedAt ? "asked" : "open",
      contactId: s.contactId,
      signalKey: s.key,
      at: s.at,
      struckAt: askedAt,
      askedAt,
      clearedBy: null,
      signal: meta,
      updates: override?.updates ?? [],
    };
    if (askedAt && !struck(askedAt)) {
      // Ticked and a week has passed — but the signal is still open, so it
      // would simply re-draft as a fresh open line: Asked never re-opens by
      // time, and the same instance stays ticked. Keep it out of the count
      // until a *new* signal instance appears.
      continue;
    }
    drafted[s.key] = storedDrafted[s.key] ?? { at: s.at };
    if (dismissalHolds(override?.dismissedAt, s.at)) {
      pushDismissed(groupIdsFor(person), line, override!.dismissedAt!);
      continue;
    }
    if (askedAt) clearedCount += 1;
    for (const groupId of groupIdsFor(person)) pushLine(groupId, line);
  }

  // ── Cleared drafted lines (signal gone, still inside the struck window) ────
  const knownKeys = new Set([...Object.keys(overrides), ...Object.keys(storedDrafted)]);
  for (const key of knownKeys) {
    if (signalByKey.has(key)) continue;
    const cleared = clearedInfo(key, { reach: input.reach, messages: input.messages, interactions });
    if (!cleared) continue;
    if (!struck(cleared.at)) continue;
    const parsed = parseToAskKey(key);
    if (!parsed) continue;
    const person = personById.get(parsed.contactId);
    if (!person) continue;
    const override = overrides[key] ?? {};
    const at = storedDrafted[key]?.at ?? cleared.at;
    const meta: ToAskSignalMeta = {
      kind: parsed.kind,
      contactName: person.name || "Someone",
      askerName: null,
      reacherName: firstOf(outreachInstance(interactions, parsed.messageId)?.userName),
      mine: false,
      days: campusCalendarDaysSince(at, nowMs),
    };
    const reworded = !!override.text;
    const line: ToAskLine = {
      key,
      kind: parsed.kind,
      text: reworded ? override.text! : defaultDraftText(meta),
      reworded,
      state: "cleared",
      contactId: parsed.contactId,
      signalKey: key,
      at,
      struckAt: cleared.at,
      askedAt: override.askedAt ?? null,
      clearedBy: cleared,
      signal: meta,
      updates: override.updates ?? [],
    };
    drafted[key] = storedDrafted[key] ?? { at };
    if (dismissalHolds(override.dismissedAt, at)) {
      pushDismissed(groupIdsFor(person), line, override.dismissedAt!);
      continue;
    }
    clearedCount += 1;
    for (const groupId of groupIdsFor(person)) pushLine(groupId, line);
  }

  // ── Assemble groups ────────────────────────────────────────────────────────
  const lineSort = (a: ToAskLine, b: ToAskLine): number => {
    const openA = a.state === "open" ? 0 : 1;
    const openB = b.state === "open" ? 0 : 1;
    if (openA !== openB) return openA - openB;
    const handA = a.kind === "handwritten" ? 0 : 1;
    const handB = b.kind === "handwritten" ? 0 : 1;
    if (handA !== handB) return handA - handB;
    const atA = parseMs(a.at) ?? 0;
    const atB = parseMs(b.at) ?? 0;
    // Hand-written newest first; drafted oldest signal first.
    if (handA === 0) return atB - atA;
    return atA - atB;
  };

  const openIn = (lines: ToAskLine[]) => lines.filter((l) => l.state === "open").length;

  const groups: ToAskGroup[] = [];

  // General first.
  const generalLines = (groupLines.get(GENERAL_GROUP) ?? []).slice().sort(lineSort);
  if (generalLines.length > 0) {
    groups.push({
      id: GENERAL_GROUP,
      kind: "general",
      traineeUid: null,
      name: "General",
      team: null,
      open: openIn(generalLines),
      lines: generalLines,
    });
  }

  // Then Trainee groups by open count, descending.
  const traineeGroups: ToAskGroup[] = [];
  for (const [groupId, lines] of groupLines) {
    if (groupId === GENERAL_GROUP || groupId === NO_TRAINEE_GROUP) continue;
    const trainee = traineeByUid.get(groupId);
    if (filter && trainee?.team !== filter) continue;
    const sorted = lines.slice().sort(lineSort);
    traineeGroups.push({
      id: groupId,
      kind: "trainee",
      traineeUid: groupId,
      name: trainee?.name || groupId,
      team: trainee?.team ?? null,
      open: openIn(sorted),
      lines: sorted,
    });
  }
  traineeGroups.sort((a, b) => b.open - a.open || a.name.localeCompare(b.name));
  groups.push(...traineeGroups);

  // No Trainee tied last.
  const noneLines = (groupLines.get(NO_TRAINEE_GROUP) ?? []).slice().sort(lineSort);
  if (noneLines.length > 0) {
    groups.push({
      id: NO_TRAINEE_GROUP,
      kind: "none",
      traineeUid: null,
      name: "No Trainee tied",
      team: null,
      open: openIn(noneLines),
      lines: noneLines,
    });
  }

  // ── The count: open lines, once per signal key ─────────────────────────────
  const openKeys = new Set<string>();
  for (const group of groups) {
    for (const line of group.lines) {
      if (line.state === "open") openKeys.add(line.key);
    }
  }
  const openCount = openKeys.size;

  const topTrainees: ToAskTopTrainee[] = traineeGroups
    .filter((g) => g.open > 0)
    .map((g) => ({ uid: g.id, name: g.name, open: g.open }));

  const dismissed = [...dismissedByKey.values()].sort(
    (a, b) => (parseMs(b.dismissedAt) ?? 0) - (parseMs(a.dismissedAt) ?? 0),
  );

  return { groups, openCount, clearedCount, topTrainees, drafted, dismissed };
}
