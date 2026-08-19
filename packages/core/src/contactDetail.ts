// Contact Detail screen — pure derivations shared by web and mobile, ported
// from src/components/modals/ContactDetailsModal.tsx. The Firestore reads/
// writes live in ./data/{contacts,threads,activities,prayers,interactions,comments}.ts
// behind an injected db.
//
// The block at the bottom belongs to mobile v2's person screen — the design's
// `M2Contact` (views/mobile/contact.jsx), which is a different screen from the
// six-tab modal this file was first written for.
import { firstName } from "./history";
import { daysSince, parseMs, touchWords } from "./myday";
import type { ThreadKind, ThreadMessage } from "./threads";
import type { Activity, Contact, Interaction, PrayerRecord } from "./types";

export interface ContactEditFields {
  firstName: string;
  lastName: string;
  role: string;
  location: string;
  email: string;
  phone: string;
  stage: string;
  tags: string[];
  notes: string;
  spiritualBackground: string;
  /** How we first met — the fixed "How we met" vocabulary (#356). */
  metVia?: string;
}

/** Diffs an edit form against the live contact, producing the audit-log
 * change lines (`handleUpdate`'s change block). Location is the optional
 * address used by Visits; `metVia` ("How we met") is the header-line source. */
export function diffContactFields(before: Contact, after: ContactEditFields): string[] {
  const changes: string[] = [];
  const fullName = `${after.firstName} ${after.lastName}`.trim();

  if (fullName !== before.name) changes.push(`name: "${before.name}" → "${fullName}"`);
  if (after.email !== before.email) changes.push(`email: "${before.email}" → "${after.email}"`);
  if (after.phone !== before.phone) changes.push(`phone: "${before.phone}" → "${after.phone}"`);
  if (after.location !== before.location) {
    changes.push(`address: "${before.location}" → "${after.location}"`);
  }
  if (after.metVia !== before.metVia) {
    changes.push(`how we met: "${before.metVia || ""}" → "${after.metVia || ""}"`);
  }
  if (after.role !== before.role) changes.push(`group: "${before.role}" → "${after.role}"`);
  if (after.stage !== before.stage) changes.push(`stage: "${before.stage}" → "${after.stage}"`);
  if (after.spiritualBackground !== before.spiritualBackground) {
    changes.push(
      `spiritualBackground: "${before.spiritualBackground || ""}" → "${after.spiritualBackground}"`,
    );
  }
  if (after.notes !== before.notes) changes.push("notes updated");

  return changes;
}

/** Maps a logged interaction's `type` to the activity feed's narrower
 * `Activity['type']` union (`handleAddInteraction`'s mapping). Also covers
 * Quick Capture's kind vocabulary (gospel/appointment/gathering/phone/text/
 * meet — see quickCapture.ts), which doesn't otherwise overlap with the
 * Conversations tab's chat/call/meeting/email set. */
export function interactionActivityType(type: string): Activity["type"] {
  if (type === "meeting") return "event";
  if (type === "chat") return "comment";
  if (type === "phone") return "call";
  if (type === "appointment" || type === "gathering") return "event";
  if (type === "gospel" || type === "text" || type === "meet") return "comment";
  return type as Activity["type"];
}

/** Builds the audit-log description for a contact deletion, capturing its
 * fields + subcollection counts before the doc is gone (`handleDelete`'s
 * fieldsLog, joined with a real newline — the web version joins with the
 * literal two-char string "\\n", which its own reader never actually
 * splits on; this is a deliberate fix, not a divergence in intent). */
export function contactDeleteFieldsLog(
  contact: Contact,
  interactionCount: number,
  commentCount: number,
): string {
  return [
    `Group: ${contact.role}`,
    `Stage: ${contact.stage}`,
    contact.metVia ? `How we met: ${contact.metVia}` : "",
    `Address: ${contact.location}`,
    `Email: ${contact.email || "N/A"}`,
    `Phone: ${contact.phone || "N/A"}`,
    `Total Interactions: ${interactionCount}`,
    `Total Comments: ${commentCount}`,
  ].join("\n");
}

// ── mobile v2's person screen (the design's `M2Contact`) ───────────────────

/** The quiet line at the end of the back row. The design reads `c.owner` and
 * says "{First} cares for them"; a `Contact` here carries no owner, so "in your
 * care" is the caller's `personalContactIdsOf` check (as My Day, People and the
 * full-timer's home all read it) and the other branch names whoever added them
 * — the same substitution People's "Everyone else" line already carries. */
export function contactCareLine(mine: boolean, adderName?: string | null): string {
  if (mine) return "In your care";
  return adderName ? `${firstName(adderName)} added them` : "";
}

/** The hero's stage line, said in the first person — the design's `connected`.
 * `myday.ts`'s `connectedLabel` is the same fact in the third person ("Connected
 * today"), which is the voice every Material screen uses; v2 speaks to you. */
