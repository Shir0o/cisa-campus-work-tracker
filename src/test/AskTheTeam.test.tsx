import { render as rtlRender, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { MemoryRouter } from "react-router-dom";
import AskTheTeam from "../components/landing/AskTheTeam";
import { LanguageProvider } from "../components/LanguageProvider";
import { useAuth } from "../components/AuthProvider";
import { addAsk, deleteAskReply } from "../lib/asks";

const render = (ui: React.ReactElement) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>);

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

let mockMessages: Record<string, unknown>[] = [];
const baseMessages = [
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
    owner: "t1",
    from: "t1",
    fromName: "Zion Park",
    takenBy: "ft1",
    takenByName: "Mei Lin",
    kind: "question",
    body: "Question recorded in person",
    at: "2026-08-02T10:00:00.000Z",
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
  },
];

// Older than the three above, so the home's cap of 3 leaves it off.
const olderQuestion = {
  id: "q0",
  parentId: null,
  owner: "t1",
  from: "t1",
  fromName: "Zion Park",
  kind: "question",
  body: "An older question that only lives on /questions",
  at: "2026-07-20T10:00:00.000Z",
};

// The real origin/wait composition is what these tests are about (#1831), so
// only the Firestore-touching parts of the module are stubbed.
vi.mock("../lib/asks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/asks")>();
  return {
    ...actual,
    subscribeStaffAsks: (_uid: string, cb: (m: unknown[]) => void) => {
      cb(mockMessages);
      return () => {};
    },
    addAsk: vi.fn(),
    deleteAskReply: vi.fn(),
  };
});

beforeEach(() => {
  mockMessages = baseMessages;
});

const PLACEHOLDER = "What do you want to ask? Say it how you'd say it out loud.";
const openComposer = () => {
  fireEvent.click(screen.getByRole("button", { name: "Ask a Full-timer…" }));
  return screen.getByRole("textbox", { name: "Your question for the team" });
};

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

    const textarea = openComposer();
    expect(textarea).toHaveAttribute("placeholder", PLACEHOLDER);
    fireEvent.change(textarea, { target: { value: "New question here" } });

    const askBtn = screen.getByRole("button", { name: /^ask$/i });
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

