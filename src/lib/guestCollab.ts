// Guest-side live collaboration (issue #1023).
//
// An edit guest joins the same Yjs-over-RTDB session the Full-timers use, but
// with a credential the server minted for exactly this doc: a custom token
// carrying { guest: true, guestDoc } that database.rules.json checks before it
// lets the connection touch anything. The token is exchanged on a *separate*
// Firebase app so the main app's auth state is untouched. When no database is
// configured (or the exchange fails) the caller degrades to server-saved,
// single-user editing rather than blocking the guest out.
import { getAuth, signInWithCustomToken } from 'firebase/auth';
import { getDatabase, type Database } from 'firebase/database';
import { databaseURL, guestFirebaseApp } from './firebase';

export async function connectGuestRtdb(collabToken: string): Promise<Database | null> {
  if (!databaseURL) return null;
  const app = guestFirebaseApp();
  const guestAuth = getAuth(app);
  if (!guestAuth.currentUser) {
    await signInWithCustomToken(guestAuth, collabToken);
  }
  return getDatabase(app, databaseURL);
}
