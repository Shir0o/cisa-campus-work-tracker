import { describe, it, expect, beforeEach } from "vitest";
import {
  buildAttentionItems,
  attentionStacksFor,
  partitionAttentionStacks,
  toWorkThroughCount,
  attentionPhrase,
  isTiedTo,
  type AttentionItem,
  type AttentionStack,
} from "../lib/attention";
import { UserEntityState, __resetUserEntityStateCache } from "../lib/userEntityState";
import type { Contact, Interaction } from "../types";
import type { ThreadMessageWithContact } from "../lib/threads";

describe("partitionAttentionStacks (#595)", () => {
  const uid = "u1";

  beforeEach(() => {
    localStorage.clear();
    __resetUserEntityStateCache();
  });

  const sampleContacts: Contact[] = [
    {
      id: "c_owned",
      name: "Alex Johnson",
      createdBy: "u3",
      createdAt: new Date().toISOString(),
      stage: "Freshman Contact",
    } as Contact,
    {
      id: "c_team",
      name: "Emerson Ahn",
      createdBy: "u2",
      createdAt: new Date().toISOString(),
      stage: "Student",
    } as Contact,
  ];

  const sampleInteractions: Interaction[] = [
    {
      id: "i1",
      contactId: "c_team",
      userId: "u2",
      content: "Shared during prayer time about exam stress.",
      createdAt: new Date().toISOString(),
      type: "small_group",
      title: "Tuesday small group",
    } as unknown as Interaction,
  ];

  const sampleThreads: ThreadMessageWithContact[] = [
    {
      id: "t1",
      contactId: "c_owned",
      from: "u3",
      fromName: "Zion",
      kind: "question",
      body: "How should we follow up with Alex?",
      at: new Date().toISOString(),
      interactionId: null,
      reactions: [],
    },
  ];

  it("partitions direct questions and owned contacts into onYou, team activity into aroundTeam", () => {
    const rawItems = buildAttentionItems({
      role: "admin",
      uid,
      contacts: sampleContacts,
      interactions: sampleInteractions,
      threads: sampleThreads,
    });

    const stacks = attentionStacksFor(rawItems, uid);
    const { onYou, aroundTeam } = partitionAttentionStacks(stacks, sampleContacts, uid, "admin");

    expect(onYou.some((s) => s.contactId === "c_owned")).toBe(true);
    expect(aroundTeam.some((s) => s.contactId === "c_team")).toBe(true);
  });

  it("places direct assigned tasks and notifications into onYou", () => {
    const rawItems = buildAttentionItems({
      role: "admin",
      uid,
      tasks: [
        {
          id: "task_1",
          title: "Follow up before Friday",
          status: "pending",
          assigneeId: uid,
          contactId: null,
        },
      ],
      notifications: [
        {
          id: "notif_1",
          title: "Welcome to campus",
          message: "A quick update",
          type: "info",
          read: false,
          userId: uid,
          createdAt: new Date().toISOString(),
        },
      ],

    });

    const stacks = attentionStacksFor(rawItems, uid);
    const { onYou, aroundTeam } = partitionAttentionStacks(stacks, sampleContacts, uid, "admin");

    expect(onYou.length).toBe(2);
    expect(aroundTeam.length).toBe(0);
  });

  it("extracts mentioned thread messages and places them into onYou regardless of contact ownership", () => {
    const threadWithMention: ThreadMessageWithContact = {
      id: "t_mention",
      contactId: "c_team", // Not owned by u1
      from: "u2",
      fromName: "Emerson",
      kind: "comment",
      body: "Hey @Tony Wang can you take a look?",
      at: new Date().toISOString(),
      interactionId: null,
      reactions: [],
      mentionedUserIds: ["u1"],
    };

    const rawItems = buildAttentionItems({
      role: "admin",
      uid: "u1",
      contacts: sampleContacts,
      threads: [threadWithMention],
    });

    const mentionItem = rawItems.find((i) => i.id === "thread:t_mention");
    expect(mentionItem).toBeDefined();
    expect(mentionItem?.mentioned).toBe(true);

    const stacks = attentionStacksFor(rawItems, "u1");
    const { onYou, aroundTeam } = partitionAttentionStacks(stacks, sampleContacts, "u1", "admin");

    // Even though c_team is not owned by u1, being mentioned routes it to onYou!
    expect(onYou.some((s) => s.contactId === "c_team")).toBe(true);
    expect(aroundTeam.some((s) => s.contactId === "c_team")).toBe(false);
  });
});

// ── #1012: the pointer card's number ────────────────────────────────────────
// The pointer counts what the page's pill counts — the stacks not yet
// Reviewed — with the predicate injected so the number stays a pure function
// and the card and the page can never disagree. It replaces the unseen count
// of #943: the moment `seen` stops being written on Around, a number derived
// from it would not degrade, it would freeze.

