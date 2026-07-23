// Full-timer roster read, plus the full team-roster (users + invitations)
// reads/writes for Settings — shared Firestore logic behind an injected
// `db`. Mirrors src/views/landings/LandingCommunity.tsx's "Reach out"
// section query (subscribeFullTimers) and src/views/Settings.tsx's "Your
// team" section (everything else below).
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Firestore,
} from "firebase/firestore";
import type { AppRole } from "../permissions";
import type { AppUser, Invitation } from "../types";

export interface FullTimerSummary {
  uid: string;
  name: string;
  email: string;
  photoURL?: string;
}

/** Live subscription to the approved Full-timers (admins), for Community's
 * "Reach out" roster. */
export function subscribeFullTimers(
  db: Firestore,
  cb: (fullTimers: FullTimerSummary[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  return onSnapshot(
    query(collection(db, "users"), where("role", "==", "admin")),
    (snap) =>
      cb(
        snap.docs
          .map((d) => ({ uid: d.id, ...(d.data() as Record<string, unknown>) }))
          .filter((u) => (u as { approved?: boolean }).approved !== false)
          .map((u) => ({
            uid: u.uid,
            name: (u as { displayName?: string }).displayName || "A Full-timer",
            email: (u as { email?: string }).email || "",
            photoURL: (u as { photoURL?: string }).photoURL || undefined,
          })),
      ),
    (e) => (onError ? onError(e) : console.error("full-timers subscription error", e)),
  );
}

/** Live subscription to every user doc, for Settings' "Your team" roster. */
export function subscribeUsers(
  db: Firestore,
  cb: (users: AppUser[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  return onSnapshot(
    query(collection(db, "users"), orderBy("email", "asc")),
    (snap) => cb(snap.docs.map((d) => ({ uid: d.id, ...d.data() })) as AppUser[]),
    (e) => (onError ? onError(e) : console.error("users subscription error", e)),
  );
}

/** Live subscription to pending invitations, for Settings' "Your team" roster. */
export function subscribeInvitations(
  db: Firestore,
  cb: (invitations: Invitation[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  return onSnapshot(
    query(collection(db, "invitations"), orderBy("createdAt", "desc")),
    (snap) => cb(snap.docs.map((d) => d.data() as Invitation)),
    (e) => (onError ? onError(e) : console.error("invitations subscription error", e)),
  );
}

export async function toggleUserApproval(db: Firestore, uid: string, currentStatus: boolean): Promise<void> {
  await updateDoc(doc(db, "users", uid), { approved: !currentStatus, updatedAt: serverTimestamp() });
}

export async function changeUserRole(db: Firestore, uid: string, newRole: AppRole): Promise<void> {
  await updateDoc(doc(db, "users", uid), { role: newRole, updatedAt: serverTimestamp() });
}

/** Best-effort remote push token registration — the owner writing to their
 * own doc. `pushToken` is otherwise unused until Phase 5's `eas init` step
 * unblocks minting a real one (see MIGRATION.md). */
export async function setPushToken(db: Firestore, uid: string, pushToken: string | null): Promise<void> {
  await updateDoc(doc(db, "users", uid), { pushToken, updatedAt: serverTimestamp() });
}

export interface SendInvitationInput {
  email: string;
  role: AppRole;
  invitedBy: string;
}

/** Pre-registers an email + role; `email` doubles as the `invitations` doc
 * id, matching web's `invitations/{emailLower}` path — callers should pass
 * an already-lowercased email. */
export async function sendInvitation(db: Firestore, input: SendInvitationInput): Promise<void> {
  await setDoc(doc(db, "invitations", input.email), {
    email: input.email,
    role: input.role,
    approved: true,
    invitedBy: input.invitedBy,
    createdAt: serverTimestamp(),
  });
}

export async function revokeInvitation(db: Firestore, email: string): Promise<void> {
  await deleteDoc(doc(db, "invitations", email.toLowerCase()));
}
