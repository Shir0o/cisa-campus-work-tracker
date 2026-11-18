import { carerNamesOf } from "./carers";
import { parseMs } from "../components/landing/helpers";
import { hasMinRole } from "./permissions";
import type { Contact, Interaction, PrayerRecord, Stage } from "../types";
import type { TeamMember } from "../hooks/useContactStory";

export function fmtContactDate(v?: string | null): string | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toLocaleDateString();
}

export function computeContactDerivedModel({
  currentContact,
  interactions,
  prayers,
  stages,
  teamMembers,
  isAdmin,
  role,
  t,
}: {
  currentContact: Contact;
  interactions: Interaction[];
  prayers: PrayerRecord[];
  stages: Stage[];
  teamMembers: TeamMember[];
  isAdmin: boolean;
  role?: string;
  t: (key: string, fallback?: string) => string;
}) {
  const sortedInteractions = [...interactions].sort((a, b) => {
    const aMs = parseMs(a.dateTime || a.createdAt) ?? 0;
    const bMs = parseMs(b.dateTime || b.createdAt) ?? 0;
    return bMs - aMs;
  });

  const latestInteraction = sortedInteractions[0] ?? null;

  const effectiveLastContactedDate =
    latestInteraction?.dateTime ||
    latestInteraction?.createdAt ||
    currentContact?.lastContactedDate ||
    currentContact?.lastSeen;

  const lastConnectedDate = fmtContactDate(effectiveLastContactedDate);
  const sinceText = lastConnectedDate
    ? t("modals.contactDetails.last_connected").replace("{date}", lastConnectedDate)
    : t("modals.contactDetails.not_connected_yet");

  const sinceBy =
    latestInteraction?.reachedByName ||
    latestInteraction?.userName ||
    currentContact?.lastContactedBy ||
    null;

  const carerNames = carerNamesOf(
    currentContact?.carers,
    Object.fromEntries(teamMembers.map((m) => [m.id, m.name])),
  );
  const carerMembers = teamMembers.filter((m) => (currentContact?.carers || []).includes(m.id));
  const addedByName =
    currentContact.createdByName ||
    ((currentContact.createdBy || currentContact.addedBy)
      ? teamMembers.find((m) => m.id === (currentContact.createdBy || currentContact.addedBy))?.name
      : null);

  const sortedStages = [...stages].sort((a, b) => a.order - b.order);
  const canMoveStage = (isAdmin || hasMinRole(role, "manager")) && sortedStages.length > 0;
  const canDelete = isAdmin || hasMinRole(role, "manager");
  const openPrayers = prayers.filter(
    (p) => p.status !== "answered" && p.status !== "unanswered",
  );

  return {
    sortedInteractions,
    latestInteraction,
    sinceText,
    sinceBy,
    carerNames,
    carerMembers,
    addedByName,
    sortedStages,
    canMoveStage,
    canDelete,
    openPrayers,
  };
}
