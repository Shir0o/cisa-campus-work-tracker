// A shared "make a to-do" composer for the one-tap entry points (an attendance
// absence, a prayer, a chat message). Each site opens it with the contact it
// came from and the live item as its source — the one shared helper over
// `addTodo` the sites share.
import TodoComposer from "./TodoComposer";
import type { TodoPerson } from "../../lib/todos";

export default function FromEntryTodoComposer({
  text,
  contactId,
  contactName,
  source,
  team,
  meUid,
  meName,
  onClose,
}: {
  text: string;
  contactId?: string | null;
  contactName?: string | null;
  source: { docId?: string | null; docTitle?: string | null; interactionId?: string | null; interactionTitle?: string | null } | null;
  team: TodoPerson[];
  meUid: string;
  meName: string;
  onClose: () => void;
}) {
  return (
    <TodoComposer
      mode="create"
      initial={{ text, assigneeId: meUid || null, contactId: contactId ?? null, contactName: contactName ?? null }}
      source={source}
      team={team}
      meUid={meUid}
      meName={meName}
      onClose={onClose}
      onSaved={onClose}
    />
  );
}