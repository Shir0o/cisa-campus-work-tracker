import { describe, it, expect, vi, beforeEach } from "vitest";
import { fullTimersAdapter } from "../components/stream/fullTimersAdapter";
import { addThreadMessage, deleteThreadMessage, type ThreadMessage } from "../lib/threads";

vi.mock("../lib/threads", () => ({
  addThreadMessage: vi.fn(() => Promise.resolve("new-id")),
  closeFollowUpAsk: vi.fn(() => Promise.resolve()),
  deleteThreadMessage: vi.fn(() => Promise.resolve()),
}));

const t = (key: string) =>
  ({
    "modals.contactDetails.discussion": "Full-timers",
    "stream.where_full_timers": "Full-timers · {name}",
    "stream.audience_full_timers": "Only Full-timers see this — Trainees can't.",
    "stream.placeholder_full_timers": "Write something only Full-timers will see…",
    "thread.empty_full_timers": "Nothing here yet.",
  })[key] ?? key;

const msg = (over: Partial<ThreadMessage>): ThreadMessage => ({
  id: "m",
  interactionId: null,
  parentId: null,
  scope: "team",
  from: "ruth",
  fromName: "Ruth Chen",
  kind: "comment",
  body: "b",
  at: "2026-09-22T10:00:00.000Z",
  ...over,
});

const stakeholders = { createdBy: "josh", carers: [] };
const make = (role = "admin", messages: ThreadMessage[] = [], onPosted?: (m: ThreadMessage, landed: Promise<string | null>) => void) =>
  fullTimersAdapter({
    contactId: "c1",
    contactName: "Daniel Reyes",
    messages,
    me: { uid: "maria", name: "Maria Santos", role },
    recipientUid: null,
    stakeholders,
    teamMembers: [
      { id: "josh", name: "Josh Park", role: "Trainee" },
      { id: "ruth", name: "Ruth Chen", role: "Full-timer" },
      { id: "grace", name: "Grace Liu", role: "Staff", fullTimer: true },
      { id: "sam", name: "Sam Ortiz", role: "Full-timer", fullTimer: false },
    ],
    t,
    onPosted,
  });

beforeEach(() => vi.clearAllMocks());

describe("fullTimersAdapter", () => {
  it("is the staff-only stream: team-scope messages and their replies, not the Conversation or an Interaction's", () => {
    const a = make("admin", [
      msg({ id: "top" }),
      msg({ id: "reply", parentId: "top" }),
      msg({ id: "open", scope: null }),
      msg({ id: "interaction", interactionId: "i1" }),
    ]);
    expect(a.messages.map((m) => m.id)).toEqual(["top", "reply"]);
  });

  it("names itself, where a Thread lives, and who sees it — behind a lock", () => {
    const a = make();
    expect(a.name).toBe("Full-timers");
    expect(a.where).toBe("Full-timers · Daniel Reyes");
    expect(a.audience).toBe("Only Full-timers see this — Trainees can't.");
    expect(a.locked).toBe(true);
    expect(a.askAudience).toBeUndefined();
    expect(a.composer?.placeholder).toBe("Write something only Full-timers will see…");
    expect(a.empty).toBe("Nothing here yet.");
  });

  it("offers no kinds and no attachments; a Full-timer may post and reply, nobody else may", () => {
    expect(make("admin").capabilities).toEqual({ kinds: false, attachments: false, canPost: true, canReply: true });
    expect(make("manager").capabilities).toEqual({ kinds: false, attachments: false, canPost: false, canReply: false });
  });

  it("offers only Full-timers as mentions (ADR 0007), by the member's flag or its role", () => {
    expect(make().mentionCandidates.map((c) => c.uid)).toEqual(["ruth", "grace"]);
  });

  it("posts to the team scope as a comment, whatever kind is asked for", () => {
    make().post({ body: "Gentle with him", kind: "nudge", mentionedUserIds: ["ruth"] });
    expect(addThreadMessage).toHaveBeenCalledWith(
      "c1",
      {
        interactionId: null,
        parentId: null,
        scope: "team",
        from: "maria",
        fromName: "Maria Santos",
        kind: "comment",
        body: "Gentle with him",
        mentionedUserIds: ["ruth"],
      },
      { to: null, contactName: "Daniel Reyes", stakeholders },
    );
  });

  it("replies under the parent in the team scope", () => {
    make().reply(msg({ id: "top" }), { body: "Agreed", mentionedUserIds: [] });
    expect(addThreadMessage).toHaveBeenCalledWith(
      "c1",
      expect.objectContaining({ parentId: "top", scope: "team", kind: "comment", interactionId: null }),
      expect.anything(),
    );
  });

  it("deletes from the team collection", () => {
    make().delete(msg({ id: "gone" }));
    expect(deleteThreadMessage).toHaveBeenCalledWith("c1", "gone", "team");
  });

  it("tells a caller what was just posted, with the promise of its real id", () => {
    const onPosted = vi.fn();
    make("admin", [], onPosted).post({ body: "Hello", kind: "comment", mentionedUserIds: [] });
    expect(onPosted).toHaveBeenCalledTimes(1);
    const [pending, landed] = onPosted.mock.calls[0];
    expect(pending).toMatchObject({ interactionId: null, parentId: null, scope: "team", from: "maria", fromName: "Maria Santos", kind: "comment", body: "Hello" });
    expect(pending.id).toMatch(/^pending:/);
    return expect(landed).resolves.toBe("new-id");
  });
});