describe("AskTheTeam collapsed composer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useAuth as unknown as Mock).mockReturnValue({
      user: { uid: "t1", displayName: "Zion Park" },
    });
  });

  it("starts as a single trigger row with no textarea", () => {
    render(<AskTheTeam meUid="t1" />);
    expect(screen.getByRole("button", { name: "Ask a Full-timer…" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("opening the trigger shows the composer and moves focus into it", () => {
    render(<AskTheTeam meUid="t1" />);
    const textarea = openComposer();
    expect(textarea).toHaveFocus();
    expect(screen.queryByRole("button", { name: "Ask a Full-timer…" })).not.toBeInTheDocument();
  });

  it("Escape collapses it and returns focus to the trigger", () => {
    render(<AskTheTeam meUid="t1" />);
    const textarea = openComposer();
    fireEvent.change(textarea, { target: { value: "half a thought" } });
    fireEvent.keyDown(textarea, { key: "Escape" });
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ask a Full-timer…" })).toHaveFocus();
    // The draft survives a collapse.
    expect(openComposer()).toHaveValue("half a thought");
  });

  it("an empty blur collapses it; a blur with a draft keeps it open", () => {
    render(<AskTheTeam meUid="t1" />);
    let textarea = openComposer();
    fireEvent.blur(textarea);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();

    textarea = openComposer();
    fireEvent.change(textarea, { target: { value: "Still writing" } });
    fireEvent.blur(textarea);
    expect(screen.getByRole("textbox", { name: "Your question for the team" })).toBeInTheDocument();
  });

  it("Cmd+Enter sends the question and collapses back to the trigger", () => {
    render(<AskTheTeam meUid="t1" />);
    const textarea = openComposer();
    fireEvent.change(textarea, { target: { value: "Sent by keyboard" } });
    fireEvent.keyDown(textarea, { key: "Enter", metaKey: true });
    expect(addAsk).toHaveBeenCalledWith({ from: "t1", fromName: "Zion Park", body: "Sent by keyboard" });
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("says once that every full-timer sees it", () => {
    render(<AskTheTeam meUid="t1" />);
    openComposer();
    expect(screen.getAllByText(/every full-timer sees this/i)).toHaveLength(1);
  });
});

describe("AskTheTeam home cap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useAuth as unknown as Mock).mockReturnValue({
      user: { uid: "t1", displayName: "Zion Park" },
    });
  });

  it("shows the 3 most recent questions, then See all to /questions", () => {
    mockMessages = [...baseMessages, olderQuestion];
    render(<AskTheTeam meUid="t1" />);
    expect(screen.getByText("What do we do about the club table flyers?")).toBeInTheDocument();
    expect(screen.getByText("Question recorded in person")).toBeInTheDocument();
    expect(screen.getByText("How do you start a conversation at the club table?")).toBeInTheDocument();
    expect(screen.queryByText(olderQuestion.body)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /see all/i })).toHaveAttribute("href", "/questions");
  });

  it("has no See all when every question already fits", () => {
    render(<AskTheTeam meUid="t1" />);
    expect(screen.queryByRole("link", { name: /see all/i })).not.toBeInTheDocument();
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

// #1831: the card printed English origin and wait sentences inside a Spanish
// session. Both are now composed through the shared translators in lib/asks.
describe("AskTheTeam origin and wait in Spanish (#1831)", () => {
  const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString();

  beforeEach(() => {
    vi.clearAllMocks();
    (useAuth as unknown as Mock).mockReturnValue({
      user: { uid: "t1", displayName: "Zion Park" },
    });
    mockMessages = [
      {
        id: "es1",
        parentId: null,
        owner: "t1",
        from: "t1",
        fromName: "Zion Park",
        kind: "question",
        body: "Una pregunta directa",
        at: daysAgo(0),
      },
      {
        id: "es2",
        parentId: null,
        owner: "t1",
        from: "t1",
        fromName: "Zion Park",
        takenBy: "ft1",
        takenByName: "Mei Lin",
        kind: "question",
        body: "Una pregunta apuntada en persona",
        at: daysAgo(1),
      },
      {
        id: "es3",
        parentId: null,
        owner: "ft1",
        from: "ft1",
        fromName: "Mei Lin",
        kind: "question",
        body: "La pregunta de la líder",
        at: daysAgo(2),
      },
    ];
  });

  it("writes every origin sentence and the wait line in Spanish, with the pen's name intact", () => {
    render(
      <LanguageProvider defaultLanguage="es">
        <AskTheTeam meUid="t1" />
      </LanguageProvider>,
    );

    // origin_you_here · origin_in_person_you · origin_here
    expect(screen.getByText("La preguntaste aquí, con tus propias palabras")).toBeInTheDocument();
    expect(screen.getByText("Preguntada en persona · Mei la escribió por ti")).toBeInTheDocument();
    expect(screen.getByText("Preguntada aquí, con sus propias palabras")).toBeInTheDocument();

    // waited_today · waited_yesterday · waited_days, and never "1 días"
    expect(screen.getByText(/preguntada hoy/)).toBeInTheDocument();
    expect(screen.getByText(/esperando desde ayer/)).toBeInTheDocument();
    expect(screen.getByText(/esperando 2 días/)).toBeInTheDocument();
    expect(screen.queryByText(/1 días/)).not.toBeInTheDocument();

    // No English origin or wait sentence survives the Spanish session.
    expect(
      screen.queryByText(
        /You asked this here|Asked here|Asked in person|asked today|waiting since yesterday|waiting \d+ days|wrote it down|written down by/,
      ),
    ).not.toBeInTheDocument();
  });
});
