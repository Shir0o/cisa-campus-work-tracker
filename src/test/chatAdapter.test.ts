import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  announcementReadMark,
  chatAdapter,
  chatReadMark,
  chatRoomSubtitle,
  toStreamMessage,
  type ChatAdapterInput,
} from "../components/stream/chatAdapter";
import { sendMessage } from "../services/chat";
import en from "../locales/en.json";
import type { ChatMessage, ChatRoom } from "../types";

// The chat-room adapter (ADR 0033 §6): DMs, groups and announcements over the
// existing chat service. Posting rules are the rules' own — in an
// announcement only a Full-timer posts top-level, and any member replies.

vi.mock("../services/chat", () => ({
  sendMessage: vi.fn().mockResolvedValue(undefined),
}));

function t(key: string): string {
  const v = key.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], en);
  return typeof v === "string" ? v : key;
}

const room = (over: Partial<ChatRoom> = {}): ChatRoom => ({
  id: "r1",
  type: "group",
  name: "Thursday table crew",
  memberIds: ["me", "josh", "grace"],
  createdById: "me",
  createdByName: "Maria Santos",
  createdAt: { seconds: 1 },
  ...over,
});

const msg = (over: Partial<ChatMessage> = {}): ChatMessage => ({
  id: "m1",
  roomId: "r1",
  text: "Table plan for Thursday",
  senderId: "josh",
  senderName: "Josh Park",
  timestamp: { seconds: 1_700_000_000 },
  type: "text",
  parentId: null,
  ...over,
});

function input(over: Partial<ChatAdapterInput> = {}): ChatAdapterInput {
  return {
    room: room(),
    roomName: "Thursday table crew",
    messages: [msg()],
    me: { uid: "me", displayName: "Maria Santos", photoURL: "", isFullTimer: false },
    members: [
      { uid: "josh", displayName: "Josh Park", role: "manager" },
      { uid: "grace", displayName: "Grace Liu", role: "admin" },
    ],
    lastReadAt: null,
    staged: [],
    t,
    onAttach: vi.fn(),
    onUnstage: vi.fn(),
    onSent: vi.fn(),
    onPin: vi.fn(),
    onHide: vi.fn(),
    onRemove: vi.fn(),
    ...over,
  };
}

beforeEach(() => vi.clearAllMocks());

describe("toStreamMessage", () => {
  it("carries the chat message as the model's fields, keeping the source", () => {
    const m = msg({ parentId: "p1" });
    const s = toStreamMessage(m);
    expect(s).toMatchObject({
      id: "m1",
      parentId: "p1",
      from: "josh",
      fromName: "Josh Park",
      body: "Table plan for Thursday",
      at: new Date(1_700_000_000_000).toISOString(),
    });
    expect(s.source).toBe(m);
  });

  it("reads a Firestore Timestamp, an ISO string, and a pending (null) server time", () => {
    const d = new Date("2026-09-20T10:00:00Z");
    expect(toStreamMessage(msg({ timestamp: { toDate: () => d } })).at).toBe(d.toISOString());
    expect(toStreamMessage(msg({ timestamp: "2026-09-20T10:00:00.000Z" })).at).toBe("2026-09-20T10:00:00.000Z");
    const pending = new Date(toStreamMessage(msg({ timestamp: null })).at).getTime();
    expect(Math.abs(pending - Date.now())).toBeLessThan(5_000);
  });
});

