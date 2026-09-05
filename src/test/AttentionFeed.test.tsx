import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import AttentionFeed from "../components/landing/AttentionFeed";
import { __resetUserEntityStateCache } from "../lib/userEntityState";
import { InboxState, __resetInboxState } from "../lib/inboxState";
import type { Contact, Interaction } from "../types";
import type { ThreadMessageWithContact } from "../lib/threads";

vi.mock("../components/AuthProvider", () => ({
  useAuth: () => ({
    user: { uid: "u1", email: "tony@cisa.org", displayName: "Tony Wang" },
    effectiveUserId: "u1",
    role: "admin",
  }),
}));

vi.mock("../lib/firebase", () => ({
  db: {},
  auth: { currentUser: { uid: "u1" } },
  handleFirestoreError: vi.fn(),
  OperationType: { READ: "read", WRITE: "write", LIST: "list", CREATE: "create", UPDATE: "update" },
}));

const addThreadMessage = vi.fn(async () => {});
const closeFollowUpAsk = vi.fn(async () => {});
const reopenFollowUpAsk = vi.fn(async () => {});

vi.mock("../lib/threads", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/threads")>();
  return {
    ...actual,
    addThreadMessage: (...args: unknown[]) => addThreadMessage(...(args as [])),
    closeFollowUpAsk: (...args: unknown[]) => closeFollowUpAsk(...(args as [])),
    reopenFollowUpAsk: (...args: unknown[]) => reopenFollowUpAsk(...(args as [])),
    subscribeAllThreads: () => () => {},
  };
});

// ── The feed is the worklist (#813) ─────────────────────────────────────────
// The two axes are the whole point: opening something must never make the
// count fall, and the completion verb has to fit what the card is about.

