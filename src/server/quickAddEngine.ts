// Quick add's parse and merge (cut-or-keep §26). Kept pure and injected so the
// mapping from a canned model response is pinned without calling Gemini: the
// route supplies the model call, this decides what the preview sees.
import { QUICK_ADD_STEPS, quickAddNameKey } from "../../packages/core/src/quickAdd";
import type {
  QuickAddContactDraft,
  QuickAddInteractionDraft,
  QuickAddMatch,
  QuickAddParseResponse,
  QuickAddReminderDraft,
} from "../../packages/core/src/quickAdd";
import { YEARS } from "../lib/contactYear";

export interface QuickAddExistingContact {
  id: string;
  name: string;
}

/** Who the parse is for: a Trainee is scoped to the people tied to them, a
 *  Full-timer sees everyone, and anyone unapproved is refused */
export interface QuickAddCaller {
  role?: string | null;
  approved?: boolean | null;
  /** The sign-in completed a second factor (Full-timers are enrolled, ADR 0029). */
  secondFactor?: boolean;
}

export interface QuickAddAccess {
  allowed: boolean;
  /** Why the caller was refused; absent when allowed. */
  reason?: string;
  uid: string;
  seesAll: boolean;
}

/** The role decision behind the route's 403: only an approved Full-timer or
 *  Trainee may parse a note, and only a Full-timer sees the whole directory. */
export function resolveQuickAddAccess(
  uid: string,
  caller: QuickAddCaller | null | undefined,
): QuickAddAccess {
  if (!caller) {
    return { allowed: false, reason: "User does not exist in the system", uid, seesAll: false };
  }
  if (caller.approved !== true) {
    return { allowed: false, reason: "User is not approved", uid, seesAll: false };
  }
  if (caller.role === "admin") {
    // The whole directory goes to the model, so the admin path keeps the MFA
    // bar every other admin route holds.
    if (caller.secondFactor !== true) {
      return { allowed: false, reason: "Multi-factor authentication required", uid, seesAll: false };
    }
    return { allowed: true, uid, seesAll: true };
  }
  if (caller.role === "manager") return { allowed: true, uid, seesAll: false };
  return {
    allowed: false,
    reason: "Quick add is for approved Full-timers and Trainees",
    uid,
    seesAll: false,
  };
}

/** A directory row with the tie list the caller's scope is measured by. */
export interface QuickAddDirectoryContact extends QuickAddExistingContact {
  visibleTo?: string[] | null;
}

/** The people the caller may match against: everyone for a Full-timer, only
 *  those whose `visibleTo` names them for a Trainee. Never a wider list. */
export function selectQuickAddContacts(
  contacts: QuickAddDirectoryContact[],
  access: QuickAddAccess,
): QuickAddExistingContact[] {
  if (!access.allowed) return [];
  const visible = access.seesAll
    ? contacts
    : contacts.filter((contact) => (contact.visibleTo || []).includes(access.uid));
  return visible.map(({ id, name }) => ({ id, name }));
}

/** The JSON shape the model is asked for. Every key may be absent. */
export interface QuickAddModelResult {
  contact?: {
    name?: string | null;
    phone?: string | null;
    email?: string | null;
    year?: string | null;
    step?: string | null;
    tags?: string[] | null;
  } | null;
  interaction?: {
    type?: string | null;
    when?: string | null;
    notes?: string | null;
  } | null;
  prayer?: string | null;
  reminder?: {
    when?: string | null;
    text?: string | null;
  } | null;
}

export const QUICK_ADD_SYSTEM_INSTRUCTION = `You are an assistant for a campus ministry work tracker. Parse one short note about one person into structured fields:
- contact: name (first and last if given), phone, email, year (one of: ${YEARS.join(", ")}) and step (one of: ${QUICK_ADD_STEPS.join(", ")}). Only fill a field the note supports; otherwise omit it. Tags are short topics the note names (e.g. "Bible study").
- interaction: the conversation the note describes — type (meeting, call, text, visit, chat, or other), when (yyyy-MM-dd, or today if unstated) and notes (what to remember).
- prayer: a prayer request for this person, in their words if possible.
- reminder: a follow-up to come back to — when (yyyy-MM-dd) and text (what to do).
Never invent a person, a prayer, or a reminder the note does not mention. Omit parts the note does not have.`;

/** The prompt handed to Gemini: the note, plus the names already in the
 *  directory so the model does not duplicate a person it can see. */
export function buildQuickAddPrompt(text: string, contacts: QuickAddExistingContact[]): string {
  return `Parse this quick note about one person.

Note:
${text}

Existing contacts (for context only; a separate match step decides who this is):
${JSON.stringify(contacts.map(({ id, name }) => ({ id, name })))}`;
}

