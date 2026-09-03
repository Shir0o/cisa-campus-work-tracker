import { describe, it, expect, beforeEach } from "vitest";
import {
  TEAMS,
  applyTeams,
  teamOf,
  isKnownTeam,
  teamLabelKey,
  uidsOnTeam,
} from "../lib/teams";

describe("teams roster (#727)", () => {
  beforeEach(() => applyTeams([]));

  it("ships the two teams the feedback named, in order", () => {
    expect(TEAMS.map((t) => t.id)).toEqual(["yp", "campus"]);
  });

  it("reads a trainee's team off the roster", () => {
    applyTeams([
      { uid: "u1", team: "yp" },
      { uid: "u2", team: "campus" },
    ]);
    expect(teamOf("u1")).toBe("yp");
    expect(teamOf("u2")).toBe("campus");
  });

  it("returns null for anyone unassigned, unknown, or nullish", () => {
    applyTeams([{ uid: "u1", team: "yp" }]);
    expect(teamOf("u9")).toBeNull();
    expect(teamOf(null)).toBeNull();
    expect(teamOf(undefined)).toBeNull();
  });

  it("ignores a team value that is not one of ours, rather than trusting the document", () => {
    applyTeams([{ uid: "u1", team: "not-a-team" }, { uid: "u2", team: "" }]);
    expect(teamOf("u1")).toBeNull();
    expect(teamOf("u2")).toBeNull();
    expect(isKnownTeam("not-a-team")).toBe(false);
    expect(isKnownTeam("campus")).toBe(true);
  });

  it("replaces the whole roster on each apply, so a cleared team stops reading", () => {
    applyTeams([{ uid: "u1", team: "yp" }]);
    applyTeams([{ uid: "u1", team: null }]);
    expect(teamOf("u1")).toBeNull();
  });

  it("lists who is on a team", () => {
    applyTeams([
      { uid: "u1", team: "yp" },
      { uid: "u2", team: "campus" },
      { uid: "u3", team: "yp" },
    ]);
    expect(uidsOnTeam("yp").sort()).toEqual(["u1", "u3"]);
    expect(uidsOnTeam("campus")).toEqual(["u2"]);
  });

  it("names a translation key per team so the chips can be translated", () => {
    expect(teamLabelKey("yp")).toBe("teams.yp");
    expect(teamLabelKey("campus")).toBe("teams.campus");
  });
});
