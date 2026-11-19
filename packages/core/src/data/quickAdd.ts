// Quick add's save (cut-or-keep §26): the person (new, or an existing match),
// their interaction, the prayer and the follow-up reminder land in ONE batch,
// so a write the rules refuse leaves nothing half-saved.
import {
  collection,
  doc,
  serverTimestamp,
  writeBatch,
  type Firestore,
} from "firebase/firestore";
import { visibleToOf } from "../permissions";
import { buildContactActivityPatch } from "./contactActivity";
import { stampFounders, stampPartners } from "./partners";
import type { QuickAddSaveInput } from "../quickAdd";
import { quickAddCanSave } from "../quickAdd";

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
    .join("")
    .slice(0, 2)
    .toUpperCase() || "??";

export async function saveQuickAdd(
  db: Firestore,
  input: QuickAddSaveInput,
  by: QuickAddAuthor,
): Promise<QuickAddSaveResult> {
  if (!quickAddCanSave(input)) {
    throw new Error("Quick add needs a name or a matched person.");
  }

  const now = new Date().toISOString();
  const batch = writeBatch(db);
  const name = input.contact.name.trim().slice(0, 128);
  const createdContact = !input.matchId?.trim();
  let contactId = input.matchId?.trim() || "";
  const contactName = (createdContact ? name : input.matchName?.trim() || name).slice(0, 128);
  const authorName = (by.name ?? "").trim() || "Someone";
  const interactionWhen = input.interaction?.when?.trim() || now;

  if (createdContact) {
    const ref = doc(collection(db, "contacts"));
    contactId = ref.id;
    const data: Record<string, unknown> = {
      name,
      email: (input.contact.email || "").trim().slice(0, 128),
      phone: (input.contact.phone || "").trim().slice(0, 32),
      stage: (input.contact.step || "lead").trim().slice(0, 64),
      year: (input.contact.year || "").trim().slice(0, 64),
      tags: input.contact.tags.map((tag) => tag.trim()).filter(Boolean).slice(0, 30),
      lastSeen: input.interaction ? interactionWhen : "Just now",
      initials: initialsOf(name),
      createdAt: now,
      serverCreatedAt: serverTimestamp(),
      createdBy: by.uid ?? null,
      createdByName: (by.name ?? "").slice(0, 128) || null,
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
    // Gospel partners and the founding set, as any new person is stamped; the
    // access list mirrors the ties in the same write so the adder can read
    // back the person they just added (#1024 phase 4).
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
    batch.set(doc(collection(db, "contacts", contactId, "interactions")), {
      type: input.interaction.type || "meeting",
      dateTime: interactionWhen,
      content: input.interaction.notes.trim(),
      createdAt: serverTimestamp(),
      userId: by.uid ?? null,
      userName: (by.name ?? "").slice(0, 128),
      contactId,
      contactName,
    });
    // An existing person's last-seen moves with the interaction. A new person
    // already carries the stamp from the create above; a second write to the
    // same document in one batch is not something the rules can see.
    if (!createdContact) {
      batch.update(doc(db, "contacts", contactId), buildContactActivityPatch({
        date: interactionWhen,
        by: { uid: by.uid ?? null, name: by.name ?? "" },
        type: "interaction",
      }) as Record<string, unknown>);
    }
  }

  if (input.prayer?.trim()) {
    batch.set(doc(collection(db, "prayers")), {
      contactId,
      date: now,
      burden: input.prayer.trim(),
      status: "pending",
      // Private until the person says otherwise — the log sheet's default.
      teamPrayer: false,
      updatedAt: now,
      updatedBy: by.uid ?? null,
      updatedByName: by.name ?? null,
    });
  }

  if (input.reminder?.text?.trim()) {
    batch.set(doc(collection(db, "tasks")), {
      title: input.reminder.text.trim().slice(0, 500),
      dueDate: input.reminder.when?.trim() || null,
      priority: "medium",
      status: "pending",
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