describe("AttentionFeed — the feed as a worklist (#813)", () => {
  const uid = "u1";

  beforeEach(() => {
    localStorage.clear();
    __resetUserEntityStateCache();
    __resetInboxState();
    vi.clearAllMocks();
  });

  const contact = (over: Partial<Contact> = {}): Contact =>
    ({
      id: "c1",
      name: "Alex Johnson",
      createdBy: "u3",
      createdAt: new Date().toISOString(),
      stage: "Freshman Contact",
      owner: "u3",
      ...over,
    }) as Contact;

  const sampleContacts: Contact[] = [contact()];

  const sampleInteractions: Interaction[] = [
    {
      id: "i1",
      contactId: "c1",
      userId: "u3",
      content: "Met at library for study session",
      createdAt: new Date().toISOString(),
      dateTime: new Date().toISOString(),
      type: "meetup",
      title: "Study session",
    } as unknown as Interaction,
  ];

  const question: ThreadMessageWithContact = {
    id: "t1",
    contactId: "c1",
    from: "u3",
    fromName: "Zion",
    kind: "question",
    body: "How should we follow up with Alex?",
    at: new Date().toISOString(),
    interactionId: null,
    reactions: [],
  };

  const feed = (props: Partial<React.ComponentProps<typeof AttentionFeed>> = {}) =>
    render(
      <AttentionFeed
        contacts={sampleContacts}
        interactions={sampleInteractions}
        threads={[question]}
        staffNameMap={{ u3: "Zion" }}
        {...props}
      />,
    );

  const header = () => screen.getByRole("heading", { name: "What's new" }).parentElement!;

  it("counts what is left to work through, not what is unread", () => {
    feed();
    expect(screen.getByRole("region", { name: "On you" })).toBeInTheDocument();
    expect(screen.getByText("Alex Johnson")).toBeInTheDocument();
    expect(within(header()).getByText("1 to work through")).toBeInTheDocument();
  });

  it("groups new people ahead of everything else", () => {
    render(
      <AttentionFeed
        contacts={[contact(), contact({ id: "c2", name: "Bo Chen", owner: "u1" })]}
        interactions={[]}
        threads={[{ ...question, id: "t2", contactId: "c2" }]}
        staffNameMap={{ u3: "Zion" }}
      />,
    );
    const labels = screen.getAllByText(/New people|Everything else/).map((n) => n.textContent);
    expect(labels[0]).toBe("New people");
  });

  // The bug this PR exists to fix.
  it("opening the person marks it seen WITHOUT lowering the count", () => {
    const onOpenContact = vi.fn();
    feed({ onOpenContact });

    expect(within(header()).getByText("1 to work through")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Alex Johnson"));

    expect(onOpenContact).toHaveBeenCalledWith(expect.objectContaining({ id: "c1" }), {
      tab: undefined,
    });
    expect(InboxState.isSeen(uid, "att:contact:c1")).toBe(true);
    expect(InboxState.isCompleted(uid, "att:contact:c1")).toBe(false);
    expect(within(header()).getByText("1 to work through")).toBeInTheDocument();
  });

  // The dot is derived inside a memo, so the store changing has to reach it.
  it("clears the accent dot as soon as the person is opened", () => {
    const { container } = feed({ onOpenContact: vi.fn() });
    const dots = () => container.querySelectorAll(".bg-accent.rounded-full");
    expect(dots().length).toBe(1);

    fireEvent.click(screen.getByText("Alex Johnson"));
    expect(dots().length).toBe(0);
  });

  it("'Mark all seen' touches the seen axis only", () => {
    feed();
    fireEvent.click(screen.getByText("Mark all seen"));

    expect(InboxState.isSeen(uid, "att:contact:c1")).toBe(true);
    expect(InboxState.isCompleted(uid, "att:contact:c1")).toBe(false);
    // Still to work through — nobody claimed to have reviewed anyone.
    expect(within(header()).getByText("1 to work through")).toBeInTheDocument();
  });

  it("greys a completed card in place and offers an Undo, rather than vanishing it", () => {
    feed();
    fireEvent.click(screen.getByRole("button", { name: /Answered/ }));

    expect(InboxState.isCompleted(uid, "att:contact:c1")).toBe(true);
    // Still on screen, under the cursor where it was.
    expect(screen.getByText("Alex Johnson")).toBeInTheDocument();
    expect(within(header()).queryByText("1 to work through")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(InboxState.isCompleted(uid, "att:contact:c1")).toBe(false);
    expect(within(header()).getByText("1 to work through")).toBeInTheDocument();
  });

  it("clears completed work on the next visit", () => {
    const { unmount } = feed();
    fireEvent.click(screen.getByRole("button", { name: /Answered/ }));
    unmount();

    feed();
    expect(screen.queryByText("Alex Johnson")).not.toBeInTheDocument();
  });

  describe("the verb fits the item", () => {
    // `mine` is created by u1, so it contributes no "somebody added them" item
    // of its own — the card is about the thread and nothing else.
    const mine = contact({ createdBy: "u1", owner: "u1" });

    const cases: Array<[string, ThreadMessageWithContact[], string]> = [
      ["a question is Answered", [question], "Answered"],
      [
        "a follow-up ask is I followed up",
        [{ ...question, id: "t_nudge", kind: "nudge", body: "Could someone text Tomas?" }],
        "I followed up",
      ],
      [
        "a note is Got it",
        [{ ...question, id: "t_note", kind: "note", body: "Sam left a note" }],
        "Got it",
      ],
      [
        "a comment is Got it",
        [{ ...question, id: "t_com", kind: "comment", body: "Sam wrote back" }],
        "Got it",
      ],
    ];

    for (const [name, threads, verb] of cases) {
      it(name, () => {
        render(
          <AttentionFeed
            contacts={[mine]}
            interactions={[]}
            threads={threads}
            staffNameMap={{ u3: "Zion" }}
          />,
        );
        expect(screen.getByRole("button", { name: new RegExp(verb) })).toBeInTheDocument();
      });
    }

    it("a contact nobody has written about is Reviewed", () => {
      render(
        <AttentionFeed contacts={sampleContacts} interactions={[]} threads={[]} staffNameMap={{ u3: "Zion" }} />,
      );
      expect(screen.getByRole("button", { name: /Reviewed/ })).toBeInTheDocument();
    });

    it("a to-do offers no button — it already owns its own done state", () => {
      render(
        <AttentionFeed
          contacts={[]}
          interactions={[]}
          threads={[]}
          tasks={[{ id: "todo1", title: "Ring the hall", status: "pending", assigneeId: "u1" }]}
          staffNameMap={{}}
        />,
      );
      expect(screen.queryByRole("button", { name: /Reviewed|Got it|Answered|I followed up/ })).toBeNull();
    });
  });

  it("closes the follow-up ask for everyone when 'I followed up' is pressed", () => {
    render(
      <AttentionFeed
        contacts={[contact({ createdBy: "u1", owner: "u1" })]}
        interactions={[]}
        threads={[{ ...question, id: "t_nudge", kind: "nudge", body: "Could someone text Alex?" }]}
        staffNameMap={{ u3: "Zion" }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /I followed up/ }));
    expect(closeFollowUpAsk).toHaveBeenCalledWith("c1", "t_nudge", {
      uid: "u1",
      name: "Tony Wang",
    });

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(reopenFollowUpAsk).toHaveBeenCalledWith("c1", "t_nudge");
  });

  it("an encouragement is summarised, never a card", () => {
    render(
      <AttentionFeed
        contacts={[contact({ owner: "u1" })]}
        interactions={[]}
        threads={[
          { ...question, id: "t_enc", kind: "encouragement", body: "Praying for you both!", fromName: "Zion Park" },
        ]}
        staffNameMap={{ u3: "Zion Park" }}
      />,
    );
    expect(screen.getByText("Zion encouraged you.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Got it/ })).toBeNull();
  });

  it("writes back from inside the card, without leaving the list", async () => {
    feed();
    fireEvent.click(screen.getByRole("button", { name: /Write back/ }));

    const box = screen.getByRole("textbox");
    fireEvent.change(box, { target: { value: "She said yes to Wednesday." } });
    fireEvent.click(screen.getByRole("button", { name: "Post" }));

    await vi.waitFor(() => expect(addThreadMessage).toHaveBeenCalled());
    const [contactId, input] = addThreadMessage.mock.calls[0] as unknown as [string, { kind: string; body: string }];
    expect(contactId).toBe("c1");
    expect(input.kind).toBe("comment");
    expect(input.body).toBe("She said yes to Wednesday.");
    // You are still in the feed, and the card is now seen.
    expect(screen.getByText("Alex Johnson")).toBeInTheDocument();
    await vi.waitFor(() => expect(InboxState.isSeen(uid, "att:contact:c1")).toBe(true));
  });

  it("offers the same three kinds the Conversation tab does", () => {
    feed();
    fireEvent.click(screen.getByRole("button", { name: /Write back/ }));
    const picker = screen.getByRole("group", { name: "What are you writing" });
    expect(within(picker).getByRole("button", { name: "Comment" })).toBeInTheDocument();
    expect(within(picker).getByRole("button", { name: "Question" })).toBeInTheDocument();
    expect(within(picker).getByRole("button", { name: "Ask a follow-up" })).toBeInTheDocument();
  });

  it("New narrows to what has not been opened; All brings it back", () => {
    feed();
    fireEvent.click(screen.getByText("Mark all seen"));

    fireEvent.click(screen.getByRole("button", { name: "New" }));
    expect(screen.getByText("Nothing new right now")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show everything" }));
    expect(screen.getByText("Alex Johnson")).toBeInTheDocument();
  });

  it("handles Show more and Show less toggle for > 5 stacks", () => {
    const manyOwnedContacts: Contact[] = Array.from({ length: 8 }, (_, i) => ({
      id: `c_owned_${i}`,
      name: `Person ${i}`,
      createdBy: "u3",
      owner: uid,
      createdAt: new Date().toISOString(),
    })) as Contact[];

    render(<AttentionFeed contacts={manyOwnedContacts} staffNameMap={{ u3: "Zion" }} threads={[]} interactions={[]} />);

    expect(screen.getByText("Show 3 more people")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Show 3 more people"));

    expect(screen.getByText("Show less")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Show less"));
    expect(screen.getByText("Show 3 more people")).toBeInTheDocument();
  });

  it("expands to show every item behind a card", () => {
    feed();
    fireEvent.click(screen.getByText("All 3"));
    expect(screen.getAllByText("Met at library for study session").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("How should we follow up with Alex?").length).toBeGreaterThanOrEqual(1);
  });

  // #reviewer-appstore-orphan-fix: when an activity points at a contactId
  // that isn't in the `contacts` array (e.g. a deleted/missing contact),
  // clicking the row must NOT call `onOpenContact` with a string id —
  // passing a string causes the consumer to build `/people/${string}` and
  // navigate to `/people/undefined`. Resolve to the actual Contact first;
  // if missing, do nothing.
  it("does not call onOpenContact when the stack's contactId is missing from contacts (orphan reference)", () => {
    const onOpenContact = vi.fn();
    const orphanInteraction: Interaction = {
      id: "i_orphan",
      contactId: "c_orphan",
      userId: "u2",
      content: "",
      createdAt: new Date().toISOString(),
      dateTime: new Date().toISOString(),
      type: "gospel",
      title: "gospel",
    } as unknown as Interaction;

    render(
      <AttentionFeed
        contacts={sampleContacts}
        interactions={[orphanInteraction]}
        threads={[]}
        staffNameMap={{ u2: "Caleb" }}
        onOpenContact={onOpenContact}
      />,
    );

    const fallbackBtn = screen.getAllByText("Contact")[0];
    fireEvent.click(fallbackBtn);

    for (const call of onOpenContact.mock.calls) {
      const arg = call[0];
      expect(typeof arg).not.toBe("string");
      if (arg && typeof arg === "object" && "id" in arg) {
        expect((arg as Contact).id).toBe("c_orphan");
      }
    }
  });
});
