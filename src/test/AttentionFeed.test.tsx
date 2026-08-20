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

describe("AttentionFeed Component (#330)", () => {
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
      reviewed: false,
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

  it("renders the section with stacks and date headers", () => {
    render(
      <AttentionFeed
        contacts={sampleContacts}
        interactions={sampleInteractions}
        threads={sampleThreads}
        staffNameMap={{ u3: "Zion" }}
      />,
    );

    expect(screen.getByText("Needs your attention")).toBeInTheDocument();
    expect(screen.getByText("Alex Johnson")).toBeInTheDocument();
    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.getByText("1 new")).toBeInTheDocument();
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

    expect(screen.getByText("Met at library for study session")).toBeInTheDocument();
    expect(screen.getByText("How should we follow up with Alex?")).toBeInTheDocument();
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

  it("handles Show more and Show less toggle for > 5 stacks", () => {
    const manyContacts: Contact[] = Array.from({ length: 8 }, (_, i) => ({
      id: `c_${i}`,
      name: `Person ${i}`,
      createdBy: "u3",
      createdAt: new Date().toISOString(),
      reviewed: false,
    })) as Contact[];

    render(
      <AttentionFeed
        contacts={manyContacts}
        staffNameMap={{ u3: "Zion" }}
      />,
    );

    expect(screen.getByText("Show 3 more people")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Show 3 more people"));

    expect(screen.getByText("Show less")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Show less"));
    expect(screen.getByText("Show 3 more people")).toBeInTheDocument();
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
});
