import { describe, it, expect, vi } from "vitest";
import type { Contact, Interaction } from "../types";
import { inboxItemsFor, type ThreadMessageWithContact } from "../lib/inbox";

// Control the relationship config so the test is independent of the real seed.
vi.mock("../lib/walking", () => ({
  FT_TRAINEES: { ft1: ["t1"] },
}));

const contact = (over: Partial<Contact>): Contact =>
  ({ id: "c", name: "X", initials: "X", role: "", location: "", email: "", phone: "", stage: "", lastSeen: "", ...over }) as Contact;

const interaction = (over: Partial<Interaction>): Interaction =>
  ({ id: "i", content: "", dateTime: "", createdAt: "", ...over }) as Interaction;

const thread = (over: Partial<ThreadMessageWithContact>): ThreadMessageWithContact =>
  ({
    id: "m",
    contactId: "c1",
    interactionId: null,
    from: "t1",
    fromName: "Zion",
    kind: "question",
    body: "",
    at: "2026-01-01T00:00:00.000Z",
    reactions: [],
    ...over,
  }) as ThreadMessageWithContact;

describe("inboxItemsFor", () => {
  it("returns nothing for a uid that walks with no one", () => {
    expect(inboxItemsFor("stranger", { contacts: [], interactions: [], threads: [] })).toEqual([]);
  });

  it("includes contacts added by a trainee, with their reviewed flag, and excludes others", () => {
    const items = inboxItemsFor("ft1", {
      contacts: [
        contact({ id: "c1", createdBy: "t1", reviewed: true, createdAt: "2026-01-02T00:00:00Z" }),
        contact({ id: "c2", createdBy: "someone-else", createdAt: "2026-01-02T00:00:00Z" }),
      ],
      interactions: [],
      threads: [],
    });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: "contact:c1", type: "contact", by: "t1", reviewed: true });
  });

  it("includes interactions a trainee logged", () => {
    const items = inboxItemsFor("ft1", {
      contacts: [],
      interactions: [
        interaction({ id: "i1", userId: "t1", contactId: "c1", createdAt: "2026-01-03T00:00:00Z" }),
        interaction({ id: "i2", userId: "other", contactId: "c2", createdAt: "2026-01-03T00:00:00Z" }),
      ],
      threads: [],
    });
    expect(items.map((x) => x.id)).toEqual(["interaction:i1"]);
  });

  it("surfaces unanswered trainee questions and drops answered ones", () => {
    const items = inboxItemsFor("ft1", {
      contacts: [],
      interactions: [],
      threads: [
        // unanswered question from the trainee
        thread({ id: "q1", contactId: "c1", from: "t1", kind: "question", at: "2026-02-01T00:00:00Z" }),
        // answered: a later reply from the full-timer at the same level
        thread({ id: "q2", contactId: "c2", from: "t1", kind: "question", at: "2026-02-01T00:00:00Z" }),
        thread({ id: "r2", contactId: "c2", from: "ft1", kind: "comment", at: "2026-02-02T00:00:00Z" }),
        // a non-question is never an inbox item on its own
        thread({ id: "n1", contactId: "c3", from: "t1", kind: "note", at: "2026-02-03T00:00:00Z" }),
      ],
    });
    expect(items.map((x) => x.id)).toEqual(["thread:q1"]);
  });

  it("sorts the combined feed newest-first", () => {
    const items = inboxItemsFor("ft1", {
      contacts: [contact({ id: "c1", createdBy: "t1", createdAt: "2026-01-01T00:00:00Z" })],
      interactions: [interaction({ id: "i1", userId: "t1", contactId: "c1", createdAt: "2026-03-01T00:00:00Z" })],
      threads: [thread({ id: "q1", contactId: "c1", from: "t1", kind: "question", at: "2026-02-01T00:00:00Z" })],
    });
    expect(items.map((x) => x.id)).toEqual(["interaction:i1", "thread:q1", "contact:c1"]);
  });
});