export function contactConnectedLine(days: number | null | undefined): string {
  if (days === null || days === undefined || !Number.isFinite(days)) {
    return "You haven't connected yet";
  }
  if (days <= 0) return "You connected today";
  if (days === 1) return "You connected yesterday";
  return `${days} days since you connected`;
}

/** How long a conversation's own words are allowed to run when they're being
 * quoted somewhere else (the hero's "Last time" line). */
const SNIPPET_MAX = 60;

/** The hero's "Last time: …" line, `null` when nothing has been logged.
 *
 * The design lowercases the whole title, because its mock conversations carry a
 * short `title` separate from their `body`. An `Interaction` has one `content`
 * field holding the staffer's own prose — lowercasing it would mangle the names
 * inside it — so the first sentence is quoted as written and clipped instead. */
export function lastTimeLine(interaction?: Interaction | null): string | null {
  const said = interactionSnippet(interaction);
  return said ? `Last time: ${said}` : null;
}

/** First sentence of a logged conversation, clipped to fit one line. */
export function interactionSnippet(interaction?: Interaction | null): string | null {
  const raw = (interaction?.content || "").trim();
  if (!raw) return null;
  const firstSentence = raw.split(/(?<=[.!?])\s/)[0].trim();
  const clipped =
    firstSentence.length > SNIPPET_MAX
      ? `${firstSentence.slice(0, SNIPPET_MAX).trimEnd()}…`
      : firstSentence;
  return /[.!?…]$/.test(clipped) ? clipped : `${clipped}.`;
}

/** The kicker above a Story card — "3 days ago · 45 min · Mei". The staffer's
 * name is dropped when it's you, exactly as the design's `.m2c-cvd` does. */
export function storyRowLine(
  interaction: Interaction,
  meUid: string,
  now: number = Date.now(),
): string {
  const ms = parseMs(interaction.dateTime) ?? parseMs(interaction.createdAt);
  const when = ms === null ? "not dated" : touchWords(daysSince(ms, now));
  const by = interaction.userId ?? interaction.createdById ?? "";
  const byName = interaction.userName ?? interaction.createdByName ?? "";
  return [
    when,
    interaction.duration ? `${interaction.duration} min` : null,
    by && by !== meUid && byName ? firstName(byName) : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export interface ContactPrayerSplit {
  /** Still being carried — the design's `status === "open"`. */
  open: PrayerRecord[];
  /** The "Looking back" group. */
  closed: PrayerRecord[];
}

/** Splits a person's prayers into the ones still open and the ones set down.
 * The design's mock has a two-value `status`; this schema has four, so
 * `pending`/`ongoing` are open and `answered`/`unanswered` are closed. */
export function splitContactPrayers(prayers: PrayerRecord[]): ContactPrayerSplit {
  const open: PrayerRecord[] = [];
  const closed: PrayerRecord[] = [];
  prayers.forEach((p) => (p.status === "answered" || p.status === "unanswered" ? closed : open).push(p));
  return { open, closed };
}

/** The line above a prayer card (`.m2c-cvd`).
 *
 * `PrayerRecord.answeredAt` is DISPLAY TEXT, not a timestamp: the web app
 * writes it as `toLocaleDateString("en-US", { month: "short", day: "numeric" })`
 * — "Jul 13" — and prints it back verbatim (src/components/landing/PrayerRows.tsx).
 * Parsing it as a date lands in the year 2001, so it is only ever shown, never
 * measured. The card is dated by `date`, when the burden was written down. */
export function prayerCardKicker(prayer: PrayerRecord, now: number = Date.now()): string {
  const ms = parseMs(prayer.date);
  const when = ms === null ? "" : touchWords(daysSince(ms, now));
  const { closed } = splitContactPrayers([prayer]);
  if (closed.length === 0) return when;

  const lead = prayer.status === "answered" ? "Answered" : "Set down";
  const said = prayer.answeredAt?.trim() || when;
  return said ? `${lead} · ${said}` : lead;
}

/** Every message on a person — contact-level AND interaction-level — in one
 * list, oldest first. This is what the design's Alongside tab shows; Story
 * shows the interaction-level ones again, under the conversation they're about
 * (`threadsFor`). */
export function mergedContactThread(messages: ThreadMessage[]): ThreadMessage[] {
  return [...messages].sort((a, b) => (parseMs(a.at) ?? 0) - (parseMs(b.at) ?? 0));
}

/** The kinds a viewer can post. The full-timer writes back, encourages and
 * nudges; the trainee notes and asks. Was `TRAINEE_KINDS`/`FULLTIMER_KINDS`,
 * local to the Material `AlongsideThreadView`. */
export function composeKindsFor(isFullTimer: boolean): ThreadKind[] {
  return isFullTimer ? ["comment", "encouragement", "nudge"] : ["note", "question"];
}