describe("toWorkThroughCount (#1012)", () => {
  const stack = (id: string): AttentionStack =>
    ({
      id,
      contactId: id,
      targetId: null,
      items: [],
      at: new Date().toISOString(),
      bucket: "today",
      by: [],
      kinds: ["contact"],
      seen: false,
    }) as AttentionStack;

  const reviewed = (...ids: string[]) => {
    const set = new Set(ids);
    return (s: AttentionStack) => set.has(s.id);
  };

  it("counts none when every team stack has been reviewed", () => {
    expect(toWorkThroughCount([stack("a"), stack("b")], reviewed("a", "b"))).toBe(0);
  });

  it("counts what is left when only part of the team has been reviewed", () => {
    expect(toWorkThroughCount([stack("a"), stack("b"), stack("c")], reviewed("a"))).toBe(2);
  });

  it("counts all when nothing has been reviewed", () => {
    expect(toWorkThroughCount([stack("a"), stack("b")], reviewed())).toBe(2);
  });

  it("counts zero on an empty team stack", () => {
    expect(toWorkThroughCount([], reviewed())).toBe(0);
  });

  it("ignores the seen axis entirely — a glance is not work done", () => {
    const glanced = { ...stack("a"), seen: true } as AttentionStack;
    expect(toWorkThroughCount([glanced], reviewed())).toBe(1);
  });
});


// ── #813: who a message reaches, and in what words ──────────────────────────

describe("buildAttentionItems — the ties, not the role", () => {
  beforeEach(() => {
    localStorage.clear();
    __resetUserEntityStateCache();
  });

  const contacts: Contact[] = [
    { id: "c_mine", name: "Elena Vargas", createdBy: "t1", stage: "Student" } as Contact,
    { id: "c_partner", name: "Tomas Nguyen", createdBy: "t2", coCreators: ["t1"], stage: "Student" } as Contact,
    { id: "c_assigned", name: "Priya Kaur", createdBy: "t2", carers: ["t1"], stage: "Student" } as Contact,
    { id: "c_stranger", name: "Maya Osei", createdBy: "t2", stage: "Student" } as Contact,
  ];

  const msg = (over: Partial<ThreadMessageWithContact>): ThreadMessageWithContact =>
    ({
      id: "m",
      contactId: "c_mine",
      from: "ft1",
      fromName: "David Oduya",
      kind: "comment",
      body: "hello",
      at: new Date().toISOString(),
      interactionId: null,
      reactions: [],
      ...over,
    }) as ThreadMessageWithContact;

  // A Trainee's role is `manager`; the branch this replaces gated on
  // `role === "trainee"` and so had never once executed.
  const trainee = (threads: ThreadMessageWithContact[], personal?: Set<string>) =>
    buildAttentionItems({
      role: "manager",
      uid: "t1",
      contacts,
      threads,
      personalContactIds: personal ?? null,
    });

  it("gives a Trainee messages on the people they added", () => {
    const items = trainee([msg({ id: "a", contactId: "c_mine" })]);
    expect(items.map((i) => i.id)).toContain("thread:a");
  });

  it("gives a Trainee messages on their gospel partner's contacts and on ones they hold in their sheep", () => {
    const items = trainee([
      msg({ id: "b", contactId: "c_partner" }),
      msg({ id: "c", contactId: "c_assigned" }),
    ]);
    expect(items.map((i) => i.id)).toEqual(expect.arrayContaining(["thread:b", "thread:c"]));
  });

  it("does NOT give a Trainee messages about students they have no tie to", () => {
    const items = trainee([msg({ id: "d", contactId: "c_stranger" })]);
    expect(items.map((i) => i.id)).not.toContain("thread:d");
  });

  it("counts 'keeping them on my My Day' as a tie, resolved on the reader's own screen", () => {
    const items = trainee([msg({ id: "e", contactId: "c_stranger" })], new Set(["c_stranger"]));
    expect(items.map((i) => i.id)).toContain("thread:e");
  });

  it("gives a Student nothing, even on a contact they are tied to", () => {
    // Students and Community members do not get this feed, and staff notes are
    // not theirs to read even about someone they signed up.
    const items = buildAttentionItems({
      role: "operator",
      uid: "t1",
      contacts,
      threads: [msg({ id: "s", contactId: "c_mine" })],
    });
    expect(items.map((i) => i.id)).not.toContain("thread:s");
  });

  it("never leaks a Full-timers-scope message to a Trainee, tie or not", () => {
    const items = trainee([msg({ id: "f", contactId: "c_mine", scope: "team" })]);
    expect(items.map((i) => i.id)).not.toContain("thread:f");
  });

  it("shows the asker their own unanswered question, and drops it once someone else replies", () => {
    const asked = msg({ id: "q", from: "t1", kind: "question", at: "2026-09-01T10:00:00.000Z" });
    const open = buildAttentionItems({ role: "manager", uid: "t1", contacts, threads: [asked] });
    expect(open.find((i) => i.id === "thread:q")?.awaitingReply).toBe(true);

    const answered = buildAttentionItems({
      role: "manager",
      uid: "t1",
      contacts,
      threads: [asked, msg({ id: "r", from: "ft1", at: "2026-09-01T11:00:00.000Z" })],
    });
    expect(answered.find((i) => i.id === "thread:q")?.awaitingReply).toBeUndefined();
  });

  it("does not count the asker's own follow-up reply as an answer to their own question", () => {
    const asked = msg({ id: "q2", from: "t1", kind: "question", at: "2026-09-01T10:00:00.000Z" });
    const ownReply = msg({ id: "r2", from: "t1", at: "2026-09-01T11:00:00.000Z" });
    const items = buildAttentionItems({
      role: "manager",
      uid: "t1",
      contacts,
      threads: [asked, ownReply],
    });
    expect(items.find((i) => i.id === "thread:q2")?.awaitingReply).toBe(true);
  });
});

