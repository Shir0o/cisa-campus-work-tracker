import type { Contact, Interaction } from "../types";
import type { ThreadMessageWithContact } from "./threads";
import { contactKind } from "./contactKind";
import { parseMs } from "../components/landing/helpers";
import { traineeIds } from "./walking";
import { teamOf } from "./teams";
import type {
  ToAskClearedBy,
  ToAskUpdateDest,
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
    id: i.id,
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
    scope: m.scope === "team" ? "team" : null,
    mentionedUserIds: m.mentionedUserIds ?? null,
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
  if (signal.kind === "mention") {
    return (
      signal.mine
        ? t("toAsk.draft_mention_mine", "{name} — your mention is still open")
        : t("toAsk.draft_mention_theirs", "{name} — {asker}'s mention is still open")
    )
      .replace("{name}", name)
      .replace("{asker}", asker);
  }
  if (signal.kind === "noReply") {
    return (
      signal.mine
        ? t("toAsk.draft_no_reply_mine", "{name} — you texted them and heard nothing back")
        : t("toAsk.draft_no_reply_theirs", "{name} — {reacher} texted them and heard nothing back")
    )
      .replace("{name}", name)
      .replace("{reacher}", signal.reacherName || "Someone");
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
  if (signal.kind === "mention") {
    return (
      signal.mine
        ? t("toAsk.sig_mention_mine", "Mention open {days} days")
        : t("toAsk.sig_mention_theirs", "{asker}'s mention open {days} days")
    )
      .replace("{asker}", asker)
      .replace("{days}", String(days));
  }
  if (signal.kind === "noReply") {
    const reacher = signal.reacherName || "Someone";
    if (signal.mine) {
      return days === 1
        ? t("toAsk.sig_no_reply_mine_one", "You texted 1 day ago · no reply")
        : t("toAsk.sig_no_reply_mine", "You texted {days} days ago · no reply").replace(
            "{days}",
            String(days),
          );
    }
    return days === 1
      ? t("toAsk.sig_no_reply_theirs_one", "{reacher} texted 1 day ago · no reply").replace(
          "{reacher}",
          reacher,
        )
      : t("toAsk.sig_no_reply_theirs", "{reacher} texted {days} days ago · no reply")
          .replace("{reacher}", reacher)
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
  if (cleared.reason === "mentionClosed") return t("toAsk.cleared_mention", "Cleared · the mention closed");
  if (cleared.reason === "answered") {
    return t("toAsk.cleared_answered", "Cleared · answered in the Thread");
  }
  return cleared.name
    ? t("toAsk.cleared_named", "Cleared · {name} reached them").replace("{name}", cleared.name)
    : t("toAsk.cleared_reached", "Cleared · reached");
}

/** Where an update went, for "Your update · 2h ago · {where}". */
export function updateWhere(dest: ToAskUpdateDest, t: Translate): string {
  if (dest === "contact") return t("toAsk.update_where_contact", "logged on their page");
  if (dest === "thread") return t("toAsk.update_where_thread", "replied in the Thread");
  return t("toAsk.update_where_line", "only on this line");
}

/** A short "how long ago" for an update: just now, minutes, hours, then days. */
export function updateAgo(at: string, nowMs: number, t: Translate): string {
  const ms = parseMs(at);
  if (ms == null) return "";
  const minutes = Math.max(0, Math.floor((nowMs - ms) / 60_000));
  if (minutes < 1) return t("toAsk.ago_now", "just now");
  if (minutes < 60) return t("toAsk.ago_minutes", "{n}m ago").replace("{n}", String(minutes));
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("toAsk.ago_hours", "{n}h ago").replace("{n}", String(hours));
  const days = Math.floor(hours / 24);
  return days === 1
    ? t("toAsk.ago_day", "1 day ago")
    : t("toAsk.ago_days", "{n} days ago").replace("{n}", String(days));
}

/** The composer's destination pill, e.g. "Priya's page · log for Jae". */
export function destLabel(
  dest: ToAskUpdateDest,
  names: { contact?: string | null; trainee?: string | null },
  t: Translate,
): string {
  if (dest === "line") return t("toAsk.dest_line", "Only this line");
  if (dest === "thread") return t("toAsk.dest_thread", "Reply in the Thread");
  const contact = names.contact || t("toAsk.this_person", "This person");
  return names.trainee
    ? t("toAsk.dest_contact_for", "{contact}'s page · log for {trainee}")
        .replace("{contact}", contact)
        .replace("{trainee}", names.trainee)
    : t("toAsk.dest_contact", "{contact}'s page").replace("{contact}", contact);
}

/** The one-line hint under the composer: what the chosen destination does. */
export function destHint(
  dest: ToAskUpdateDest,
  names: { contact?: string | null; trainee?: string | null },
  t: Translate,
): string {
  const contact = names.contact || t("toAsk.this_person", "This person");
  if (dest === "thread") {
    return t("toAsk.hint_thread", "Posts it as your reply in {contact}'s Thread, where the team sees it.").replace(
      "{contact}",
      contact,
    );
  }
  if (dest === "contact") {
    return names.trainee
      ? t("toAsk.hint_contact_for", "Logs it on {contact}'s page as {trainee} reaching them, so it counts as reached.")
          .replace("{contact}", contact)
          .replace("{trainee}", names.trainee)
      : t("toAsk.hint_contact", "Logs it on {contact}'s page, so it counts as reached.").replace("{contact}", contact);
  }
  return t("toAsk.hint_line", "Kept on this line. Only you see it.");
}
