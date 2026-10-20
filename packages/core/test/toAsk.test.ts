import { describe, it, expect } from "vitest";
import {
  buildToAsk,
  GENERAL_GROUP,
  NO_TRAINEE_GROUP,
  STRUCK_VISIBLE_DAYS,
  type ToAskInput,
  type ToAskNotepad,
  type ToAskPerson,
  type ToAskThreadMessage,
  type ToAskTrainee,
} from "../src/toAsk";
import type { ReachReading } from "../src/reach";

const NOW = new Date("2026-10-16T18:00:00.000Z"); // Friday 16 October 2026
const DAY = 86_400_000;
const ago = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString();

const trainee = (uid: string, name: string, team = "campus"): ToAskTrainee => ({
  uid,
  name,
  team,
});

const JAE = trainee("jae", "Jae", "campus");
const ANA = trainee("ana", "Ana", "campus");
const HANA = trainee("hana", "Hana", "yp");

const person = (id: string, over: Partial<ToAskPerson> = {}): ToAskPerson => ({
  id,
  name: id,
  kind: "contact",
  createdAtMs: NOW.getTime() - 40 * DAY,
  ...over,
});

/** A person added inside the 30-day Not-reached window. */
const fresh = (id: string, over: Partial<ToAskPerson> = {}): ToAskPerson =>
  person(id, { createdAtMs: NOW.getTime() - 5 * DAY, ...over });

const message = (over: Partial<ToAskThreadMessage> = {}): ToAskThreadMessage => ({
  id: "m1",
  contactId: "c1",
  interactionId: null,
  from: "someone",
  fromName: "Someone Else",
  kind: "nudge",
  body: "b",
  at: ago(4),
  ...over,
});

const base = (over: Partial<ToAskInput> = {}): ToAskInput => ({
  uid: "ft",
  now: NOW,
  people: [],
  reach: new Map<string, ReachReading>(),
  trainees: [JAE, ANA, HANA],
  messages: [],
  notepad: null,
  ...over,
});

describe("buildToAsk — the three signals draft lines", () => {
  it("drafts a Not reached yet line under the tied Trainee", () => {
    const view = buildToAsk(
      base({
        people: [fresh("c1", { name: "Priya Nair", carers: ["jae"] })],
      }),
    );
    expect(view.openCount).toBe(1);
    const jae = view.groups.find((g) => g.id === "jae");
    expect(jae?.lines).toHaveLength(1);
    expect(jae?.lines[0].kind).toBe("notReached");
    expect(jae?.lines[0].state).toBe("open");
    expect(jae?.lines[0].signal?.contactName).toBe("Priya Nair");
  });

  it("leaves out a Contact added more than 30 days ago", () => {
    const view = buildToAsk(
      base({
        people: [person("c1", { createdAtMs: NOW.getTime() - 40 * DAY, carers: ["jae"] })],
      }),
    );
    expect(view.openCount).toBe(0);
    expect(view.groups).toEqual([]);
  });

  it("drafts an open Follow-up ask exactly three campus days old", () => {
    const view = buildToAsk(
      base({
        people: [person("c1", { name: "Sam", carers: ["jae"] })],
        messages: [message({ id: "a1", contactId: "c1", kind: "nudge", at: ago(3), from: "ft", fromName: "Full Timer" })],
      }),
    );
    const jae = view.groups.find((g) => g.id === "jae");
    expect(jae?.lines.map((l) => l.kind)).toEqual(["ask"]);
    expect(jae?.lines[0].signal?.mine).toBe(true);
  });

  it("does not draft an ask two days old", () => {
    const view = buildToAsk(
      base({
        people: [person("c1", { carers: ["jae"] })],
        messages: [message({ id: "a1", contactId: "c1", kind: "nudge", at: ago(2) })],
      }),
    );
    expect(view.openCount).toBe(0);
  });

  it("does not draft a closed ask", () => {
    const view = buildToAsk(
      base({
        people: [person("c1", { carers: ["jae"] })],
        messages: [message({ id: "a1", contactId: "c1", kind: "nudge", at: ago(5), closedAt: ago(1) })],
      }),
    );
    expect(view.openCount).toBe(0);
  });

  it("drafts an unanswered question three days old, but not one with a reply", () => {
    const unanswered = buildToAsk(
      base({
        people: [person("c1", { name: "Leo", carers: ["ana"] })],
        messages: [message({ id: "q1", contactId: "c1", kind: "question", at: ago(4), from: "kate", fromName: "Kate Ng" })],
      }),
    );
    const ana = unanswered.groups.find((g) => g.id === "ana");
    expect(ana?.lines[0].kind).toBe("question");
    expect(ana?.lines[0].signal?.askerName).toBe("Kate");

    const answered = buildToAsk(
      base({
        people: [person("c1", { carers: ["ana"] })],
        messages: [
          message({ id: "q1", contactId: "c1", kind: "question", at: ago(4), from: "kate", fromName: "Kate" }),
          message({ id: "r1", contactId: "c1", kind: "comment", at: ago(3), from: "jae", fromName: "Jae", parentId: "q1" }),
        ],
      }),
    );
    expect(answered.openCount).toBe(0);
  });
});

