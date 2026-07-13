// Per-user My Day preferences — shared Firestore logic behind an injected
// `db`. Mirrors the web app's src/lib/userPreferences.ts.
import { doc, onSnapshot, setDoc, type Firestore } from "firebase/firestore";

export interface UserPreferences {
  personalContactIds?: string[];
}

export function subscribeUserPreferences(
  db: Firestore,
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

export async function saveUserPreferences(
  db: Firestore,
  uid: string,
  patch: Partial<UserPreferences>,
): Promise<void> {
  await setDoc(doc(db, "userPreferences", uid), patch, { merge: true });
}
