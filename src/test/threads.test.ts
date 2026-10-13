import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { addDoc, deleteDoc, getDocs, onSnapshot, updateDoc, where } from "firebase/firestore";
import {
  THREAD_KINDS,
  threadsFor,
  repliesOf,
  countFor,
  addThreadMessage,
  contactStakeholdersOf,
  threadNotificationLink,
  deleteThreadMessage,
  editThreadMessage,
  subscribeThreads,
  subscribeAllThreads,
  subscribeTiedThreads,
  useThreads,
  useAllThreads,
  type ThreadMessage,
} from "../lib/threads";
import { sendNotification } from "../lib/firebase";
import { applyRoster } from "../lib/walking";

vi.mock("firebase/firestore", () => ({
  addDoc: vi.fn(() => Promise.resolve({ id: "new-msg-id" })),
  collection: vi.fn((_db, ...seg: string[]) => ({ path: seg.join("/") })),
  collectionGroup: vi.fn((_db, name: string) => ({ path: name })),
  deleteDoc: vi.fn(() => Promise.resolve()),
  doc: vi.fn((_db, ...seg: string[]) => ({ path: seg.join("/") })),
  getDocs: vi.fn(() => Promise.resolve({ docs: [] })),
  onSnapshot: vi.fn(),
  orderBy: vi.fn((field, dir) => ({ field, dir })),
  query: vi.fn((ref) => ref),
  updateDoc: vi.fn(() => Promise.resolve()),
  where: vi.fn((field, op, value) => ({ field, op, value })),
}));

const tiedMock = vi.hoisted(() => ({ subscribeTiedSubcollection: vi.fn(() => () => {}) }));
vi.mock("../lib/contactQueries", () => tiedMock);

vi.mock("../lib/firebase", () => ({
  db: {},
  handleFirestoreError: vi.fn(),
  sendNotification: vi.fn(),
  OperationType: { CREATE: "CREATE", UPDATE: "UPDATE", DELETE: "DELETE", LIST: "LIST" },
}));


const msg = (over: Partial<ThreadMessage>): ThreadMessage => ({
  id: "x",
  interactionId: null,
  from: "u1",
  fromName: "T",
  kind: "comment",
  body: "b",
  at: "2020-01-01T00:00:00.000Z",
  ...over,
});

describe("THREAD_KINDS", () => {
  it("defines all five kinds with the nudge as a warn tone", () => {
    expect(Object.keys(THREAD_KINDS).sort()).toEqual([
      "comment",
      "encouragement",
      "note",
      "nudge",
      "question",
    ]);
    expect(THREAD_KINDS.nudge.tone).toBe("warn");
    expect(THREAD_KINDS.question.tone).toBe("amber");
  });
});

describe("threadsFor / countFor", () => {
  const messages = [
    msg({ id: "a", interactionId: null }),
    msg({ id: "b", interactionId: "I-1" }),
    msg({ id: "c", interactionId: null }),
  ];

  it("filters by level — null = the contact-level thread", () => {
    expect(threadsFor(messages).map((m) => m.id)).toEqual(["a", "c"]);
    expect(countFor(messages)).toBe(2);
  });

  it("filters by a specific interaction id", () => {
    expect(threadsFor(messages, "I-1").map((m) => m.id)).toEqual(["b"]);
    expect(countFor(messages, "I-1")).toBe(1);
  });
});

describe("addThreadMessage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("writes a trimmed message with an ISO timestamp", async () => {
    await addThreadMessage("C-1", {
      interactionId: null,
      from: "u1",
      fromName: "Tony",
      kind: "comment",
      body: "  hello  ",
    });
    expect(addDoc).toHaveBeenCalledTimes(1);
    const [ref, data] = vi.mocked(addDoc).mock.calls[0] as unknown as [
      { path: string },
      Record<string, unknown>,
    ];
    expect(ref.path).toBe("contacts/C-1/threads");
    expect(data).toMatchObject({
      from: "u1",
      fromName: "Tony",
      kind: "comment",
      body: "hello",
      interactionId: null,
    });
    expect(typeof data.at).toBe("string");
    expect(Number.isNaN(Date.parse(data.at as string))).toBe(false);
  });
});

