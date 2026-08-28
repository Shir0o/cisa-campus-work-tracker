import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import AskTheTeam from "../components/landing/AskTheTeam";
import { useAuth } from "../components/AuthProvider";
import { addAsk } from "../lib/asks";

vi.mock("../components/AuthProvider", () => ({
  useAuth: vi.fn(),
}));

vi.mock("../lib/asks", () => ({
  subscribeMyAsks: (_uid: string, cb: (m: unknown[]) => void) => {
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
    ]);
    return () => {};
  },
  askQuestionsBy: (all: any[]) => all.filter((m) => !m.parentId),
  askRepliesOf: () => [],
  askWaitedDays: () => 0,
  askOrigin: (m: any, viewerId?: string | null) => {
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
}));

describe("AskTheTeam component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useAuth as any).mockReturnValue({
      user: { uid: "t1", displayName: "Zion Park" },
    });
  });

  it("renders questions with correct origin text for asker", () => {
    render(<AskTheTeam meUid="t1" />);

    expect(
      screen.getByText("How do you start a conversation at the club table?"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("You asked this here, in your own words"),
    ).toBeInTheDocument();

    expect(screen.getByText("Question recorded in person")).toBeInTheDocument();
    expect(
      screen.getByText("Asked in person · Mei wrote it down for you"),
    ).toBeInTheDocument();
  });

  it("allows submitting a new question", () => {
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
  });
});
