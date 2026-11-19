// The web half of quick add's save (cut-or-keep §26): the person (new, or the
// picked match), the interaction, the prayer and the reminder land in ONE
// batch. The phone writes through @cisa/core's copy; this mirror keeps the web
// build free of that runtime dependency and is pinned by QuickAdd tests.
import { collection, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import { visibleToOf } from './contactTies';
import { stampFounders, stampPartners } from './partnersModel';
import { buildContactActivityPatch } from './contactActivity';
import type { QuickAddSaveInput } from '../../packages/core/src/quickAdd';

export interface QuickAddAuthor {
  uid?: string | null;
  name?: string | null;
}

export interface QuickAddSaveResult {
  contactId: string;
  createdContact: boolean;
}

const initialsOf = (name: string): string =>
  name
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || '??';

export async function saveQuickAdd(
  input: QuickAddSaveInput,
  by: QuickAddAuthor,
): Promise<QuickAddSaveResult> {
  if (!input.matchId?.trim() && !input.contact.name.trim()) {
    throw new Error('Quick add needs a name or a matched person.');
  }

  const now = new Date().toISOString();
  const batch = writeBatch(db);
  const name = input.contact.name.trim().slice(0, 128);
  const createdContact = !input.matchId?.trim();
  let contactId = input.matchId?.trim() || '';
  const contactName = (createdContact ? name : input.matchName?.trim() || name).slice(0, 128);
  const authorName = (by.name ?? '').trim() || 'Someone';
  const interactionWhen = input.interaction?.when?.trim() || now;

  if (createdContact) {
    const ref = doc(collection(db, 'contacts'));
    contactId = ref.id;
    const data: Record<string, unknown> = {
      name,
      email: (input.contact.email || '').trim().slice(0, 128),
      phone: (input.contact.phone || '').trim().slice(0, 32),
      stage: (input.contact.step || 'lead').trim().slice(0, 64),
      year: (input.contact.year || '').trim().slice(0, 64),
      tags: input.contact.tags.map((tag) => tag.trim()).filter(Boolean).slice(0, 30),
      lastSeen: input.interaction ? interactionWhen : 'Just now',
      initials: initialsOf(name),
      createdAt: now,
      serverCreatedAt: serverTimestamp(),
      createdBy: by.uid ?? null,
      createdByName: (by.name ?? '').slice(0, 128) || null,
      hasNewActivity: true,
      attendance: {},
      // A new person is created and reached in the same batch; carrying the
      // activity stamp here (rather than a second write to the same document)
      // is what a batch can do safely.
      ...(input.interaction
        ? {
            lastContactedDate: interactionWhen,
            lastContactedBy: authorName,
            lastContactedById: by.uid ?? null,
            reachedAt: interactionWhen,
          }
        : {}),
    };
    // The access list and founding/partner ties a new person always carries, so
    // the adder can read back the person they just added (#1024 phase 4).
    stampPartners(data, by.uid);
    stampFounders(data, by.uid);
    batch.set(ref, {
      ...data,
      visibleTo: visibleToOf(
        data as {
          createdBy?: string | null;
          addedBy?: string | null;
          coCreators?: string[];
          founders?: string[];
          carers?: string[];
        },
      ),
    });
  }

  if (input.interaction) {
    batch.set(doc(collection(db, 'contacts', contactId, 'interactions')), {
      type: input.interaction.type || 'meeting',
      dateTime: interactionWhen,
      content: input.interaction.notes.trim(),
      createdAt: serverTimestamp(),
      userId: by.uid ?? null,
      userName: (by.name ?? '').slice(0, 128),
      contactId,
      contactName,
    });
    // An existing person's last-seen moves with the interaction. A new person
    // already carries the stamp from the create above; a second write to the
    // same document in one batch is not something the rules can see.
    if (!createdContact) {
      batch.update(
        doc(db, 'contacts', contactId),
        buildContactActivityPatch({
          date: interactionWhen,
          by: { uid: by.uid ?? null, name: by.name ?? '' },
          type: 'interaction',
        }) as Record<string, unknown>,
      );
    }
  }

  if (input.prayer?.trim()) {
    batch.set(doc(collection(db, 'prayers')), {
      contactId,
      date: now,
      burden: input.prayer.trim(),
      status: 'pending',
      // Private until the person says otherwise — the log sheet's default.
      teamPrayer: false,
      updatedAt: now,
      updatedBy: by.uid ?? null,
      updatedByName: by.name ?? null,
    });
  }

  if (input.reminder?.text?.trim()) {
    batch.set(doc(collection(db, 'tasks')), {
      title: input.reminder.text.trim().slice(0, 500),
      dueDate: input.reminder.when?.trim() || null,
      priority: 'medium',
      status: 'pending',
      assigneeId: by.uid ?? null,
      contactId,
      contactName,
      createdById: by.uid ?? null,
      createdByName: by.name ?? null,
      createdAt: serverTimestamp(),
      subtasks: [],
    });
  }

  await batch.commit();
  return { contactId, createdContact };
}
