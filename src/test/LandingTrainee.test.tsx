import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import LandingTrainee from "../views/landings/LandingTrainee";
import { useAuth } from "../components/AuthProvider";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", () => ({ useNavigate: () => mockNavigate }));
vi.mock("../components/AuthProvider", () => ({ useAuth: vi.fn() }));
vi.mock("../components/modals/ContactDetailsModal", () => ({ default: () => null }));

const soonISO = new Date(Date.now() + 2 * 86_400_000).toISOString();

type DocLike = { id: string; data: () => any };
const byPath =
  (map: Record<string, DocLike[]>) =>
  (ref: any, cb: any) => {
    cb({ docs: map[ref?.path] || [] });
    return vi.fn();
  };

vi.mock("firebase/firestore", () => ({
  collection: vi.fn((_db, ...seg: string[]) => ({ path: seg.join("/") })),
  query: vi.fn((ref) => ref),
  orderBy: vi.fn(),
  onSnapshot: vi.fn((_ref, cb) => {
    cb({ docs: [] });
    return vi.fn();
  }),
}));

vi.mock("../lib/firebase", () => ({
  db: {},
  handleFirestoreError: vi.fn(),
  OperationType: { LIST: "LIST" },
}));

const h = vi.hoisted(() => ({
  addPersonalPrayer: vi.fn(),
  updatePersonalPrayer: vi.fn(),
  deletePersonalPrayer: vi.fn(),
  updatePrayerStatus: vi.fn(),
  openMessage: vi.fn(),
  personalPrayers: [] as any[],
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
vi.mock("../lib/prayers", () => ({ updatePrayerStatus: (...a: any[]) => h.updatePrayerStatus(...a) }));
vi.mock("../lib/messaging", () => ({ openMessage: (...a: any[]) => h.openMessage(...a) }));

import { onSnapshot } from "firebase/firestore";

describe("LandingTrainee", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.personalPrayers = [];
    vi.mocked(onSnapshot).mockImplementation((_ref: any, cb: any) => {
      cb({ docs: [] });
      return vi.fn();
    });
    (useAuth as any).mockReturnValue({ user: { uid: "u1", displayName: "Zion Park" } });
  });

  it("renders greeting and both sections with empty states", async () => {
    render(<LandingTrainee />);
    await waitFor(() => expect(screen.getByText(/Zion/)).toBeInTheDocument());
    expect(screen.getByText("Your people")).toBeInTheDocument();
    expect(screen.getByText("Prayers you're carrying")).toBeInTheDocument();
    expect(screen.getByText(/No one's in your care yet/)).toBeInTheDocument();
    expect(screen.getByText(/No prayers yet/)).toBeInTheDocument();
  });

  it("lists the contacts you created and opens the details modal", async () => {
    vi.mocked(onSnapshot).mockImplementation(
      byPath({
        contacts: [
          { id: "c1", data: () => ({ name: "Rio Tan", initials: "RT", stage: "Regular", createdBy: "u1", lastSeen: soonISO }) },
          { id: "c2", data: () => ({ name: "Not Mine", initials: "NM", stage: "Regular", createdBy: "someone" }) },
        ],
      }),
    );
    render(<LandingTrainee />);
    await waitFor(() => expect(screen.getByText("Rio Tan")).toBeInTheDocument());
    expect(screen.queryByText("Not Mine")).not.toBeInTheDocument();
  });

  it("updates the status of a prayer for one of your people", async () => {
    vi.mocked(onSnapshot).mockImplementation(
      byPath({
        contacts: [{ id: "c1", data: () => ({ name: "Rio Tan", initials: "RT", stage: "Regular", createdBy: "u1" }) }],
        prayers: [{ id: "p1", data: () => ({ contactId: "c1", burden: "wisdom for finals", status: "pending", date: soonISO }) }],
      }),
    );
    render(<LandingTrainee />);
    await waitFor(() => expect(screen.getByText("wisdom for finals")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "answered" }));
    expect(h.updatePrayerStatus).toHaveBeenCalledWith("p1", "answered", expect.anything());
  });

  it("adds a personal prayer", async () => {
    render(<LandingTrainee />);
    await waitFor(() => expect(screen.getByText("Add a personal prayer")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Add a personal prayer"));
    const input = await screen.findByPlaceholderText(/What would you like to pray for/);
    fireEvent.change(input, { target: { value: "a teachable heart" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(h.addPersonalPrayer).toHaveBeenCalledWith("u1", { title: "a teachable heart", contactId: null });
  });
});