/** First + last name, lower-cased — the key matching uses on both sides. */
function nameKey(name: string): string {
  const parts = quickAddNameKey(name)
    .replace(/[.,]/g, "")
    .split(" ")
    .filter(Boolean);
  if (parts.length === 0) return "";
  return parts.length === 1 ? parts[0] : `${parts[0]} ${parts[parts.length - 1]}`;
}

/** Every person the parsed name could be. Never chooses one: the preview does. */
export function matchQuickAddContacts(
  name: string,
  contacts: QuickAddExistingContact[],
): QuickAddMatch[] {
  const target = nameKey(name);
  if (!target) return [];
  const targetParts = target.split(" ");
  return contacts
    .filter((contact) => {
      const candidate = nameKey(contact.name);
      if (!candidate) return false;
      if (candidate === target) return true;
      const candidateParts = candidate.split(" ");
      // A first name alone ("Jordan") matches the full-name person; a full
      // name never matches a different full name ("Jordan Smith" ≠ "Jordan Lee").
      if (targetParts.length === 1) return candidateParts[0] === targetParts[0];
      if (candidateParts.length === 1) return candidateParts[0] === targetParts[0];
      return false;
    })
    .map(({ id, name: matchedName }) => ({ id, name: matchedName }));
}

const textOf = (value: unknown, max = 500): string =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

/** A year the note stated in any case, written as the list spells it. */
function canonicalYear(value: unknown): string {
  const raw = textOf(value, 64);
  if (!raw) return "";
  return YEARS.find((year) => year.toLowerCase() === raw.toLowerCase()) ?? "";
}

/** A step the note stated in any case, written as the stored value. */
function canonicalStep(value: unknown): string {
  const raw = textOf(value, 64).toLowerCase();
  if (!raw) return "";
  return (QUICK_ADD_STEPS as readonly string[]).includes(raw) ? raw : "";
}

function tagsOf(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const item of value) {
    const tag = textOf(item, 40);
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
  }
  return tags.slice(0, 30);
}

/** Maps the model's JSON onto the preview's fields, then matches every existing
 *  person with that name. A note that names nobody returns an empty name and no
 *  matches, which is what blocks Save. */
export function buildQuickAddResult(
  model: QuickAddModelResult | null,
  contacts: QuickAddExistingContact[],
): QuickAddParseResponse {
  const rawContact = model?.contact ?? {};
  const contact: QuickAddContactDraft = {
    name: textOf(rawContact.name, 128),
    phone: textOf(rawContact.phone, 32),
    email: textOf(rawContact.email, 128),
    year: canonicalYear(rawContact.year),
    step: canonicalStep(rawContact.step),
    tags: tagsOf(rawContact.tags),
  };

  const result: QuickAddParseResponse = {
    contact,
    match: matchQuickAddContacts(contact.name, contacts),
  };

  const rawInteraction = model?.interaction;
  const interaction: QuickAddInteractionDraft = {
    type: textOf(rawInteraction?.type, 40).toLowerCase(),
    when: textOf(rawInteraction?.when, 64),
    notes: textOf(rawInteraction?.notes, 5000),
  };
  if (interaction.type || interaction.when || interaction.notes) result.interaction = interaction;

  const prayer = textOf(model?.prayer, 5000);
  if (prayer) result.prayer = prayer;

  const rawReminder = model?.reminder;
  const reminder: QuickAddReminderDraft = {
    when: textOf(rawReminder?.when, 64),
    text: textOf(rawReminder?.text, 500),
  };
  if (reminder.when || reminder.text) result.reminder = reminder;

  return result;
}

/** Parse the model's JSON, then merge it. Malformed JSON fails loudly so the
 *  route can answer 500 rather than show an empty preview. */
export function parseQuickAddModelResponse(raw: string): QuickAddModelResult {
  try {
    return JSON.parse(raw.trim()) as QuickAddModelResult;
  } catch (error: any) {
    throw new Error(`Failed to parse AI response: ${error?.message || String(error)}`, {
      cause: error,
    });
  }
}

/** The model call: the route passes Gemini, tests pass a canned response. */
export interface QuickAddGenerate {
  (prompt: string): Promise<string>;
}

/** The whole parse with the model call injected. */
export async function runQuickAddParse(
  input: { text: string; contacts: QuickAddExistingContact[] },
  generate: QuickAddGenerate,
): Promise<QuickAddParseResponse> {
  const prompt = buildQuickAddPrompt(input.text, input.contacts);
  const raw = await generate(prompt);
  return buildQuickAddResult(parseQuickAddModelResponse(raw), input.contacts);
}