describe("posting rules", () => {
  it("lets anyone post and reply in a DM or a group", () => {
    for (const type of ["direct", "group"] as const) {
      const a = chatAdapter(input({ room: room({ type }) }));
      expect(a.capabilities).toEqual({ kinds: false, attachments: true, canPost: true, canReply: true });
      expect(a.readOnlyNote).toBeUndefined();
    }
  });

  it("in an announcement, a member replies but does not post top-level, and reads the footer instead", () => {
    const a = chatAdapter(input({ room: room({ type: "announcement" }) }));
    expect(a.capabilities.canPost).toBe(false);
    expect(a.capabilities.canReply).toBe(true);
    expect(a.readOnlyNote).toBe("Only Full-timers post here. Anyone can reply in a thread.");
  });

  it("in an announcement, a Full-timer posts, with the real audience above the box", () => {
    const me = { uid: "me", displayName: "Maria Santos", isFullTimer: true };
    const custom = chatAdapter(input({ me, room: room({ type: "announcement", audiencePreset: "custom" }) }));
    expect(custom.capabilities.canPost).toBe(true);
    expect(custom.readOnlyNote).toBeUndefined();
    expect(custom.audience).toBe("Posting to 3 people in this channel");
    const everyone = chatAdapter(input({ me, room: room({ type: "announcement", audiencePreset: "everyone" }) }));
    expect(everyone.audience).toBe("Posting to everyone on Campus — 3 people");
  });

  it("a chat has no audience line", () => {
    expect(chatAdapter(input()).audience).toBe("");
  });

  it("a viewer outside an announcement's members can't reply either", () => {
    const a = chatAdapter(input({ room: room({ type: "announcement", memberIds: ["josh"] }) }));
    expect(a.capabilities.canReply).toBe(false);
  });
});

describe("writes", () => {
  it("posts top-level with the staged attachments, the room's members, type and name, then clears the stage", async () => {
    const staged = [{ type: "contact" as const, id: "c1", name: "Daniel Reyes" }];
    const i = input({ staged });
    await chatAdapter(i).post({ body: "Bringing Daniel's card", kind: "comment", mentionedUserIds: [] });
    expect(sendMessage).toHaveBeenCalledWith(
      "r1",
      "Bringing Daniel's card",
      { uid: "me", displayName: "Maria Santos", photoURL: "" },
      staged,
      ["me", "josh", "grace"],
      null,
      "group",
      "Thursday table crew",
    );
    expect(i.onSent).toHaveBeenCalled();
  });

  it("replies under the parent, with no attachments", async () => {
    const a = chatAdapter(input({ room: room({ type: "announcement", name: "Weekly notes" }) }));
    await a.reply(a.messages[0], { body: "Is transport provided?", mentionedUserIds: [] });
    expect(sendMessage).toHaveBeenCalledWith(
      "r1",
      "Is transport provided?",
      expect.objectContaining({ uid: "me" }),
      undefined,
      ["me", "josh", "grace"],
      "m1",
      "announcement",
      "Weekly notes",
    );
  });

  it("a failed post rejects — a confirmed write, so the draft stays — and keeps the stage; a failed reply is reported", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(sendMessage).mockRejectedValueOnce(new Error("offline"));
    const i = input();
    const adapter = chatAdapter(i);
    expect(adapter.failure?.post).toBe("That didn't send. Try again.");
    await expect(adapter.post({ body: "x", kind: "comment", mentionedUserIds: [] })).rejects.toThrow();
    expect(spy).toHaveBeenCalledWith("Failed to send message:", expect.any(Error));
    expect(i.onSent).not.toHaveBeenCalled();
    vi.mocked(sendMessage).mockRejectedValueOnce(new Error("offline"));
    const a = chatAdapter(i);
    await a.reply(a.messages[0], { body: "y", mentionedUserIds: [] });
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });

  it("delete takes the message back for everyone through the page's handler", () => {
    const i = input();
    const a = chatAdapter(i);
    a.delete(a.messages[0]);
    expect(i.onRemove).toHaveBeenCalledWith(i.messages[0]);
  });

  it("names the take-back after who is doing it, and asks first", () => {
    const a = chatAdapter(input({ messages: [msg({ id: "a", senderId: "me" }), msg({ id: "b" })] }));
    expect(a.deleteLabel!(a.messages[0])).toBe("Take back for everyone");
    expect(a.deleteLabel!(a.messages[1])).toBe("Remove for everyone");
    expect(a.deleteConfirm).toEqual({
      prompt: "Take this back for everyone? They'll see that a message was removed — not what it said.",
      yes: "Yes, remove it",
      no: "Keep it",
    });
  });

  it("More offers Pin (or Unpin) and Hide from my view", () => {
    const i = input({ messages: [msg({ id: "a" }), msg({ id: "b", pinned: true })] });
    const a = chatAdapter(i);
    const [pin, hide] = a.moreActions!(a.messages[0]);
    expect(pin.label).toBe("Pin");
    expect(hide.label).toBe("Hide from my view");
    pin.run();
    expect(i.onPin).toHaveBeenCalledWith(i.messages[0], true);
    hide.run();
    expect(i.onHide).toHaveBeenCalledWith(i.messages[0]);
    const [unpin] = a.moreActions!(a.messages[1]);
    expect(unpin.label).toBe("Unpin");
    unpin.run();
    expect(i.onPin).toHaveBeenCalledWith(i.messages[1], false);
  });
});

