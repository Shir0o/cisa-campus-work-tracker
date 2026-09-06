import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import AttentionFeed from "../components/landing/AttentionFeed";
import { __resetUserEntityStateCache } from "../lib/userEntityState";
import { __resetInboxState } from "../lib/inboxState";
import type { Contact } from "../types";

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
  handleFirestoreError: vi.fn(),
  OperationType: { READ: "read", WRITE: "write", LIST: "list", CREATE: "create", UPDATE: "update" },
}));

// A person added by Mei (not u1) lands in the "Around the team" column; one
// tied to u1 lands in "On you".
const contact = (over: Partial<Contact>): Contact =>
  ({
    id: "kofi",
    name: "Kofi Mensah",
    createdBy: "mei",
    owner: "mei",
    createdAt: new Date().toISOString(),
    ...over,
  }) as Contact;

const renderFeed = (contacts: Contact[], onOpenContact?: (c: Contact) => void) =>
  render(
    <AttentionFeed contacts={contacts} interactions={[]} threads={[]} staffNameMap={{}} onOpenContact={onOpenContact} />,
  );

const teamCol = () => screen.getByRole("region", { name: "Around the team" });

describe("Around the team reach affordance (#828)", () => {
  beforeEach(() => {
    localStorage.clear();
    __resetUserEntityStateCache();
    __resetInboxState();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reaches a person with a phone by call, without opening their page", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    const onOpenContact = vi.fn();
    renderFeed([contact({ phone: "+15551234567" })], onOpenContact);
    const callBtn = within(teamCol()).getByRole("button", { name: "Call" });
    fireEvent.click(callBtn);
    expect(openSpy).toHaveBeenCalledWith("tel:+15551234567");
    expect(onOpenContact).not.toHaveBeenCalled();
  });

  it("reaches an email-only person by mailto", () => {
    renderFeed([contact({ email: "kofi@campus.org" })]);
    const link = within(teamCol()).getByRole("link", { name: "Email" });
    expect(link).toHaveAttribute("href", "mailto:kofi@campus.org");
  });

  it("offers both channels when the person has both", () => {
    renderFeed([contact({ phone: "+15551234567", email: "kofi@campus.org" })]);
    expect(within(teamCol()).getByRole("button", { name: "Call" })).toBeInTheDocument();
    expect(within(teamCol()).getByRole("link", { name: "Email" })).toHaveAttribute(
      "href",
      "mailto:kofi@campus.org",
    );
  });

  it("shows no reach affordance when the person has neither — empty string counts as absent", () => {
    renderFeed([contact({ phone: "", email: "" })]);
    expect(within(teamCol()).queryByRole("button", { name: "Call" })).not.toBeInTheDocument();
    expect(within(teamCol()).queryByRole("link", { name: "Email" })).not.toBeInTheDocument();
  });

  it("leaves the On you column untouched", () => {
    // Mei added them (so the stack exists) but u1 owns them — the tie puts the
    // row in "On you", where no reach affordance belongs.
    renderFeed([
      contact({ owner: "u1", phone: "+15551234567", email: "kofi@campus.org" }),
    ]);
    const youCol = screen.getByRole("region", { name: "On you" });
    expect(within(youCol).getByText("Kofi Mensah")).toBeInTheDocument();
    expect(within(youCol).queryByRole("button", { name: "Call" })).not.toBeInTheDocument();
    expect(within(youCol).queryByRole("link", { name: "Email" })).not.toBeInTheDocument();
  });
});
