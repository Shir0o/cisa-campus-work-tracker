import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import AttentionFeed from "../components/landing/AttentionFeed";
import { __resetUserEntityStateCache } from "../lib/userEntityState";
import { applyTeams } from "../lib/teams";
import type { Contact, Interaction } from "../types";

vi.mock("../components/AuthProvider", () => ({
  useAuth: () => ({
    user: { uid: "u1", email: "ruth@cisa.org" },
    effectiveUserId: "u1",
    role: "admin",
  }),
}));

vi.mock("../lib/firebase", () => ({
  db: {},
  auth: { currentUser: { uid: "u1" } },
}));

// Mei is on YP, Grace on Campus.
const staffNameMap = { mei: "Mei Tanaka", grace: "Grace Lim" };

const contacts: Contact[] = [
  { id: "kofi", name: "Kofi Mensah", createdBy: "mei", owner: "mei", createdAt: new Date().toISOString() } as Contact,
  { id: "aisha", name: "Aisha Rahman", createdBy: "grace", owner: "grace", createdAt: new Date().toISOString() } as Contact,
];

const interactions: Interaction[] = [
  {
    id: "i1",
    contactId: "kofi",
    userId: "mei",
    content: "Coffee after the lab",
    createdAt: new Date().toISOString(),
    dateTime: new Date().toISOString(),
    type: "meetup",
    title: "Coffee after the lab",
  } as unknown as Interaction,
];

const feed = () =>
  render(
    <AttentionFeed contacts={contacts} interactions={interactions} threads={[]} staffNameMap={staffNameMap} />,
  );

describe("AttentionFeed filters (#727)", () => {
  beforeEach(() => {
    localStorage.clear();
    __resetUserEntityStateCache();
    applyTeams([
      { uid: "mei", team: "yp", displayName: "Mei Tanaka" },
      { uid: "grace", team: "campus", displayName: "Grace Lim" },
    ]);
  });

  it("gives the feed a visible header carrying the title and the filter row", () => {
    feed();
    expect(screen.getByRole("heading", { name: "What's new" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Filter the news by team" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Filter the news by teammate" })).toBeInTheDocument();
  });

  it("shows every team's news at rest", () => {
    feed();
    expect(screen.getByText("Kofi Mensah")).toBeInTheDocument();
    expect(screen.getByText("Aisha Rahman")).toBeInTheDocument();
  });

  it("cuts on who did it when a team chip is pressed", () => {
    feed();
    fireEvent.click(screen.getByRole("button", { name: "YP team" }));
    expect(screen.getByText("Kofi Mensah")).toBeInTheDocument();
    expect(screen.queryByText("Aisha Rahman")).not.toBeInTheDocument();
  });

  it("narrows to one teammate through the select", () => {
    feed();
    fireEvent.change(screen.getByRole("combobox", { name: "Filter the news by teammate" }), {
      target: { value: "grace" },
    });
    expect(screen.getByText("Aisha Rahman")).toBeInTheDocument();
    expect(screen.queryByText("Kofi Mensah")).not.toBeInTheDocument();
  });

  it("scopes the select's options to the chosen team", () => {
    feed();
    fireEvent.click(screen.getByRole("button", { name: "YP team" }));
    const select = screen.getByRole("combobox", { name: "Filter the news by teammate" });
    expect(within(select).getByRole("option", { name: "Mei Tanaka" })).toBeInTheDocument();
    expect(within(select).queryByRole("option", { name: "Grace Lim" })).not.toBeInTheDocument();
    // and the resting option names the team it is resting inside
    expect(within(select).getByRole("option", { name: "Whole YP team" })).toBeInTheDocument();
  });

  it("drops a teammate who is not on the newly chosen team", () => {
    feed();
    const select = screen.getByRole("combobox", { name: "Filter the news by teammate" });
    fireEvent.change(select, { target: { value: "grace" } });
    fireEvent.click(screen.getByRole("button", { name: "YP team" }));
    expect(screen.getByText("Kofi Mensah")).toBeInTheDocument();
  });

  it("never offers a teammate with nothing on the feed, so the select cannot empty it", () => {
    feed();
    const select = screen.getByRole("combobox", { name: "Filter the news by teammate" });
    const named = within(select)
      .getAllByRole("option")
      .map((o) => o.textContent);
    expect(named).toEqual(["Whole team", "Grace Lim", "Mei Tanaka"]);
  });

  it("offers a rostered teammate who has done nothing, and says so when picked", () => {
    // Andre is on Campus and has nothing on the feed — the state the canvas drew.
    applyTeams([
      { uid: "mei", team: "yp", displayName: "Mei Tanaka" },
      { uid: "grace", team: "campus", displayName: "Grace Lim" },
      { uid: "andre", team: "campus", displayName: "Andre Baptiste" },
    ]);
    feed();

    const select = screen.getByRole("combobox", { name: "Filter the news by teammate" });
    expect(within(select).getByRole("option", { name: "Andre Baptiste" })).toBeInTheDocument();

    fireEvent.change(select, { target: { value: "andre" } });
    expect(screen.getByText("Nothing from Andre this week")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show everyone" }));
    expect(screen.getByText("Kofi Mensah")).toBeInTheDocument();
  });

  it("offers a way back out of an empty filter", () => {
    render(
      <AttentionFeed contacts={[contacts[0]]} interactions={interactions} threads={[]} staffNameMap={staffNameMap} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Campus team" }));
    expect(screen.getByText("Nothing from the Campus team this week")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show everyone" }));
    expect(screen.getByText("Kofi Mensah")).toBeInTheDocument();
  });

  it("recounts the header against the filter", () => {
    feed();
    const headerRow = () => screen.getByRole("heading", { name: "What's new" }).parentElement!;
    expect(within(headerRow()).getByText("2 new")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "YP team" }));
    expect(within(headerRow()).getByText("1 new")).toBeInTheDocument();
  });

  it("recounts the Around the team column too, not just the header", () => {
    feed();
    // Neither contact is u1's, so both sit in the team column.
    const teamCol = () => screen.getByRole("region", { name: "Around the team" });
    expect(within(teamCol()).getByText("2 new")).toBeInTheDocument();
    // Aisha is Grace's, on Campus — narrowing to YP leaves only Kofi.
    fireEvent.click(screen.getByRole("button", { name: "YP team" }));
    expect(within(teamCol()).getByText("1 new")).toBeInTheDocument();
  });

  it("marks a stack Talked when it holds a logged conversation", () => {
    feed();
    // Kofi has an interaction; Aisha is only a new face.
    expect(screen.getAllByText("Talked")).toHaveLength(1);
  });
});
