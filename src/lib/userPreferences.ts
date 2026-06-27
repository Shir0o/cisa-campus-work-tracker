import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "./firebase";

// Per-user My Day preferences, stored at userPreferences/{uid}. These are
// personal choices (not shared team data): which contacts you're personally
// walking with, and how the "Message" button should behave on a laptop.
export type DesktopMessagingApp = "apple" | "google";

export interface UserPreferences {
  // Contacts the user treats as "theirs" on My Day. Undefined = not chosen yet,
  // so callers fall back to contacts the user created.
  personalContactIds?: string[];
  // Which app the "Message" button opens on a desktop. Undefined = auto-detect.
  desktopMessagingApp?: DesktopMessagingApp;
}

// Live subscription to a user's preference doc. Calls back with {} when the doc
// doesn't exist yet so callers can apply their own defaults.
export function subscribeUserPreferences(
  uid: string,
  cb: (prefs: UserPreferences) => void,
  onError?: (e: unknown) => void,
): () => void {
  return onSnapshot(
    doc(db, "userPreferences", uid),
    (snap) => cb((snap.data() as UserPreferences) ?? {}),
    (e) => (onError ? onError(e) : console.error("userPreferences subscription error", e)),
  );
}

// Merge-write a patch onto the user's preference doc (creating it if needed).
export async function saveUserPreferences(
  uid: string,
  patch: Partial<UserPreferences>,
): Promise<void> {
  try {
    await setDoc(doc(db, "userPreferences", uid), patch, { merge: true });
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, `userPreferences/${uid}`);
  }
}
