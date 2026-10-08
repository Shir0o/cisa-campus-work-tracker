import { describe, it, expect, vi, beforeEach } from "vitest";
import { conversationAdapter } from "../components/stream/conversationAdapter";
import { addThreadMessage, closeFollowUpAsk, deleteThreadMessage, editThreadMessage, reopenFollowUpAsk, type ThreadMessage } from "../lib/threads";

vi.mock("../lib/threads", () => ({
  addThreadMessage: vi.fn(() => Promise.resolve("new-id")),
  closeFollowUpAsk: vi.fn(() => Promise.resolve()),
  reopenFollowUpAsk: vi.fn(() => Promise.resolve()),
  deleteThreadMessage: vi.fn(() => Promise.resolve()),
  editThreadMessage: vi.fn(() => Promise.resolve()),
}));

const t = (key: string) =>
  ({
    "modals.contactDetails.follow_up": "Conversation",
    "stream.where_conversation": "Conversation · {name}",
    "stream.audience_conversation": "Everyone tied to {name} sees this.",
    "stream.audience_conversation_ask": "Everyone tied to {name} sees this and can say they followed up.",
    "thread.empty_conversation": "Nothing here yet.",
    "stream.edit_failed": "That didn't save. Try again in a moment.",
    "stream.post_failed": "That didn't post. Try again in a moment.",
  })[key] ?? key;

const msg = (over: Partial<ThreadMessage>): ThreadMessage => ({
  id: "m",
  interactionId: null,
  parentId: null,
  scope: null,
  from: "josh",
  fromName: "Josh Park",
  kind: "comment",
  body: "b",
  at: "2026-09-22T10:00:00.000Z",
  ...over,
});

const stakeholders = { createdBy: "maria", carers: ["josh"] };
const make = (role = "manager", messages: ThreadMessage[] = []) =>
  conversationAdapter({
    contactId: "c1",
    contactName: "Daniel Reyes",
    messages,
    me: { uid: "maria", name: "Maria Santos", role },
    recipientUid: "ruth",
    stakeholders,
    teamMembers: [
      { id: "josh", name: "Josh Park", role: "Trainee" },
      { id: "ruth", name: "Ruth Chen", role: "Full-timer" },
    ],
    t,
  });

beforeEach(() => vi.clearAllMocks());

describe("conversationAdapter", () => {
  it("is the contact-level open stream: its messages and their replies, not an Interaction's Thread or Full-timers", () => {
    const a = make("admin", [
      msg({ id: "top" }),
      msg({ id: "reply", parentId: "top" }),
      msg({ id: "interaction", interactionId: "i1" }),
      msg({ id: "team", scope: "team" }),
    ]);
    expect(a.messages.map((m) => m.id)).toEqual(["top", "reply"]);
  });

  it("names its audience and where a Thread lives, by the person's first name", () => {
    const a = make();
    expect(a.name).toBe("Conversation");
    expect(a.where).toBe("Conversation · Daniel Reyes");
    expect(a.audience).toBe("Everyone tied to Daniel sees this.");
    expect(a.askAudience).toBe("Everyone tied to Daniel sees this and can say they followed up.");
    expect(a.empty).toBe("Nothing here yet.");
  });

  it.each([
    ["admin", true],
    ["manager", true],
    ["operator", true],
    ["viewer", false],
  ])("a %s may post and reply: %s; kinds are offered, attachments are not", (role, may) => {
    expect(make(role).capabilities).toEqual({ kinds: true, attachments: false, canPost: may, canReply: may });
  });

  it("offers any teammate as a mention (ADR 0007)", () => {
    expect(make().mentionCandidates).toEqual([
      { uid: "josh", name: "Josh Park", role: "Trainee" },
      { uid: "ruth", name: "Ruth Chen", role: "Full-timer" },
    ]);
  });

  it("posts through addThreadMessage with the kind, mentions, and everyone tied to notify", () => {
    make().post({ body: "Text him", kind: "nudge", mentionedUserIds: ["josh"] });
    expect(addThreadMessage).toHaveBeenCalledWith(
      "c1",
      {
        interactionId: null,
        parentId: null,
        scope: null,
        from: "maria",
        fromName: "Maria Santos",
        kind: "nudge",
        body: "Text him",
        mentionedUserIds: ["josh"],
      },
      { to: "ruth", contactName: "Daniel Reyes", stakeholders },
    );
  });

  it("replies as a comment under the parent, leaving an ask it answers open", () => {
    const ask = msg({ id: "ask", kind: "nudge" });
    make().reply(ask, { body: "I can", mentionedUserIds: [] });
    expect(addThreadMessage).toHaveBeenCalledWith(
      "c1",
      expect.objectContaining({ parentId: "ask", kind: "comment", body: "I can", interactionId: null, scope: null }),
      { to: "ruth", contactName: "Daniel Reyes", stakeholders },
    );
    expect(closeFollowUpAsk).not.toHaveBeenCalled();
  });

  it.each(["followedUp", "neverMind"] as const)("%s closes the ask as the viewer, so the asker closing it reads as withdrawn", (how) => {
    make().closeAsk(msg({ id: "ask", kind: "nudge", from: "maria" }), how);
    expect(closeFollowUpAsk).toHaveBeenCalledWith("c1", "ask", { uid: "maria", name: "Maria Santos" });
  });

  it("reopens the ask via reopenFollowUpAsk (#1496)", () => {
    make().reopenAsk!(msg({ id: "ask", kind: "nudge", from: "maria" }));
    expect(reopenFollowUpAsk).toHaveBeenCalledWith("c1", "ask");
    expect(make({ me: { uid: "v", name: "Viewer", role: "viewer" } }).reopenAsk).toBeUndefined();
  });

  it("deletes the one message", () => {
    make().delete(msg({ id: "gone" }));
    expect(deleteThreadMessage).toHaveBeenCalledWith("c1", "gone", null);
  });

  it("lets the author rewrite their own message", () => {
    make().edit!(msg({ id: "mine", from: "maria" }), "new words");
    expect(editThreadMessage).toHaveBeenCalledWith("c1", "mine", "new words");
  });

  it("offers Edit only on the viewer's own message — never on anyone else's, any role", () => {
    const a = make();
    expect(a.canEdit!(msg({ id: "mine", from: "maria" }))).toBe(true);
    expect(a.canEdit!(msg({ id: "theirs", from: "josh" }))).toBe(false);
    // A Full-timer may delete another's message, but not rewrite it.
    expect(a.canEdit!(msg({ id: "ruths", from: "ruth" }))).toBe(false);
  });

  it("names the failure line an edit or a post shows", () => {
    expect(make().failure).toEqual({
      post: "That didn't post. Try again in a moment.",
      edit: "That didn't save. Try again in a moment.",
    });
  });
});
