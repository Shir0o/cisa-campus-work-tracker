// Public welcome-form (SignUp) write — shared Firestore logic behind an
// injected `db`. Mirrors src/views/SignUp.tsx's handleSubmit: no authenticated
// actor (this is an anonymous public submission), so unlike addContact there's
// no `by`/self-notify — only a best-effort admin broadcast.
import {
  addDoc,
  collection,
  getDocs,
  limit,
  query,
  serverTimestamp,
  type Firestore,
} from "firebase/firestore";
import { getUserInitials } from "../utils";
import type { SignUpFormState } from "../signup";

/**
 * Writes the new lead to `contacts` (stage defaults to the first `stages`
 * doc, falling back to "Lead") and best-effort broadcasts an ALL_ADMINS
 * notification. Returns the new contact id.
 */
export async function submitSignUp(
  db: Firestore,
  form: SignUpFormState,
  seasonTags: string[],
): Promise<string> {
  const stagesSnapshot = await getDocs(query(collection(db, "stages"), limit(1)));
  const firstStage = stagesSnapshot.empty ? "Lead" : (stagesSnapshot.docs[0].data().label as string);

  const docRef = await addDoc(collection(db, "contacts"), {
    name: form.name.trim(),
    email: form.email.trim(),
    phone: form.phone.trim(),
    location: form.hall || "Online Form",
    role: "Student",
    stage: firstStage,
    initials: getUserInitials(form.name),
    notes: form.notes.trim(),
    spiritualBackground: form.spiritualBackground,
    pronouns: form.pronouns.trim(),
    year: form.year,
    major: form.major,
    instagram: form.instagram.trim(),
    howHeard: form.howHeard,
    interests: form.interests,
    prayerRequest: form.prayerRequest.trim(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastSeen: new Date().toLocaleDateString(),
    tags: ["New Sign Up", ...seasonTags],
  });

  try {
    await addDoc(collection(db, "notifications"), {
      userId: "ALL_ADMINS",
      title: "New Student Sign-up",
      message: `${form.name} has signed up via the public form.`,
      type: "event" as const,
      read: false,
      createdAt: serverTimestamp(),
    });
  } catch (notifyError) {
    console.error("Failed to broadcast admin notification:", notifyError);
  }

  return docRef.id;
}
