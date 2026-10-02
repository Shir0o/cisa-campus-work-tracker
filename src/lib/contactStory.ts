import type { Gathering, Interaction, PrayerRecord, Rhythm, SystemActivity } from '../types';
import { parseMs } from '../components/landing/helpers';

// One thing that changed on a person, old → new. The story builder keeps these
// structured so the component can phrase each one in the reader's language.
export type StoryChange =
  | { type: 'step'; from: string; to: string }
  | { type: 'kind'; from: string; to: string }
  | { type: 'tags'; added: string[]; removed: string[] }
  | { type: 'field'; field: string; from: string; to: string }
  | { type: 'notes' }
  | { type: 'share'; person: string; added: boolean }
  | { type: 'creator'; from: string; to: string };

// One entry on a contact's story timeline (the contact page's "The story so
// far"): what happened to a person, newest first, ending with them being added.
export type StoryEntry =
  | { kind: 'conversation'; id: string; at: string; interaction: Interaction }
  | { kind: 'change'; id: string; at: string; byId: string; byName: string; changes: StoryChange[] }
  | { kind: 'prayer' | 'prayer-answered'; id: string; at: string; prayer: PrayerRecord }
  | { kind: 'attendance'; id: string; at: string; name: string; count: number }
  | { kind: 'story-message'; id: string; at: string; messageId: string; fromId: string; fromName: string; body: string }
  | { kind: 'added'; id: string; at: string | null; byName: string | null };

// A Conversation message someone chose to Add to story: the story quotes it,
// naming who said it and when, and links back to where it was said (#1298).
export interface StoryMessageInput {
  id: string;
  from: string;
  fromName: string;
  body: string;
  at: string;
}

export interface ContactStoryInput {
  contact: { id: string; createdAt?: string; createdByName?: string | null; storyMessageIds?: string[] };
  interactions: Interaction[];
  prayers: PrayerRecord[];
  activities: SystemActivity[];
  gatherings?: Gathering[];
  rhythms?: Rhythm[];
  storyMessages?: StoryMessageInput[];
  pendingRemovalIds?: string[];
}

// Step moves are only recorded as History text; read the from → to back out.
// An edit-form save lists every changed field, one per line; a Directory bulk
// move writes "Stage:" capitalised.
function stepMoveOf({ action = '', description = '' }: SystemActivity): { from: string; to: string } | null {
  const match = description.match(/^[Ss]tage: "(.*)" → "(.*)"$/m);
  if (match) return { from: match[1], to: match[2] };

  // A step-board drag writes the steps unquoted ("Changed stage from A to B"),
  // so take the destination from the action, where it is quoted, and the
  // origin is whatever precedes it — safe even for a step named "Open to God".
  const to = action.match(/^moved contact to stage "(.*)"$/)?.[1];
  const prefix = 'Changed stage from ';
  const suffix = ` to ${to}`;
  if (to !== undefined && description.startsWith(prefix) && description.endsWith(suffix)) {
    return { from: description.slice(prefix.length, -suffix.length), to };
  }
  return null;
}

const FIELD_LINE = /^(name|email|phone|group|spiritualBackground|gender|carer|delegate): "(.*)" → "(.*)"$/;
const TAG_LIST_LINE = /^Tags: \[(.*)\] → \[(.*)\]$/;

const tagList = (value: string): string[] =>
  value.split(',').map((tag) => tag.trim()).filter(Boolean);

