// #646: My Day's "Questions for the team" stack no longer answers inline. The
// action navigates to the Questions page with focusQuestionId set; the composer
// lives on that page. Mark-scanned on the stack stays.
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import AskStack from "../components/landing/AskStack";
import { LanguageProvider } from "../components/LanguageProvider";
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

// LanguageProvider subscribes to saved preferences when an effective user is
// present; a stack test only needs the language it was given.
vi.mock("../lib/userPreferences", () => ({
  subscribeUserPreferences: () => () => {},
  saveUserPreferences: vi.fn(),
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
    expect(screen.getByText("Questions for the team")).toBeTruthy();
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

// #1831: the full-timer feed printed English origin and wait sentences inside
// a Spanish session. Both are now composed through the shared translators.
describe("AskStack origin and wait in Spanish (#1831)", () => {
  const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString();

  beforeEach(() => {
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
      user: { uid: "ft1", displayName: "Mei" },
      effectiveUserId: "ft1",
      role: "admin",
    });
    __resetInboxReadsCache();
    mockStackMessages = [
      {
        id: "es-a",
        parentId: null,
        owner: "t2",
        from: "t2",
        fromName: "Ana Lei",
        takenBy: "ft1",
        takenByName: "Mei Lin",
        kind: "question",
        body: "Pregunta apuntada por mí",
        at: daysAgo(2),
      },
      {
        id: "es-b",
        parentId: null,
        owner: "t3",
        from: "t3",
        fromName: "Rio",
        takenBy: "ft2",
        takenByName: "Daniel Ortiz",
        kind: "question",
        body: "Pregunta apuntada por otra persona",
        at: daysAgo(1),
      },
      {
        id: "es-c",
        parentId: null,
        owner: "t4",
        from: "t4",
        fromName: "Zion Park",
        kind: "question",
        body: "Pregunta escrita en la app",
        at: daysAgo(0),
      },
    ];
  });

  it("writes the origin sentence and the wait line in Spanish for every question", () => {
    render(
      <MemoryRouter>
        <LanguageProvider defaultLanguage="es">
          <AskStack />
        </LanguageProvider>
      </MemoryRouter>,
    );

    // origin_in_person with the `origin_you` slot, another pen, and no pen.
    expect(screen.getByText("Preguntada en persona · escrita por ti")).toBeInTheDocument();
    expect(screen.getByText("Preguntada en persona · escrita por Daniel")).toBeInTheDocument();
    expect(screen.getByText("Preguntada aquí, con sus propias palabras")).toBeInTheDocument();

    // waited_days · waited_yesterday · waited_today, and never "1 días".
    expect(screen.getByText(/esperando 2 días/)).toBeInTheDocument();
    expect(screen.getByText(/esperando desde ayer/)).toBeInTheDocument();
    expect(screen.getByText(/preguntada hoy/)).toBeInTheDocument();
    expect(screen.queryByText(/1 días/)).not.toBeInTheDocument();

    // No English origin or wait sentence survives the Spanish session.
    expect(
      screen.queryByText(
        /You asked this here|Asked here|Asked in person|asked today|waiting since yesterday|waiting \d+ days|wrote it down|written down by/,
      ),
    ).not.toBeInTheDocument();
  });
});