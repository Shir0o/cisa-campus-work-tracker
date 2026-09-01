import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import AskTheTeam from "../components/landing/AskTheTeam";
import { useAuth } from "../components/AuthProvider";
import { addAsk, deleteAskReply } from "../lib/asks";

vi.mock("../components/AuthProvider", () => ({
  useAuth: vi.fn(),
}));

vi.mock("../lib/firebase", () => ({
  db: { _type: "firestore" },
}));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn((_db, name) => ({ path: name })),
  query: vi.fn((c) => c),
  onSnapshot: vi.fn((_q: unknown, cb: (snap: { docs: unknown[] }) => void) => {
    cb({
      docs: [
        {
          id: "ft1",
          data: () => ({ role: "admin", approved: true, email: "mei@example.com", displayName: "Mei Lin" }),
        },
      ],
    });
    return () => {};
  }),
}));

const mockMessages = [
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
    owner: "t1",
    from: "t1",
    fromName: "Zion Park",
    takenBy: "ft1",
    takenByName: "Mei Lin",
    kind: "question",
    body: "Question recorded in person",
    at: "2026-08-02T10:00:00.000Z",
    reactions: [],
  },
  {
    id: "q3",
    parentId: null,
    owner: "ft1",
    from: "ft1",
    fromName: "Mei Lin",
    kind: "question",
    body: "What do we do about the club table flyers?",
    at: "2026-08-03T10:00:00.000Z",
    reactions: [],
  },
  {
    id: "q1r1",
    parentId: "q1",
    owner: "t1",
    from: "ft1",
    fromName: "Mei Lin",
    kind: "comment",
    body: "Ask what they're studying first.",
    at: "2026-08-01T11:00:00.000Z",
    reactions: [],
  },
];

vi.mock("../lib/asks", () => ({
  subscribeStaffAsks: (_uid: string, cb: (m: unknown[]) => void) => {
    cb(mockMessages);
    return () => {};
  },
  askQuestions: (all: { parentId: string | null }[]) => all.filter((m) => !m.parentId),
  askRepliesOf: (all: { parentId: string | null }[], parentId: string) =>
    all.filter((m) => m.parentId === parentId),
  askWaitedDays: () => 0,
  askOrigin: (m: { from: string; takenBy?: string; takenByName?: string }, viewerId?: string | null) => {
    const mine = viewerId === m.from;
    if (!m.takenBy) {
      return {
        written: false,
        pen: null,
        icon: "msg",
        text: mine ? "You asked this here, in your own words" : "Asked here, in their own words",
        short: mine ? "You asked this here" : "Asked here",
      };
    }
    return {
      written: true,
      pen: { uid: m.takenBy, name: m.takenByName },
      icon: "edit",
      text: mine ? "Asked in person · Mei wrote it down for you" : "Asked in person · written down by Mei",
      short: mine ? "Mei wrote it down for you" : "Written down by Mei",
    };
  },
  addAsk: vi.fn(),
  deleteAskReply: vi.fn(),
}));

describe("AskTheTeam component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useAuth as any).mockReturnValue({
      user: { uid: "t1", displayName: "Zion Park" },
    });
  });

  it("renders the whole team's questions with the asker's name and correct origin text", () => {
    render(<AskTheTeam meUid="t1" />);

    // my own direct question — my origin voice
    expect(
      screen.getByText("How do you start a conversation at the club table?"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("You asked this here, in your own words"),
    ).toBeInTheDocument();

    // my own in-person question, written down for me
    expect(screen.getByText("Question recorded in person")).toBeInTheDocument();
    expect(
      screen.getByText("Asked in person · Mei wrote it down for you"),
    ).toBeInTheDocument();

    // a full-timer's question is visible team-wide, with the asker's name
    expect(
      screen.getByText("What do we do about the club table flyers?"),
    ).toBeInTheDocument();
    expect(screen.getByText("Mei Lin")).toBeInTheDocument();
    expect(screen.getByText("Full-timer")).toBeInTheDocument();
    expect(
      screen.getByText("Asked here, in their own words"),
    ).toBeInTheDocument();
  });

  it("allows submitting a new question and confirms it reached the team", () => {
    render(<AskTheTeam meUid="t1" />);

    const textarea = screen.getByPlaceholderText(
      "What do you want to ask? Say it how you'd say it out loud.",
    );
    fireEvent.change(textarea, { target: { value: "New question here" } });

    const askBtn = screen.getByRole("button", { name: /ask/i });
    fireEvent.click(askBtn);

    expect(addAsk).toHaveBeenCalledWith({
      from: "t1",
      fromName: "Zion Park",
      body: "New question here",
    });
    expect(
      screen.getByText("Asked. The team can see it."),
    ).toBeInTheDocument();
  });
});

describe("AskTheTeam component (#680) per-reply delete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useAuth as unknown as Mock).mockReturnValue({
      user: { uid: "t1", displayName: "Zion Park" },
    });
  });

  it("the asker of a question sees a per-reply trash on the trainee home", () => {
    render(<AskTheTeam meUid="t1" />);
    // q1 (Zion's) has the reply q1r1 from Mei.
    expect(
      screen.getAllByRole("button", { name: "Delete this answer" }).length,
    ).toBeGreaterThan(0);
  });

  it('"Keep it" backs out without deleting', () => {
    render(<AskTheTeam meUid="t1" />);

    fireEvent.click(screen.getAllByRole("button", { name: "Delete this answer" })[0]);
    expect(screen.getByText(/delete this answer\?/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /keep it/i }));

    expect(screen.queryByText(/delete this answer\?/i)).not.toBeInTheDocument();
    expect(deleteAskReply).not.toHaveBeenCalled();
  });

  it("confirming a reply delete calls deleteAskReply with the reply id", async () => {
    vi.mocked(deleteAskReply).mockResolvedValue(undefined);
    render(<AskTheTeam meUid="t1" />);

    fireEvent.click(screen.getAllByRole("button", { name: "Delete this answer" })[0]);
    fireEvent.click(screen.getByRole("button", { name: /^Delete answer$/ }));

    await vi.waitFor(() => expect(deleteAskReply).toHaveBeenCalledWith("q1r1"));
  });
});
