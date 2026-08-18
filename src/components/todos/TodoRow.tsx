import { Check, FileText, Trash2, ListChecks } from "lucide-react";
import { cn, getUserInitials } from "../../lib/utils";
import { dueChip, dueToneClass, toggleSubtask, type TodoPerson, type SubtaskItem } from "../../lib/todos";

// A reusable initials/photo avatar — shared with the to-do composer.
export function PersonAvatar({
  person,
  size = "sm",
}: {
  person?: TodoPerson;
  size?: "xs" | "sm" | "md";
}) {
  const dim = size === "md" ? "w-9 h-9 text-sm" : size === "xs" ? "w-5 h-5 text-[10px]" : "w-7 h-7 text-xs";
  const name = person?.name || "Unknown";
  if (person?.photoURL) {
    return <img src={person.photoURL} alt={name} className={cn(dim, "rounded-full object-cover shrink-0")} />;
  }
  return (
    <div
      className={cn(
        dim,
        "rounded-full bg-primary-container text-on-primary-container font-semibold flex items-center justify-center shrink-0",
      )}
      title={name}
    >
      {person ? getUserInitials(name) : "–"}
    </div>
  );
}

export interface TodoItem {
  id: string;
  title: string;
  dueDate?: string | null;
  status?: "pending" | "completed" | "canceled";
  createdById?: string | null;
  createdByName?: string | null;
  sourceDocId?: string | null;
  sourceDocTitle?: string | null;
  assigneeId?: string | null;
  contactId?: string | null;
  contactName?: string | null;
  subtasks?: SubtaskItem[];
}

const firstName = (name?: string | null) => (name ? name.split(" ")[0] : "");

// One to-do line: a round check button, the task text, a meta line
// ("from {creator} · 📄 {page}"), and a due chip. Read-only on My Day
// (toggle + jump only); the Board passes onEdit/onDelete to manage it.
export default function TodoRow({
  todo,
  assignee,
  showAssignee = false,
  first = false,
  onToggle,
  onEdit,
  onDelete,
  onJumpToSource,
  onContactClick,
}: {
  todo: TodoItem;
  assignee?: TodoPerson;
  showAssignee?: boolean;
  first?: boolean;
  onToggle: (todo: TodoItem, done: boolean) => void;
  onEdit?: (todo: TodoItem) => void;
  onDelete?: (todo: TodoItem) => void;
  onJumpToSource?: (docId: string) => void;
  onContactClick?: (contactId: string) => void;
}) {
  const isDone = todo.status === "completed";
  const due = isDone ? null : dueChip(todo.dueDate);
  const subtasks = todo.subtasks || [];
  const completedSubtasksCount = subtasks.filter((s) => s.done).length;
  const hasSubtasks = subtasks.length > 0;
  const hasMeta =
    (showAssignee && assignee) ||
    todo.createdByName ||
    (todo.sourceDocId && todo.sourceDocTitle) ||
    (todo.contactId && todo.contactName) ||
    hasSubtasks;

  const handleSubtaskToggle = async (subtaskId: string, done: boolean) => {
    try {
      await toggleSubtask(todo.id, subtasks, subtaskId, done);
    } catch {
      // ignore
    }
  };

  return (
    <div
      className={cn(
        "group flex items-start gap-3.5 py-4",
        !first && "border-t border-outline-variant/40",
      )}
    >
      <button
        onClick={() => onToggle(todo, !isDone)}
        title={isDone ? "Done — tap to reopen" : "Mark done"}
        aria-pressed={isDone}
        aria-label={isDone ? "Mark not done" : "Mark done"}
        className={cn(
          "mt-0.5 w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition-colors",
          isDone ? "bg-primary border-primary text-on-primary" : "border-outline hover:border-primary",
        )}
      >
        {isDone && <Check className="w-3 h-3" />}
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onEdit ? () => onEdit(todo) : undefined}
            disabled={!onEdit}
            className={cn(
              "block text-left text-on-surface flex-1",
              isDone && "line-through text-on-surface-variant",
              onEdit && "hover:text-accent transition-colors cursor-pointer",
            )}
          >
            {todo.title}
          </button>
          {hasSubtasks && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-on-surface-variant bg-surface-container-low px-2 py-0.5 rounded-full border border-outline-variant/50">
              <ListChecks className="w-3 h-3 text-accent" />
              {completedSubtasksCount}/{subtasks.length}
            </span>
          )}
        </div>

        {/* Subtask checklist list */}
        {hasSubtasks && (
          <div className="mt-2 space-y-1.5 pl-1 border-l-2 border-outline-variant/40">
            {subtasks.map((st) => (
              <label
                key={st.id}
                className="flex items-center gap-2 text-xs text-on-surface-variant hover:text-on-surface cursor-pointer select-none"
              >
                <input
                  type="checkbox"
                  checked={st.done}
                  onChange={(e) => handleSubtaskToggle(st.id, e.target.checked)}
                  className="w-3.5 h-3.5 rounded border-outline-variant text-accent focus:ring-primary/20 accent-primary"
                />
                <span className={cn(st.done && "line-through text-on-surface-variant/60")}>
                  {st.title}
                </span>
              </label>
            ))}
          </div>
        )}

        {hasMeta && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-sm text-on-surface-variant">
            {showAssignee && assignee && (
              <span className="inline-flex items-center gap-1.5 font-medium text-on-surface">
                <PersonAvatar person={assignee} size="xs" />
                {firstName(assignee.name)}
              </span>
            )}
            {todo.createdByName && <span>from {firstName(todo.createdByName)}</span>}
            {todo.sourceDocId && todo.sourceDocTitle && (
              <button
                type="button"
                onClick={onJumpToSource ? () => onJumpToSource(todo.sourceDocId as string) : undefined}
                disabled={!onJumpToSource}
                className={cn(
                  "inline-flex items-center gap-1 text-accent font-medium max-w-[16rem] truncate",
                  onJumpToSource && "hover:underline cursor-pointer",
                )}
                title={todo.sourceDocTitle}
              >
                <FileText className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{todo.sourceDocTitle}</span>
              </button>
            )}
            {todo.contactId && todo.contactName && (
              <button
                type="button"
                onClick={onContactClick ? () => onContactClick(todo.contactId as string) : undefined}
                disabled={!onContactClick}
                className={cn("text-accent font-medium", onContactClick && "hover:underline cursor-pointer")}
              >
                {todo.contactName}
              </button>
            )}
          </div>
        )}
      </div>

      {due && (
        <span className={cn("text-xs font-medium whitespace-nowrap shrink-0 mt-0.5", dueToneClass[due.tone])}>
          {due.label}
        </span>
      )}

      {onDelete && (
        <button
          onClick={() => onDelete(todo)}
          title="Delete to-do"
          aria-label="Delete to-do"
          className="mt-0.5 shrink-0 text-on-surface-variant/50 hover:text-error transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
