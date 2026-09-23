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
});