describe("addThreadMessage notify", () => {
  beforeEach(() => vi.clearAllMocks());

  it("pings the recipient with a kind-shaped title + contact when notify.to is set", async () => {
    await addThreadMessage(
      "C-1",
      { interactionId: null, from: "u1", fromName: "Tony Wang", kind: "question", body: "Coming Thursday?" },
      { to: "u3", contactName: "Rio Tan" },
    );
    expect(sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u3",
        title: "Tony asked about Rio Tan",
        message: "Coming Thursday?",
        type: "info",
        targetId: "C-1",
        link: "/people/C-1?tab=thread",
      }),
    );
  });

  it("truncates a long body in the notification message", async () => {
    await addThreadMessage(
      "C-1",
      { from: "u1", fromName: "Tony", kind: "nudge", body: "x".repeat(200) },
      { to: "u3", contactName: "Rio" },
    );
    const arg = vi.mocked(sendNotification).mock.calls[0][0] as { message: string };
    expect(arg.message.endsWith("…")).toBe(true);
    expect(arg.message.length).toBeLessThanOrEqual(141);
  });

  it("does not notify when notify.to is absent", async () => {
    await addThreadMessage(
      "C-1",
      { from: "u1", fromName: "Tony", kind: "comment", body: "hi" },
      { to: null },
    );
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("notifies creator and co-creators (gospel partners) as stakeholders, excluding author", async () => {
    await addThreadMessage(
      "C-1",
      { from: "u1", fromName: "Tony", kind: "comment", body: "Shared bible verse" },
      {
        contactName: "Rio",
        stakeholders: { createdBy: "u1", coCreators: ["u2", "u3"] },
      },
    );
    // u1 is author so excluded. u2 and u3 should be notified.
    expect(sendNotification).toHaveBeenCalledTimes(2);
    expect(sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u2",
        title: "Tony commented on Rio",
        message: "Shared bible verse",
      }),
    );
    expect(sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u3",
        title: "Tony commented on Rio",
        message: "Shared bible verse",
      }),
    );
  });

  it("notifies addedBy, founders, and carers as stakeholders, excluding author", async () => {
    await addThreadMessage(
      "C-1",
      { from: "u-ft", fromName: "Full Timer", kind: "question", body: "How was the catchup?" },
      {
        contactName: "Jane",
        stakeholders: {
          addedBy: "u-trainee-1",
          founders: ["u-trainee-2"],
          carers: ["u-trainee-3"],
        },
      },
    );
    expect(sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u-trainee-1",
        title: "Full asked about Jane",
      }),
    );
    expect(sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u-trainee-2",
        title: "Full asked about Jane",
      }),
    );
    expect(sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u-trainee-3",
        title: "Full asked about Jane",
      }),
    );
    // Each is pushed by the notification function; the key holds a back-and-
    // forth on one person to one buzz per hour for each of them (#813).
    for (const userId of ["u-trainee-1", "u-trainee-2", "u-trainee-3"]) {
      expect(sendNotification).toHaveBeenCalledWith(
        expect.objectContaining({ userId, coalesceKey: "contact:C-1" }),
      );
    }
  });

  it("notifies mentioned users with mention-specific title and message", async () => {
    await addThreadMessage(
      "C-1",
      {
        from: "u1",
        fromName: "Tony",
        kind: "comment",
        body: "Hey @Rio Tan, can you check on this?",
        mentionedUserIds: ["u4"],
      },
      {
        contactName: "Alex",
        stakeholders: { createdBy: "u2" },
      },
    );
    // u2 is stakeholder, u4 is mentioned
    expect(sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u4",
        title: "Tony mentioned you on Alex",
        message: "Hey @Rio Tan, can you check on this?",
      }),
    );
    expect(sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u2",
        title: "Tony commented on Alex",
        coalesceKey: "contact:C-1",
      }),
    );
  });

  it("never holds back an @mention: it is addressed to that person, so it always buzzes", async () => {
    await addThreadMessage(
      "C-1",
      { from: "u1", fromName: "Tony", kind: "comment", body: "@Rio look", mentionedUserIds: ["u4"] },
      { contactName: "Alex", stakeholders: { createdBy: "u2" } },
    );
    const toU4 = vi.mocked(sendNotification).mock.calls.map((c) => c[0]).find((n) => n.userId === "u4");
    expect(toU4).toBeDefined();
    expect(toU4).not.toHaveProperty("coalesceKey");
  });

  it("filters out non-fulltimers from notifications when scope is team (discussion)", async () => {
    // u_ft is full-timer, u_trainee is trainee
    applyRoster([
      { uid: "u_author_ft", role: "admin" },
      { uid: "u_ft", role: "admin" },
      { uid: "u_trainee", role: "manager" },
    ]);

    await addThreadMessage(
      "C-1",
      {
        from: "u_author_ft",
        fromName: "Fulltimer",
        kind: "comment",
        scope: "team",
        body: "Discussion note @Trainee",
        mentionedUserIds: ["u_trainee", "u_ft"],
      },
      {
        contactName: "Alex",
        stakeholders: { createdBy: "u_trainee", coCreators: ["u_ft"] },
      },
    );

    // Trainees must never receive team-scoped notifications!
    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u_ft",
      }),
    );
  });


  // A caller that shows a message before the round trip needs to recognise its
  // own document when the subscription delivers it. Matching on the words
  // instead would confuse two identical messages for one (#1012).
  it("hands back the id of the message it wrote", async () => {
    const id = await addThreadMessage("C-1", {
      from: "u1",
      fromName: "Tony",
      kind: "comment",
      body: "ok",
    });
    expect(id).toBe("new-msg-id");
  });

  it("hands back null when the write failed, rather than an id that means nothing", async () => {
    vi.mocked(addDoc).mockRejectedValueOnce(new Error("write denied"));
    const id = await addThreadMessage("C-1", {
      from: "u1",
      fromName: "Tony",
      kind: "comment",
      body: "ok",
    });
    expect(id).toBeNull();
  });

  it("funnels addThreadMessage failures through handleFirestoreError", async () => {
    const { handleFirestoreError } = await import("../lib/firebase");
    vi.mocked(addDoc).mockRejectedValueOnce(new Error("write denied"));
    await addThreadMessage("C-1", { from: "u1", fromName: "T", kind: "note", body: "hi" });
    expect(handleFirestoreError).toHaveBeenCalledWith(
      expect.any(Error),
      "CREATE",
      "contacts/C-1/threads",
    );
  });
});