// Read the changes out of one History activity. Only "edit" activities carry a
// change; attendance is read from Gatherings instead, so its activity is not a
// change the story stores (unmarking someone must remove the entry, #1291).
function changesOf(activity: SystemActivity): StoryChange[] {
  if (activity.type !== 'edit') return [];
  const description = activity.description ?? '';
  if (description.startsWith('Attendance [')) return [];

  const shared = description.match(/^Granted view access to (.+)$/m);
  if (shared) return [{ type: 'share', person: shared[1].trim(), added: true }];
  const unshared = description.match(/^Removed view access for (.+)$/m);
  if (unshared) return [{ type: 'share', person: unshared[1].trim(), added: false }];
  const creator = description.match(/^Reassigned creator from (.+) to (.+)$/m);
  if (creator) return [{ type: 'creator', from: creator[1].trim(), to: creator[2].trim() }];

  const changes: StoryChange[] = [];
  for (const line of description.split('\n')) {
    const trimmed = line.trim();
    const step = trimmed.match(/^[Ss]tage: "(.*)" → "(.*)"$/);
    if (step) {
      changes.push({ type: 'step', from: step[1], to: step[2] });
      continue;
    }
    const kind = trimmed.match(/^[Kk]ind: "(.*)" → "(.*)"$/);
    if (kind) {
      changes.push({ type: 'kind', from: kind[1], to: kind[2] });
      continue;
    }
    const tags = trimmed.match(TAG_LIST_LINE);
    if (tags) {
      const before = tagList(tags[1]);
      const after = tagList(tags[2]);
      changes.push({
        type: 'tags',
        added: after.filter((tag) => !before.includes(tag)),
        removed: before.filter((tag) => !after.includes(tag)),
      });
      continue;
    }
    const field = trimmed.match(FIELD_LINE);
    if (field) {
      changes.push({ type: 'field', field: field[1], from: field[2], to: field[3] });
      continue;
    }
    if (trimmed === 'notes updated') changes.push({ type: 'notes' });
  }

  // The drag form has no quoted line to match above.
  const drag = stepMoveOf(activity);
  if (drag && !changes.some((change) => change.type === 'step')) {
    changes.push({ type: 'step', from: drag.from, to: drag.to });
  }

  return changes;
}

const WEEK_MS = 7 * 86_400_000;

