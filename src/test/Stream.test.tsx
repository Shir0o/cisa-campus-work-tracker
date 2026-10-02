import React from "react";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import Stream from "../components/stream/Stream";
import type { StreamAdapter, StreamSourceMessage } from "../components/stream/types";

// The stream component is driven only through its adapter (ADR 0033 §6), so
// every test here hands it a fake one and watches what it draws and calls.

const DAY = 86_400_000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const yesterdayAt = (h: number, m = 0) => {
  const d = new Date(Date.now() - DAY);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};

let seq = 0;
const message = (over: Partial<StreamSourceMessage>): StreamSourceMessage => {
  seq += 1;
  return {
    id: `m${seq}`,
    parentId: null,
    from: "josh",
    fromName: "Josh Park",
    kind: "comment",
    body: "body",
    at: yesterdayAt(9),
    ...over,
  };
};

function fakeAdapter(over: Partial<StreamAdapter> = {}): StreamAdapter {
  return {
    messages: [],
    name: "Conversation",
    where: "Conversation · Daniel Reyes",
    audience: "Everyone tied to Daniel sees this.",
    askAudience: "Everyone tied to Daniel sees this and can say they followed up.",
    capabilities: { kinds: true, attachments: false, canPost: true, canReply: true },
    mentionCandidates: [
      { uid: "josh", name: "Josh Park", role: "Trainee" },
      { uid: "grace", name: "Grace Liu", role: "Full-timer" },
    ],
    post: vi.fn(),
    reply: vi.fn(),
    closeAsk: vi.fn(),
    delete: vi.fn(),
    ...over,
  };
}

const MARIA = { uid: "maria", name: "Maria Santos", role: "manager" };
const RUTH_FT = { uid: "ruth", name: "Ruth Chen", role: "admin" };

function renderStream(adapter: StreamAdapter, props: Partial<React.ComponentProps<typeof Stream>> = {}) {
  return render(<Stream adapter={adapter} viewer={MARIA} threadMode="replace" {...props} />);
}

const row = (text: string) => screen.getByText(text).closest("[data-stream-row]") as HTMLElement;

describe("Stream — rows (G1–G5)", () => {
  it("draws each message as a row: name, time and body; a burst continues without repeating the name", () => {
    renderStream(
      fakeAdapter({
        messages: [
          message({ id: "a", from: "josh", fromName: "Josh Park", body: "first", at: yesterdayAt(9, 0) }),
          message({ id: "b", from: "josh", fromName: "Josh Park", body: "second", at: yesterdayAt(9, 3) }),
          message({ id: "c", from: "grace", fromName: "Grace Liu", body: "third", at: yesterdayAt(9, 4) }),
        ],
      }),
    );
    expect(screen.getAllByText("Josh Park")).toHaveLength(1);
    expect(screen.getByText("Grace Liu")).toBeInTheDocument();
    expect(within(row("first")).getByText("Josh Park")).toBeInTheDocument();
    expect(within(row("second")).queryByText("Josh Park")).toBeNull();
  });

  it("left-aligns your own messages under your own name, like everyone else's", () => {
    renderStream(
      fakeAdapter({
        messages: [
          message({ from: "maria", fromName: "Maria Santos", body: "mine", at: yesterdayAt(9) }),
          message({ from: "josh", fromName: "Josh Park", body: "theirs", at: yesterdayAt(10) }),
        ],
      }),
    );
    expect(screen.queryByText("You")).toBeNull();
    const mine = row("mine");
    const theirs = row("theirs");
    expect(within(mine).getByText("Maria Santos")).toBeInTheDocument();
    // Same layout either way: the avatar comes first, then the body.
    expect(mine.firstElementChild?.getAttribute("data-stream-avatar")).not.toBeNull();
    expect(theirs.firstElementChild?.getAttribute("data-stream-avatar")).not.toBeNull();
    expect(mine.className).toBe(theirs.className);
  });

  it("divides the days: Yesterday, then Today", () => {
    renderStream(
      fakeAdapter({
        messages: [message({ body: "then", at: yesterdayAt(9) }), message({ body: "now", at: ago(60_000) })],
      }),
    );
    const dividers = screen.getAllByRole("separator").map((s) => s.textContent);
    expect(dividers).toEqual(["Yesterday", "Today"]);
  });

  it("says so when the stream is empty", () => {
    renderStream(fakeAdapter({ empty: "Nothing here yet — leave the first comment below." }));
    expect(screen.getByText("Nothing here yet — leave the first comment below.")).toBeInTheDocument();
  });

  it("highlights an @mention of a candidate in the body", () => {
    renderStream(fakeAdapter({ messages: [message({ body: "@Grace Liu can you sit with him?" })] }));
    expect(screen.getByText("@Grace Liu")).toHaveAttribute("data-stream-mention");
  });

  it("highlights a hand-typed @Firstname of a candidate too, in any case — but not a longer word", () => {
    renderStream(
      fakeAdapter({
        messages: [
          message({ id: "a", body: "@Grace can you sit with him?" }),
          message({ id: "b", body: "ask @josh first", at: yesterdayAt(10) }),
          message({ id: "c", body: "@Graceful exit", at: yesterdayAt(11) }),
        ],
      }),
    );
    expect(screen.getByText("@Grace")).toHaveAttribute("data-stream-mention");
    expect(screen.getByText("@josh")).toHaveAttribute("data-stream-mention");
    expect(row("@Graceful exit").querySelector("[data-stream-mention]")).toBeNull();
  });
});

