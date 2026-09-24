import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { addDoc, deleteDoc, onSnapshot } from "firebase/firestore";
import {
  THREAD_KINDS,
  threadsFor,
  repliesOf,
  countFor,
  addThreadMessage,
  deleteThreadMessage,
  subscribeThreads,
  subscribeAllThreads,
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
  onSnapshot: vi.fn(),
  orderBy: vi.fn((field, dir) => ({ field, dir })),
  query: vi.fn((ref) => ref),
}));

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