describe("subscribeAllThreads", () => {
  beforeEach(() => vi.clearAllMocks());

  it("tags each message with its parent contactId and defaults malformed docs", () => {
    vi.mocked(onSnapshot).mockImplementation((_q: unknown, next: unknown) => {
      (next as (s: unknown) => void)({
        docs: [
          {
            id: "m1",
            ref: { parent: { parent: { id: "c1" } } },
            data: () => ({
              from: "u3",
              fromName: "Zion",
              kind: "question",
              body: "q",
              at: "2021-01-01T00:00:00.000Z",
              interactionId: "i9",
            }),
          },
          { id: "m2", ref: { parent: { parent: null } }, data: () => ({}) },
        ],
      });
      return () => {};
    });

    const cb = vi.fn();
    subscribeAllThreads(cb);
    const messages = cb.mock.calls[0][0] as (ThreadMessage & { contactId: string })[];
    expect(messages[0]).toMatchObject({ id: "m1", contactId: "c1", interactionId: "i9", kind: "question" });
    // malformed doc → empty contactId + safe field defaults
    expect(messages[1]).toMatchObject({ id: "m2", contactId: "", kind: "comment", from: "" });
  });
});

describe("subscribeTiedThreads", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reads a Trainee's threads through their visible contacts, newest first", () => {
    const cb = vi.fn();
    const onError = vi.fn();
    subscribeTiedThreads("trainee1", cb, onError);

    expect(onSnapshot).not.toHaveBeenCalled();
    expect(tiedMock.subscribeTiedSubcollection).toHaveBeenCalledWith("trainee1", "threads", expect.any(Function), onError);

    const next = (tiedMock.subscribeTiedSubcollection.mock.calls[0] as unknown[])[2] as (docs: unknown[]) => void;
    const docAt = (id: string, contactId: string, at: string) => ({
      id,
      ref: { path: `contacts/${contactId}/threads/${id}`, parent: { parent: { id: contactId } } },
      data: () => ({ from: "u1", fromName: "Ada", kind: "note", body: id, at, interactionId: null }),
    });
    // Merged per contact, so not in time order until sorted.
    next([docAt("old", "a", "2026-01-01T00:00:00.000Z"), docAt("new", "b", "2026-03-01T00:00:00.000Z")]);

    const messages = cb.mock.lastCall![0] as (ThreadMessage & { contactId: string })[];
    expect(messages.map((m) => [m.id, m.contactId])).toEqual([["new", "b"], ["old", "a"]]);
  });
});