// ── #1071: creator-less sign-up contacts are the team's to pick up ──────────
// A public sign-up writes a contact with no ties and `visibleTo: []`. It is
// readable by Full-timers (who read the whole roster) but no one is tied to
// it, so neither `c.createdBy && c.createdBy !== uid` nor `isTiedTo` ever
// surfaced it. The feeds treat a creator-less contact as team work: it becomes
// a card for every Full-timer, and stays out of a Trainee's feed until someone
// is put on them (#1024 phase 4 preserved).

describe("buildAttentionItems — creator-less sign-up contacts (#1071)", () => {
  const signup = (over: Partial<Contact> = {}): Contact =>
    ({ id: "c_signup", name: "New Student", stage: "Unassigned", ...over }) as Contact;

  it("surfaces a creator-less contact to a Full-timer as a team-added card", () => {
    const items = buildAttentionItems({ role: "admin", uid: "ft1", contacts: [signup()] });
    const card = items.find((i) => i.type === "contact" && i.contactId === "c_signup");
    expect(card).toBeDefined();
    expect(card?.by).toBeUndefined();
  });

  it("routes the sign-up card to Around the team, not My Day's On you", () => {
    const c = signup();
    const rawItems = buildAttentionItems({ role: "admin", uid: "ft1", contacts: [c] });
    const stacks = attentionStacksFor(rawItems, "ft1");
    const { onYou, aroundTeam } = partitionAttentionStacks(stacks, [c], "ft1", "admin");
    expect(aroundTeam.some((s) => s.contactId === "c_signup")).toBe(true);
    expect(onYou.some((s) => s.contactId === "c_signup")).toBe(false);
  });

  it("keeps the sign-up away from a Trainee until someone is tied to them", () => {
    const items = buildAttentionItems({ role: "manager", uid: "t1", contacts: [signup()] });
    expect(items.some((i) => i.type === "contact" && i.contactId === "c_signup")).toBe(false);
  });

  it("still hides the contacts a Full-timer added themselves", () => {
    const items = buildAttentionItems({
      role: "admin",
      uid: "ft1",
      contacts: [signup({ id: "c_own", createdBy: "ft1" })],
    });
    expect(items.some((i) => i.type === "contact" && i.contactId === "c_own")).toBe(false);
  });

  it("reads the sign-up card as someone adding them", () => {
    const card = { id: "contact:c_signup", type: "contact", at: "", by: null, contactId: "c_signup" } as AttentionItem;
    expect(attentionPhrase(card)).toBe("Someone added them");
  });
});

describe("attentionPhrase — the words fit what happened", () => {
  const base = (over: Partial<AttentionItem>): AttentionItem =>
    ({ id: "x", type: "thread", at: "", byName: "David Oduya", ...over }) as AttentionItem;

  it("no longer calls every thread item a question", () => {
    expect(attentionPhrase(base({ kind: "note" }))).toBe("David left a note");
    expect(attentionPhrase(base({ kind: "comment" }))).toBe("David wrote back");
    expect(attentionPhrase(base({ kind: "encouragement" }))).toBe("David encouraged you");
  });

  it("says a question is a question, and a follow-up ask an ask", () => {
    expect(attentionPhrase(base({ kind: "question" }))).toBe("David asked you something");
    expect(attentionPhrase(base({ kind: "nudge" }))).toBe("David asked for a follow-up");
  });

  it("names who closed a follow-up ask once someone has", () => {
    expect(
      attentionPhrase(base({ kind: "nudge", closedAt: "2026-09-04T00:00:00.000Z", closedByName: "Sam Cho" })),
    ).toBe("Sam followed up");
  });

  it("reads a question from the asker's own side", () => {
    expect(attentionPhrase(base({ kind: "question", awaitingReply: true }))).toBe(
      "You asked something · no reply yet",
    );
  });
});

describe("isTiedTo", () => {
  const c = { createdBy: "t1", coCreators: ["t2"] };

  it("is true for the adder, the gospel partner and a co-creator", () => {
    expect(isTiedTo(c, "t1")).toBe(true);
    expect(isTiedTo(c, "t2")).toBe(true);
  });

  it("is false for someone with no tie", () => {
    expect(isTiedTo(c, "t9")).toBe(false);
  });

  it("counts keeping the person on your own My Day, even with no tie on the contact", () => {
    expect(isTiedTo(c, "t9", new Set(["c1"]), "c1")).toBe(true);
  });

  it("is false when the contact is missing and nothing is kept", () => {
    expect(isTiedTo(undefined, "t1")).toBe(false);
  });
});
