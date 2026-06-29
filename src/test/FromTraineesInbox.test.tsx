import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import FromTraineesInbox from "../components/landing/FromTraineesInbox";
import { useAuth } from "../components/AuthProvider";
import { addThreadMessage } from "../lib/threads";
import { __resetInboxReadsCache } from "../lib/inboxReads";
import type { Contact } from "../types";

vi.mock("../components/AuthProvider", () => ({ useAuth: vi.fn() }));

// Independent of the real seed: ft1 walks with t1.
vi.mock("../lib/walking", () => ({
  FT_TRAINEES: { ft1: ["t1"] },
  FT_OF: { t1: "ft1" },
  traineesOf: (uid?: string) => (uid === "ft1" ? ["t1"] : []),
  isTrainee: (uid?: string) => uid === "t1",
  fullTimerOf: (uid?: string) => (uid === "t1" ? "ft1" : null),
}));

vi.mock("../lib/threads", () => ({
  addThreadMessage: vi.fn(),
  subscribeAllThreads: (cb: (m: unknown[]) => void) => {
    cb([
      {
        id: "q1",
        contactId: "c1",
        interactionId: null,
        from: "t1",
        fromName: "Zion Park",
        kind: "question",
        body: "Should I invite Rio to small group?",
        at: "2026-02-03T00:00:00.000Z",
        reactions: [],
      },
    ]);
    return () => {};
  },
}));

vi.mock("../lib/firebase", () => ({
  db: {},
  handleFirestoreError: vi.fn(),
  OperationType: { LIST: "LIST" },
}));

// The interactions collection-group subscription.
vi.mock("firebase/firestore", () => ({
  collectionGroup: vi.fn((_db, name: string) => ({ group: name })),
  query: vi.fn((ref) => ref),
  orderBy: vi.fn(),
  limit: vi.fn(),
  onSnapshot: vi.fn((_ref, cb) => {
    cb({
      docs: [
        {
          id: "i1",
          data: () => ({
            userId: "t1",
            userName: "Zion Park",
            content: "Coffee with Rio after class.",
            createdAt: "2026-02-02T00:00:00.000Z",
          }),
          ref: { path: "contacts/c1/interactions/i1" },
        },
      ],
    });
    return () => {};
  }),
}));

const contact = (over: Partial<Contact>): Contact =>
  ({ id: "c", name: "X", initials: "X", role: "", location: "", email: "", phone: "", stage: "", lastSeen: "", ...over }) as Contact;

const contacts: Contact[] = [
  contact({
    id: "c1",
    name: "Rio Tan",
    createdBy: "t1",
    createdByName: "Zion Park",
    createdAt: "2026-02-01T00:00:00.000Z",
  }),
];

describe("FromTraineesInbox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetInboxReadsCache();
    localStorage.clear();
    (useAuth as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      user: { uid: "ft1", displayName: "Mei Chen" },
    });
  });

  it("renders the trainee-titled section with a row per inbox item and an unread count", async () => {
    render(<FromTraineesInbox meUid="ft1" contacts={contacts} onOpenContact={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("Walking with Zion")).toBeInTheDocument());
    expect(screen.getByText("Zion added Rio Tan")).toBeInTheDocument();
    expect(screen.getByText("Zion logged time with Rio Tan")).toBeInTheDocument();
    expect(screen.getByText("Zion asked about Rio Tan")).toBeInTheDocument();
    expect(screen.getByText("3 new")).toBeInTheDocument();
  });

  it("posts a canned encouragement to the trainee when Encourage is clicked", async () => {
    render(<FromTraineesInbox meUid="ft1" contacts={contacts} onOpenContact={vi.fn()} />);
    await waitFor(() => expect(screen.getAllByRole("button", { name: /Encourage/ }).length).toBe(3));
    fireEvent.click(screen.getAllByRole("button", { name: /Encourage/ })[0]);
    expect(addThreadMessage).toHaveBeenCalledWith(
      "c1",
      expect.objectContaining({ kind: "encouragement", from: "ft1" }),
      expect.objectContaining({ to: "t1", contactName: "Rio Tan" }),
    );
  });

  it("opens the contact's thread when Comment is clicked", async () => {
    const onOpen = vi.fn();
    render(<FromTraineesInbox meUid="ft1" contacts={contacts} onOpenContact={onOpen} />);
    await waitFor(() => expect(screen.getAllByRole("button", { name: /Comment/ }).length).toBe(3));
    fireEvent.click(screen.getAllByRole("button", { name: /Comment/ })[0]);
    expect(onOpen).toHaveBeenCalledWith(contacts[0], expect.objectContaining({ tab: "thread" }));
  });

  it("clears the unread count when Mark all scanned is clicked", async () => {
    render(<FromTraineesInbox meUid="ft1" contacts={contacts} onOpenContact={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("3 new")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Mark all scanned/ }));
    await waitFor(() => expect(screen.queryByText("3 new")).not.toBeInTheDocument());
  });

  it("renders nothing for a user who walks with no one", () => {
    const { container } = render(
      <FromTraineesInbox meUid="nobody" contacts={contacts} onOpenContact={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