// A Monday-aligned week index, so two occasions in one week share a bucket and
// consecutive weeks differ by one. Used to fold a weekly Rhythm's runs.
function weekIndex(date: string): number {
  const d = new Date(`${date}T00:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7;
  return Math.round((d.getTime() - day * 86_400_000) / WEEK_MS);
}

// Every Gathering the person was marked present at, read live rather than
// copied: unmarking someone takes the entry back out. A weekly Rhythm's
// consecutive weeks fold into one entry ("came to College Meeting · 6 weeks
// running"); a gap starts a new one. Absences never appear.
function attendanceEntries(
  gatherings: Gathering[],
  rhythms: Rhythm[],
  contactId: string,
): StoryEntry[] {
  const rhythmById = new Map(rhythms.map((rhythm) => [rhythm.id, rhythm]));
  const entries: StoryEntry[] = [];
  const byRhythm = new Map<string, Gathering[]>();

  for (const gathering of gatherings) {
    if (gathering.cancelled || !gathering.attendance?.present.includes(contactId)) continue;
    const rhythm = gathering.rhythmId ? rhythmById.get(gathering.rhythmId) : undefined;
    if (!rhythm) {
      entries.push({ kind: 'attendance', id: gathering.id, at: gathering.date, name: gathering.name, count: 1 });
      continue;
    }
    const list = byRhythm.get(gathering.rhythmId as string) ?? [];
    list.push(gathering);
    byRhythm.set(gathering.rhythmId as string, list);
  }

  for (const [rhythmId, list] of byRhythm) {
    const rhythm = rhythmById.get(rhythmId) as Rhythm;
    list.sort((a, b) => a.date.localeCompare(b.date));

    if (rhythm.cadence.type !== 'weekly') {
      for (const gathering of list) {
        entries.push({ kind: 'attendance', id: gathering.id, at: gathering.date, name: rhythm.name, count: 1 });
      }
      continue;
    }

    let runStart = 0;
    for (let i = 1; i <= list.length; i += 1) {
      const continues =
        i < list.length && weekIndex(list[i].date) - weekIndex(list[i - 1].date) <= 1;
      if (continues) continue;
      const run = list.slice(runStart, i);
      entries.push({
        kind: 'attendance',
        id: `${rhythmId}:${run[0].date}`,
        at: run[run.length - 1].date,
        name: rhythm.name,
        count: new Set(run.map((gathering) => weekIndex(gathering.date))).size,
      });
      runStart = i;
    }
  }

  return entries;
}

function foldChanges(entries: StoryEntry[]): StoryEntry[] {
  const folded: StoryEntry[] = [];
  for (const entry of entries) {
    const last = folded[folded.length - 1];
    if (entry.kind === 'change' && last?.kind === 'change' && last.byId === entry.byId) {
      folded[folded.length - 1] = { ...last, changes: [...last.changes, ...entry.changes] };
    } else {
      folded.push(entry);
    }
  }
  return folded;
}

export function buildContactStory({
  contact,
  interactions,
  prayers,
  activities,
  gatherings = [],
  rhythms = [],
  storyMessages = [],
  pendingRemovalIds = [],
}: ContactStoryInput): StoryEntry[] {
  // A conversation sits at the date it happened (dateTime), not when it was
  // entered, so backdated entries land in the right place (#399). One that was
  // just removed leaves at once, though its delete only commits after Undo.
  const conversations: StoryEntry[] = interactions
    .filter((interaction) => !pendingRemovalIds.includes(interaction.id))
    .map((interaction) => ({
    kind: 'conversation',
    id: interaction.id,
    at: interaction.dateTime || interaction.createdAt,
    interaction,
  }));

  const changes: StoryEntry[] = activities.flatMap((activity) => {
    const parsed = changesOf(activity);
    return parsed.length
      ? [{
          kind: 'change' as const,
          id: activity.id ?? activity.createdAt,
          at: activity.createdAt,
          byId: activity.userId,
          byName: activity.userName,
          changes: parsed,
        }]
      : [];
  });

  // A prayer is a moment when it is started, and again when it is answered.
  // The answered moment orders by the ISO `updatedAt` written in the same save,
  // never by `answeredAt` — that field is display text ("Sep 24") that parses
  // to the year 2001 and would sink the milestone to the bottom of the story.
  const prayerMoments: StoryEntry[] = prayers.flatMap((prayer) => [
    { kind: 'prayer' as const, id: prayer.id, at: prayer.date, prayer },
    ...(prayer.status === 'answered' && prayer.answeredAt
      ? [{ kind: 'prayer-answered' as const, id: prayer.id, at: prayer.updatedAt || prayer.date, prayer }]
      : []),
  ]);

  const attendance = attendanceEntries(gatherings, rhythms, contact.id);

  // Only the messages the person currently keeps a reference to; taking one
  // back out leaves it where it was said but drops it from the story (#1298).
  const storyMessageIds = new Set(contact.storyMessageIds ?? []);
  const addedMessages: StoryEntry[] = storyMessages
    .filter((message) => storyMessageIds.has(message.id))
    .map((message) => ({
      kind: 'story-message',
      id: message.id,
      at: message.at,
      messageId: message.id,
      fromId: message.from,
      fromName: message.fromName,
      body: message.body,
    }));

  // Newest first. A date we cannot read must not silently collapse to epoch 0
  // and sink beneath every real entry, so it sorts above them instead.
  const orderMs = (at: string | null) => parseMs(at) ?? Number.POSITIVE_INFINITY;
  const newestFirst = [...conversations, ...changes, ...prayerMoments, ...attendance, ...addedMessages].sort((a, b) => {
    const [ta, tb] = [orderMs(a.at), orderMs(b.at)];
    return ta === tb ? 0 : tb - ta;
  });

  // A run of changes by one person reads as one moment you can open.
  const folded = foldChanges(newestFirst);

  // Being added is the beginning of the story, so it stays last even when a
  // conversation is backdated to before the person was logged.
  return [
    ...folded,
    {
      kind: 'added',
      id: 'added',
      at: contact.createdAt ?? null,
      byName: contact.createdByName ?? null,
    },
  ];
}