describe("buildToAsk — grouping", () => {
  it("shows a person tied to two Trainees under each, counted once", () => {
    const view = buildToAsk(
      base({
        people: [fresh("c1", { name: "Mei Lin", createdBy: "jae", coCreators: ["ana"] })],
      }),
    );
    expect(view.groups.find((g) => g.id === "jae")?.lines).toHaveLength(1);
    expect(view.groups.find((g) => g.id === "ana")?.lines).toHaveLength(1);
    expect(view.openCount).toBe(1);
  });

  it("puts a contact with no Trainee tied in the No Trainee tied group", () => {
    const view = buildToAsk(base({ people: [fresh("c1", { name: "Alma Ruiz", createdBy: "ft" })] }));
    expect(view.groups).toHaveLength(1);
    expect(view.groups[0].id).toBe(NO_TRAINEE_GROUP);
    expect(view.groups[0].kind).toBe("none");
  });

  it("ignores a tie the Trainee has Released from their queue", () => {
    const view = buildToAsk(
      base({ people: [fresh("c1", { carers: ["jae"], unfollowedBy: ["jae"] })] }),
    );
    expect(view.groups[0].id).toBe(NO_TRAINEE_GROUP);
  });

  it("orders General first, Trainee groups by open count, No Trainee tied last", () => {
    const view = buildToAsk(
      base({
        people: [
          fresh("c1", { createdBy: "jae" }),
          fresh("c2", { createdBy: "jae" }),
          fresh("c3", { createdBy: "ana" }),
          fresh("c4", { createdBy: "ft" }),
        ],
        notepad: {
          lines: [
            { id: "n1", text: "Who drives Friday?", group: GENERAL_GROUP, createdAt: ago(1) },
          ],
        },
      }),
    );
    expect(view.groups.map((g) => g.id)).toEqual([GENERAL_GROUP, "jae", "ana", NO_TRAINEE_GROUP]);
    expect(view.topTrainees[0]).toEqual({ uid: "jae", name: "Jae", open: 2 });
  });

  it("orders hand-written lines first, newest first, then drafted lines oldest signal first", () => {
    const view = buildToAsk(
      base({
        people: [person("c1", { name: "Sam", carers: ["jae"] })],
        messages: [
          message({ id: "a1", contactId: "c1", kind: "nudge", at: ago(5) }),
          message({ id: "a2", contactId: "c1", kind: "nudge", at: ago(3) }),
        ],
        notepad: {
          lines: [
            { id: "n1", text: "older note", group: "jae", createdAt: ago(4) },
            { id: "n2", text: "newer note", group: "jae", createdAt: ago(1) },
          ],
        },
      }),
    );
    const jae = view.groups.find((g) => g.id === "jae")!;
    expect(jae.lines.map((l) => l.key)).toEqual([
      "note:n2",
      "note:n1",
      "ask|c1|a1",
      "ask|c1|a2",
    ]);
  });

  it("filters Trainee groups by team but keeps General and No Trainee tied", () => {
    const view = buildToAsk(
      base({
        filter: "yp",
        people: [
          fresh("c1", { createdBy: "jae" }),
          fresh("c2", { createdBy: "hana" }),
          fresh("c3", { createdBy: "ft" }),
        ],
        notepad: { lines: [{ id: "n1", text: "x", group: GENERAL_GROUP, createdAt: ago(1) }] },
      }),
    );
    const ids = view.groups.map((g) => g.id);
    expect(ids).toContain("hana");
    expect(ids).not.toContain("jae");
    expect(ids).toContain(GENERAL_GROUP);
    expect(ids).toContain(NO_TRAINEE_GROUP);
  });
});

