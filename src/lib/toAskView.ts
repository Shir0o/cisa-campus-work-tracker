import type { Contact, Interaction } from "../types";
import type { ThreadMessageWithContact } from "./threads";
import { contactKind } from "./contactKind";
import { parseMs } from "../components/landing/helpers";
import { traineeIds } from "./walking";
import { teamOf } from "./teams";
import type {
  ToAskClearedBy,
  ToAskInteraction,
  ToAskPerson,
  ToAskSignalMeta,
  ToAskThreadMessage,
  ToAskTrainee,
} from "./toAsk";

// The plain-data assembly the To ask derivation reads, and the words it shows.
// Pure and Firestore-free so both the page and the My Day pointer card build
// the same input, and the composition is unit-testable without a DOM.

export type Translate = (key: string, fallback?: string) => string;

/** The roster as `buildToAsk` reads it: a name and the ties grouping needs. */
export function toAskPeopleOf(contacts: Contact[]): ToAskPerson[] {
  return contacts.map((c) => ({
    id: c.id,
    name: c.name,
    kind: contactKind(c),
    createdAtMs: parseMs(c.createdAt),
    createdBy: c.createdBy ?? null,
    addedBy: c.addedBy ?? null,
    coCreators: c.coCreators ?? null,
    founders: c.founders ?? null,
    carers: c.carers ?? null,
    unfollowedBy: c.unfollowedBy ?? null,
  }));
}

export function toAskInteractionsOf(interactions: Interaction[]): ToAskInteraction[] {
  return interactions.map((i) => ({
    contactId: i.contactId ?? "",
    ms: parseMs(i.dateTime || i.createdAt) ?? Number.NaN,
    userId: i.reachedById ?? i.userId ?? null,
    userName: i.reachedByName ?? i.userName ?? null,
    type: i.type ?? null,
  }));
}

export function toAskMessagesOf(threads: ThreadMessageWithContact[]): ToAskThreadMessage[] {
  return threads.map((m) => ({
    id: m.id,
    contactId: m.contactId,
    interactionId: m.interactionId ?? null,
    from: m.from,
    fromName: m.fromName,
    kind: m.kind,
    body: m.body,
    at: m.at,
    closedAt: m.closedAt ?? null,
    closedByName: m.closedByName ?? null,
    parentId: m.parentId ?? null,
  }));
}

/** Every Trainee on the roster, with the team the filter reads and a name. */
export function toAskTraineesOf(nameByUid: Record<string, string | undefined>): ToAskTrainee[] {
  return traineeIds().map((uid) => ({
    uid,
    name: nameByUid[uid]?.trim() || uid,
    team: teamOf(uid),
  }));
}

/** The app's own words for a drafted line, when the Full-timer has not
 *  reworded it. The module returns the same English as a fallback. */
export function draftText(signal: ToAskSignalMeta, t: Translate): string {
  const name = signal.contactName;
  if (signal.kind === "notReached") {
    return t("toAsk.draft_not_reached", "{name} — not reached yet").replace("{name}", name);
  }
  const asker = signal.askerName || "Someone";
  if (signal.kind === "ask") {
    return (
      signal.mine
        ? t("toAsk.draft_ask_mine", "{name} — your follow-up ask is still open")
        : t("toAsk.draft_ask_theirs", "{name} — {asker}'s follow-up ask is still open")
    )
      .replace("{name}", name)
      .replace("{asker}", asker);
  }
  return (
    signal.mine
      ? t("toAsk.draft_question_mine", "{name} — your question has no reply")
      : t("toAsk.draft_question_theirs", "{name} — {asker}'s question has no reply")
  )
    .replace("{name}", name)
    .replace("{asker}", asker);
}

/** The signal chip under a drafted line, e.g. "Not reached yet · added 12 days ago". */
export function signalChip(signal: ToAskSignalMeta, t: Translate): string {
  const days = signal.days;
  const asker = signal.askerName || "Someone";
  if (signal.kind === "notReached") {
    return days === 1
      ? t("toAsk.sig_not_reached_one", "Not reached yet · added 1 day ago")
      : t("toAsk.sig_not_reached", "Not reached yet · added {days} days ago").replace(
          "{days}",
          String(days),
        );
  }
  if (signal.kind === "ask") {
    return (
      signal.mine
        ? t("toAsk.sig_ask_mine", "Follow-up ask open {days} days")
        : t("toAsk.sig_ask_theirs", "{asker}'s follow-up ask open {days} days")
    )
      .replace("{asker}", asker)
      .replace("{days}", String(days));
  }
  return (
    signal.mine
      ? t("toAsk.sig_question_mine", "Question unanswered {days} days")
      : t("toAsk.sig_question_theirs", "{asker}'s question unanswered {days} days")
  )
    .replace("{asker}", asker)
    .replace("{days}", String(days));
}

/** What cleared a struck-through line. */
export function clearedText(cleared: ToAskClearedBy, t: Translate): string {
  if (cleared.reason === "askClosed") return t("toAsk.cleared_ask", "Cleared · the ask closed");
  if (cleared.reason === "answered") {
    return t("toAsk.cleared_answered", "Cleared · answered in the Thread");
  }
  return cleared.name
    ? t("toAsk.cleared_named", "Cleared · {name} reached them").replace("{name}", cleared.name)
    : t("toAsk.cleared_reached", "Cleared · reached");
}
