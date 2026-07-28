import { describe, expect, it } from "vitest";
import {
  buildAssignmentNotificationPayload,
  buildCompletionNotificationPayload,
  buildDueNotificationPayload,
  findDueTodosForUser,
} from "../src/todoNotifications";

describe("todoNotifications", () => {
  describe("buildAssignmentNotificationPayload", () => {
    it("builds correct notification payload for assignment", () => {
      const payload = buildAssignmentNotificationPayload({
        assigneeId: "user-123",
        title: "Submit report",
        assignerName: "John Doe",
        todoId: "todo-1",
      });

      expect(payload).toEqual({
        userId: "user-123",
        title: "New to-do",
        message: "John assigned you: Submit report",
        type: "assignment",
        link: "/",
        targetId: "todo-1",
      });
    });

    it("truncates very long titles", () => {
      const longTitle = "A".repeat(350);
      const payload = buildAssignmentNotificationPayload({
        assigneeId: "user-123",
        title: longTitle,
        assignerName: "Jane",
      });

      expect(payload.message).toBe(`Jane assigned you: ${"A".repeat(300)}…`);
    });
  });

  describe("buildCompletionNotificationPayload", () => {
    it("builds correct notification payload when completed", () => {
      const payload = buildCompletionNotificationPayload({
        createdById: "creator-99",
        title: "Fix bug",
        completerName: "Alex Smith",
        todoId: "todo-2",
      });

      expect(payload).toEqual({
        userId: "creator-99",
        title: "To-do completed",
        message: "Alex completed: Fix bug",
        type: "success",
        link: "/",
        targetId: "todo-2",
      });
    });
  });

  describe("buildDueNotificationPayload", () => {
    it("builds correct payload for due task", () => {
      const payload = buildDueNotificationPayload({
        userId: "user-55",
        title: "Meeting prep",
        dueDate: "2026-07-28",
        todoId: "todo-3",
      });

      expect(payload).toEqual({
        userId: "user-55",
        title: "To-do due today",
        message: "Due today: Meeting prep",
        type: "info",
        link: "/",
        targetId: "todo-3",
      });
    });
  });

  describe("findDueTodosForUser", () => {
    const todos = [
      { id: "1", title: "Task 1", assigneeId: "u1", createdById: "u2", dueDate: "2026-07-28", status: "pending" },
      { id: "2", title: "Task 2", assigneeId: "u2", createdById: "u1", dueDate: "2026-07-28", status: "pending" },
      { id: "3", title: "Task 3", assigneeId: "u1", createdById: "u2", dueDate: "2026-07-28", status: "completed" },
      { id: "4", title: "Task 4", assigneeId: "u1", createdById: "u2", dueDate: "2026-07-29", status: "pending" },
      { id: "5", title: "Task 5", assigneeId: null, createdById: "u1", dueDate: "2026-07-28", status: "pending" },
    ];

    it("returns active tasks assigned to user or created by user when unassigned due on target date", () => {
      const result = findDueTodosForUser(todos, "u1", "2026-07-28");
      expect(result.map((t) => t.id)).toEqual(["1", "5"]);
    });
  });
});