describe("buildToAsk — ADR 0046 and the lifecycle", () => {
  it("clears a reworded line when its signal clears, keeping the Full-timer's words", () => {
    const view = buildToAsk(
      base({
        people: [person("c1", { name: "Daniel Ortiz", createdBy: "jae" })],
        reach: new Map([["c1", { reached: true, ms: NOW.getTime() - DAY }]]),
        interactions: [{ contactId: "c1", ms: NOW.getTime() - DAY, userName: "Jae", type: "text" }],
        notepad: {
          overrides: { "notReached|c1": { text: "Did Daniel answer after Club Rush?" } },
          drafted: { "notReached|c1": { at: ago(12) } },
        },
      }),
    );
    const line = view.groups.find((g) => g.id === "jae")!.lines[0];
    expect(line.state).toBe("cleared");
    expect(line.text).toBe("Did Daniel answer after Club Rush?");
    expect(line.reworded).toBe(true);
    expect(line.clearedBy?.reason).toBe("reached");
    expect(line.clearedBy?.name).toBe("Jae");
    expect(view.openCount).toBe(0);
    expect(view.clearedCount).toBe(1);
  });

  it("never re-opens an Asked line as time passes", () => {
    const notepad: ToAskNotepad = {
      overrides: { "notReached|c1": { askedAt: NOW.toISOString() } },
      drafted: { "notReached|c1": { at: ago(10) } },
    };
    const people = [fresh("c1", { createdBy: "jae" })];
    const today = buildToAsk(base({ people, notepad }));
    expect(today.openCount).toBe(0);
    expect(today.groups.find((g) => g.id === "jae")?.lines[0].state).toBe("asked");

    const later = buildToAsk(
      base({ now: new Date(NOW.getTime() + 3 * DAY), people, notepad }),
    );
    expect(later.openCount).toBe(0);
    expect(later.groups.find((g) => g.id === "jae")?.lines[0].state).toBe("asked");
  });

  it("drafts a fresh line when a new signal instance appears for the same person", () => {
    const view = buildToAsk(
      base({
        people: [fresh("c1", { createdBy: "hana" })],
        messages: [message({ id: "a-new", contactId: "c1", kind: "nudge", at: ago(3), from: "kate" })],
        notepad: {
          // The *old* Not-reached instance was asked and hidden.
          overrides: { "notReached|c1": { askedAt: NOW.toISOString() } },
          drafted: { "notReached|c1": { at: ago(20) } },
        },
      }),
    );
    const lines = view.groups.find((g) => g.id === "hana")!.lines;
    expect(lines.find((l) => l.kind === "ask")?.state).toBe("open");
    expect(lines.find((l) => l.kind === "notReached")?.state).toBe("asked");
    expect(view.openCount).toBe(1);
  });

  it("keeps a struck line for seven days, then drops it", () => {
    const notepad = (daysAgo: number): ToAskNotepad => ({
      lines: [{ id: "n1", text: "note", group: "jae", createdAt: ago(30), askedAt: ago(daysAgo) }],
    });
    const shown = buildToAsk(base({ people: [person("c1", { createdBy: "jae" })], notepad: notepad(6) }));
    const dropped = buildToAsk(base({ people: [person("c1", { createdBy: "jae" })], notepad: notepad(8) }));
    expect(shown.groups.find((g) => g.id === "jae")?.lines[0].state).toBe("asked");
    expect(dropped.groups.find((g) => g.id === "jae")).toBeUndefined();
    expect(STRUCK_VISIBLE_DAYS).toBe(7);
  });

  it("drops struck lines sooner with Clear done", () => {
    const view = buildToAsk(
      base({
        people: [person("c1", { createdBy: "jae" })],
        notepad: {
          lines: [{ id: "n1", text: "note", group: "jae", createdAt: ago(30), askedAt: ago(1) }],
          clearedBefore: NOW.toISOString(),
        },
      }),
    );
    expect(view.groups.find((g) => g.id === "jae")).toBeUndefined();
    expect(view.clearedCount).toBe(0);
  });

  it("says what cleared a question", () => {
    const view = buildToAsk(
      base({
        people: [person("c1", { name: "Leo", createdBy: "ana" })],
        messages: [
          message({ id: "q1", contactId: "c1", kind: "question", at: ago(6), from: "kate" }),
          message({ id: "r1", contactId: "c1", kind: "comment", at: ago(2), from: "ana", fromName: "Ana", parentId: "q1" }),
        ],
        notepad: { drafted: { "question|c1|q1": { at: ago(6) } } },
      }),
    );
    const line = view.groups.find((g) => g.id === "ana")!.lines[0];
    expect(line.state).toBe("cleared");
    expect(line.clearedBy?.reason).toBe("answered");
  });

  it("keeps a question open for a later top-level message that is not a reply (#1649)", () => {
    const NOW2 = new Date("2026-10-16T19:00:00.000Z");
    const q = message({ id: "q1", contactId: "c1", kind: "question", at: "2026-10-10T18:00:00.000Z", from: "kate", fromName: "Kate" });
    const note = message({ id: "n1", contactId: "c1", kind: "note", at: "2026-10-11T18:00:00.000Z", from: "jae", fromName: "Jae" });
    const reply = message({ id: "r1", contactId: "c1", kind: "comment", at: "2026-10-11T18:00:00.000Z", from: "jae", fromName: "Jae", parentId: "q1" });
    const people = [person("c1", { name: "Leo", carers: ["jae"] })];
    const drafted = { "question|c1|q1": { at: "2026-10-10T18:00:00.000Z" } };

    expect(buildToAsk(base({ now: NOW2, people, messages: [q, note] })).openCount).toBe(1);

    const view = buildToAsk(base({ now: NOW2, people, messages: [q, reply], notepad: { drafted } }));
    expect(view.openCount).toBe(0);
    const line = view.groups.find((g) => g.id === "jae")!.lines[0];
    expect(line.state).toBe("cleared");
    expect(line.clearedBy).toMatchObject({ reason: "answered", at: reply.at });
  });

  it("does not let the asker's own reply answer a question, nor a reply draft a signal (#1649)", () => {
    const view = buildToAsk(
      base({
        people: [person("c1", { carers: ["jae"] })],
        messages: [
          message({ id: "q1", contactId: "c1", kind: "question", at: ago(6), from: "kate" }),
          message({ id: "r1", contactId: "c1", kind: "comment", at: ago(5), from: "kate", parentId: "q1" }),
          message({ id: "r2", contactId: "c1", kind: "question", at: ago(5), from: "kate", parentId: "q1" }),
          message({ id: "r3", contactId: "c1", kind: "nudge", at: ago(5), from: "kate", parentId: "q1" }),
        ],
      }),
    );
    expect(view.openCount).toBe(1);
  });

  it("keeps drafted keys for groups the team filter hides (#1649)", () => {
    const view = buildToAsk(
      base({ filter: "campus", people: [fresh("c1", { createdBy: "hana" })] }),
    );
    expect(view.groups.find((g) => g.id === "hana")).toBeUndefined();
    expect(Object.keys(view.drafted)).toEqual(["notReached|c1"]);
  });

  it("returns the drafted keys to persist back", () => {
    const view = buildToAsk(base({ people: [fresh("c1", { createdBy: "jae" })] }));
    expect(Object.keys(view.drafted)).toEqual(["notReached|c1"]);
  });
});
