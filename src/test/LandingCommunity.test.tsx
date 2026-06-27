import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import LandingCommunity from "../views/landings/LandingCommunity";
import { useAuth } from "../components/AuthProvider";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", () => ({ useNavigate: () => mockNavigate }));
vi.mock("../components/AuthProvider", () => ({ useAuth: vi.fn() }));

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
  where: vi.fn(),
  onSnapshot: vi.fn((_ref, cb) => {
    cb({ docs: [] });
    return vi.fn();
  }),
}));

vi.mock("../lib/firebase", () => ({ db: {}, handleFirestoreError: vi.fn(), OperationType: {} }));

const h = vi.hoisted(() => ({
  getOrCreateDirectChat: vi.fn((..._a: any[]) => Promise.resolve("room1")),
}));
vi.mock("../services/chat", () => ({
  getOrCreateDirectChat: (...a: any[]) => h.getOrCreateDirectChat(...a),
}));
vi.mock("../lib/rsvp", () => ({
  setRsvp: vi.fn(),
  subscribeMyRsvps: (_uid: string, cb: any) => {
    cb(new Set());
    return vi.fn();
  },
  subscribeEventRsvps: () => vi.fn(),
}));

import { onSnapshot } from "firebase/firestore";

const seedFullTimers = () =>
  vi.mocked(onSnapshot).mockImplementation(
    byPath({
      users: [
        {
          id: "ft1",
          data: () => ({ displayName: "Tony Wang", email: "tony@x.com", photoURL: "", role: "admin", approved: true }),
        },
      ],
    }),
  );

describe("LandingCommunity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(onSnapshot).mockImplementation((_ref: any, cb: any) => {
      cb({ docs: [] });
      return vi.fn();
    });
    (useAuth as any).mockReturnValue({ user: { uid: "v1", displayName: "Phil Day" } });
  });

  it("renders the welcome, Open gatherings and Reach out sections", () => {
    render(<LandingCommunity />);
    expect(screen.getByText(/Hello, Phil\./)).toBeInTheDocument();
    expect(screen.getByText("Open gatherings")).toBeInTheDocument();
    expect(screen.getByText("Reach out")).toBeInTheDocument();
  });

  it("opens a direct message to a Full-timer and navigates to messages", async () => {
    seedFullTimers();
    render(<LandingCommunity />);
    await waitFor(() => expect(screen.getByText(/Tony and the team/)).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Reach out/i }));
    await waitFor(() => {
      expect(h.getOrCreateDirectChat).toHaveBeenCalledWith(
        { uid: "v1", displayName: "Phil Day" },
        { uid: "ft1", displayName: "Tony Wang" },
      );
      expect(mockNavigate).toHaveBeenCalledWith("/messages");
    });
  });

  it("falls back to email when the DM cannot be created", async () => {
    seedFullTimers();
    h.getOrCreateDirectChat.mockRejectedValueOnce(new Error("blocked"));
    const original = window.location;
    Object.defineProperty(window, "location", { value: { href: "" }, writable: true });

    render(<LandingCommunity />);
    await waitFor(() => expect(screen.getByText(/Tony and the team/)).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Reach out/i }));

    await waitFor(() => expect(window.location.href).toBe("mailto:tony@x.com"));
    expect(mockNavigate).not.toHaveBeenCalled();
    Object.defineProperty(window, "location", { value: original, writable: true });
  });
});
