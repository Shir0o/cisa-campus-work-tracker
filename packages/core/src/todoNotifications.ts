// Pure todo notification payload creators & due-date helpers.
// Kept pure and side-effect free for cross-platform reuse (web & mobile).

export interface TodoNotifyPayload {
  userId: string;
  title: string;
  message: string;
  type: "assignment" | "info" | "success";
  link?: string;
  targetId?: string;
}

export interface TodoItemForNotify {
  id: string;
  title: string;
  assigneeId?: string | null;
  createdById?: string | null;
  dueDate?: string | null;
  status?: string;
}

/** Formats a person's display name to just their first name. */
function firstName(name?: string | null): string {
  if (!name || !name.trim()) return "Someone";
  return name.trim().split(/\s+/)[0];
}

/** Payload when a task is assigned/reassigned to a user. */
export function buildAssignmentNotificationPayload(params: {
  assigneeId: string;
  title: string;
  assignerName?: string | null;
  todoId?: string;
}): TodoNotifyPayload {
  const who = firstName(params.assignerName);
  const truncatedTitle = params.title.length > 300 ? params.title.slice(0, 300) + "…" : params.title;
  return {
    userId: params.assigneeId,
    title: "New to-do",
    message: `${who} assigned you: ${truncatedTitle}`,
    type: "assignment",
    link: "/",
    targetId: params.todoId,
  };
}

/** Payload when a task is completed by someone other than the creator. */
export function buildCompletionNotificationPayload(params: {
  createdById: string;
  title: string;
  completerName?: string | null;
  todoId?: string;
}): TodoNotifyPayload {
  const who = firstName(params.completerName);
  const truncatedTitle = params.title.length > 300 ? params.title.slice(0, 300) + "…" : params.title;
  return {
    userId: params.createdById,
    title: "To-do completed",
    message: `${who} completed: ${truncatedTitle}`,
    type: "success",
    link: "/",
    targetId: params.todoId,
  };
}

/** Payload for a todo that is due today. */
export function buildDueNotificationPayload(params: {
  userId: string;
  title: string;
  dueDate?: string | null;
  todoId?: string;
}): TodoNotifyPayload {
  const truncatedTitle = params.title.length > 300 ? params.title.slice(0, 300) + "…" : params.title;
  return {
    userId: params.userId,
    title: "To-do due today",
    message: `Due today: ${truncatedTitle}`,
    type: "info",
    link: "/",
    targetId: params.todoId,
  };
}

/**
 * Filter pending to-dos that are due on a specific target date (yyyy-MM-dd)
 * for a specific user (either assigned to them, or created by them if unassigned).
 */
export function findDueTodosForUser(
  todos: TodoItemForNotify[],
  userId: string,
  targetDateISO: string,
): TodoItemForNotify[] {
  return todos.filter((t) => {
    if (t.status === "completed") return false;
    if (!t.dueDate || t.dueDate !== targetDateISO) return false;
    // Assigned to this user
    if (t.assigneeId === userId) return true;
    // Or created by this user and unassigned
    if (!t.assigneeId && t.createdById === userId) return true;
    return false;
  });
}
