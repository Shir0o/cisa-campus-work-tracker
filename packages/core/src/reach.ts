// The reach model (#1293, ADR 0034). Whether anyone has reached a person — an
// Interaction logged with them, or their name marked present at a Gathering —
// and when they last did. Tapping Call or Text writes nothing, so it never
// counts on its own. This is the shared copy; the web app deliberately has no
// @cisa/core dependency (see the note at the top of src/lib/goal.ts), so
// src/lib/reach.ts is a standalone mirror kept in step by
// src/test/reachParity.test.ts.
import { parseMs } from "./myday";

/** One logged Interaction, reduced to the person and its date. A `Touch` from
 *  `lastTouchByContact` is exactly this shape. */
export interface ReachInteraction {
  contactId: string;
  ms: number;
}

/** The fields of a Gathering the reach model reads: its date, and who was
 *  present. An undefined `attendance` means it was never taken. */
export interface ReachGathering {
  date: string;
  attendance?: { present: string[]; absent?: string[] };
}

export interface ReachSources {
  interactions: readonly ReachInteraction[];
  gatherings: readonly ReachGathering[];
}

/** Whether anyone has reached a person, and when they last did. */
export interface ReachReading {
  /** True once an Interaction has been logged with the person, or they have
   *  been marked present at a Gathering. */
  reached: boolean;
  /** Epoch ms of the newest reach — an Interaction or a Gathering they were
   *  present at; null when nobody has reached them. */
  ms: number | null;
}

/** Every reached person, keyed by contact id. */
export function reachByContact(sources: ReachSources): Map<string, ReachReading> {
  const map = new Map<string, ReachReading>();
  const note = (contactId: string, ms: number | null) => {
    const cur = map.get(contactId);
    if (!cur) {
      map.set(contactId, { reached: true, ms });
      return;
    }
    if (ms != null && (cur.ms == null || ms > cur.ms)) cur.ms = ms;
  };

  for (const interaction of sources.interactions) {
    if (!interaction.contactId) continue;
    note(interaction.contactId, Number.isFinite(interaction.ms) ? interaction.ms : null);
  }

  for (const gathering of sources.gatherings) {
    const at = parseMs(gathering.date);
    for (const contactId of gathering.attendance?.present ?? []) note(contactId, at);
  }

  return map;
}

/** Whether anyone has reached this person. Built on `reachByContact`; callers
 *  rendering many rows should build the map once instead. */
export function isReached(contactId: string, sources: ReachSources): boolean {
  return reachByContact(sources).get(contactId)?.reached ?? false;
}
