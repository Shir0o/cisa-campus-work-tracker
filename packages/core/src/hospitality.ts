// Hospitality — the vocabulary and prose for "Open your home" (MOBILE-V2.md,
// the Community member's one real power). PURE: the Firestore reads/writes
// live in ./data/hospitality.ts.
//
// Shared rather than owned by either home screen: the member writes the offer
// and the Full-timer reads it, and both need the same words for it.
import type { HospitalityOffer } from "./types";

/** The four options, verbatim from the design's `CM_AVAIL_M2`. */
export const HOSPITALITY_AVAILABILITY: { key: string; label: string }[] = [
  { key: "weeknight", label: "A weeknight dinner" },
  { key: "sunday", label: "Sunday lunch" },
  { key: "weekend", label: "A weekend afternoon" },
  { key: "anytime", label: "Anytime — just ask" },
];

/** The labels for the keys an offer selected, in the canonical order above —
 * so two people who picked the same things read the same way. Keys that are no
 * longer offered (an older doc) simply drop out. */
export function hospitalityLabels(offer: HospitalityOffer | null): string[] {
  if (!offer) return [];
  return HOSPITALITY_AVAILABILITY.filter((a) => offer.availability.includes(a.key)).map(
    (a) => a.label,
  );
}

/** "You've opened your home for a weeknight dinner, Sunday lunch — room for
 * about 3–4 students." The design's own sentence, minus the second person so
 * the Full-timer's widget can use it too. */
export function hospitalitySummary(offer: HospitalityOffer | null): string {
  const labels = hospitalityLabels(offer);
  if (!offer || labels.length === 0) return "No times given yet";
  const when = labels.map((l) => l.toLowerCase()).join(", ");
  return offer.seats ? `${when} — room for about ${offer.seats}` : when;
}
