import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../lib/firebase", () => ({
  db: {},
  handleFirestoreError: vi.fn(),
  OperationType: { READ: "read", WRITE: "write", LIST: "list", CREATE: "create", UPDATE: "update" },
}));

import { InboxState, __resetInboxState } from "../lib/inboxState";
import { UserEntityState, __resetUserEntityStateCache } from "../lib/userEntityState";
import { followUpContact } from "../lib/followUp";

// "I followed up" on a person-row dropdown (#1069): the same server-backed
// completion axis the worklist card uses, never the dead local-only refs.
describe("followUpContact — row \"I followed up\" completes the worklist item", () => {
  beforeEach(() => {
    localStorage.clear();
    __resetUserEntityStateCache();
    __resetInboxState();
    vi.clearAllMocks();
  });

  it("writes the server-backed completion ref for the person", () => {
    followUpContact("u1", "c1");
    expect(InboxState.isCompleted("u1", "att:contact:c1")).toBe(true);
  });

  it("never writes the dead bare-id or contact: refs", () => {
    followUpContact("u1", "c1");
    expect(InboxState.isCompleted("u1", "c1")).toBe(false);
    expect(InboxState.isCompleted("u1", "contact:c1")).toBe(false);
    expect(UserEntityState.isDone("u1", "contact:c1")).toBe(false);
  });

  it("returns an undo that takes the completion back", () => {
    const undo = followUpContact("u1", "c1");
    undo();
    expect(InboxState.isCompleted("u1", "att:contact:c1")).toBe(false);
  });

  it("mirrors into the local synchronous cache", () => {
    followUpContact("u1", "c1");
    expect(UserEntityState.isDone("u1", "att:contact:c1")).toBe(true);
  });
});