describe("deleteThreadMessage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes the message document at contacts/{contactId}/threads/{messageId}", async () => {
    await deleteThreadMessage("C-1", "M-1");
    expect(deleteDoc).toHaveBeenCalledWith({ path: "contacts/C-1/threads/M-1" });
  });

  it("funnels deleteThreadMessage failures through handleFirestoreError", async () => {
    const { handleFirestoreError } = await import("../lib/firebase");
    vi.mocked(deleteDoc).mockRejectedValueOnce(new Error("delete denied"));
    await deleteThreadMessage("C-1", "M-1");
    expect(handleFirestoreError).toHaveBeenCalledWith(
      expect.any(Error),
      "DELETE",
      "contacts/C-1/threads/M-1",
    );
  });
});

describe("editThreadMessage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rewrites the body and stamps editedAt on the author's message", async () => {
    await editThreadMessage("C-1", "M-1", "  new words  ");
    expect(updateDoc).toHaveBeenCalledWith(
      { path: "contacts/C-1/threads/M-1" },
      { body: "new words", editedAt: expect.any(String) },
    );
  });

  it("rejects on failure through handleFirestoreError, so an editor can stay open", async () => {
    const { handleFirestoreError } = await import("../lib/firebase");
    vi.mocked(handleFirestoreError).mockImplementationOnce(() => {
      throw new Error("edit denied");
    });
    vi.mocked(updateDoc).mockRejectedValueOnce(new Error("permission denied"));
    await expect(editThreadMessage("C-1", "M-1", "x")).rejects.toThrow("edit denied");
    expect(handleFirestoreError).toHaveBeenCalledWith(
      expect.any(Error),
      "UPDATE",
      "contacts/C-1/threads/M-1",
    );
  });
});

