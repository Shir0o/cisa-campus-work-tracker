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
    threadsFor: (msgs: any[], iid: any = null, scope: any = null) =>
      msgs.filter((m) => norm(m.interactionId) === norm(iid) && norm(m.scope) === norm(scope) && !m.parentId),
    countFor: (msgs: any[], iid: any = null, scope: any = null) =>
      msgs.filter((m) => norm(m.interactionId) === norm(iid) && norm(m.scope) === norm(scope) && !m.parentId).length,
    repliesOf: (msgs: any[], pid: string) => msgs.filter((m) => m.parentId === pid),
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

  it("posts a message with author and trimmed body", async () => {
    render(<Thread contactId="C-1" interactionId={null} meStaffId="u1" />);
    await userEvent.type(
      screen.getByPlaceholderText("Add a comment…"),
      "Great first contact",
    );
    await userEvent.click(screen.getByRole("button", { name: /Comment/ }));
    expect(addThreadMessage).toHaveBeenCalledWith(
      "C-1",
      {
        interactionId: null,
        from: "u1",
        fromName: "Tony Wang",
        kind: "comment",
        body: "Great first contact",
        scope: null,
      },
      { to: null, contactName: undefined },
    );
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
      screen.getByText("Nothing here yet — leave the first comment below."),
    ).toBeInTheDocument();
  });

  it("renders the compact empty state for the inline per-interaction variant", () => {
    render(<Thread contactId="C-1" interactionId="I-1" meStaffId="u1" compact />);
    expect(screen.getByText("No comments on this interaction yet.")).toBeInTheDocument();
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
      expect.objectContaining({ to: null }),
    );
  });

  it("allows replying to a comment like a Slack thread", async () => {
    hoisted.messages = [
      message({ id: "m1", body: "Parent comment", from: "u2" }),
    ];
    render(<Thread contactId="C-1" meStaffId="u1" />);
    await userEvent.click(screen.getByRole("button", { name: "Reply" }));
    const replyInput = screen.getByPlaceholderText("Write a reply…");
    await userEvent.type(replyInput, "Slack style reply");
    await userEvent.click(screen.getByRole("button", { name: "Reply" }));
    expect(addThreadMessage).toHaveBeenCalledWith(
      "C-1",
      expect.objectContaining({ body: "Slack style reply", parentId: "m1" }),
      expect.anything(),
    );
  });

  it("pane variant: composer follows the message list in DOM order and both sit in the pane", () => {
    hoisted.messages = [
      message({ id: "a", from: "u3", fromName: "Zion Park", body: "earliest" }),
      message({ id: "b", from: "u1", fromName: "Tony Wang", body: "newest" }),
    ];
    const { container } = render(
      <Thread contactId="C-1" interactionId={null} meStaffId="u1" pane />,
    );

    const pane = container.querySelector("[data-thread-pane]");
    expect(pane).toBeTruthy();
    const list = pane.querySelector("[data-thread-list]");
    const composer = pane.querySelector("[data-thread-composer]");
    expect(list).toBeTruthy();
    expect(composer).toBeTruthy();
    // DOM order: list before composer so flex column lays them out as a fill.
    expect(
      list.compareDocumentPosition(composer) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("pane variant: does not wrap composer after the list when messages render in flow", () => {
    // Guards against the original #762 regression where the composer sat
    // below every message and forced the user to scroll back down to reply.
    hoisted.messages = [
      message({ id: "a", from: "u3", fromName: "Zion Park", body: "first" }),
      message({ id: "b", from: "u3", fromName: "Zion Park", body: "second" }),
    ];
    const { container } = render(
      <Thread contactId="C-1" interactionId={null} meStaffId="u1" pane />,
    );

    const pane = container.querySelector("[data-thread-pane]");
    expect(pane).toBeTruthy();
    // The composer must be a direct child of the pane, not nested inside the
    // list — that way the pane's flex layout can pin the composer to its
    // bottom while the list scrolls.
    const composer = pane.querySelector("[data-thread-composer]");
    expect(pane.contains(composer)).toBe(true);
    expect(composer.parentElement === pane).toBe(true);
  });

  it("pane variant renders messages oldest-first, matching useThreads' order", () => {
    // #780 styled the pane list `flex-direction: column-reverse`, which
    // reversed an already-oldest-first array and made Discussion and Follow up
    // read backwards. DOM order is the seam that survives the CSS fix.
    hoisted.messages = [
      message({ id: "a", body: "oldest" }),
      message({ id: "b", body: "middle" }),
      message({ id: "c", body: "newest" }),
    ];
    const { container } = render(
      <Thread contactId="C-1" interactionId={null} meStaffId="u1" pane />,
    );

    const list = container.querySelector("[data-thread-list]");
    const bodies = [...list.textContent.matchAll(/oldest|middle|newest/g)].map((m) => m[0]);
    expect(bodies).toEqual(["oldest", "middle", "newest"]);
  });

  it("pane variant opens scrolled to the newest message", () => {
    // The pane's whole point is that you land on what the team said last.
    // jsdom reports scrollHeight 0, so stub it to the height a real scroller
    // would have.
    const desc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollHeight");
    Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
      configurable: true,
      get: () => 900,
    });
    try {
      hoisted.messages = [
        message({ id: "a", body: "oldest" }),
        message({ id: "b", body: "newest" }),
      ];
      const { container } = render(
        <Thread contactId="C-1" interactionId={null} meStaffId="u1" pane />,
      );
      const list = container.querySelector("[data-thread-list]") as HTMLElement;
      expect(list.scrollTop).toBe(900);
    } finally {
      if (desc) Object.defineProperty(HTMLElement.prototype, "scrollHeight", desc);
      else delete (HTMLElement.prototype as any).scrollHeight;
    }
  });

  it("the default variant does not scroll itself", () => {
    // Only the fill panes own their scroll; the flow call sites ride the
    // page's single content scroller and must not be yanked.
    const desc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollHeight");
    Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
      configurable: true,
      get: () => 900,
    });
    try {
      hoisted.messages = [message({ id: "a", body: "oldest" })];
      const { container } = render(
        <Thread contactId="C-1" interactionId={null} meStaffId="u1" />,
      );
      const list = container.querySelector("[data-thread-list]") as HTMLElement;
      expect(list.scrollTop).toBe(0);
    } finally {
      if (desc) Object.defineProperty(HTMLElement.prototype, "scrollHeight", desc);
      else delete (HTMLElement.prototype as any).scrollHeight;
    }
  });

  it("compact variant keeps its tighter message spacing", () => {
    // #780 moved `space-y-3` off the list and onto the composer, where it does
    // nothing; the nested-in-an-interaction-row list silently widened to
    // space-y-4.
    hoisted.messages = [
      message({ id: "a", interactionId: "I-1", body: "one" }),
      message({ id: "b", interactionId: "I-1", body: "two" }),
    ];
    const { container } = render(
      <Thread contactId="C-1" interactionId="I-1" meStaffId="u1" compact />,
    );
    const list = container.querySelector("[data-thread-list]") as HTMLElement;
    expect(list.className).toContain("space-y-3");
    expect(list.className).not.toContain("space-y-4");
  });

  it("compact variant does not opt into pane layout (must remain unchanged)", () => {
    const { container } = render(
      <Thread contactId="C-1" interactionId="I-1" meStaffId="u1" compact />,
    );
    expect(container.querySelector("[data-thread-pane]")).toBeNull();
  });

  it("shows mention autocomplete on typing @ and includes mentionedUserIds on post", async () => {
    const teamMembers = [
      { id: "u2", name: "Zion Park", role: "Trainee", initials: "ZP" },
      { id: "u3", name: "Rio Tan", role: "Full-timer", initials: "RT" },
    ];

    render(
      <Thread
        contactId="C-1"
        meStaffId="u1"
        teamMembers={teamMembers}
        contactStakeholders={{ createdBy: "u2" }}
      />,
    );

    const input = screen.getByPlaceholderText("Add a comment…");
    await userEvent.type(input, "Hey @Zio");

    // Autocomplete listbox should appear
    expect(screen.getByRole("listbox", { name: "Teammate mentions" })).toBeInTheDocument();
    expect(screen.getByText("Zion Park")).toBeInTheDocument();

    // Click candidate
    await userEvent.click(screen.getByText("Zion Park"));

    // Autocomplete inserts name with trailing space and closes listbox
    expect(input).toHaveValue("Hey @Zion Park ");
    expect(screen.queryByRole("listbox", { name: "Teammate mentions" })).toBeNull();

    // Submit comment
    await userEvent.click(screen.getByRole("button", { name: /Comment/ }));

    expect(addThreadMessage).toHaveBeenCalledWith(
      "C-1",
      expect.objectContaining({
        body: "Hey @Zion Park",
        mentionedUserIds: ["u2"],
      }),
      expect.objectContaining({
        stakeholders: { createdBy: "u2" },
      }),
    );
  });
});

