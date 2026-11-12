// An @mention is the only "for you" signal in a Conversation. Every message is
// a plain comment; naming a teammate puts it on that teammate's list — the
// inbox, My Day and Around the team, the worklist card, To ask and the queue —
// until it is closed for everyone it named, by:
//   • the first reply from any mentioned person,
//   • any mentioned person pressing Done, or
//   • the sender pressing Never mind.
// A reply from someone not mentioned leaves it open. Closing writes the same
// three keys a Follow-up ask uses (`closedBy`, `closedByName`, `closedAt`), so
// a closed mention is read the same way on every surface and by the reminder.
//
// Legacy `question` and `nudge` messages keep their own rules until they
// close; nothing writes those kinds any more.

/** The fields the mention rules read. */
export interface MentionMessage {
  id: string;
  from: string;
  kind?: string | null;
  at: string;
  parentId?: string | null;
  mentionedUserIds?: readonly string[] | null;
  closedAt?: string | null;
}

/** Kinds that keep their pre-mention open/close rules. */
const LEGACY_ASK_KINDS = new Set(["question", "nudge"]);

const time = (iso: string) => {
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? 0 : t;
};

/** Everyone a message names, without its author, once each. */
export function mentionedOthers(m: MentionMessage): string[] {
  const out: string[] = [];
  for (const uid of m.mentionedUserIds ?? []) {
    if (uid && uid !== m.from && !out.includes(uid)) out.push(uid);
  }
  return out;
}

/** A message that names someone and so is on their list (open or closed). */
export function isMentionItem(m: MentionMessage): boolean {
  return !LEGACY_ASK_KINDS.has(m.kind ?? "") && mentionedOthers(m).length > 0;
}

/** Still waiting on the people it names. */
export function isOpenMention(m: MentionMessage): boolean {
  return isMentionItem(m) && !m.closedAt;
}

/** Still on `uid`'s list: it names them and nobody has closed it. */
export function isOpenMentionFor(m: MentionMessage, uid: string): boolean {
  return isOpenMention(m) && mentionedOthers(m).includes(uid);
}

/** Who an open mention is still waiting on; empty once closed. */
export function waitingOn(m: MentionMessage): string[] {
  return isOpenMention(m) ? mentionedOthers(m) : [];
}

/**
 * The open mentions a reply closes: the message it answers, and any earlier
 * reply in the same Thread, when the reply's author is one of the people named.
 * Replies are one level deep, so a mention written as a reply is answered by a
 * later reply under the same parent.
 */
export function mentionsClosedByReply<M extends MentionMessage>(messages: readonly M[], reply: MentionMessage): M[] {
  const parentId = reply.parentId;
  if (!parentId) return [];
  const at = time(reply.at);
  return messages.filter(
    (m) =>
      m.id !== reply.id &&
      (m.id === parentId || (m.parentId === parentId && time(m.at) < at)) &&
      isOpenMentionFor(m, reply.from),
  );
}

/** "Tony", "Tony and Sarah", "Tony, Sarah and Jae" — `and` is the caller's word. */
export function joinNames(names: readonly string[], and: string): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} ${and} ${names[names.length - 1]}`;
}