describe("the composer's stage (C5)", () => {
  it("stages each attachment as a removable item: a contact as a card, anything else as a file", () => {
    const i = input({
      staged: [
        { type: "contact", id: "c1", name: "Daniel Reyes" },
        { type: "event", id: "e1", name: "Fall retreat" },
      ],
    });
    const a = chatAdapter(i);
    expect(a.staged).toEqual([
      { key: "0", label: "Daniel Reyes", kind: "contact" },
      { key: "1", label: "Fall retreat", kind: "file" },
    ]);
    a.unstage!("1");
    expect(i.onUnstage).toHaveBeenCalledWith(1);
    a.attach!();
    expect(i.onAttach).toHaveBeenCalled();
  });
});

describe("what a row reads", () => {
  it("a taken-back message reads as who took it back", () => {
    const a = chatAdapter(
      input({
        members: [{ uid: "josh", displayName: "Josh Park" }, { uid: "grace", displayName: "Grace Liu" }],
        messages: [
          msg({ id: "d1", senderId: "me", senderName: "Maria Santos", deleted: { by: "me", at: null } }),
          msg({ id: "d2", deleted: { by: "me", at: null } }),
          msg({ id: "d3", deleted: { by: "josh", at: null } }),
          msg({ id: "d4", deleted: { by: "grace", at: null } }),
          msg({ id: "d5", deleted: { by: "u9", at: null } }),
          msg({ id: "ok" }),
        ],
      }),
    );
    expect(a.messages.map((m) => a.goneLabel!(m))).toEqual([
      "You took this message back.",
      "You removed this message.",
      "Josh took this message back.",
      "Removed by Grace.",
      "Removed by u9.",
      null,
    ]);
  });

  it("a system line is a notice, not a row", () => {
    const a = chatAdapter(input({ messages: [msg({ type: "system", text: "Josh joined" }), msg({ id: "m2" })] }));
    expect(a.notice!(a.messages[0])).toBe(true);
    expect(a.notice!(a.messages[1])).toBe(false);
  });

  it("an announcement post carries the Full-timer tag; a reply and a chat message don't", () => {
    const ann = chatAdapter(input({ room: room({ type: "announcement" }), messages: [msg(), msg({ id: "r", parentId: "m1" })] }));
    expect(ann.badge!(ann.messages[0])).toBe("Full-timer");
    expect(ann.badge!(ann.messages[1])).toBeNull();
    const chat = chatAdapter(input());
    expect(chat.badge!(chat.messages[0])).toBeNull();
  });

  it("holds a pinned announcement post first, under who pinned it", () => {
    const a = chatAdapter(
      input({
        room: room({ type: "announcement" }),
        messages: [
          msg({ id: "a", pinned: true, pinnedBy: "me" }),
          msg({ id: "b", pinned: true, pinnedBy: "grace" }),
          msg({ id: "c", pinned: true }),
          msg({ id: "d" }),
          msg({ id: "e", pinned: true, deleted: { by: "josh", at: null } }),
        ],
      }),
    );
    expect(a.messages.map((m) => a.pinnedLabel!(m))).toEqual([
      "Pinned by you · stays at the top until you unpin it",
      "Pinned by Grace Liu · stays at the top until they unpin it",
      "Pinned by Josh Park · stays at the top until they unpin it",
      null,
      null,
    ]);
  });

  it("a pin in a chat stays in date order", () => {
    const a = chatAdapter(input({ messages: [msg({ pinned: true, pinnedBy: "me" })] }));
    expect(a.pinnedLabel!(a.messages[0])).toBeNull();
  });

  it("offers the room's other members as mention candidates", () => {
    expect(chatAdapter(input()).mentionCandidates).toEqual([
      { uid: "josh", name: "Josh Park", role: "manager" },
      { uid: "grace", name: "Grace Liu", role: "admin" },
    ]);
  });

  it("says what an empty room, or a search that finds nothing, reads", () => {
    expect(chatAdapter(input()).empty).toBe("No messages yet. Send a message to start the conversation!");
    expect(chatAdapter(input({ search: "retreat" })).empty).toBe("Nothing matches “retreat”.");
  });

  it("uses the chat or announcement placeholder", () => {
    expect(chatAdapter(input()).composer?.placeholder).toBe("Write a message…");
    expect(chatAdapter(input()).composer?.hint).toBe("⌘↵ to send");
    expect(chatAdapter(input({ room: room({ type: "announcement" }) })).composer?.hint).toBeUndefined();
    expect(chatAdapter(input({ room: room({ type: "announcement" }) })).composer?.placeholder).toBe("Write an announcement…");
  });

  it("passes the room's last-read point through for the New line", () => {
    expect(chatAdapter(input({ lastReadAt: "2026-09-20T10:00:00.000Z" })).lastReadAt).toBe("2026-09-20T10:00:00.000Z");
  });
});

