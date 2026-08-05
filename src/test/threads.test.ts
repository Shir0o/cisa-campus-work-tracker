import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { addDoc, onSnapshot, runTransaction } from "firebase/firestore";
import {
  THREAD_KINDS,
  THREAD_REACTIONS,
  threadsFor,
  repliesOf,
  countFor,
  addThreadMessage,
  toggleReaction,
  subscribeThreads,
  subscribeAllThreads,
  useThreads,
  useAllThreads,
  type ThreadMessage,
} from "../lib/threads";
import { sendNotification } from "../lib/firebase";

vi.mock("firebase/firestore", () => ({
  addDoc: vi.fn(() => Promise.resolve()),
  collection: vi.fn((_db, ...seg: string[]) => ({ path: seg.join("/") })),
  collectionGroup: vi.fn((_db, name: string) => ({ path: name })),
  doc: vi.fn((_db, ...seg: string[]) => ({ path: seg.join("/") })),
  onSnapshot: vi.fn(),
  orderBy: vi.fn((field, dir) => ({ field, dir })),
  query: vi.fn((ref) => ref),
  runTransaction: vi.fn(),
}));

vi.mock("../lib/firebase", () => ({
  db: {},
  handleFirestoreError: vi.fn(),
  sendNotification: vi.fn(),
  OperationType: { CREATE: "CREATE", UPDATE: "UPDATE", LIST: "LIST" },
}));

const msg = (over: Partial<ThreadMessage>): ThreadMessage => ({
  id: "x",
  interactionId: null,
  from: "u1",
  fromName: "T",
  kind: "comment",
  body: "b",
  at: "2020-01-01T00:00:00.000Z",
  reactions: [],
  ...over,
});

describe("THREAD_KINDS / reactions config", () => {
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

  it("offers the small reaction set", () => {
    expect(THREAD_REACTIONS).toEqual(["🙏", "❤️", "🌱", "✅"]);
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

  it("writes a trimmed message with empty reactions and an ISO timestamp", async () => {
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
      reactions: [],
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
              reactions: [],
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
    expect(messages[1]).toMatchObject({ id: "m2", contactId: "", kind: "comment", from: "", reactions: [] });
  });
});

describe("toggleReaction", () => {
  beforeEach(() => vi.clearAllMocks());

  const runWith = (existingReactions: { by: string; emoji: string }[]) => {
    const update = vi.fn();
    vi.mocked(runTransaction).mockImplementation((async (_db: unknown, fn: any) =>
      fn({
        get: async () => ({
          exists: () => true,
          data: () => ({ reactions: existingReactions }),
        }),
        update,
      })) as any);
    return update;
  };

  it("adds the reaction when absent", async () => {
    const update = runWith([]);
    await toggleReaction("C-1", "M-1", "u1", "🙏");
    expect(update).toHaveBeenCalledWith({ path: "contacts/C-1/threads/M-1" }, {
      reactions: [{ by: "u1", emoji: "🙏" }],
    });
  });

  it("removes the reaction when already present (toggle off)", async () => {
    const update = runWith([{ by: "u1", emoji: "🙏" }]);
    await toggleReaction("C-1", "M-1", "u1", "🙏");
    expect(update).toHaveBeenCalledWith({ path: "contacts/C-1/threads/M-1" }, {
      reactions: [],
    });
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
              reactions: [{ by: "u3", emoji: "🙏" }],
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
      reactions: [{ by: "u3", emoji: "🙏" }],
    });
    // malformed doc gets safe defaults
    expect(messages[1]).toMatchObject({ id: "m2", kind: "comment", from: "", reactions: [] });
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
