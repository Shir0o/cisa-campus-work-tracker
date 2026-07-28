import { describe, it, expect, vi } from "vitest";

// Mock firebase before importing todos.ts
vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  collection: vi.fn(),
  doc: vi.fn(),
  serverTimestamp: vi.fn(),
}));

vi.mock('../lib/firebase', () => ({
  db: 'mock-db',
  handleFirestoreError: vi.fn(),
  OperationType: { CREATE: 'create', UPDATE: 'update', DELETE: 'delete', LIST: 'list' },
  sendNotification: vi.fn(),
}));

import {
  buildAssignmentNotificationPayload,
  buildCompletionNotificationPayload,
} from "../lib/todos";

describe("todo notification payload builders", () => {
  // ── buildAssignmentNotificationPayload ──────────────────────────────

  describe("buildAssignmentNotificationPayload", () => {
    it("builds a payload with first name of assigner", () => {
      const result = buildAssignmentNotificationPayload({
        assigneeId: "user-1",
        title: "Fix the bug",
        assignerName: "Alice Smith",
        todoId: "todo-1",
      });
      expect(result).toEqual({
        userId: "user-1",
        title: "New to-do",
        message: "Alice assigned you: Fix the bug",
        type: "assignment",
        link: "/",
        targetId: "todo-1",
      });
    });

    it('uses "Someone" when assignerName is null', () => {
      const result = buildAssignmentNotificationPayload({
        assigneeId: "user-1",
        title: "Do laundry",
        assignerName: null,
      });
      expect(result.message).toMatch(/^Someone assigned you/);
    });

    it('uses "Someone" when assignerName is empty', () => {
      const result = buildAssignmentNotificationPayload({
        assigneeId: "user-1",
        title: "Do laundry",
        assignerName: "   ",
      });
      expect(result.message).toMatch(/^Someone assigned you/);
    });

    it("truncates titles longer than 300 characters", () => {
      const longTitle = "A".repeat(350);
      const result = buildAssignmentNotificationPayload({
        assigneeId: "user-1",
        title: longTitle,
        assignerName: "Bob",
      });
      expect(result.message).toContain("A".repeat(300) + "…");
      expect(result.message.length).toBeLessThan(350);
    });

    it("does not truncate titles at or under 300 characters", () => {
      const title = "B".repeat(300);
      const result = buildAssignmentNotificationPayload({
        assigneeId: "user-1",
        title,
        assignerName: "Bob",
      });
      expect(result.message).toContain(title);
      expect(result.message).not.toContain("…");
    });
  });

  // ── buildCompletionNotificationPayload ─────────────────────────────

  describe("buildCompletionNotificationPayload", () => {
    it("builds a payload with first name of completer", () => {
      const result = buildCompletionNotificationPayload({
        createdById: "user-2",
        title: "Review PR",
        completerName: "Charlie Brown",
        todoId: "todo-2",
      });
      expect(result).toEqual({
        userId: "user-2",
        title: "To-do completed",
        message: "Charlie completed: Review PR",
        type: "success",
        link: "/",
        targetId: "todo-2",
      });
    });

    it('uses "Someone" when completerName is null', () => {
      const result = buildCompletionNotificationPayload({
        createdById: "user-2",
        title: "Task",
        completerName: null,
      });
      expect(result.message).toMatch(/^Someone completed/);
    });

    it("truncates titles longer than 300 characters", () => {
      const longTitle = "C".repeat(350);
      const result = buildCompletionNotificationPayload({
        createdById: "user-2",
        title: longTitle,
        completerName: "Dan",
      });
      expect(result.message).toContain("C".repeat(300) + "…");
    });

    it("does not truncate titles at or under 300 characters", () => {
      const title = "D".repeat(300);
      const result = buildCompletionNotificationPayload({
        createdById: "user-2",
        title,
        completerName: "Dan",
      });
      expect(result.message).toContain(title);
      expect(result.message).not.toContain("…");
    });
  });
});