describe("subscribeThreads", () => {
  beforeEach(() => vi.clearAllMocks());

  it("maps docs and defaults missing fields", () => {
    vi.mocked(onSnapshot).mockImplementation((_q: unknown, next: unknown) => {
      (next as (s: unknown) => void)({
        docs: [
          {
            id: "m1",
            data: () => ({
              from: "u1",
              fromName: "Tony",
              kind: "note",
              body: "hi",
              at: "2021-01-01T00:00:00.000Z",
              interactionId: null,
            }),
          },
          { id: "m2", data: () => ({}) },
        ],
      });
      return () => {};
    });

    const cb = vi.fn();
    subscribeThreads("C-1", cb);
    const messages = cb.mock.calls[0][0] as ThreadMessage[];
    expect(messages[0]).toMatchObject({
      id: "m1",
      kind: "note",
    });
    // malformed doc gets safe defaults
    expect(messages[1]).toMatchObject({ id: "m2", kind: "comment", from: "" });
  });

  it("passes subscribeThreads errors to the caller handler", () => {
    const err = new Error("permission denied");
    vi.mocked(onSnapshot).mockImplementation((_q: unknown, _next: unknown, onErr: unknown) => {
      (onErr as (e: unknown) => void)(err);
      return () => {};
    });
    const onError = vi.fn();
    subscribeThreads("C-1", vi.fn(), onError);
    expect(onError).toHaveBeenCalledWith(err);
  });

  it("passes subscribeAllThreads errors to the caller handler", () => {
    const err = new Error("permission denied");
    vi.mocked(onSnapshot).mockImplementation((_q: unknown, _next: unknown, onErr: unknown) => {
      (onErr as (e: unknown) => void)(err);
      return () => {};
    });
    const onError = vi.fn();
    subscribeAllThreads(vi.fn(), onError);
    expect(onError).toHaveBeenCalledWith(err);
  });
});
// Full-timers Discussion has its own subcollection so no non-admin list query
// can reach it: a list rule cannot drop single documents from a result.
describe("Full-timers Discussion lives in teamThreads", () => {
  beforeEach(() => vi.clearAllMocks());

  const snapFor = (path: string) => {
    if (path.endsWith("teamThreads")) {
      return [
        {
          id: "t1",
          ref: { parent: { parent: { id: "c2" } } },
          data: () => ({ from: "ft", fromName: "Ft", kind: "comment", body: "team", at: "2021-02-01T00:00:00.000Z", interactionId: null }),
        },
      ];
    }
    return [
      {
        id: "m1",
        ref: { parent: { parent: { id: "c1" } } },
        data: () => ({ from: "u1", fromName: "U", kind: "note", body: "open", at: "2021-01-01T00:00:00.000Z", interactionId: null }),
      },
    ];
  };
  const mockBoth = () => {
    const unsubs: ReturnType<typeof vi.fn>[] = [];
    vi.mocked(onSnapshot).mockImplementation((q: unknown, next: unknown) => {
      (next as (s: unknown) => void)({ docs: snapFor((q as { path: string }).path) });
      const u = vi.fn();
      unsubs.push(u);
      return u;
    });
    return unsubs;
  };
  const pathsQueried = () => vi.mocked(onSnapshot).mock.calls.map((c) => (c[0] as unknown as { path: string }).path);

  it("posts a team-scope message to contacts/{id}/teamThreads", async () => {
    await addThreadMessage("C-1", { scope: "team", from: "ft", fromName: "Ft", kind: "comment", body: "hi" });
    expect(addDoc).toHaveBeenCalledWith({ path: "contacts/C-1/teamThreads" }, expect.objectContaining({ scope: "team" }));
  });

  it("keeps an open-thread message in contacts/{id}/threads", async () => {
    await addThreadMessage("C-1", { from: "u1", fromName: "U", kind: "comment", body: "hi" });
    expect(addDoc).toHaveBeenCalledWith({ path: "contacts/C-1/threads" }, expect.objectContaining({ scope: null }));
  });

  it("deletes a team-scope message from teamThreads", async () => {
    await deleteThreadMessage("C-1", "M-1", "team");
    expect(deleteDoc).toHaveBeenCalledWith({ path: "contacts/C-1/teamThreads/M-1" });
  });

  it("subscribeThreads reads only the open thread unless asked for the team one", () => {
    mockBoth();
    const cb = vi.fn();
    subscribeThreads("C-1", cb);
    expect(pathsQueried()).toEqual(["contacts/C-1/threads"]);
    expect(cb.mock.calls.at(-1)![0].map((m: ThreadMessage) => m.id)).toEqual(["m1"]);
  });

  it("subscribeThreads merges the team thread newest-first for a Full-timer, and closes both", () => {
    const unsubs = mockBoth();
    const cb = vi.fn();
    const stop = subscribeThreads("C-1", cb, undefined, { includeTeam: true });
    expect(pathsQueried()).toEqual(["contacts/C-1/threads", "contacts/C-1/teamThreads"]);
    const last = cb.mock.calls.at(-1)![0] as ThreadMessage[];
    expect(last.map((m) => [m.id, m.scope])).toEqual([["t1", "team"], ["m1", null]]);
    stop();
    for (const u of unsubs) expect(u).toHaveBeenCalled();
  });

  it("subscribeAllThreads merges every contact's team thread for a Full-timer", () => {
    mockBoth();
    const cb = vi.fn();
    subscribeAllThreads(cb, undefined, { includeTeam: true });
    expect(pathsQueried()).toEqual(["threads", "teamThreads"]);
    const last = cb.mock.calls.at(-1)![0] as (ThreadMessage & { contactId: string })[];
    expect(last.map((m) => [m.id, m.contactId, m.scope])).toEqual([["t1", "c2", "team"], ["m1", "c1", null]]);
  });

  it("subscribeAllThreads reads only the open threads by default", () => {
    mockBoth();
    subscribeAllThreads(vi.fn());
    expect(pathsQueried()).toEqual(["threads"]);
  });
});

