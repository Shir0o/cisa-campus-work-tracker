import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import LandingStudent from "../views/landings/LandingStudent";
import { useAuth } from "../components/AuthProvider";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", () => ({ useNavigate: () => mockNavigate }));
vi.mock("../components/AuthProvider", () => ({ useAuth: vi.fn() }));

const soonISO = new Date(Date.now() + 2 * 86_400_000).toISOString();

vi.mock("firebase/firestore", () => ({
  collection: vi.fn((_db, ...seg: string[]) => ({ path: seg.join("/") })),
  query: vi.fn((ref) => ref),
  onSnapshot: vi.fn((_ref, cb) => {
    // Only the events subscription (from UpcomingEventsRsvp) reaches firestore here.
    cb({
      docs: [
        {
          id: "ev1",
          data: () => ({ name: "Friday Gathering", date: soonISO, location: "Hall", type: "Weekly", order: 1 }),
        },
      ],
    });
    return vi.fn();
  }),
  where: vi.fn(),
  collectionGroup: vi.fn(),
  doc: vi.fn(),
  setDoc: vi.fn(),
  deleteDoc: vi.fn(),
  serverTimestamp: vi.fn(),
}));

vi.mock("../lib/firebase", () => ({ db: {}, handleFirestoreError: vi.fn(), OperationType: {} }));

const h = vi.hoisted(() => ({
  addPersonalPrayer: vi.fn(),
  updatePersonalPrayer: vi.fn(),
  deletePersonalPrayer: vi.fn(),
  setRsvp: vi.fn(),
  personalPrayers: [] as any[],
  myRsvps: new Set<string>(),
}));
vi.mock("../lib/personalPrayers", () => ({
  subscribePersonalPrayers: (_uid: string, cb: any) => {
    cb(h.personalPrayers);
    return vi.fn();
  },
  addPersonalPrayer: (...a: any[]) => h.addPersonalPrayer(...a),
  updatePersonalPrayer: (...a: any[]) => h.updatePersonalPrayer(...a),
  deletePersonalPrayer: (...a: any[]) => h.deletePersonalPrayer(...a),
}));
vi.mock("../lib/rsvp", () => ({
  setRsvp: (...a: any[]) => h.setRsvp(...a),
  subscribeMyRsvps: (_uid: string, cb: any) => {
    cb(h.myRsvps);
    return vi.fn();
  },
  subscribeEventRsvps: () => vi.fn(),
}));

describe("LandingStudent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.personalPrayers = [];
    h.myRsvps = new Set();
    (useAuth as any).mockReturnValue({ user: { uid: "u1", displayName: "Tim Lee" } });
  });

  it("renders greeting, Coming up and Pray for your friends", () => {
    render(<LandingStudent />);
    expect(screen.getByText(/Hi Tim\./)).toBeInTheDocument();
    expect(screen.getByText("Coming up")).toBeInTheDocument();
    expect(screen.getByText("Pray for your friends")).toBeInTheDocument();
    expect(screen.getByText("Friday Gathering")).toBeInTheDocument();
  });

  it("shows the empty friends state", () => {
    render(<LandingStudent />);
    expect(screen.getByText(/No one yet/)).toBeInTheDocument();
  });

  it("RSVPs to an upcoming gathering", () => {
    render(<LandingStudent />);
    fireEvent.click(screen.getByRole("button", { name: /I'll be there/i }));
    expect(h.setRsvp).toHaveBeenCalledWith("ev1", { uid: "u1", name: "Tim Lee" }, true);
  });

  it("adds a friend to pray for", async () => {
    render(<LandingStudent />);
    fireEvent.click(screen.getByText("Add someone"));
    const input = await screen.findByPlaceholderText(/Who's on your heart/);
    fireEvent.change(input, { target: { value: "Daniel — finals" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(h.addPersonalPrayer).toHaveBeenCalledWith("u1", { title: "Daniel — finals" });
  });

  it("updates a friend's prayer status", () => {
    h.personalPrayers = [{ id: "pp1", title: "Daniel", contactId: null, date: soonISO, status: "open" }];
    render(<LandingStudent />);
    fireEvent.click(screen.getByRole("button", { name: "answered" }));
    expect(h.updatePersonalPrayer).toHaveBeenCalledWith("u1", "pp1", { status: "answered" });
  });
});
