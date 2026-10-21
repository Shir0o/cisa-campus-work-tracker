// Campus mode's "Added or logged this window" chips (#1715): the people this
// trainee added, or logged a conversation with, since today's on-campus window
// opened. Read from the contacts and interactions the home already loads — no
// query of its own.
import { firstName, type Contact, type Interaction, type OnCampusWindow } from '@cisa/core';

type Added = Pick<Contact, 'id' | 'name'> & { createdBy?: string; addedBy?: string; createdAt?: unknown };

// Contact `createdAt` is an ISO string on most docs but a Firestore Timestamp
// on sign-ups.
const ms = (v: unknown): number => {
  if (v && typeof (v as { toMillis?: unknown }).toMillis === 'function') return (v as { toMillis(): number }).toMillis();
  return typeof v === 'string' ? Date.parse(v) : NaN;
};

export function campusRecent(
  contacts: Added[],
  interactions: Interaction[],
  uid: string | null | undefined,
  w: OnCampusWindow,
  now: number = Date.now(),
): Array<{ id: string; name: string; isNew: boolean }> {
  if (!uid) return [];
  const opened = new Date(now).setHours(w.from, 0, 0, 0);
  const since = (v: unknown) => ms(v) >= opened;
  const byId = new Map(contacts.map((c) => [c.id, c]));
  const seen = new Map<string, { id: string; name: string; isNew: boolean; at: number }>();

  for (const c of contacts) {
    if ((c.createdBy || c.addedBy) === uid && since(c.createdAt)) {
      seen.set(c.id, { id: c.id, name: firstName(c.name), isNew: true, at: ms(c.createdAt) });
    }
  }
  for (const i of interactions) {
    const at = ms(i.createdAt || i.dateTime);
    if (i.userId !== uid || !i.contactId || !(at >= opened)) continue;
    const prev = seen.get(i.contactId);
    if (prev) prev.at = Math.max(prev.at, at);
    else {
      const name = byId.get(i.contactId)?.name ?? i.contactName ?? '';
      seen.set(i.contactId, { id: i.contactId, name: firstName(name), isNew: false, at });
    }
  }
  return [...seen.values()].sort((a, b) => b.at - a.at).map(({ at: _at, ...p }) => p);
}
