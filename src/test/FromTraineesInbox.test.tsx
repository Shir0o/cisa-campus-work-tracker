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

  it("renders the team inbox with a row per inbox item and an unread count", async () => {
    render(<FromTraineesInbox meUid="ft1" contacts={contacts} onOpenContact={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("From the team")).toBeInTheDocument());
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

  it("posts a canned encouragement when an emoji is picked in the mobile sheet", async () => {
    render(<FromTraineesInbox meUid="ft1" contacts={contacts} onOpenContact={vi.fn()} mobile />);
    await waitFor(() => expect(screen.getByText("From the team")).toBeInTheDocument());
    fireEvent.click(screen.getAllByRole("button", { name: /Zion asked about Rio Tan/ })[0]);
    fireEvent.click(screen.getByText(/Encourage Zion/));
    fireEvent.click(screen.getByTitle("Praying for you both! Let me know if you need anything."));
    expect(addThreadMessage).toHaveBeenCalledWith(
      "c1",
      expect.objectContaining({ kind: "encouragement", from: "ft1" }),
      expect.objectContaining({ to: "t1" }),
    );
  });

  it("opens the conversation and reminds the trainee from the mobile sheet", async () => {
    const onOpen = vi.fn();
    render(<FromTraineesInbox meUid="ft1" contacts={contacts} onOpenContact={onOpen} mobile />);
    await waitFor(() => expect(screen.getByText("From the team")).toBeInTheDocument());
    fireEvent.click(screen.getAllByRole("button", { name: /Zion asked about Rio Tan/ })[0]);
    fireEvent.click(screen.getByText(/Open the conversation/));
    expect(onOpen).toHaveBeenCalledWith(contacts[0], expect.objectContaining({ tab: "thread" }));

    fireEvent.click(screen.getAllByRole("button", { name: /Zion asked about Rio Tan/ })[0]);
    fireEvent.click(screen.getByText(/Remind Zion/));
    expect(addThreadMessage).toHaveBeenCalledWith(
      "c1",
      expect.objectContaining({ kind: "nudge", from: "ft1" }),
      expect.objectContaining({ to: "t1" }),
    );
  });

  it("marks a read item unscanned from the mobile sheet", async () => {
    const { rerender } = render(
      <FromTraineesInbox meUid="ft1" contacts={contacts} onOpenContact={vi.fn()} mobile />,
    );
    await waitFor(() => expect(screen.getByText("From the team")).toBeInTheDocument());
    // mark all scanned first so rows read as scanned
    fireEvent.click(screen.getByRole("button", { name: /Mark all scanned/ }));
    await waitFor(() => expect(screen.queryByText("3 new")).not.toBeInTheDocument());

    rerender(<FromTraineesInbox meUid="ft1" contacts={contacts} onOpenContact={vi.fn()} mobile />);
    fireEvent.click(screen.getAllByRole("button", { name: /Zion asked about Rio Tan/ })[0]);
    fireEvent.click(screen.getByText(/Mark unscanned/));
    await waitFor(() => expect(screen.getByText("1 new")).toBeInTheDocument());
  });

  it("closes the mobile sheet from the scrim, X, and react cancel", async () => {
    render(<FromTraineesInbox meUid="ft1" contacts={contacts} onOpenContact={vi.fn()} mobile />);
    await waitFor(() => expect(screen.getByText("From the team")).toBeInTheDocument());
    fireEvent.click(screen.getAllByRole("button", { name: /Zion asked about Rio Tan/ })[0]);
    const dialog = () => screen.getByRole("dialog");
    expect(dialog()).toBeInTheDocument();
    fireEvent.click(document.querySelector(".scrim")!);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: /Zion asked about Rio Tan/ })[0]);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(document.querySelector(".modal-x")!);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("reveals and collapses earlier inbox items", async () => {
    // Enough created contacts to push past the collapsed cap of 6.
    const manyContacts = Array.from({ length: 8 }, (_, i) =>
      contact({
        id: `c${i}`,
        name: `Person ${i}`,
        createdBy: "t1",
        createdByName: "Zion Park",
        createdAt: `2026-02-0${(i % 9) + 1}T00:00:00.000Z`,
      }),
    );
    render(<FromTraineesInbox meUid="ft1" contacts={manyContacts} onOpenContact={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("From the team")).toBeInTheDocument());
    // mark everything scanned so the collapsed cap (6) applies
    fireEvent.click(screen.getByRole("button", { name: /Mark all scanned/ }));
    await waitFor(() => expect(screen.getByText(/Show \d+ earlier/)).toBeInTheDocument());
    fireEvent.click(screen.getByText(/Show \d+ earlier/));
    expect(screen.getByText(/Show less/)).toBeInTheDocument();
    fireEvent.click(screen.getByText(/Show less/));
    expect(screen.getByText(/Show \d+ earlier/)).toBeInTheDocument();
  });

  it("surfaces a failed interactions read through handleFirestoreError", async () => {
    const { handleFirestoreError } = await import("../lib/firebase");
    const firestore = await import("firebase/firestore");
    (firestore.onSnapshot as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_ref: unknown, _cb: unknown, onError: (e: unknown) => void) => {
        onError(new Error("permission denied"));
        return vi.fn();
      },
    );
    render(<FromTraineesInbox meUid="ft1" contacts={contacts} onOpenContact={vi.fn()} />);
    await waitFor(() =>
      expect(handleFirestoreError).toHaveBeenCalledWith(
        expect.any(Error),
        "LIST",
        "interactions (collectionGroup)",
      ),
    );
  });
});
