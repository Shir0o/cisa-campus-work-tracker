import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { addDoc, deleteDoc, getDoc, onSnapshot, updateDoc } from "firebase/firestore";
import {
  THREAD_KINDS,
  threadsFor,
  repliesOf,
  countFor,
  addThreadMessage,
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

vi.mock("firebase/firestore", () => ({
  addDoc: vi.fn(() => Promise.resolve({ id: "new-msg-id" })),
  collection: vi.fn((_db, ...seg: string[]) => ({ path: seg.join("/") })),
  collectionGroup: vi.fn((_db, name: string) => ({ path: name })),
  deleteDoc: vi.fn(() => Promise.resolve()),
  doc: vi.fn((_db, ...seg: string[]) => ({ path: seg.join("/") })),
  getDoc: vi.fn(() => Promise.resolve({ exists: () => false, data: () => ({}) })),
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

  it("sends nothing for a conversation message with no @mention", async () => {
    // Every caller used to pass the person's ties, and a legacy single
    // recipient; neither is addressed to anyone (cut-or-keep §28).
    await addThreadMessage(
      "C-1",
      { from: "u1", fromName: "Tony", kind: "comment", body: "He is doing well." },
      { contactName: "Rio", to: "u9", stakeholders: { createdBy: "u2" } } as never,
    );
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("sends only to the teammates it @mentions", async () => {
    await addThreadMessage(
      "C-1",
      {
        from: "u1",
        fromName: "Tony",
        kind: "comment",
        body: "Hey @Rio Tan and @Alex, can you check on this?",
        mentionedUserIds: ["u4", "u5"],
      },
      { contactName: "Alex", stakeholders: { createdBy: "u2" } } as never,
    );
    expect(sendNotification).toHaveBeenCalledTimes(2);
    expect(sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u4",
        title: "Tony mentioned you on Alex",
        message: "Hey @Rio Tan and @Alex, can you check on this?",
      }),
    );
    expect(sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u5", title: "Tony mentioned you on Alex" }),
    );
  });

  it("truncates a long body in the mention notification", async () => {
    await addThreadMessage(
      "C-1",
      { from: "u1", fromName: "Tony", kind: "nudge", body: "x".repeat(200), mentionedUserIds: ["u3"] },
      { contactName: "Rio" },
    );
    const arg = vi.mocked(sendNotification).mock.calls[0][0] as { message: string };
    expect(arg.message.endsWith("…")).toBe(true);
    expect(arg.message.length).toBeLessThanOrEqual(141);
  });

  it("never notifies the author for mentioning themselves", async () => {
    await addThreadMessage(
      "C-1",
      { from: "u1", fromName: "Tony", kind: "comment", body: "@me note", mentionedUserIds: ["u1"] },
      { contactName: "Alex" },
    );
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("never holds back an @mention: it is addressed to that person, so it always buzzes", async () => {
    await addThreadMessage(
      "C-1",
      { from: "u1", fromName: "Tony", kind: "comment", body: "@Rio look", mentionedUserIds: ["u4"] },
      { contactName: "Alex" },
    );
    const toU4 = vi.mocked(sendNotification).mock.calls.map((c) => c[0]).find((n) => n.userId === "u4");
    expect(toU4).toBeDefined();
    expect(toU4).not.toHaveProperty("coalesceKey");
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
// The Full-timers pane and its `teamThreads` collection are cut (cut-or-keep
// §24). Every reader below reads `threads` only and skips a legacy team-scope
// document; the stored data is left where it is.
describe("the cut teamThreads collection", () => {
  beforeEach(() => vi.clearAllMocks());

  it("writes an open-thread message to contacts/{id}/threads", async () => {
    await addThreadMessage("C-1", { from: "u1", fromName: "U", kind: "comment", body: "hi" });
    expect(addDoc).toHaveBeenCalledWith({ path: "contacts/C-1/threads" }, expect.objectContaining({ scope: null }));
  });

  it("deletes a message from contacts/{id}/threads", async () => {
    await deleteThreadMessage("C-1", "M-1");
    expect(deleteDoc).toHaveBeenCalledWith({ path: "contacts/C-1/threads/M-1" });
  });

  it("subscribeThreads reads only the open thread and skips a legacy team document", () => {
    vi.mocked(onSnapshot).mockImplementation((_q: unknown, next: unknown) => {
      (next as (s: unknown) => void)({
        docs: [
          {
            id: "legacy",
            ref: { parent: { parent: { id: "c1" } } },
            data: () => ({ from: "ft", fromName: "Ft", kind: "comment", body: "team", at: "2021-02-01T00:00:00.000Z", interactionId: null, scope: "team" }),
          },
          {
            id: "m1",
            ref: { parent: { parent: { id: "c1" } } },
            data: () => ({ from: "u1", fromName: "U", kind: "note", body: "open", at: "2021-01-01T00:00:00.000Z", interactionId: null }),
          },
        ],
      });
      return vi.fn();
    });
    const cb = vi.fn();
    subscribeThreads("C-1", cb);
    expect(vi.mocked(onSnapshot).mock.calls.map((c) => (c[0] as unknown as { path: string }).path)).toEqual(["contacts/C-1/threads"]);
    expect(cb.mock.calls.at(-1)![0].map((m: ThreadMessage) => m.id)).toEqual(["m1"]);
  });

  it("subscribeAllThreads reads only the open threads and skips a legacy team document", () => {
    vi.mocked(onSnapshot).mockImplementation((_q: unknown, next: unknown) => {
      (next as (s: unknown) => void)({
        docs: [
          {
            id: "legacy",
            ref: { parent: { parent: { id: "c2" } } },
            data: () => ({ from: "ft", fromName: "Ft", kind: "comment", body: "team", at: "2021-02-01T00:00:00.000Z", interactionId: null, scope: "team" }),
          },
          {
            id: "m1",
            ref: { parent: { parent: { id: "c1" } } },
            data: () => ({ from: "u1", fromName: "U", kind: "note", body: "open", at: "2021-01-01T00:00:00.000Z", interactionId: null }),
          },
        ],
      });
      return vi.fn();
    });
    const cb = vi.fn();
    subscribeAllThreads(cb);
    expect(vi.mocked(onSnapshot).mock.calls.map((c) => (c[0] as unknown as { path: string }).path)).toEqual(["threads"]);
    const last = cb.mock.calls.at(-1)![0] as (ThreadMessage & { contactId: string })[];
    expect(last.map((m) => m.id)).toEqual(["m1"]);
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
      { from: "u1", fromName: "Tony", kind: "comment", body: "Sure", parentId: "p-1", mentionedUserIds: ["u3"] },
      { contactName: "Rio" },
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

  it("a reply opens under its parent, and an Interaction link names it", () => {
    expect(threadNotificationLink("C-1", {})).toBe("/people/C-1?tab=thread");
    expect(threadNotificationLink("C-1", { parentId: "p-2" })).toBe("/people/C-1?tab=thread&parent=p-2");
    expect(threadNotificationLink("C-1", { interactionId: "i-1" })).toBe("/people/C-1?interaction=i-1");
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

// An @mention closes, for everyone it named, on the first reply from one of them.
describe("addThreadMessage closes the @mention a reply answers", () => {
  const parent = (over: Record<string, unknown> = {}) => ({
    exists: () => true,
    data: () => ({ from: "tony", fromName: "Tony", kind: "comment", body: "@Anna @Tim ?", at: "2020-01-01T00:00:00.000Z", interactionId: null, mentionedUserIds: ["anna", "tim"], ...over }),
  });
  const closes = () => vi.mocked(updateDoc).mock.calls.filter((c) => "closedBy" in (c[1] as object));

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("closes the parent as the replier when they are one of the people it names", async () => {
    vi.mocked(getDoc).mockResolvedValueOnce(parent() as never);
    await addThreadMessage("C-1", { parentId: "mn", from: "anna", fromName: "Anna Lee", kind: "comment", body: "On it." });
    expect(closes()).toHaveLength(1);
    expect(closes()[0][0]).toEqual({ path: "contacts/C-1/threads/mn" });
    expect(closes()[0][1]).toMatchObject({ closedBy: "anna", closedByName: "Anna Lee" });
  });

  it("leaves it open when the replier is not named, or it is already closed", async () => {
    vi.mocked(getDoc).mockResolvedValueOnce(parent() as never);
    await addThreadMessage("C-1", { parentId: "mn", from: "jae", fromName: "Jae", kind: "comment", body: "Me too." });
    vi.mocked(getDoc).mockResolvedValueOnce(parent({ closedAt: "2020-01-02T00:00:00.000Z" }) as never);
    await addThreadMessage("C-1", { parentId: "mn", from: "tim", fromName: "Tim", kind: "comment", body: "Late." });
    expect(closes()).toEqual([]);
  });
});