describe("repliesOf helper", () => {
  it("filters replies belonging to a parentId", () => {
    const msgs = [
      msg({ id: "m1", parentId: null }),
      msg({ id: "r1", parentId: "m1" }),
      msg({ id: "r2", parentId: "m1" }),
      msg({ id: "m2", parentId: null }),
    ];
    expect(repliesOf(msgs, "m1").map((m) => m.id)).toEqual(["r1", "r2"]);
    expect(repliesOf(msgs, "m2")).toEqual([]);
  });
});

describe("addThreadMessage writes the link a notification opens (#1303)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("a Conversation reply carries its parent, so the Thread opens under it", async () => {
    await addThreadMessage(
      "C-1",
      { from: "u1", fromName: "Tony", kind: "comment", body: "Sure", parentId: "p-1" },
      { to: "u3", contactName: "Rio" },
    );
    expect(sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({ link: "/people/C-1?tab=thread&parent=p-1" }),
    );
  });
});

describe("threadNotificationLink (#1303)", () => {
  it("a top-level Conversation message opens just the stream", () => {
    expect(threadNotificationLink("C-1", {})).toBe("/people/C-1?tab=thread");
  });

  it("a Conversation reply opens the Thread under its parent", () => {
    expect(threadNotificationLink("C-1", { parentId: "p-1" })).toBe(
      "/people/C-1?tab=thread&parent=p-1",
    );
  });

  it("a Full-timers message opens the Discussion side, a reply under its parent", () => {
    expect(threadNotificationLink("C-1", { scope: "team" })).toBe(
      "/people/C-1?tab=discussion",
    );
    expect(threadNotificationLink("C-1", { scope: "team", parentId: "p-2" })).toBe(
      "/people/C-1?tab=discussion&parent=p-2",
    );
  });

  it("a message on an Interaction's Thread carries the interaction id", () => {
    expect(threadNotificationLink("C-1", { interactionId: "I-9", parentId: "p-3" })).toBe(
      "/people/C-1?interaction=I-9",
    );
  });
});

describe("useAllThreads hook", () => {
  beforeEach(() => vi.clearAllMocks());

  it("subscribes to all threads using useAllThreads", async () => {
    vi.mocked(onSnapshot).mockImplementation((_q: unknown, next: unknown) => {
      (next as (s: unknown) => void)({
        docs: [
          {
            id: "m1",
            ref: { parent: { parent: { id: "c1" } } },
            data: () => msg({ id: "m1" }),
          },
        ],
      });
      return () => {};
    });

    const { result } = renderHook(() => useAllThreads());
    await waitFor(() => expect(result.current).toHaveLength(1));
    expect(result.current[0].contactId).toBe("c1");
  });
});

