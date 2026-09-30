// The Around-the-team conversation strip (#1012) posts through the contact's
// staff thread. A Full-timer's comment, question or follow-up ask from there
// must reach every Trainee tied to the person — founders and carers included,
// not only the creator (#1166).
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { CardConversation } from "../components/landing/CardConversation";
import type { Contact } from "../types";

vi.mock("../components/AuthProvider", () => ({
  useAuth: () => ({ user: { uid: "ft1", displayName: "Tony Wang" }, effectiveUserId: "ft1", role: "admin" }),
}));

vi.mock("../lib/firebase", () => ({
  db: {},
  auth: { currentUser: { uid: "ft1" } },
  handleFirestoreError: vi.fn(),
  OperationType: { READ: "read", WRITE: "write", LIST: "list", CREATE: "create", UPDATE: "update" },
}));

const addThreadMessage = vi.fn(async () => "m1");
vi.mock("../lib/threads", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/threads")>();
  return { ...actual, addThreadMessage: (...args: unknown[]) => addThreadMessage(...(args as [])) };
});

describe("CardConversation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("notifies every Trainee tied to the person, founders and carers included", async () => {
    const contact = {
      id: "c1",
      name: "Priya Shah",
      createdBy: "t1",
      addedBy: "t1",
      coCreators: ["t2"],
      founders: ["t1", "t3"],
      carers: ["t4"],
    } as Contact;

    render(
      <CardConversation contact={contact} uid="ft1" messages={[]} justPosted={new Set()} onPosted={vi.fn()} />,
    );

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "How did coffee go?" } });
    fireEvent.click(screen.getByRole("button", { name: "Post" }));

    await vi.waitFor(() => expect(addThreadMessage).toHaveBeenCalled());
    const notify = (addThreadMessage.mock.calls[0] as unknown[])[2] as { stakeholders: unknown };
    expect(notify.stakeholders).toEqual({
      createdBy: "t1",
      addedBy: "t1",
      coCreators: ["t2"],
      founders: ["t1", "t3"],
      carers: ["t4"],
    });
  });

  const kofi = { id: "c1", name: "Kofi Mensah", createdBy: "t1" } as Contact;
  const roster = [
    { id: "ruth", name: "Ruth Chen", role: "Full-timer" },
    { id: "josh", name: "Josh Park", role: "Trainee" },
  ];
  const renderStrip = () =>
    render(
      <CardConversation contact={kofi} uid="ft1" messages={[]} justPosted={new Set()} onPosted={vi.fn()} teamMembers={roster} />,
    );

  it("reads the Conversation with kind chips and its audience above the box, in the compact stream", () => {
    const { container } = renderStrip();
    expect(screen.getByRole("group", { name: "What are you writing" })).toBeInTheDocument();
    expect(screen.getByText("Everyone tied to Kofi sees this.")).toBeInTheDocument();
    expect(container.querySelector(".strm-compact")).toBeTruthy();
  });

  it("offers Full-timers with no kinds, a lock, its own placeholder and only Full-timers to @mention", () => {
    renderStrip();
    fireEvent.click(screen.getByRole("tab", { name: /Full-timers/ }));

    expect(screen.queryByRole("group", { name: "What are you writing" })).not.toBeInTheDocument();
    expect(screen.getByText("Only Full-timers see this — Trainees can't.")).toBeInTheDocument();
    const box = screen.getByPlaceholderText("Write something only Full-timers will see…");
    fireEvent.change(box, { target: { value: "@" , selectionStart: 1 } });
    const list = screen.getByRole("listbox", { name: "Teammate mentions" });
    expect(list).toHaveTextContent("Ruth Chen");
    expect(list).not.toHaveTextContent("Josh Park");
  });
});
