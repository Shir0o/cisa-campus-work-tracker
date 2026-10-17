// To ask (#1649) — a Full-timer's private notepad of things to ask Trainees in
// person. A **clock in, a value out** derivation in the pattern of the Around
// the team (`aroundTeam.ts`) and reminder (`reminders.ts`) rules, and the
// behaviour oracle both surfaces render: no Firestore here.
//
// Three existing signals draft lines on their own — **Not reached yet** (from
// the existing whole-team unreached-contacts rule), a **Follow-up ask** still
// open after three campus calendar days, and a **question** with no reply
// after the same three days (both from the reminder rule's constants and
// clock). A drafted line stays tied to its signal instance for its whole life,
// even once reworded (ADR 0046): the line is keyed by contact + signal kind +
// the ask or message id, so when Jae logs an Interaction the line clears
// itself rather than being asked about again.
import { parseMs } from "./myday";
import {
  isTiedTo,
  unreachedContacts,
  type ReachPerson,
  type ReachReading,
} from "./reach";
import { campusCalendarDaysSince, REMIND_AFTER_CALENDAR_DAYS } from "./reminders";

/** The team filter, as on Around the team. */
export type ToAskTeamFilter = "all" | "campus" | "yp";

/** Ticked or cleared lines stay struck through this long, then drop. */
export const STRUCK_VISIBLE_DAYS = 7;

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
}

/** An Interaction, reduced to what names whoever cleared a Not-reached line. */
export interface ToAskInteraction {
  contactId: string;
  ms: number;
  userId?: string | null;
  userName?: string | null;
  type?: string | null;
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
}

/** What the Full-timer did to a drafted signal instance. */
export interface AskNoteOverride {
  /** Their own words for the line. */
  text?: string;
  /** The private Asked tick — the signal stays open. */
  askedAt?: string;
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

export type ToAskSignalKind = "notReached" | "ask" | "question";
export type ToAskLineKind = "handwritten" | ToAskSignalKind;
export type ToAskLineState = "open" | "asked" | "cleared";

/** The structured signal behind a drafted line, for the renderer's own words. */
export interface ToAskSignalMeta {
  kind: ToAskSignalKind;
  contactName: string;
  /** The asker's first name, for "Kate's follow-up ask" / "your question". */
  askerName?: string | null;
  /** True when the reader asked it. */
  mine?: boolean;
  /** Whole campus calendar days since the signal started. */
  days: number;
}

export interface ToAskClearedBy {
  reason: "reached" | "askClosed" | "answered";
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
}

export const GENERAL_GROUP = "general";
export const NO_TRAINEE_GROUP = "none";

const iso = (ms: number | null | undefined): string =>
  ms == null || !Number.isFinite(ms) ? "" : new Date(ms).toISOString();

const signalKey = (kind: ToAskSignalKind, contactId: string, messageId?: string): string =>
  messageId ? `${kind}|${contactId}|${messageId}` : `${kind}|${contactId}`;

function parseKey(key: string): { kind: ToAskSignalKind; contactId: string; messageId?: string } | null {
  const [kind, contactId, messageId] = key.split("|");
  if (kind !== "notReached" && kind !== "ask" && kind !== "question") return null;
  if (!contactId) return null;
  return { kind, contactId, messageId };
}

const firstName = (name?: string | null): string =>
  (name || "").trim().split(/\s+/)[0] || "Someone";

interface OpenSignal {
  key: string;
  kind: ToAskSignalKind;
  at: string;
  contactId: string;
  contactName: string;
  askerName?: string | null;
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
  const parsed = parseKey(key);
  if (!parsed) return null;
  const { kind, contactId, messageId } = parsed;

  if (kind === "notReached") {
    const reading = ctx.reach.get(contactId);
    if (!reading?.reached) return null;
    const newest = ctx.interactions
      .filter((i) => i.contactId === contactId)
      .sort((a, b) => b.ms - a.ms)[0];
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

function defaultDraftText(signal: ToAskSignalMeta): string {
  if (signal.kind === "notReached") return `${signal.contactName} — not reached yet`;
  const owner = signal.mine ? "your" : `${signal.askerName}'s`;
  return signal.kind === "ask"
    ? `${signal.contactName} — ${owner} follow-up ask is still open`
    : `${signal.contactName} — ${owner} question has no reply`;
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
    };
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
    };
    if (askedAt && !struck(askedAt)) {
      // Ticked and a week has passed — but the signal is still open, so it
      // would simply re-draft as a fresh open line: Asked never re-opens by
      // time, and the same instance stays ticked. Keep it out of the count
      // until a *new* signal instance appears.
      continue;
    }
    if (askedAt) clearedCount += 1;
    drafted[s.key] = storedDrafted[s.key] ?? { at: s.at };

    const tied = input.trainees.filter((t) => isTiedTo(person, t.uid));
    if (tied.length === 0) pushLine(NO_TRAINEE_GROUP, line);
    else for (const t of tied) pushLine(t.uid, line);
  }

  // ── Cleared drafted lines (signal gone, still inside the struck window) ────
  const knownKeys = new Set([...Object.keys(overrides), ...Object.keys(storedDrafted)]);
  for (const key of knownKeys) {
    if (signalByKey.has(key)) continue;
    const cleared = clearedInfo(key, { reach: input.reach, messages: input.messages, interactions });
    if (!cleared) continue;
    if (!struck(cleared.at)) continue;
    const parsed = parseKey(key);
    if (!parsed) continue;
    const person = personById.get(parsed.contactId);
    if (!person) continue;
    const override = overrides[key] ?? {};
    const at = storedDrafted[key]?.at ?? cleared.at;
    const meta: ToAskSignalMeta = {
      kind: parsed.kind,
      contactName: person.name || "Someone",
      askerName: null,
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
    };
    clearedCount += 1;
    drafted[key] = storedDrafted[key] ?? { at };
    const tied = input.trainees.filter((t) => isTiedTo(person, t.uid));
    if (tied.length === 0) pushLine(NO_TRAINEE_GROUP, line);
    else for (const t of tied) pushLine(t.uid, line);
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

  return { groups, openCount, clearedCount, topTrainees, drafted };
}