describe("read marks (G6)", () => {
  it("a chat room's New line starts from the per-device last-read time", () => {
    expect(chatReadMark(null)).toBeNull();
    expect(chatReadMark("garbage")).toBeNull();
    expect(chatReadMark(String(Date.UTC(2026, 8, 20)))).toBe(new Date(Date.UTC(2026, 8, 20)).toISOString());
  });

  it("an announcement's New line sits above the first post the viewer hasn't read", () => {
    const posts = [
      msg({ id: "a", timestamp: { seconds: 100 }, readBy: ["me"] }),
      msg({ id: "mine", senderId: "me", timestamp: { seconds: 150 } }),
      msg({ id: "r", parentId: "a", timestamp: { seconds: 160 } }),
      msg({ id: "b", timestamp: { seconds: 200 }, readBy: [] }),
      msg({ id: "c", timestamp: { seconds: 300 } }),
    ];
    const mark = announcementReadMark(posts, "me");
    expect(mark).not.toBeNull();
    const at = new Date(mark!).getTime();
    expect(at).toBeGreaterThan(150_000);
    expect(at).toBeLessThan(200_000);
  });

  it("an announcement read to the end has no New line", () => {
    expect(announcementReadMark([msg({ readBy: ["me"] })], "me")).toBeNull();
    expect(announcementReadMark([msg({ deleted: { by: "josh", at: null } })], "me")).toBeNull();
  });
});

describe("header line (S5)", () => {
  it("a DM is just the two of you; a group counts its people", () => {
    expect(chatRoomSubtitle(room({ type: "direct" }), { members: [], meIsFullTimer: false, t })).toBe("Just the two of you");
    expect(chatRoomSubtitle(room(), { members: [], meIsFullTimer: false, t })).toBe("Group · 3 people");
  });

  it("an announcement counts its people and names who posts there", () => {
    const ann = room({ type: "announcement", memberIds: ["me", "a", "b", "c"] });
    const ft = (uid: string, displayName: string) => ({ uid, displayName, role: "admin" });
    const tr = (uid: string, displayName: string) => ({ uid, displayName, role: "manager" });

    expect(chatRoomSubtitle(ann, { members: [tr("a", "Josh Park")], meIsFullTimer: false, t })).toBe("Announcement · 4 people");
    expect(chatRoomSubtitle(ann, { members: [ft("a", "Maria Santos")], meIsFullTimer: false, t })).toBe(
      "Announcement · 4 people · Maria posts here",
    );
    expect(chatRoomSubtitle(ann, { members: [], meIsFullTimer: true, t })).toBe("Announcement · 4 people · you post here");
    expect(
      chatRoomSubtitle(ann, { members: [ft("a", "Ruth Chen"), ft("b", "Grace Liu")], meIsFullTimer: false, t }),
    ).toBe("Announcement · 4 people · Grace and Ruth post here");
    expect(
      chatRoomSubtitle(ann, { members: [ft("a", "Ruth Chen"), ft("b", "Grace Liu")], meIsFullTimer: true, t }),
    ).toBe("Announcement · 4 people · you and 2 others post here");
    expect(
      chatRoomSubtitle(ann, { members: [ft("a", "Ruth Chen"), ft("b", "Grace Liu"), ft("c", "Maria Santos")], meIsFullTimer: false, t }),
    ).toBe("Announcement · 4 people · Grace and 2 others post here");
  });
});
