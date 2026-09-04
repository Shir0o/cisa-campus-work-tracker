import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import AttentionFeed from "../components/landing/AttentionFeed";
import { UserEntityState, __resetUserEntityStateCache } from "../lib/userEntityState";
import type { Contact, Interaction } from "../types";
import type { ThreadMessageWithContact } from "../lib/threads";

vi.mock("../components/AuthProvider", () => ({
  useAuth: () => ({
    user: { uid: "u1", email: "tony@cisa.org" },
    effectiveUserId: "u1",
    role: "admin",
  }),
}));

vi.mock("../lib/firebase", () => ({
  db: {},
  auth: { currentUser: { uid: "u1" } },
}));

describe("AttentionFeed Component (#330, #595)", () => {
  const uid = "u1";

  beforeEach(() => {
    localStorage.clear();
    __resetUserEntityStateCache();
    vi.clearAllMocks();
  });

  const sampleContacts: Contact[] = [
    {
      id: "c1",
      name: "Alex Johnson",
      createdBy: "u3",
      createdAt: new Date().toISOString(),
      stage: "Freshman Contact",
      owner: "u3",
    } as Contact,
  ];

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

  const sampleThreads: ThreadMessageWithContact[] = [
    {
      id: "t1",
      contactId: "c1",
      from: "u3",
      fromName: "Zion",
      kind: "question",
      body: "How should we follow up with Alex?",
      at: new Date().toISOString(),
      interactionId: null,
      reactions: [],
    },
  ];

  it("renders the two-column desktop feed with On you and date headers", () => {
    render(
      <AttentionFeed
        contacts={sampleContacts}
        interactions={sampleInteractions}
        threads={sampleThreads}
        staffNameMap={{ u3: "Zion" }}
      />,
    );

    expect(screen.getByRole("region", { name: "On you" })).toBeInTheDocument();
    expect(screen.getByText("Alex Johnson")).toBeInTheDocument();
    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.getAllByText("1 new").length).toBeGreaterThanOrEqual(1);
  });

  it("marks stack done and removes it when 'I followed up' is clicked", () => {
    const onToast = vi.fn();
    render(
      <AttentionFeed
        contacts={sampleContacts}
        interactions={sampleInteractions}
        threads={sampleThreads}
        staffNameMap={{ u3: "Zion" }}
        onToast={onToast}
      />,
    );

    const followUpBtn = screen.getByText("I followed up");
    fireEvent.click(followUpBtn);

    expect(UserEntityState.isDone(uid, "contact:c1")).toBe(true);
    expect(screen.queryByText("Alex Johnson")).not.toBeInTheDocument();
  });

  it("marks all scanned when clicking 'Mark all scanned'", () => {
    render(
      <AttentionFeed
        contacts={sampleContacts}
        interactions={sampleInteractions}
        threads={sampleThreads}
        staffNameMap={{ u3: "Zion" }}
      />,
    );

    const markAllBtn = screen.getByText("Mark all scanned");
    fireEvent.click(markAllBtn);

    expect(UserEntityState.isRead(uid, "contact:c1")).toBe(true);
    expect(UserEntityState.isRead(uid, "interaction:i1")).toBe(true);
    expect(UserEntityState.isRead(uid, "thread:t1")).toBe(true);
    expect(screen.queryByText("1 new")).not.toBeInTheDocument();
  });

  it("expands to show all items when clicking 'All 3'", () => {
    render(
      <AttentionFeed
        contacts={sampleContacts}
        interactions={sampleInteractions}
        threads={sampleThreads}
        staffNameMap={{ u3: "Zion" }}
      />,
    );

    const expandBtn = screen.getByText("All 3");
    fireEvent.click(expandBtn);

    expect(screen.getAllByText("Met at library for study session").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("How should we follow up with Alex?").length).toBeGreaterThanOrEqual(1);
  });

  it("calls onOpenContact with initialTab='thread' when clicking 'Comment'", () => {
    const onOpenContact = vi.fn();
    render(
      <AttentionFeed
        contacts={sampleContacts}
        interactions={sampleInteractions}
        threads={sampleThreads}
        staffNameMap={{ u3: "Zion" }}
        onOpenContact={onOpenContact}
      />,
    );

    const commentBtn = screen.getByText("Comment");
    fireEvent.click(commentBtn);

    expect(onOpenContact).toHaveBeenCalledWith(
      expect.objectContaining({ id: "c1" }),
      { tab: "thread" },
    );
  });

  it("handles Show more and Show less toggle for > 5 stacks in onYou and aroundTeam", () => {
    const manyOwnedContacts: Contact[] = Array.from({ length: 8 }, (_, i) => ({
      id: `c_owned_${i}`,
      name: `Person ${i}`,
      createdBy: "u3",
      owner: uid,
      createdAt: new Date().toISOString(),
    })) as Contact[];

    render(
      <AttentionFeed
        contacts={manyOwnedContacts}
        staffNameMap={{ u3: "Zion" }}
      />,
    );

    expect(screen.getByText("Show 3 more people")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Show 3 more people"));

    expect(screen.getByText("Show less")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Show less"));
    expect(screen.getByText("Show 3 more people")).toBeInTheDocument();
  });

  it("renders Around the team column for ambient team touches with quick reactions", () => {
    const now = Date.now();
    const teamContact: Contact = {
      id: "c_ambient",
      name: "Emerson Ahn",
      createdBy: "u2",
      owner: "u2",
      createdAt: new Date(now - 60000).toISOString(),
      stage: "Student",
    } as Contact;

    const teamInteraction: Interaction = {
      id: "i_ambient",
      contactId: "c_ambient",
      userId: "u2",
      content: "Shared during prayer time about exam stress.",
      createdAt: new Date(now).toISOString(),
      dateTime: new Date(now).toISOString(),
      type: "small_group",
      title: "Tuesday small group",
    } as unknown as Interaction;


    render(
      <AttentionFeed
        contacts={[teamContact]}
        interactions={[teamInteraction]}
        staffNameMap={{ u2: "Caleb" }}
      />,
    );

    expect(screen.getByRole("region", { name: "Around the team" })).toBeInTheDocument();
    expect(screen.getByText("Emerson Ahn")).toBeInTheDocument();
    expect(screen.getByText("Caleb logged Tuesday small group")).toBeInTheDocument();

    const landedBtn = screen.getByTitle("Tell them it landed");
    fireEvent.click(landedBtn);
    expect(screen.getByText("🙏")).toBeInTheDocument();
  });

  it("toggles sub-item read state and opens encourage reactions", () => {
    render(
      <AttentionFeed
        contacts={sampleContacts}
        interactions={sampleInteractions}
        threads={sampleThreads}
        staffNameMap={{ u3: "Zion" }}
      />,
    );

    fireEvent.click(screen.getByText("All 3"));
    const encourageBtns = screen.getAllByText("Encourage");
    fireEvent.click(encourageBtns[0]);
    expect(screen.getByText("🙏")).toBeInTheDocument();

    const scannedBtns = screen.getAllByText("Mark scanned");
    fireEvent.click(scannedBtns[0]);
    expect(UserEntityState.isRead(uid, "contact:c1")).toBe(true);
  });

  // #reviewer-appstore-orphan-fix: when an activity points at a contactId
  // that isn't in the `contacts` array (e.g. a deleted/missing contact),
  // clicking the row must NOT call `onOpenContact` with a string id —
  // passing a string causes the consumer to build `/people/${string}` and
  // navigate to `/people/undefined`. Resolve to the actual Contact first;
  // if missing, do nothing.
  it("does not call onOpenContact when the stack's contactId is missing from contacts (orphan reference)", () => {
    const onOpenContact = vi.fn();
    // Note: contacts array does NOT include 'c_orphan'. The interaction below
    // references it — this is the exact prod shape of the bad activity
    // (reviewer-appstore logged an interaction for 'xnkdzn' on a deleted
    // contact l3vJMlCsJEprKqxzZLYc — see CHANGELOG).
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
        staffNameMap={{ u2: "Caleb" }}
        onOpenContact={onOpenContact}
      />,
    );

    // The row renders the "Contact" fallback name (capital C, when contact
    // prop is undefined but stack.contactId exists).
    const fallbackBtn = screen.getAllByText("Contact")[0];
    fireEvent.click(fallbackBtn);

    // The fix: never pass a string id to a Contact-typed consumer.
    // Either onOpenContact is not called at all, OR it is called with a real
    // Contact object — never with a raw string.
    for (const call of onOpenContact.mock.calls) {
      const arg = call[0];
      expect(typeof arg).not.toBe("string");
      if (arg && typeof arg === "object" && "id" in arg) {
        expect((arg as Contact).id).toBe("c_orphan"); // would still fail lookup
      }
    }
  });
});

