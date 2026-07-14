// Season-settings read — shared Firestore logic behind an injected `db`.
// Mirrors the web app's src/lib/seasons.ts's subscribeSeasonSettings (read-only
// subset; override/club-rush writes aren't needed by any mobile screen yet).
import { doc, onSnapshot, type Firestore } from "firebase/firestore";
import type { SeasonSettings } from "../types";

/** Live subscription to the team-wide season settings (settings/season). */
export function subscribeSeasonSettings(
  db: Firestore,
  cb: (settings: SeasonSettings) => void,
  onError?: (e: unknown) => void,
): () => void {
  return onSnapshot(
    doc(db, "settings", "season"),
    (snap) => cb((snap.data() as SeasonSettings | undefined) ?? {}),
    (e) => (onError ? onError(e) : console.error("season settings subscription error", e)),
  );
}