describe("Stream — the hover toolbar (G7)", () => {
  it("Make a to-do hands the message to the surface", () => {
    const onMakeTodo = vi.fn();
    const m = message({ body: "text him" });
    renderStream(fakeAdapter({ messages: [m] }), { onMakeTodo });
    fireEvent.click(within(row("text him")).getByRole("button", { name: "Make a to-do" }));
    expect(onMakeTodo).toHaveBeenCalledWith(m);
  });

  it("Add to story hands the message to the surface", () => {
    const onAddToStory = vi.fn();
    const m = message({ body: "she came to the appointment" });
    renderStream(fakeAdapter({ messages: [m] }), { onAddToStory });
    fireEvent.click(within(row("she came to the appointment")).getByRole("button", { name: "Add to story" }));
    expect(onAddToStory).toHaveBeenCalledWith(m);
  });

  it("offers Remove from story once the message is in the story, and takes it back out", () => {
    const onAddToStory = vi.fn();
    const m = message({ id: "m1", body: "in the story" });
    renderStream(fakeAdapter({ messages: [m] }), { onAddToStory, storyMessageIds: new Set(["m1"]) });
    fireEvent.click(within(row("in the story")).getByRole("button", { name: "Remove from story" }));
    expect(onAddToStory).toHaveBeenCalledWith(m);
    expect(within(row("in the story")).queryByRole("button", { name: "Add to story" })).toBeNull();
  });

  it("offers no Add to story where the surface does not", () => {
    renderStream(fakeAdapter({ messages: [message({ body: "no story here" })] }));
    expect(screen.queryByRole("button", { name: "Add to story" })).toBeNull();
  });

  it("More → Delete removes your own message", () => {
    const adapter = fakeAdapter({ messages: [message({ id: "mine", from: "maria", body: "oops" })] });
    renderStream(adapter);
    fireEvent.click(within(row("oops")).getByRole("button", { name: "More actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete message" }));
    expect(adapter.delete).toHaveBeenCalledWith(expect.objectContaining({ id: "mine" }));
  });

  it("offers no Delete on someone else's message to a Trainee, but does to a Full-timer", () => {
    const adapter = fakeAdapter({ messages: [message({ from: "josh", body: "his" })] });
    const { unmount } = renderStream(adapter);
    fireEvent.click(within(row("his")).getByRole("button", { name: "More actions" }));
    expect(screen.queryByRole("menuitem", { name: "Delete message" })).toBeNull();
    unmount();

    renderStream(adapter, { viewer: RUTH_FT });
    fireEvent.click(within(row("his")).getByRole("button", { name: "More actions" }));
    expect(screen.getByRole("menuitem", { name: "Delete message" })).toBeInTheDocument();
  });

  it("a parent whose replies remain cannot be deleted until they are gone", () => {
    renderStream(
      fakeAdapter({
        messages: [
          message({ id: "p", from: "maria", body: "parent" }),
          message({ id: "r", parentId: "p", from: "josh", body: "reply", at: yesterdayAt(10) }),
        ],
      }),
    );
    fireEvent.click(within(row("parent")).getByRole("button", { name: "More actions" }));
    expect(screen.queryByRole("menuitem", { name: "Delete message" })).toBeNull();
  });

  it("Reply in thread opens the Thread and posts the reply to that parent", async () => {
    const adapter = fakeAdapter({ messages: [message({ id: "p", body: "parent" })] });
    renderStream(adapter);
    fireEvent.click(within(row("parent")).getByRole("button", { name: "Reply in thread" }));
    const box = screen.getByPlaceholderText("Reply…");
    await userEvent.type(box, "On it");
    fireEvent.click(screen.getByRole("button", { name: "Reply" }));
    expect(adapter.reply).toHaveBeenCalledWith(expect.objectContaining({ id: "p" }), {
      body: "On it",
      mentionedUserIds: [],
    });
  });
});

