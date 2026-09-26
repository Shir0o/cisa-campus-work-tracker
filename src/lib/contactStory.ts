import type { Interaction, PrayerRecord, SystemActivity } from '../types';
import { parseMs } from '../components/landing/helpers';

// One entry on a contact's story timeline (the contact page's "The story so
// far"): what happened to a person, newest first, ending with them being added.
export type StoryEntry =
  | { kind: 'conversation'; id: string; at: string; interaction: Interaction }
  | { kind: 'step'; id: string; at: string; from: string; to: string; byName: string }
  | { kind: 'prayer' | 'prayer-answered'; id: string; at: string; prayer: PrayerRecord }
  | { kind: 'added'; id: string; at: string | null; byName: string | null };

export interface ContactStoryInput {
  contact: { id: string; createdAt?: string; createdByName?: string | null };
  interactions: Interaction[];
  prayers: PrayerRecord[];
  activities: SystemActivity[];
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

export function buildContactStory({
  contact,
  interactions,
  prayers,
  activities,
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

  const steps: StoryEntry[] = activities.flatMap((activity) => {
    const move = stepMoveOf(activity);
    return move
      ? [{ kind: 'step' as const, id: activity.id ?? activity.createdAt, at: activity.createdAt, ...move, byName: activity.userName }]
      : [];
  });

  // A prayer is a moment when it is started, and again when it is answered.
  const prayerMoments: StoryEntry[] = prayers.flatMap((prayer) => [
    { kind: 'prayer' as const, id: prayer.id, at: prayer.date, prayer },
    ...(prayer.status === 'answered' && prayer.answeredAt
      ? [{ kind: 'prayer-answered' as const, id: prayer.id, at: prayer.answeredAt, prayer }]
      : []),
  ]);

  const newestFirst = [...conversations, ...steps, ...prayerMoments].sort((a, b) => (parseMs(b.at) ?? 0) - (parseMs(a.at) ?? 0));

  // Being added is the beginning of the story, so it stays last even when a
  // conversation is backdated to before the person was logged.
  return [
    ...newestFirst,
    {
      kind: 'added',
      id: 'added',
      at: contact.createdAt ?? null,
      byName: contact.createdByName ?? null,
    },
  ];
}
