import { describe, it, expect } from "vitest";
import {
  buildToAsk,
  GENERAL_GROUP,
  newToAskUpdate,
  NO_REPLY_AFTER_CALENDAR_DAYS,
  NO_TRAINEE_GROUP,
  parseToAskKey,
  STRUCK_VISIBLE_DAYS,
  toAskNoteId,
  toAskThreadTarget,
  toAskUpdateDestinations,
  type ToAskInput,
  type ToAskInteraction,
  type ToAskNotepad,
  type ToAskPerson,
  type ToAskThreadMessage,
  type ToAskTrainee,
  type ToAskUpdate,
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

/** A logged Interaction, defaulting to Jae texting c1 eight days ago. */
const interaction = (over: Partial<ToAskInteraction> = {}): ToAskInteraction => ({
  id: "i1",
  contactId: "c1",
  ms: NOW.getTime() - 8 * DAY,
  userId: "jae",
  userName: "Jae",
  type: "text",
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

describe("buildToAsk — a text with no reply (#1670)", () => {
  it("drafts a line seven campus days after a logged text", () => {
    const view = buildToAsk(
      base({
        people: [person("c1", { name: "Mei Lin", carers: ["jae"] })],
        interactions: [interaction()],
      }),
    );
    const jae = view.groups.find((g) => g.id === "jae");
    expect(jae?.lines.map((l) => l.kind)).toEqual(["noReply"]);
    expect(jae?.lines[0].key).toBe("noReply|c1|i1");
    expect(jae?.lines[0].state).toBe("open");
    expect(jae?.lines[0].signal).toMatchObject({
      contactName: "Mei Lin",
      reacherName: "Jae",
      mine: false,
      days: 8,
    });
    expect(NO_REPLY_AFTER_CALENDAR_DAYS).toBe(7);
  });

  it("draws the line at exactly seven campus days, not at six", () => {
    const openAt = (days: number) =>
      buildToAsk(
        base({
          people: [person("c1", { carers: ["jae"] })],
          interactions: [interaction({ ms: NOW.getTime() - days * DAY })],
        }),
      ).openCount;
    expect(openAt(7)).toBe(1);
    expect(openAt(6)).toBe(0);
  });

  it("counts chat and email as writing to someone, not a meeting or a visit", () => {
    const openFor = (type: string) =>
      buildToAsk(
        base({
          people: [person("c1", { carers: ["jae"] })],
          interactions: [interaction({ type })],
        }),
      ).openCount;
    expect(openFor("chat")).toBe(1);
    expect(openFor("email")).toBe(1);
    expect(openFor("meeting")).toBe(0);
    expect(openFor("gathering")).toBe(0);
  });

  it("clears once anything else is logged with them", () => {
    const view = buildToAsk(
      base({
        people: [person("c1", { carers: ["jae"] })],
        interactions: [
          interaction({ id: "i1", ms: NOW.getTime() - 10 * DAY, type: "text" }),
          interaction({
            id: "i2",
            ms: NOW.getTime() - 8 * DAY,
            type: "meeting",
            userId: "ana",
            userName: "Ana",
          }),
        ],
      }),
    );
    expect(view.openCount).toBe(0);
  });

  it("clears once they come to a Gathering", () => {
    const view = buildToAsk(
      base({
        people: [person("c1", { carers: ["jae"] })],
        interactions: [interaction({ ms: NOW.getTime() - 10 * DAY })],
        reach: new Map([["c1", { reached: true, ms: NOW.getTime() - 3 * DAY }]]),
      }),
    );
    expect(view.openCount).toBe(0);
  });

  it("drafts one line per person, tied to their newest text", () => {
    const view = buildToAsk(
      base({
        people: [person("c1", { carers: ["jae"] })],
        interactions: [
          interaction({ id: "old", ms: NOW.getTime() - 12 * DAY }),
          interaction({ id: "new", ms: NOW.getTime() - 8 * DAY, userId: "ana", userName: "Ana" }),
        ],
      }),
    );
    const lines = view.groups.find((g) => g.id === "jae")!.lines;
    expect(lines).toHaveLength(1);
    expect(lines[0].key).toBe("noReply|c1|new");
    expect(lines[0].signal?.reacherName).toBe("Ana");
  });

  it("marks the line as mine when the reader sent the text", () => {
    const view = buildToAsk(
      base({
        people: [person("c1", { carers: ["jae"] })],
        interactions: [interaction({ userId: "ft", userName: "Full Timer" })],
      }),
    );
    expect(view.groups[0].lines[0].signal).toMatchObject({
      mine: true,
      reacherName: "Full",
    });
  });

  it("drafts for anyone texted, not only a Contact", () => {
    const view = buildToAsk(
      base({
        people: [person("c1", { kind: "our-own", carers: ["jae"] })],
        interactions: [interaction()],
      }),
    );
    expect(view.openCount).toBe(1);
  });

  it("clears with what ended it, and keeps the old line struck", () => {
    const view = buildToAsk(
      base({
        people: [person("c1", { name: "Mei", carers: ["jae"] })],
        interactions: [
          interaction({ id: "i1", ms: NOW.getTime() - 12 * DAY }),
          interaction({
            id: "i2",
            ms: NOW.getTime() - 3 * DAY,
            type: "meeting",
            userId: "ana",
            userName: "Ana",
          }),
        ],
        notepad: { drafted: { "noReply|c1|i1": { at: ago(12) } } },
      }),
    );
    const old = view.groups.find((g) => g.id === "jae")!.lines[0];
    expect(old.key).toBe("noReply|c1|i1");
    expect(old.state).toBe("cleared");
    expect(old.clearedBy).toMatchObject({ reason: "reached", name: "Ana" });
    expect(view.openCount).toBe(0);
  });

  it("drafts a fresh line after a reply instead of reopening the old one", () => {
    const oldAsked = { at: ago(20) };
    const view = buildToAsk(
      base({
        people: [person("c1", { name: "Mei", carers: ["jae"] })],
        interactions: [
          interaction({ id: "i1", ms: NOW.getTime() - 20 * DAY }),
          interaction({
            id: "i2",
            ms: NOW.getTime() - 15 * DAY,
            type: "meeting",
            userId: "ana",
            userName: "Ana",
          }),
          interaction({ id: "i3", ms: NOW.getTime() - 8 * DAY }),
        ],
        notepad: { drafted: { "noReply|c1|i1": oldAsked } },
      }),
    );
    const lines = view.groups.find((g) => g.id === "jae")!.lines;
    expect(lines.find((l) => l.key === "noReply|c1|i3")?.state).toBe("open");
    expect(lines.find((l) => l.key === "noReply|c1|i1")?.state).not.toBe("open");
    expect(view.openCount).toBe(1);
  });
});

describe("buildToAsk — Dismiss", () => {
  it("hides a dismissed drafted line from every count and lists it in the tray", () => {
    const view = buildToAsk(
      base({
        people: [fresh("c1", { name: "Priya", carers: ["jae"] })],
        notepad: { overrides: { "notReached|c1": { dismissedAt: ago(1) } } },
      }),
    );
    expect(view.groups.find((g) => g.id === "jae")).toBeUndefined();
    expect(view.openCount).toBe(0);
    expect(view.clearedCount).toBe(0);
    expect(view.topTrainees).toEqual([]);
    expect(view.dismissed).toHaveLength(1);
    expect(view.dismissed[0]).toMatchObject({
      key: "notReached|c1",
      groupId: "jae",
      groupKind: "trainee",
      groupName: "Jae",
      dismissedAt: ago(1),
    });
    expect(view.dismissed[0].line).toMatchObject({ kind: "notReached", state: "open", contactId: "c1" });
    expect(view.dismissed[0].line.signal?.contactName).toBe("Priya");
    // Still drafted, so a later clear can say what cleared it.
    expect(Object.keys(view.drafted)).toEqual(["notReached|c1"]);
  });

  it("brings a drafted line back once its signal starts after the dismissal", () => {
    const people = [person("c1", { carers: ["jae"] })];
    const messages = [message({ id: "q1", kind: "question", at: ago(4) })];
    const hidden = buildToAsk(
      base({ people, messages, notepad: { overrides: { "question|c1|q1": { dismissedAt: ago(3) } } } }),
    );
    expect(hidden.openCount).toBe(0);
    expect(hidden.dismissed.map((d) => d.key)).toEqual(["question|c1|q1"]);

    const back = buildToAsk(
      base({ people, messages, notepad: { overrides: { "question|c1|q1": { dismissedAt: ago(5) } } } }),
    );
    expect(back.openCount).toBe(1);
    expect(back.dismissed).toEqual([]);
  });

  it("drafts a new signal instance for a person whose old line was dismissed", () => {
    const view = buildToAsk(
      base({
        people: [person("c1", { carers: ["jae"] })],
        messages: [message({ id: "a2", kind: "nudge", at: ago(3) })],
        notepad: { overrides: { "ask|c1|a1": { dismissedAt: ago(10) } } },
      }),
    );
    expect(view.openCount).toBe(1);
    expect(view.groups.find((g) => g.id === "jae")!.lines[0].key).toBe("ask|c1|a2");
  });

  it("hides a dismissed hand-written line until it is brought back", () => {
    const note = { id: "n1", text: "Who drives Friday?", group: "jae", createdAt: ago(2) };
    const view = buildToAsk(base({ notepad: { lines: [{ ...note, dismissedAt: ago(1) }] } }));
    expect(view.groups).toEqual([]);
    expect(view.openCount).toBe(0);
    expect(view.dismissed[0]).toMatchObject({ key: "note:n1", groupId: "jae", groupName: "Jae" });
    expect(view.dismissed[0].line.text).toBe("Who drives Friday?");

    const back = buildToAsk(base({ notepad: { lines: [note] } }));
    expect(back.openCount).toBe(1);
    expect(back.dismissed).toEqual([]);
  });

  it("does not count a dismissed Asked line as done", () => {
    const view = buildToAsk(
      base({
        notepad: {
          lines: [{ id: "n1", text: "x", group: "jae", createdAt: ago(3), askedAt: ago(1), dismissedAt: ago(1) }],
        },
      }),
    );
    expect(view.clearedCount).toBe(0);
    expect(view.dismissed).toHaveLength(1);
  });

  it("hides a dismissed line whose signal has since cleared", () => {
    const view = buildToAsk(
      base({
        people: [person("c1", { carers: ["jae"] })],
        reach: new Map([["c1", { reached: true, ms: NOW.getTime() - DAY }]]),
        interactions: [{ contactId: "c1", ms: NOW.getTime() - DAY, userName: "Jae", type: "call" }],
        notepad: {
          overrides: { "notReached|c1": { dismissedAt: ago(2) } },
          drafted: { "notReached|c1": { at: ago(12) } },
        },
      }),
    );
    expect(view.groups).toEqual([]);
    expect(view.clearedCount).toBe(0);
    expect(view.dismissed[0].line.state).toBe("cleared");
  });

  it("lists a line tied to two Trainees once, newest dismissal first, General and No Trainee by name", () => {
    const view = buildToAsk(
      base({
        people: [fresh("c1", { carers: ["jae", "ana"] }), fresh("c2")],
        notepad: {
          lines: [{ id: "n1", text: "x", group: GENERAL_GROUP, createdAt: ago(3), dismissedAt: ago(3) }],
          overrides: {
            "notReached|c1": { dismissedAt: ago(2) },
            "notReached|c2": { dismissedAt: ago(1) },
          },
        },
      }),
    );
    expect(view.dismissed.map((d) => [d.key, d.groupId, d.groupName])).toEqual([
      ["notReached|c2", NO_TRAINEE_GROUP, "No Trainee tied"],
      ["notReached|c1", "jae", "Jae"],
      ["note:n1", GENERAL_GROUP, "General"],
    ]);
  });

  it("keeps the team filter on the tray", () => {
    const view = buildToAsk(
      base({
        filter: "yp",
        people: [fresh("c1", { carers: ["jae", "hana"] }), fresh("c2", { carers: ["ana"] })],
        notepad: {
          overrides: {
            "notReached|c1": { dismissedAt: ago(1) },
            "notReached|c2": { dismissedAt: ago(1) },
          },
        },
      }),
    );
    expect(view.dismissed.map((d) => [d.key, d.groupId])).toEqual([["notReached|c1", "hana"]]);
  });
});

describe("buildToAsk — Post an update", () => {
  const update = (over: Partial<ToAskUpdate> = {}): ToAskUpdate => ({
    id: "u1",
    text: "Jae saw her at lunch",
    at: ago(1),
    dest: "line",
    ...over,
  });

  it("exposes a drafted line's updates, oldest first, and leaves it open", () => {
    const updates = [update(), update({ id: "u2", at: ago(0), dest: "contact" })];
    const view = buildToAsk(
      base({
        people: [fresh("c1", { carers: ["jae"] })],
        notepad: { overrides: { "notReached|c1": { updates } } },
      }),
    );
    const line = view.groups.find((g) => g.id === "jae")!.lines[0];
    expect(line.updates).toEqual(updates);
    expect(line.state).toBe("open");
    expect(line.reworded).toBe(false);
    expect(view.openCount).toBe(1);
  });

  it("exposes a hand-written line's updates, and an empty list when there are none", () => {
    const view = buildToAsk(
      base({
        notepad: {
          lines: [
            { id: "n1", text: "a", group: "jae", createdAt: ago(2), updates: [update()] },
            { id: "n2", text: "b", group: "jae", createdAt: ago(3) },
          ],
        },
      }),
    );
    const lines = view.groups.find((g) => g.id === "jae")!.lines;
    expect(lines.find((l) => l.key === "note:n1")!.updates).toEqual([update()]);
    expect(lines.find((l) => l.key === "note:n2")!.updates).toEqual([]);
  });

  it("keeps the updates on a cleared line", () => {
    const view = buildToAsk(
      base({
        people: [person("c1", { carers: ["jae"] })],
        reach: new Map([["c1", { reached: true, ms: NOW.getTime() - DAY }]]),
        interactions: [{ contactId: "c1", ms: NOW.getTime() - DAY, userName: "Kate", type: "interaction" }],
        notepad: {
          overrides: { "notReached|c1": { updates: [update({ dest: "contact" })] } },
          drafted: { "notReached|c1": { at: ago(12) } },
        },
      }),
    );
    const line = view.groups.find((g) => g.id === "jae")!.lines[0];
    expect(line.state).toBe("cleared");
    expect(line.updates).toHaveLength(1);
  });
});

describe("To ask line helpers", () => {
  it("reads a key back", () => {
    expect(parseToAskKey("question|c1|q1")).toEqual({ kind: "question", contactId: "c1", messageId: "q1" });
    expect(parseToAskKey("notReached|c1")).toEqual({ kind: "notReached", contactId: "c1", messageId: undefined });
    expect(parseToAskKey("note:n1")).toBeNull();
    expect(toAskNoteId("note:n1")).toBe("n1");
    expect(toAskNoteId("notReached|c1")).toBeNull();
  });

  it("offers the contact's page only with a contact, the Thread only for asks and questions", () => {
    expect(toAskUpdateDestinations({ kind: "handwritten", contactId: null })).toEqual(["line"]);
    expect(toAskUpdateDestinations({ kind: "handwritten", contactId: "c1" })).toEqual(["line", "contact"]);
    expect(toAskUpdateDestinations({ kind: "notReached", contactId: "c1" })).toEqual(["line", "contact"]);
    expect(toAskUpdateDestinations({ kind: "noReply", contactId: "c1" })).toEqual(["line", "contact"]);
    expect(toAskUpdateDestinations({ kind: "ask", contactId: "c1" })).toEqual(["line", "contact", "thread"]);
    expect(toAskUpdateDestinations({ kind: "question", contactId: "c1" })).toEqual(["line", "contact", "thread"]);
  });

  it("builds an update with trimmed text and the clock's time", () => {
    const u = newToAskUpdate("  Saw her Friday ", "contact", NOW);
    expect(u).toMatchObject({ text: "Saw her Friday", at: NOW.toISOString(), dest: "contact" });
    expect(u.id).toMatch(/^u-/);
    expect(newToAskUpdate("x", "line", NOW).id).not.toBe(u.id);
  });

  it("targets the Thread reply at the signal's own message and stream", () => {
    const messages = [
      message({ id: "q1", kind: "question", interactionId: "i9" }),
      message({ id: "a1", kind: "nudge", scope: "team" }),
    ];
    expect(toAskThreadTarget("question|c1|q1", messages)).toEqual({
      contactId: "c1",
      parentId: "q1",
      interactionId: "i9",
      scope: null,
    });
    expect(toAskThreadTarget("ask|c1|a1", messages)).toMatchObject({ parentId: "a1", scope: "team" });
    expect(toAskThreadTarget("ask|c1|gone", messages)).toBeNull();
    expect(toAskThreadTarget("notReached|c1", messages)).toBeNull();
    expect(toAskThreadTarget("note:n1", messages)).toBeNull();
  });
});

describe("buildToAsk — an open @mention drafts a line on the ask schedule", () => {
  const mention = (over: Partial<ToAskThreadMessage> = {}) =>
    message({ id: "mn1", contactId: "c1", kind: "comment", from: "kate", fromName: "Kate Ng", mentionedUserIds: ["jae"], at: ago(3), ...over });

  it("drafts a mention line three campus days after it was written", () => {
    const view = buildToAsk(base({ people: [person("c1", { name: "Sam", carers: ["jae"] })], messages: [mention()] }));
    const line = view.groups.find((g) => g.id === "jae")?.lines[0];
    expect(line?.kind).toBe("mention");
    expect(line?.signal).toMatchObject({ kind: "mention", askerName: "Kate", mine: false, days: 3 });
    expect(line?.text).toBe("Sam — Kate's mention is still open");
    expect(toAskUpdateDestinations(line!)).toEqual(["line", "contact", "thread"]);
    expect(toAskThreadTarget(line!.key, [mention()])).toMatchObject({ contactId: "c1", parentId: "mn1" });
  });

  it("does not draft one two days old, nor a plain comment that names nobody", () => {
    const view = buildToAsk(
      base({
        people: [person("c1", { carers: ["jae"] })],
        messages: [mention({ at: ago(2) }), mention({ id: "plain", mentionedUserIds: undefined, at: ago(5) })],
      }),
    );
    expect(view.openCount).toBe(0);
  });

  it("clears the line once the mention is closed", () => {
    const people = [person("c1", { carers: ["jae"] })];
    const drafted = buildToAsk(base({ people, messages: [mention()] }));
    const view = buildToAsk(
      base({
        people,
        messages: [mention({ closedAt: ago(1), closedByName: "Jae" })],
        notepad: { drafted: drafted.drafted },
      }),
    );
    expect(view.openCount).toBe(0);
    const line = view.groups.flatMap((g) => g.lines).find((l) => l.key === drafted.groups[0].lines[0].key);
    expect(line?.clearedBy).toMatchObject({ reason: "mentionClosed", name: "Jae" });
  });
});
