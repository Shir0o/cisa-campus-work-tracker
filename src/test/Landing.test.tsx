import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import Landing from "../views/landings/Landing";
import { useAuth } from "../components/AuthProvider";

vi.mock("../components/AuthProvider", () => ({ useAuth: vi.fn() }));
vi.mock("../views/MyDay", () => ({ default: () => <div data-testid="myday" /> }));
vi.mock("../views/landings/LandingTrainee", () => ({ default: () => <div data-testid="trainee" /> }));
vi.mock("../views/landings/LandingStudent", () => ({ default: () => <div data-testid="student" /> }));
vi.mock("../views/landings/LandingCommunity", () => ({
  default: () => <div data-testid="community" />,
}));

describe("Landing dispatcher", () => {
  const cases: [string | null, string][] = [
    ["admin", "myday"],
    ["manager", "trainee"],
    ["operator", "student"],
    ["viewer", "community"],
    [null, "myday"], // unknown/loading falls back to the Full-timer cockpit
  ];

  for (const [role, testid] of cases) {
    it(`renders the ${testid} home for role ${role}`, () => {
      (useAuth as any).mockReturnValue({ role });
      render(<Landing />);
      expect(screen.getByTestId(testid)).toBeInTheDocument();
    });
  }
});
