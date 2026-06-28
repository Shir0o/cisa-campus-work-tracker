import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import Thread from "../components/Thread";
import { addThreadMessage, toggleReaction } from "../lib/threads";
import { isTrainee } from "../lib/walking";

const hoisted = vi.hoisted(() => ({ messages: [] as any[] }));

// Mock the threads lib: keep faithful kind/reaction config + filtering, but
// drive the message list and spy on writes.
vi.mock("../lib/threads", () => {
  const THREAD_KINDS = {
    note: { label: "Note", tone: "accent", verb: "noted" },
    comment: { label: "Comment", tone: "teal", verb: "commented" },
    question: { label: "Question", tone: "amber", verb: "asked" },
    encouragement: { label: "Encourage", tone: "violet", verb: "encouraged" },
    nudge: { label: "Follow-up", tone: "warn", verb: "nudged" },
  };
  const norm = (v: any) => v ?? null;
  return {
    THREAD_KINDS,
    THREAD_REACTIONS: ["🙏", "❤️", "🌱", "✅"],
    threadsFor: (msgs: any[], iid: any = null) =>
      msgs.filter((m) => norm(m.interactionId) === norm(iid)),
    countFor: (msgs: any[], iid: any = null) =>
      msgs.filter((m) => norm(m.interactionId) === norm(iid)).length,
    useThreads: () => hoisted.messages,
    addThreadMessage: vi.fn(() => Promise.resolve()),
    toggleReaction: vi.fn(() => Promise.resolve()),
  };
});

vi.mock("../lib/walking", () => ({ isTrainee: vi.fn(() => false) }));

vi.mock("../components/AuthProvider", () => ({
  useAuth: () => ({ user: { uid: "u1", displayName: "Tony Wang" } }),
}));

const message = (over: any) => ({
  id: "m",
  interactionId: null,
  from: "u3",
  fromName: "Zion Park",
  kind: "note",
  body: "body",
  at: new Date().toISOString(),
  reactions: [],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isTrainee).mockReturnValue(false);
  hoisted.messages = [];
});

describe("Thread", () => {
  it("labels the viewer's own messages 'You' and others by first name", () => {
    hoisted.messages = [
      message({ id: "a", from: "u1", fromName: "Tony Wang", kind: "comment", body: "mine" }),
      message({ id: "b", from: "u3", fromName: "Zion Park", kind: "note", body: "theirs" }),
    ];
    render(<Thread contactId="C-1" interactionId={null} meStaffId="u1" />);
    expect(screen.getByText("You")).toBeInTheDocument();
    expect(screen.getByText("Zion")).toBeInTheDocument();
  });

  it("shows full-timer compose kinds (incl. Follow-up/nudge)", () => {
    render(<Thread contactId="C-1" meStaffId="u1" />);
    expect(screen.getByRole("button", { name: "Follow-up" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Comment" })).toBeInTheDocument();
    // a full-timer is not offered "Note"
    expect(screen.queryByRole("button", { name: "Note" })).not.toBeInTheDocument();
  });

  it("shows trainee compose kinds (Note, no nudge)", () => {
    vi.mocked(isTrainee).mockReturnValue(true);
    render(<Thread contactId="C-1" meStaffId="u3" />);
    expect(screen.getByRole("button", { name: "Note" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Follow-up" })).not.toBeInTheDocument();
  });

  it("posts a message with the current kind, author, and trimmed body", async () => {
    render(<Thread contactId="C-1" interactionId={null} meStaffId="u1" />);
    await userEvent.type(
      screen.getByPlaceholderText("Add a comment…"),
      "Great first contact",
    );
    await userEvent.click(screen.getByRole("button", { name: /Post/ }));
    expect(addThreadMessage).toHaveBeenCalledWith("C-1", {
      interactionId: null,
      from: "u1",
      fromName: "Tony Wang",
      kind: "comment",
      body: "Great first contact",
    });
  });

  it("toggles a reaction on a message", async () => {
    hoisted.messages = [message({ id: "a", from: "u3", reactions: [] })];
    render(<Thread contactId="C-1" meStaffId="u1" />);
    const addButtons = screen.getAllByTitle("Add reaction");
    await userEvent.click(addButtons[0]); // 🙏
    expect(toggleReaction).toHaveBeenCalledWith("C-1", "a", "u1", "🙏");
  });

  it("renders an empty state when there are no messages", () => {
    render(<Thread contactId="C-1" meStaffId="u1" />);
    expect(
      screen.getByText("Nothing here yet — start the conversation below."),
    ).toBeInTheDocument();
  });

  it("renders the compact empty state for the inline per-interaction variant", () => {
    render(<Thread contactId="C-1" interactionId="I-1" meStaffId="u1" compact />);
    expect(screen.getByText("No notes on this conversation yet.")).toBeInTheDocument();
  });

  it("shows reaction tallies and toggles the viewer's existing reaction", async () => {
    hoisted.messages = [
      message({ id: "a", from: "u3", reactions: [{ by: "u1", emoji: "🙏" }] }),
    ];
    render(<Thread contactId="C-1" meStaffId="u1" />);
    const tallyButton = screen.getByTitle("React");
    expect(tallyButton).toHaveTextContent("🙏");
    expect(tallyButton).toHaveTextContent("1");
    await userEvent.click(tallyButton);
    expect(toggleReaction).toHaveBeenCalledWith("C-1", "a", "u1", "🙏");
  });

  it("posts with ⌘↵ from the textarea", async () => {
    render(<Thread contactId="C-1" meStaffId="u1" />);
    const ta = screen.getByPlaceholderText("Add a comment…");
    await userEvent.type(ta, "quick post");
    fireEvent.keyDown(ta, { key: "Enter", ctrlKey: true });
    expect(addThreadMessage).toHaveBeenCalledWith(
      "C-1",
      expect.objectContaining({ body: "quick post", kind: "comment" }),
    );
  });

  it("updates the placeholder when switching to the Question kind", async () => {
    render(<Thread contactId="C-1" meStaffId="u1" />);
    await userEvent.click(screen.getByRole("button", { name: "Question" }));
    expect(screen.getByPlaceholderText("Ask them a question…")).toBeInTheDocument();
  });
});
