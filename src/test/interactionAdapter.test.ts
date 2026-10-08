import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  interactionAdapter,
  interactionParentId,
  interactionThreadSummary,
} from "../components/stream/interactionAdapter";
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
    "stream.thread_on_interaction": "On an interaction · everyone tied to {name} sees this.",
    "stream.interaction_quote": "{name}'s conversation · {date}",
    "stream.interaction_quote_anon": "Conversation · {date}",
    "stream.think_together_placeholder":"Think it through together…",
    "thread.empty_interaction": "No comments on this interaction yet.",
    "stream.edit_failed": "That didn't save. Try again in a moment.",
    "stream.post_failed": "That didn't post. Try again in a moment.",
  })[key] ?? key;

const msg = (over: Partial<ThreadMessage>): ThreadMessage => ({
  id: "m",
  interactionId: "i1",
  parentId: null,
  scope: null,
  from: "maria",
  fromName: "Maria Santos",
  kind: "comment",
  body: "b",
  at: "2026-09-18T10:00:00.000Z",
  ...over,
});

const interaction = {
  id: "i1",
  userId: "josh",
  userName: "Josh Park",
  content: "Sat with Daniel at the Thursday gathering.",
  dateTime: "2026-09-17T12:00:00.000Z",
};

const stakeholders = { createdBy: "maria", carers: ["josh"] };
const make = (role = "manager", messages: ThreadMessage[] = [], over: Partial<Parameters<typeof interactionAdapter>[0]> = {}) =>
  interactionAdapter({
    contactId: "c1",
    contactName: "Daniel Reyes",
    interaction,
    messages,
    me: { uid: "maria", name: "Maria Santos", role },
    recipientUid: "ruth",
    stakeholders,
    teamMembers: [
      { id: "josh", name: "Josh Park", role: "Trainee" },
      { id: "ruth", name: "Ruth Chen", role: "Full-timer" },
    ],
    locale: "en-US",
    t,
    ...over,
  });

beforeEach(() => vi.clearAllMocks());

describe("interactionAdapter", () => {
  it("is one Thread whose parent is the Interaction: its replies hang off it, other levels are left out", () => {
    const a = make("admin", [
      msg({ id: "r1" }),
      msg({ id: "r2", parentId: "r1" }),
      msg({ id: "other", interactionId: "i2" }),
      msg({ id: "conversation", interactionId: null }),
      msg({ id: "team", scope: "team" }),
    ]);
    const parent = interactionParentId("i1");
    expect(a.thread?.parentId).toBe(parent);
    expect(a.messages.map((m) => m.id).sort()).toEqual([parent, "r1", "r2"].sort());
    // One level deep: legacy nested replies read as replies to the Interaction too.
    expect(a.messages.filter((m) => m.parentId === parent).map((m) => m.id).sort()).toEqual(["r1", "r2"]);
    expect(a.messages.find((m) => m.id === parent)).toMatchObject({ from: "josh", fromName: "Josh Park", body: interaction.content });
  });

  it("quotes the Interaction — who, when, and what was written — and says who reads the Thread", () => {
    const a = make();
    expect(a.thread?.quote.label).toBe("Josh's conversation · Thu, Sep 17");
    expect(a.thread?.quote.body).toBe("Sat with Daniel at the Thursday gathering.");
    expect(a.thread?.subtitle).toBe("On an interaction · everyone tied to Daniel sees this.");
    expect(a.replyPlaceholder).toBe("Think it through together…");
    expect(a.empty).toBe("No comments on this interaction yet.");
  });

  it("drops the author from the quote when the Interaction has none", () => {
    const a = make("manager", [], { interaction: { ...interaction, userName: undefined } });
    expect(a.thread?.quote.label).toBe("Conversation · Thu, Sep 17");
  });

  it("offers no kinds and no attachments; a writer may reply", () => {
    expect(make("manager").capabilities).toEqual({ kinds: false, attachments: false, canPost: true, canReply: true });
    expect(make("viewer").capabilities.canReply).toBe(false);
  });

  it("offers any teammate as a mention", () => {
    expect(make().mentionCandidates.map((c) => c.uid)).toEqual(["josh", "ruth"]);
  });

  it("writes a reply as a message on the interaction, contact-level in the data (no path change)", () => {
    const a = make();
    a.reply(a.messages[0], { body: "Film photography — Ruth's roommate", mentionedUserIds: ["ruth"] });
    expect(addThreadMessage).toHaveBeenCalledWith(
      "c1",
      {
        interactionId: "i1",
        parentId: null,
        scope: null,
        from: "maria",
        fromName: "Maria Santos",
        kind: "comment",
        body: "Film photography — Ruth's roommate",
        mentionedUserIds: ["ruth"],
      },
      { to: "ruth", contactName: "Daniel Reyes", stakeholders },
    );
  });

  it("closes a legacy ask as the viewer, and deletes the one message", () => {
    const a = make();
    a.closeAsk(msg({ id: "ask", kind: "nudge" }), "followedUp");
    expect(closeFollowUpAsk).toHaveBeenCalledWith("c1", "ask", { uid: "maria", name: "Maria Santos" });
    a.reopenAsk!(msg({ id: "ask", kind: "nudge" }));
    expect(reopenFollowUpAsk).toHaveBeenCalledWith("c1", "ask");
    a.delete(msg({ id: "gone" }));
    expect(deleteThreadMessage).toHaveBeenCalledWith("c1", "gone", null);
  });

  it("lets the author rewrite their own reply, but never the quoted Interaction", () => {
    const a = make();
    const parent = interactionParentId("i1");
    const mine = msg({ id: "mine", from: "maria" });
    expect(a.canEdit!(mine)).toBe(true);
    expect(a.canEdit!(msg({ id: "theirs", from: "josh" }))).toBe(false);
    // The Interaction stands where a message would, but is not one to edit.
    expect(a.canEdit!(msg({ id: parent, from: "maria" }))).toBe(false);
    a.edit!(mine, "new words");
    expect(editThreadMessage).toHaveBeenCalledWith("c1", "mine", "new words");
  });
});

describe("interactionThreadSummary", () => {
  const viewer = { uid: "maria", role: "manager" };
  const now = new Date("2026-09-22T12:00:00.000Z").getTime();

  it("is null when nobody has replied — the entry offers Think it through together", () => {
    expect(interactionThreadSummary(make(), viewer, now)).toBeNull();
  });

  it("carries up to three repliers, the count and the last reply for the entry's chip", () => {
    const a = make("manager", [
      msg({ id: "r1", from: "maria", fromName: "Maria Santos", at: "2026-09-17T21:40:00.000Z" }),
      msg({ id: "r2", from: "josh", fromName: "Josh Park", at: "2026-09-18T09:00:00.000Z" }),
      msg({ id: "r3", from: "josh", fromName: "Josh Park", at: "2026-09-19T09:00:00.000Z" }),
    ]);
    expect(interactionThreadSummary(a, viewer, now)).toEqual({
      count: 3,
      lastReplyAt: "2026-09-19T09:00:00.000Z",
      repliers: [
        { uid: "maria", name: "Maria Santos" },
        { uid: "josh", name: "Josh Park" },
      ],
    });
  });
});
