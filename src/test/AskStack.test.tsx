// #646: My Day's "Questions for Full-timers" stack no longer answers inline. The
// action navigates to the Questions page with focusQuestionId set; the composer
// lives on that page. Mark-scanned on the stack stays.
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import AskStack from "../components/landing/AskStack";
import { useAuth } from "../components/AuthProvider";
import { __resetInboxReadsCache } from "../lib/inboxReads";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});
vi.mock("../components/AuthProvider", () => ({ useAuth: vi.fn() }));

const defaultStackMessages = [
  {
    id: "q1",
    parentId: null,
    owner: "t1",
    from: "t1",
    fromName: "Zion Park",
    kind: "question",
    body: "How do you start a conversation at the club table?",
    at: "2026-08-01T10:00:00.000Z",
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
  },
];

let mockStackMessages: Record<string, unknown>[] = defaultStackMessages;

// The real origin/wait composition is what these tests are about (#1831), so
// only the Firestore-touching parts of the module are stubbed.
vi.mock("../lib/asks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/asks")>();
  return {
    ...actual,
    subscribeAsks: (cb: (m: unknown[]) => void) => {
      cb(mockStackMessages);
      return () => {};
    },
    addAskReply: vi.fn(),
  };
});

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
    mockStackMessages = defaultStackMessages;
    __resetInboxReadsCache();
  });

  it("renders nothing for a non-full-timer", () => {
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
      user: { uid: "t1", displayName: "Zion" },
      effectiveUserId: "t1",
      role: "manager",
    });
    const { container } = render(
      <MemoryRouter>
        <AskStack />
      </MemoryRouter>,
    );
    expect(container.querySelector("section")).toBeNull();
  });

  it("heads the feed with one stack per asker, excluding answered questions", () => {
    render(
      <MemoryRouter>
        <AskStack />
      </MemoryRouter>,
    );
    expect(screen.getByText("Questions for Full-timers")).toBeTruthy();
    // newest asker first
    expect(screen.getByText(/Ana Lei asked the team/)).toBeTruthy();
    expect(screen.getByText(/Zion Park asked the team/)).toBeTruthy();
    expect(screen.queryByText(/Rio asked the team/)).toBeNull();
  });

  it("does not render an inline composer — answering is a pointer to /questions", () => {
    render(
      <MemoryRouter>
        <AskStack />
      </MemoryRouter>,
    );

    // The old inline composer is gone. No textarea, no "Send it" button.
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByText(/^Send it$/)).toBeNull();

    // The action is a single button per question that says who it is for.
    const answerButtons = screen.getAllByText(/^Answer /);
    expect(answerButtons).toHaveLength(2);
  });

  it("tapping a question navigates to /questions with focusQuestionId set", () => {
    mockNavigate.mockReset();
    render(
      <MemoryRouter>
        <AskStack />
      </MemoryRouter>,
    );

    // Newest asker first — Ana Lei's q2 is the top row, Zion's q1 is the second.
    const answerButtons = screen.getAllByText(/^Answer /);
    fireEvent.click(answerButtons[1]);
    expect(mockNavigate).toHaveBeenCalledWith("/questions", {
      state: { focusQuestionId: "q1" },
    });
  });

  it("'Mark scanned' still clears the inbox badge without navigating (#646)", () => {
    mockNavigate.mockReset();
    render(
      <MemoryRouter>
        <AskStack />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getAllByText(/Mark scanned/)[0]);
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});