// #1604: someone who wrote in a stream within 14 days hears what others write
// there after — whether or not it answers them, and whether or not they are
// tied to the person (CONTEXT.md "In the Conversation", ADR 0007 amendment).
describe("addThreadMessage reaches teammates In the Conversation", () => {
  const recent = (from: string, extra: Record<string, unknown> = {}) => ({
    id: from + "-msg",
    ref: { path: "contacts/C-1/threads/" + from + "-msg", parent: { parent: { id: "C-1" } } },
    data: () => ({ from, fromName: from, kind: "nudge", body: "Can someone text Mark?", interactionId: null, at: new Date(Date.now() - 60_000).toISOString(), ...extra }),
  });
  const reached = () => vi.mocked(sendNotification).mock.calls.map((c) => c[0]);

  beforeEach(() => {
    vi.clearAllMocks();
    applyRoster([
      { uid: "tony", role: "admin" },
      { uid: "anna", role: "admin" },
      { uid: "tim", role: "manager" },
    ]);
  });

  it("tells the asker of a Follow-up ask, though they are not tied, when a teammate replies", async () => {
    vi.mocked(getDocs).mockResolvedValueOnce({ docs: [recent("tony")] } as never);
    await addThreadMessage(
      "C-1",
      { parentId: "tony-msg", from: "anna", fromName: "Anna Lee", kind: "comment", body: "I texted him." },
      { contactName: "Mark", stakeholders: { createdBy: "tim" } },
    );
    expect(reached()).toContainEqual(
      expect.objectContaining({ userId: "tony", title: "Anna commented on Mark", coalesceKey: "contact:C-1" }),
    );
  });

  it("still reaches them when they released the person", async () => {
    vi.mocked(getDocs).mockResolvedValueOnce({ docs: [recent("tony")] } as never);
    await addThreadMessage(
      "C-1",
      { from: "anna", fromName: "Anna", kind: "note", body: "Saw him today." },
      { contactName: "Mark", stakeholders: { createdBy: "tony", unfollowedBy: ["tony"] } },
    );
    expect(reached().map((n) => n.userId)).toEqual(["tony"]);
  });

  it("tells a teammate who is both tied and In the Conversation once", async () => {
    vi.mocked(getDocs).mockResolvedValueOnce({ docs: [recent("tim"), recent("tim")] } as never);
    await addThreadMessage(
      "C-1",
      { from: "anna", fromName: "Anna", kind: "question", body: "Did he come?" },
      { contactName: "Mark", stakeholders: { createdBy: "tim" } },
    );
    expect(reached()).toEqual([expect.objectContaining({ userId: "tim", title: "Anna asked about Mark" })]);
  });

  it("never tells a Trainee about the Full-timers stream", async () => {
    vi.mocked(getDocs).mockResolvedValueOnce({ docs: [recent("tim"), recent("tony")] } as never);
    await addThreadMessage(
      "C-1",
      { scope: "team", from: "anna", fromName: "Anna", kind: "comment", body: "Between us." },
      { contactName: "Mark" },
    );
    expect(reached().map((n) => n.userId)).toEqual(["tony"]);
  });

  it("ignores messages in another stream on the same person", async () => {
    vi.mocked(getDocs).mockResolvedValueOnce({ docs: [recent("tony", { interactionId: "i1" })] } as never);
    await addThreadMessage(
      "C-1",
      { from: "anna", fromName: "Anna", kind: "comment", body: "On the Conversation." },
      { contactName: "Mark" },
    );
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("asks only for the stream's last 14 days", async () => {
    await addThreadMessage("C-1", { from: "anna", fromName: "Anna", kind: "comment", body: "Hi" }, { contactName: "Mark" });
    expect(getDocs).toHaveBeenCalledTimes(1);
    const [field, op, value] = vi.mocked(where).mock.calls[0] as [string, string, string];
    expect([field, op]).toEqual(["at", ">="]);
    const days = (Date.now() - Date.parse(value)) / 86_400_000;
    expect(Math.round(days)).toBe(14);
  });

  it("never tells someone who can no longer see the person (security review)", async () => {
    vi.mocked(getDocs).mockResolvedValueOnce({ docs: [recent("tim"), recent("tony")] } as never);
    await addThreadMessage(
      "C-1",
      { from: "anna", fromName: "Anna", kind: "note", body: "Private detail." },
      { contactName: "Mark", stakeholders: { createdBy: "anna", visibleTo: ["anna"] } },
    );
    // tim (Trainee) was unshared since writing; tony is a Full-timer and sees everyone.
    expect(reached().map((n) => n.userId)).toEqual(["tony"]);
  });

  it("tells a Trainee who still sees the person", async () => {
    vi.mocked(getDocs).mockResolvedValueOnce({ docs: [recent("tim")] } as never);
    await addThreadMessage(
      "C-1",
      { from: "anna", fromName: "Anna", kind: "note", body: "Hi" },
      { contactName: "Mark", stakeholders: contactStakeholdersOf({ createdBy: "anna", visibleTo: ["anna", "tim"] } as never) },
    );
    expect(reached().map((n) => n.userId)).toEqual(["tim"]);
  });

  it("keeps the message when the read fails", async () => {
    vi.mocked(getDocs).mockRejectedValueOnce(new Error("offline"));
    const id = await addThreadMessage(
      "C-1",
      { from: "anna", fromName: "Anna", kind: "comment", body: "Hi" },
      { contactName: "Mark", stakeholders: { createdBy: "tim" } },
    );
    expect(id).toBe("new-msg-id");
    expect(reached().map((n) => n.userId)).toEqual(["tim"]);
  });
});
