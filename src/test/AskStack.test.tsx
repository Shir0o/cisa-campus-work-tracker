import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import AskStack from "../components/landing/AskStack";
import { useAuth } from "../components/AuthProvider";
import { addAskReply } from "../lib/asks";
import { __resetInboxReadsCache } from "../lib/inboxReads";

vi.mock("../components/AuthProvider", () => ({ useAuth: vi.fn() }));

vi.mock("../lib/asks", () => ({
  subscribeAsks: (cb: (m: unknown[]) => void) => {
    cb([
      {
        id: "q1",
        parentId: null,
        owner: "t1",
        from: "t1",
        fromName: "Zion Park",
        kind: "question",
        body: "How do you start a conversation at the club table?",
        at: "2026-08-01T10:00:00.000Z",
        reactions: [],
      },
      {
        id: "q2",
        parentId: null,
        owner: "t2",
        from: "t2",
        fromName: "Ana Lei",
        kind: "question",
        body: "Is it strange to offer to pray with someone the first time you meet?",
        at: "2026-08-02T10:00:00.000Z",
        reactions: [],
      },
      // answered — the first full-timer already replied, so it's off the feed
      {
        id: "q3",
        parentId: null,
        owner: "t3",
        from: "t3",
        fromName: "Rio",
        kind: "question",
        body: "Already answered.",
        at: "2026-08-03T10:00:00.000Z",
        reactions: [],
      },
      {
        id: "a3",
        parentId: "q3",
        owner: "t3",
        from: "ft1",
        fromName: "Mei",
        kind: "comment",
        body: "Answered already.",
        at: "2026-08-03T11:00:00.000Z",
        reactions: [],
      },
    ]);
    return () => {};
  },
  askStacksFor: (all: unknown[], uid: string) => {
    const messages = all as {
      id: string;
      parentId: string | null;
      from: string;
      at: string;
    }[];
    const answeredIds = new Set(
      messages.filter((x) => x.parentId).map((x) => x.parentId),
    );
    const byAsker = new Map<string, typeof messages>();
    for (const m of messages) {
      if (m.parentId || m.from === uid || answeredIds.has(m.id)) continue;
      if (!byAsker.has(m.from)) byAsker.set(m.from, []);
      byAsker.get(m.from)!.push(m);
    }
    const stacks: { id: string; from: string; items: unknown[]; at: string }[] = [];
    byAsker.forEach((items, from) =>
      stacks.push({ id: "ask:" + from, from, items, at: items[0].at }),
    );
    return stacks.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  },
  addAskReply: vi.fn(),
  askWaitedDays: () => 0,
}));

vi.mock("../lib/firebase", () => ({
  db: {},
  handleFirestoreError: vi.fn(),
  OperationType: { LIST: "LIST", CREATE: "CREATE" },
}));

vi.mock("../lib/inboxReads", () => {
  const reads = new Set<string>();
  const InboxReads = {
    isRead: (_uid: string, id: string) => reads.has(id),
    markRead: (_uid: string, id: string) => reads.add(id),
  };
  return {
    InboxReads,
    useInboxReads: () => InboxReads,
    __resetInboxReadsCache: () => reads.clear(),
  };
});

describe("AskStack (web full-timer)", () => {
  beforeEach(() => {
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
      user: { uid: "ft1", displayName: "Mei" },
      effectiveUserId: "ft1",
      role: "admin",
    });
    __resetInboxReadsCache();
  });

  it("renders nothing for a non-full-timer", () => {
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
      user: { uid: "t1", displayName: "Zion" },
      effectiveUserId: "t1",
      role: "manager",
    });
    const { container } = render(<AskStack />);
    expect(container.querySelector("section")).toBeNull();
  });

  it("heads the feed with one stack per asker, excluding answered questions", () => {
    render(<AskStack />);
    expect(screen.getByText("Questions for the team")).toBeTruthy();
    // newest asker first
    expect(screen.getByText(/Ana Lei asked the team/)).toBeTruthy();
    expect(screen.getByText(/Zion Park asked the team/)).toBeTruthy();
    expect(screen.queryByText(/Rio asked the team/)).toBeNull();
  });

  it("answers a question, pinging the asker", () => {
    render(<AskStack />);
    // Second asker's row (Zion) — answer via the inline composer.
    const answerButtons = screen.getAllByText(/Answer /);
    fireEvent.click(answerButtons[1]);
    const textarea = screen.getByPlaceholderText(
      "Answer Zion the way you'd say it out loud.",
    );
    fireEvent.change(textarea, { target: { value: "Three tries, spread out." } });
    fireEvent.click(screen.getByText("Send it"));
    expect(addAskReply).toHaveBeenCalledWith(
      "q1",
      { from: "ft1", fromName: "Mei", body: "Three tries, spread out." },
      "t1",
      "t1",
    );
  });
});