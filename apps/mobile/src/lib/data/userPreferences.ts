// Per-user My Day preferences — mirrors the web app's src/lib/userPreferences.ts.
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';

export interface UserPreferences {
  personalContactIds?: string[];
}

export function subscribeUserPreferences(
  uid: string,
  cb: (prefs: UserPreferences) => void,
  onError?: (e: unknown) => void,
): () => void {
  return onSnapshot(
    doc(db, 'userPreferences', uid),
    (snap) => cb((snap.data() as UserPreferences) ?? {}),
    (e) => (onError ? onError(e) : console.error('userPreferences subscription error', e)),
  );
}

export async function saveUserPreferences(
  uid: string,
  patch: Partial<UserPreferences>,
): Promise<void> {
  try {
    await setDoc(doc(db, 'userPreferences', uid), patch, { merge: true });
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, `userPreferences/${uid}`);
  }
}
