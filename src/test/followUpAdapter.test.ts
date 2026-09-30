import { describe, it, expect, vi, beforeEach } from "vitest";
import { followUpAdapter, type FollowUpAdapterInput } from "../components/stream/followUpAdapter";
import type { FeedbackReply } from "../types";

const t = (key: string) =>
  ({
    "feedback.follow_ups": "Follow-ups",
    "feedback.no_follow_ups": "No follow-ups yet.",
    "feedback.the_team": "The team",
    "feedback.follow_up_placeholder": "Ask a follow-up…",
    "feedback.follow_up_failed": "That didn't send.",
    "feedback.edit_failed": "That didn't save.",
    "feedback.edit_follow_up": "Edit your follow-up",
    "feedback.send": "Send",
  })[key] ?? key;

const reply = (over: Partial<FeedbackReply>): FeedbackReply => ({
  id: "r",
  authorRole: "submitter",
  authorId: "u1",
  authorName: "Jane Student",
  body: "Any news?",
  createdAt: "2026-09-02T12:00:00.000Z",
  ...over,
});

const make = (replies: FeedbackReply[] = [], over: Partial<FollowUpAdapterInput> = {}) =>
  followUpAdapter({
    noteId: "n1",
    replies,
    me: { uid: "u1", name: "Jane Student" },
    asSubmitter: true,
    getIdToken: () => Promise.resolve("tok"),
    t,
    ...over,
  });

const ok = () => Promise.resolve({ ok: true, status: 200, statusText: "OK" });

beforeEach(() => {
  global.fetch = vi.fn().mockImplementation(ok) as unknown as typeof fetch;
});

describe("followUpAdapter — a Feedback Note's Follow-ups as a stream", () => {
  it("is a plain stream: no kinds, no Threads, no mentions, no attachments; anyone with the note may post", () => {
    const a = make();
    expect(a.capabilities).toEqual({ kinds: false, attachments: false, canPost: true, canReply: false });
    expect(a.mentionCandidates).toEqual([]);
    expect(a.audience).toBe("");
    expect(a.empty).toBe("No follow-ups yet.");
  });

  it("names the submitter and posts the team as 'The team', never by name", () => {
    const a = make([
      reply({ id: "r1" }),
      reply({ id: "r2", authorRole: "team", authorId: "ft1", authorName: "Tony Wang", createdAt: "2026-09-03T12:00:00.000Z" }),
      reply({ id: "r3", authorRole: "team", authorId: undefined, authorName: undefined, relayed: true, createdAt: "2026-09-04T12:00:00.000Z" }),
    ]);
    expect(a.messages.map((m) => [m.id, m.fromName])).toEqual([
      ["r1", "Jane Student"],
      ["r2", "The team"],
      ["r3", "The team"],
    ]);
    // Every team reply is one author, so a run of them groups like anyone's.
    expect(a.messages[1].from).toBe(a.messages[2].from);
    expect(a.messages[1].from).not.toBe("u1");
    expect(a.messages.every((m) => !m.parentId)).toBe(true);
  });

  it("gives the team a single 'T' for its avatar, not the two initials of 'The team'", () => {
    const a = make([reply({ id: "r1" }), reply({ id: "r2", authorRole: "team", authorId: undefined })]);
    expect(a.messages[0].initials).toBeUndefined();
    expect(a.messages[1].initials).toBe("T");
  });

  it("falls back to the viewer's own name when a submitter reply carries none", () => {
    const a = make([reply({ authorName: undefined })]);
    expect(a.messages[0].fromName).toBe("Jane Student");
  });

  it("shows the submitter the restatement of a relayed comment, and the owner the raw one", () => {
    const relayed = reply({ id: "r1", authorRole: "team", authorId: undefined, body: "Superseded by #917.", launderedBody: "Handled.", relayed: true });
    expect(make([relayed]).messages[0].body).toBe("Handled.");
    expect(make([relayed], { asSubmitter: false }).messages[0].body).toBe("Superseded by #917.");
  });

  it("carries the edited marker through", () => {
    const a = make([reply({ editedAt: "2026-09-05T12:00:00.000Z" }), reply({ id: "r2" })]);
    expect(a.messages[0].editedAt).toBe("2026-09-05T12:00:00.000Z");
    expect(a.messages[1].editedAt).toBeFalsy();
  });

  it("lets you edit only your own submitter replies — not others', the team's, or a relayed one", () => {
    const a = make([
      reply({ id: "mine" }),
      reply({ id: "other", authorId: "u2" }),
      reply({ id: "team", authorRole: "team", authorId: "u1" }),
      reply({ id: "relayed", relayed: true, authorId: "u1" }),
    ]);
    const can = (id: string) => a.canEdit!(a.messages.find((m) => m.id === id)!);
    expect([can("mine"), can("other"), can("team"), can("relayed")]).toEqual([true, false, false, false]);
  });

  it("offers no delete: there is no endpoint that removes a Follow-up", () => {
    const a = make([reply({})]);
    expect(a.canDelete!(a.messages[0])).toBe(false);
  });

  it("posts through the server route with the ID token — the only write path", async () => {
    await make().post({ body: "Which screen is it on?", kind: "comment", mentionedUserIds: [] });
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/feedback/reply",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer tok" },
        body: JSON.stringify({ id: "n1", body: "Which screen is it on?" }),
      }),
    );
  });

  it("still posts, without an Authorization header, when the token cannot be fetched", async () => {
    await make([], { getIdToken: () => Promise.reject(new Error("no token")) }).post({ body: "hi", kind: "comment", mentionedUserIds: [] });
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/feedback/reply",
      expect.objectContaining({ headers: { "Content-Type": "application/json" } }),
    );
  });

  it("edits through the server's edit route", async () => {
    const a = make([reply({ id: "r1" })]);
    await a.edit!(a.messages[0], "Changed my question");
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/feedback/reply/edit",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ id: "n1", replyId: "r1", body: "Changed my question" }),
      }),
    );
  });

  it("rejects when the server refuses, so the stream can say so", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, statusText: "Server Error" }) as unknown as typeof fetch;
    const a = make([reply({ id: "r1" })]);
    await expect(a.post({ body: "x", kind: "comment", mentionedUserIds: [] })).rejects.toThrow(/500/);
    await expect(a.edit!(a.messages[0], "x")).rejects.toThrow(/500/);
  });

  it("supplies the composer's own words and the failure lines", () => {
    const a = make();
    expect(a.composer).toMatchObject({ placeholder: "Ask a follow-up…", submitLabel: "Send", editLabel: "Edit your follow-up", maxLength: 5000 });
    expect(a.failure).toEqual({ post: "That didn't send.", edit: "That didn't save." });
  });
});