describe("Stream — Threads (T1–T3)", () => {
  const withReplies = () =>
    fakeAdapter({
      messages: [
        message({ id: "p", from: "josh", body: "I'll sit with him Thursday.", at: yesterdayAt(11) }),
        message({ id: "r1", parentId: "p", from: "maria", fromName: "Maria Santos", body: "Perfect", at: yesterdayAt(11, 20) }),
        message({ id: "r2", parentId: "p", from: "grace", fromName: "Grace Liu", body: "I can drive", at: ago(60_000) }),
      ],
    });

  it("a parent with replies carries a chip: faces, count, and when the last one came", () => {
    renderStream(withReplies());
    const chip = within(row("I'll sit with him Thursday.")).getByRole("button", { name: /2 replies/ });
    expect(chip).toHaveTextContent("Last reply");
    expect(within(chip).getByText("MS")).toBeInTheDocument();
    expect(within(chip).getByText("GL")).toBeInTheDocument();
    // Replies live in the Thread, not the stream.
    expect(screen.queryByText("Perfect")).toBeNull();
  });

  it("in a narrow container the Thread replaces the stream, says where it lives, and goes back", () => {
    renderStream(withReplies(), { header: <h3>Conversation</h3> });
    fireEvent.click(screen.getByRole("button", { name: /2 replies/ }));

    expect(screen.queryByRole("heading", { name: "Conversation" })).toBeNull();
    const thread = screen.getByRole("region", { name: "Thread" });
    expect(within(thread).getByText("in Conversation · Daniel Reyes")).toBeInTheDocument();
    expect(within(thread).getByText("I'll sit with him Thursday.")).toBeInTheDocument();
    expect(within(thread).getByText("Perfect")).toBeInTheDocument();
    expect(within(thread).getByText("I can drive")).toBeInTheDocument();

    fireEvent.click(within(thread).getByRole("button", { name: "Back to Conversation" }));
    expect(screen.queryByRole("region", { name: "Thread" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Conversation" })).toBeInTheDocument();
  });

  it("in a wide container the Thread opens beside the stream and marks its parent's chip", () => {
    renderStream(withReplies(), { threadMode: "beside", header: <h3>Conversation</h3> });
    const chip = screen.getByRole("button", { name: /2 replies/ });
    expect(chip).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(chip);

    expect(screen.getByRole("heading", { name: "Conversation" })).toBeInTheDocument();
    const thread = screen.getByRole("region", { name: "Thread" });
    expect(within(thread).queryByRole("button", { name: "Back to Conversation" })).toBeNull();
    expect(screen.getByRole("button", { name: /2 replies/ })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(within(thread).getByRole("button", { name: "Close Thread" }));
    expect(screen.queryByRole("region", { name: "Thread" })).toBeNull();
  });

  it("the Thread's close shuts the whole surface when it replaced the stream", () => {
    const onClose = vi.fn();
    renderStream(withReplies(), { onClose });
    fireEvent.click(screen.getByRole("button", { name: /2 replies/ }));
    fireEvent.click(within(screen.getByRole("region", { name: "Thread" })).getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("offers no reply box where the viewer may not reply", () => {
    renderStream(fakeAdapter({ ...withReplies(), capabilities: { kinds: true, attachments: false, canPost: true, canReply: false } }));
    expect(screen.queryByRole("button", { name: "Reply in thread" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /2 replies/ }));
    expect(screen.queryByPlaceholderText("Reply…")).toBeNull();
  });
});

describe("Stream — kinds and Follow-up asks (K1–K3)", () => {
  const openAsk = (over: Partial<StreamSourceMessage> = {}) =>
    message({ id: "ask", kind: "nudge", from: "maria", fromName: "Maria Santos", body: "Can someone text Daniel?", at: yesterdayAt(16, 40), ...over });

  it("tags a Question and a Follow-up ask beside the author's name", () => {
    renderStream(
      fakeAdapter({
        messages: [openAsk(), message({ kind: "question", from: "grace", fromName: "Grace Liu", body: "Roommate?", at: ago(60_000) })],
      }),
    );
    expect(within(row("Roommate?")).getByText("Question")).toBeInTheDocument();
    expect(within(row("Can someone text Daniel?")).getByText("Follow-up ask")).toBeInTheDocument();
  });

  it("the asker sees how long it has been open, I followed up and Never mind, and each closes the ask", () => {
    const adapter = fakeAdapter({ messages: [openAsk()] });
    renderStream(adapter);
    const ask = row("Can someone text Daniel?");
    expect(within(ask).getByText("Open 1 day")).toBeInTheDocument();

    fireEvent.click(within(ask).getByRole("button", { name: "I followed up" }));
    expect(adapter.closeAsk).toHaveBeenLastCalledWith(expect.objectContaining({ id: "ask" }), "followedUp");

    fireEvent.click(within(ask).getByRole("button", { name: "Never mind" }));
    expect(adapter.closeAsk).toHaveBeenLastCalledWith(expect.objectContaining({ id: "ask" }), "neverMind");
  });

  it("anyone else tied gets I followed up but never Never mind", () => {
    renderStream(fakeAdapter({ messages: [openAsk()] }), { viewer: RUTH_FT });
    const ask = row("Can someone text Daniel?");
    expect(within(ask).getByRole("button", { name: "I followed up" })).toBeInTheDocument();
    expect(within(ask).queryByRole("button", { name: "Never mind" })).toBeNull();
  });

  it("a followed-up ask says who and when; a withdrawn one says the asker withdrew it", () => {
    renderStream(
      fakeAdapter({
        messages: [
          openAsk({ id: "done", body: "done ask", closedBy: "josh", closedByName: "Josh Park", closedAt: ago(2 * 3_600_000) }),
          openAsk({ id: "gone", body: "gone ask", closedBy: "maria", closedByName: "Maria Santos", closedAt: ago(3_600_000) }),
        ],
      }),
    );
    expect(within(row("done ask")).getByText(/Josh Park followed up · /)).toBeInTheDocument();
    expect(within(row("gone ask")).getByText(/Maria Santos withdrew this · /)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "I followed up" })).toBeNull();
  });
});

describe("Stream — the composer (C1–C3)", () => {
  it("puts the audience above the box and posts a comment on ⌘/Ctrl+Enter", async () => {
    const adapter = fakeAdapter();
    renderStream(adapter);
    expect(screen.getByText("Everyone tied to Daniel sees this.")).toBeInTheDocument();
    const box = screen.getByPlaceholderText("Write something…");
    await userEvent.type(box, "  Saw him at lunch  ");
    fireEvent.keyDown(box, { key: "Enter", ctrlKey: true });
    expect(adapter.post).toHaveBeenCalledWith({ body: "Saw him at lunch", kind: "comment", mentionedUserIds: [] });
    expect(box).toHaveValue("");
  });

  it("offers kind chips inside the box; the ask chip changes the placeholder, the audience and what is posted", async () => {
    const adapter = fakeAdapter();
    renderStream(adapter);
    const kinds = screen.getByRole("group", { name: "What are you writing" });
    fireEvent.click(within(kinds).getByRole("button", { name: "Ask a follow-up" }));
    expect(within(kinds).getByRole("button", { name: "Ask a follow-up" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Everyone tied to Daniel sees this and can say they followed up.")).toBeInTheDocument();
    const box = screen.getByPlaceholderText(/What wants doing/);
    await userEvent.type(box, "Text him about Thursday");
    fireEvent.click(screen.getByRole("button", { name: "Post" }));
    expect(adapter.post).toHaveBeenCalledWith({ body: "Text him about Thursday", kind: "nudge", mentionedUserIds: [] });
    // Back to a comment for the next one.
    expect(within(kinds).getByRole("button", { name: "Comment" })).toHaveAttribute("aria-pressed", "true");
  });

  it("shows no kind chips where the adapter allows no kinds", () => {
    renderStream(fakeAdapter({ capabilities: { kinds: false, attachments: false, canPost: true, canReply: true } }));
    expect(screen.queryByRole("group", { name: "What are you writing" })).toBeNull();
  });

  it("shows no composer where the viewer may not post", () => {
    renderStream(fakeAdapter({ capabilities: { kinds: true, attachments: false, canPost: false, canReply: false } }));
    expect(screen.queryByRole("button", { name: "Post" })).toBeNull();
  });

  it("offers the adapter's mention candidates, Enter picks one, and the post carries who was mentioned", async () => {
    const adapter = fakeAdapter();
    renderStream(adapter);
    const box = screen.getByPlaceholderText("Write something…");
    await userEvent.type(box, "Ask @Gr");
    const list = screen.getByRole("listbox", { name: "Teammate mentions" });
    expect(within(list).queryByText("Josh Park")).toBeNull();
    fireEvent.keyDown(box, { key: "Enter" });
    expect(box).toHaveValue("Ask @Grace Liu ");
    await userEvent.type(box, "about it");
    fireEvent.keyDown(box, { key: "Enter", metaKey: true });
    expect(adapter.post).toHaveBeenCalledWith({ body: "Ask @Grace Liu about it", kind: "comment", mentionedUserIds: ["grace"] });
  });

  it("drops a mention whose name was edited out before posting (ADR 0007)", async () => {
    const adapter = fakeAdapter();
    renderStream(adapter);
    const box = screen.getByPlaceholderText("Write something…");
    await userEvent.type(box, "@Gr");
    fireEvent.keyDown(box, { key: "Enter" });
    fireEvent.change(box, { target: { value: "never mind Grace" } });
    fireEvent.keyDown(box, { key: "Enter", ctrlKey: true });
    expect(adapter.post).toHaveBeenCalledWith({ body: "never mind Grace", kind: "comment", mentionedUserIds: [] });
  });

  it("the @ button starts a mention", async () => {
    renderStream(fakeAdapter());
    fireEvent.click(screen.getByRole("button", { name: "Mention someone" }));
    expect(screen.getByPlaceholderText("Write something…")).toHaveValue("@");
    expect(screen.getByRole("listbox", { name: "Teammate mentions" })).toBeInTheDocument();
  });
});

// Optional adapter capabilities a source can opt into (Your notes' Follow-ups
// were the first): editing your own message, confirmed writes, a footer line,
// the composer's own words. A source that sets none of them reads as before.
describe("Stream — optional adapter capabilities", () => {
  const mine = () => message({ id: "mine", from: "maria", fromName: "Maria Santos", body: "my words" });
  const editable = (over: Partial<StreamAdapter> = {}) =>
    fakeAdapter({
      messages: [mine(), message({ id: "his", from: "josh", body: "his words" })],
      edit: vi.fn(() => Promise.resolve()),
      canEdit: (m) => m.from === "maria",
      failure: { post: "That didn't send.", edit: "That didn't save." },
      ...over,
    });

  it("offers Edit only where the adapter says the viewer may, and no Edit at all without an edit capability", () => {
    const { unmount } = renderStream(editable());
    expect(within(row("my words")).getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(within(row("his words")).queryByRole("button", { name: "Edit" })).toBeNull();
    unmount();
    renderStream(fakeAdapter({ messages: [mine()] }));
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
  });

  it("saves an edit through the adapter and closes the editor", async () => {
    const adapter = editable();
    renderStream(adapter);
    fireEvent.click(within(row("my words")).getByRole("button", { name: "Edit" }));
    const box = screen.getByRole("textbox", { name: "Edit message" });
    expect(box).toHaveValue("my words");
    await userEvent.clear(box);
    await userEvent.type(box, "better words");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(adapter.edit).toHaveBeenCalledWith(expect.objectContaining({ id: "mine" }), "better words");
    await waitFor(() => expect(screen.queryByRole("button", { name: "Save" })).toBeNull());
  });

  it("Cancel leaves the message alone and never calls the adapter", async () => {
    const adapter = editable();
    renderStream(adapter);
    fireEvent.click(within(row("my words")).getByRole("button", { name: "Edit" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Edit message" }), " extra");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(adapter.edit).not.toHaveBeenCalled();
    expect(screen.getByText("my words")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });

  it("says so, and keeps the editor open, when the edit fails", async () => {
    const adapter = editable({ edit: vi.fn(() => Promise.reject(new Error("500"))) });
    renderStream(adapter);
    fireEvent.click(within(row("my words")).getByRole("button", { name: "Edit" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Edit message" }), "!");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That didn't save.");
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("marks an edited message Edited, whoever wrote it", () => {
    renderStream(
      fakeAdapter({
        messages: [
          message({ from: "josh", body: "fixed", editedAt: ago(1000) }),
          message({ from: "josh", body: "untouched", at: yesterdayAt(12) }),
        ],
      }),
    );
    expect(within(row("fixed")).getByText("Edited")).toBeInTheDocument();
    expect(within(row("untouched")).queryByText("Edited")).toBeNull();
  });

  it("draws a message's own initials in its avatar when the source gives them, else the name's", () => {
    renderStream(
      fakeAdapter({
        messages: [
          message({ from: "team", fromName: "The team", initials: "T", body: "from us" }),
          message({ from: "josh", fromName: "Josh Park", body: "from him", at: yesterdayAt(12) }),
        ],
      }),
    );
    expect(row("from us").querySelector("[data-stream-avatar]")).toHaveTextContent(/^T$/);
    expect(row("from him").querySelector("[data-stream-avatar]")).toHaveTextContent(/^JP$/);
  });

  it("hides Delete where the adapter says nothing here can be deleted, even for the author", () => {
    renderStream(fakeAdapter({ messages: [mine()], canDelete: () => false }));
    fireEvent.click(within(row("my words")).getByRole("button", { name: "More actions" }));
    expect(screen.queryByRole("menuitem", { name: "Delete message" })).toBeNull();
  });

  it("draws the adapter's footer under the composer, and the composer's own words", () => {
    renderStream(
      fakeAdapter({
        composer: { placeholder: "Ask a follow-up…", label: "Ask a follow-up", submitLabel: "Send", hint: "⌘↵ to send" },
        capabilities: { kinds: false, attachments: false, canPost: true, canReply: false },
      }),
      { footer: <p>Replies are public.</p> },
    );
    const box = screen.getByPlaceholderText("Ask a follow-up…");
    expect(screen.getByRole("textbox", { name: "Ask a follow-up" })).toBe(box);
    expect(screen.getByRole("button", { name: "Send" })).toBeInTheDocument();
    expect(screen.getByText("⌘↵ to send")).toBeInTheDocument();
    const footer = screen.getByText("Replies are public.");
    expect(box.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("keeps the draft and says so when a confirmed post fails; clears it once a post lands", async () => {
    const post = vi.fn().mockRejectedValueOnce(new Error("500")).mockResolvedValueOnce(undefined);
    renderStream(
      fakeAdapter({
        post,
        failure: { post: "That didn't send.", edit: "That didn't save." },
        capabilities: { kinds: false, attachments: false, canPost: true, canReply: false },
        composer: { placeholder: "Ask a follow-up…" },
      }),
    );
    const box = screen.getByPlaceholderText("Ask a follow-up…");
    await userEvent.type(box, "Any news?");
    await userEvent.click(screen.getByRole("button", { name: "Post" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That didn't send.");
    expect(box).toHaveValue("Any news?");
    await userEvent.click(screen.getByRole("button", { name: "Post" }));
    await waitFor(() => expect(box).toHaveValue(""));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("offers no @ button where nobody can be mentioned", () => {
    renderStream(fakeAdapter({ mentionCandidates: [] }));
    expect(screen.queryByRole("button", { name: "Mention someone" })).toBeNull();
  });
});

describe("Stream — what a source can set (#1258)", () => {
  it("uses the adapter's own placeholder where there are no kind chips, and locks the audience line", () => {
    renderStream(
      fakeAdapter({
        capabilities: { kinds: false, attachments: false, canPost: true, canReply: true },
        composer: { placeholder: "Write something only Full-timers will see…" },
        audience: "Only Full-timers see this — Trainees can't.",
        locked: true,
      }),
    );
    expect(screen.getByPlaceholderText("Write something only Full-timers will see…")).toBeInTheDocument();
    expect(screen.getByText("Only Full-timers see this — Trainees can't.")).toBeInTheDocument();
  });

  it("marks a message just posted, even one that would have continued its author's burst", () => {
    renderStream(
      fakeAdapter({
        messages: [
          message({ id: "a", from: "maria", fromName: "Maria Santos", body: "first", at: ago(120_000) }),
          message({ id: "b", from: "maria", fromName: "Maria Santos", body: "second", at: ago(60_000) }),
        ],
      }),
      { highlightIds: new Set(["b"]) },
    );
    expect(within(row("second")).getByText("Just posted")).toBeInTheDocument();
    expect(within(row("second")).getByText("Maria Santos")).toBeInTheDocument();
    expect(within(row("first")).queryByText("Just posted")).toBeNull();
  });

  it("draws in the compact size inside a card", () => {
    const { container } = renderStream(fakeAdapter(), { compact: true });
    expect(container.querySelector(".strm.strm-compact")).toBeTruthy();
  });

  it("gives a reply box the adapter's own placeholder", () => {
    renderStream(
      fakeAdapter({
        replyPlaceholder: "Think it through together…",
        messages: [message({ id: "p", body: "parent" }), message({ id: "r", parentId: "p", body: "reply" })],
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: /1 reply/ }));
    expect(screen.getByPlaceholderText("Think it through together…")).toBeInTheDocument();
  });
});

describe("Stream — an adapter that is itself one Thread (an Interaction's)", () => {
  const PARENT = "interaction:i1";
  const interactionAdapter = (over: Partial<StreamAdapter> = {}) =>
    fakeAdapter({
      name: "Thread",
      where: "Interaction · Daniel Reyes",
      capabilities: { kinds: false, attachments: false, canPost: true, canReply: true },
      replyPlaceholder: "Think it through together…",
      empty: "No comments on this interaction yet.",
      thread: {
        parentId: PARENT,
        subtitle: "On an interaction · everyone tied to Daniel sees this.",
        quote: { label: "Josh's conversation · Thu, Sep 17", body: "Sat with Daniel at the Thursday gathering." },
      },
      messages: [
        message({ id: PARENT, from: "josh", fromName: "Josh Park", body: "Sat with Daniel at the Thursday gathering.", at: yesterdayAt(9) }),
        message({ id: "r1", parentId: PARENT, from: "maria", fromName: "Maria Santos", body: "Film photography — good second friend.", at: yesterdayAt(21) }),
      ],
      ...over,
    });

  it("opens straight on the Thread: the Interaction quoted as its parent, the replies below, no way back to a stream", () => {
    renderStream(interactionAdapter());
    const thread = screen.getByRole("region", { name: "Thread" });
    expect(within(thread).getByText("On an interaction · everyone tied to Daniel sees this.")).toBeInTheDocument();
    expect(within(thread).getByText("Josh's conversation · Thu, Sep 17")).toBeInTheDocument();
    // The quote is not a message row: only the one reply is.
    expect(thread.querySelectorAll("[data-stream-row]")).toHaveLength(1);
    expect(within(thread).getByText("Sat with Daniel at the Thursday gathering.")).toBeInTheDocument();
    expect(within(thread).getByText("1 reply")).toBeInTheDocument();
    expect(within(thread).getByText("Film photography — good second friend.")).toBeInTheDocument();
    expect(within(thread).queryByRole("button", { name: /^Back to/ })).toBeNull();
  });

  it("closes the surface, and replies to the Interaction with the adapter's placeholder", async () => {
    const adapter = interactionAdapter();
    const onClose = vi.fn();
    renderStream(adapter, { onClose });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();

    const box = screen.getByPlaceholderText("Think it through together…");
    await userEvent.type(box, "I will mention the scholarship");
    fireEvent.click(screen.getByRole("button", { name: "Reply" }));
    expect(adapter.reply).toHaveBeenCalledWith(
      expect.objectContaining({ id: PARENT }),
      { body: "I will mention the scholarship", mentionedUserIds: [] },
    );
  });

  it("says so when nobody has replied yet", () => {
    renderStream(interactionAdapter({ messages: [message({ id: PARENT, body: "Sat with Daniel." })] }));
    expect(screen.getByText("No comments on this interaction yet.")).toBeInTheDocument();
  });

  it("offers no reply box to a viewer who may not reply", () => {
    renderStream(
      interactionAdapter({ capabilities: { kinds: false, attachments: false, canPost: false, canReply: false } }),
    );
    expect(screen.queryByPlaceholderText("Think it through together…")).toBeNull();
  });
});

// The adapter's optional hooks a chat room needs (#1259). Each is generic: a
// source that leaves one out keeps the behaviour above.
describe("Stream — what a chat room adds", () => {
  const chat = (over: Partial<StreamAdapter> = {}) =>
    fakeAdapter({ capabilities: { kinds: false, attachments: true, canPost: true, canReply: true }, audience: "", ...over });

  it("holds a pinned message first under its strip, out of date order", () => {
    renderStream(
      chat({
        messages: [
          message({ id: "a", body: "older", at: yesterdayAt(9) }),
          message({ id: "b", body: "pinned one", at: yesterdayAt(10), from: "grace", fromName: "Grace Liu" }),
          message({ id: "c", body: "newer", at: ago(60_000), from: "ruth", fromName: "Ruth Chen" }),
        ],
        pinnedLabel: (m) => (m.id === "b" ? "Pinned by Grace Liu · stays at the top until they unpin it" : null),
      }),
    );
    const rows = Array.from(document.querySelectorAll("[data-stream-row]")).map((el) => el.getAttribute("data-stream-row"));
    expect(rows).toEqual(["b", "a", "c"]);
    const strip = screen.getByText("Pinned by Grace Liu · stays at the top until they unpin it");
    expect(strip.compareDocumentPosition(row("pinned one")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("a stream of only a pinned message is not empty", () => {
    renderStream(chat({ messages: [message({ id: "p", body: "only" })], pinnedLabel: () => "Pinned", empty: "Nothing yet" }));
    expect(screen.queryByText("Nothing yet")).toBeNull();
    expect(row("only")).toBeInTheDocument();
  });

  it("draws a badge beside the name, and a system notice centred rather than as a row", () => {
    renderStream(
      chat({
        messages: [
          message({ id: "n", from: "system", fromName: "System", body: "Josh joined the group", at: yesterdayAt(8) }),
          message({ id: "p", body: "post" }),
        ],
        badge: (m) => (m.id === "p" ? "Full-timer" : null),
        notice: (m) => m.from === "system",
      }),
    );
    expect(within(row("post")).getByText("Full-timer")).toBeInTheDocument();
    expect(screen.getByText("Josh joined the group")).toHaveAttribute("role", "note");
    expect(screen.queryByText("System")).toBeNull();
  });

  it("a taken-back message reads as its gone line, with no body and no actions", () => {
    renderStream(chat({ messages: [message({ id: "g", body: "secret" })], goneLabel: () => "You took this message back." }));
    expect(screen.queryByText("secret")).toBeNull();
    const gone = row("You took this message back.");
    expect(within(gone).queryByRole("toolbar")).toBeNull();
  });

  it("More carries the source's own actions, and a soft delete with its words and a confirm step", () => {
    const pin = vi.fn();
    const adapter = chat({
      messages: [message({ id: "mine", from: "maria", body: "oops" })],
      moreActions: () => [{ label: "Pin", run: pin }],
      deleteLabel: () => "Take back for everyone",
      deleteConfirm: { prompt: "Take this back?", yes: "Yes, remove it", no: "Keep it" },
    });
    renderStream(adapter);
    const more = () => fireEvent.click(within(row("oops")).getByRole("button", { name: "More actions" }));
    more();
    fireEvent.click(screen.getByRole("menuitem", { name: "Pin" }));
    expect(pin).toHaveBeenCalled();
    more();
    fireEvent.click(screen.getByRole("menuitem", { name: "Take back for everyone" }));
    expect(screen.getByText("Take this back?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: "Keep it" }));
    expect(adapter.delete).not.toHaveBeenCalled();
    expect(screen.queryByText("Take this back?")).toBeNull();
    // Keep it steps back to the menu, still open.
    fireEvent.click(screen.getByRole("menuitem", { name: "Take back for everyone" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Yes, remove it" }));
    expect(adapter.delete).toHaveBeenCalledWith(expect.objectContaining({ id: "mine" }));
  });

  it("renders the surface's extra under the body and its actions beside the Thread chip, which can open the Thread", () => {
    renderStream(
      chat({ messages: [message({ id: "p", body: "retreat" })] }),
      {
        threadMode: "beside",
        renderExtra: (m) => <span>attachment of {m.id}</span>,
        renderActions: (m, { openThread }) => (
          <button type="button" onClick={openThread}>
            Open {m.id}
          </button>
        ),
      },
    );
    expect(within(row("retreat")).getByText("attachment of p")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open p" }));
    expect(screen.getByRole("region", { name: "Thread" })).toBeInTheDocument();
  });

  it("a viewer who may not post reads the surface's footer in the composer's place", () => {
    renderStream(chat({ capabilities: { kinds: false, attachments: true, canPost: false, canReply: true } }), {
      footer: <div>Only Full-timers post here. Anyone can reply in a thread.</div>,
    });
    expect(screen.getByText("Only Full-timers post here. Anyone can reply in a thread.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Post" })).toBeNull();
  });

  it("stages files and cards above the text, each removable; the paperclip asks the source; a post may be only attachments (C5)", () => {
    const attach = vi.fn();
    const unstage = vi.fn();
    const adapter = chat({
      staged: [
        { key: "0", label: "Retreat packing list", kind: "file" },
        { key: "1", label: "Daniel Reyes", kind: "contact" },
      ],
      attach,
      unstage,
    });
    renderStream(adapter);
    fireEvent.click(screen.getByRole("button", { name: "Attach" }));
    expect(attach).toHaveBeenCalled();
    const staged = screen.getByRole("list", { name: "Staged to send" });
    expect(within(staged).getByText("Retreat packing list")).toBeInTheDocument();
    expect(within(staged).getByText("DR")).toBeInTheDocument();
    fireEvent.click(within(staged).getByRole("button", { name: "Remove Daniel Reyes" }));
    expect(unstage).toHaveBeenCalledWith("1");
    const send = screen.getByRole("button", { name: "Post" });
    expect(send).not.toBeDisabled();
    fireEvent.click(send);
    expect(adapter.post).toHaveBeenCalledWith({ body: "", kind: "comment", mentionedUserIds: [] });
  });

  it("no paperclip where the source takes no attachments", () => {
    renderStream(fakeAdapter());
    expect(screen.queryByRole("button", { name: "Attach" })).toBeNull();
  });
});

// G1 with a face (#1259): a row shows the sender's photo where the source has
// one, and falls back to initials otherwise.
describe("Stream — avatar photos", () => {
  const avatarOf = (text: string) => row(text).querySelector("[data-stream-avatar]") as HTMLElement;

  it("shows the sender's photo, decorative like the initials it replaces", () => {
    renderStream(
      fakeAdapter({
        messages: [message({ id: "a", body: "with photo" })],
        avatarUrl: (m) => (m.id === "a" ? "https://example.com/josh.jpg" : null),
      }),
    );
    const av = avatarOf("with photo");
    expect(av).toHaveAttribute("aria-hidden");
    const img = av.querySelector("img") as HTMLImageElement;
    expect(img).toHaveAttribute("src", "https://example.com/josh.jpg");
    expect(img).toHaveAttribute("alt", "");
    expect(av).not.toHaveTextContent("JP");
  });

  it("falls back to initials when there is no photo, or the image fails to load", () => {
    renderStream(
      fakeAdapter({
        messages: [
          message({ id: "none", body: "no photo", from: "grace", fromName: "Grace Liu" }),
          message({ id: "bad", body: "broken photo", from: "josh", fromName: "Josh Park", at: yesterdayAt(11) }),
        ],
        avatarUrl: (m) => (m.id === "bad" ? "https://example.com/broken.jpg" : null),
      }),
    );
    expect(avatarOf("no photo").querySelector("img")).toBeNull();
    expect(avatarOf("no photo")).toHaveTextContent("GL");
    fireEvent.error(avatarOf("broken photo").querySelector("img")!);
    expect(avatarOf("broken photo").querySelector("img")).toBeNull();
    expect(avatarOf("broken photo")).toHaveTextContent("JP");
  });

  it("a continuation still hides the avatar", () => {
    renderStream(
      fakeAdapter({
        messages: [
          message({ id: "a", body: "first", at: yesterdayAt(9, 0) }),
          message({ id: "b", body: "second", at: yesterdayAt(9, 2) }),
        ],
        avatarUrl: () => "https://example.com/josh.jpg",
      }),
    );
    expect(row("second").querySelector("[data-stream-avatar]")).toBeNull();
  });
});
