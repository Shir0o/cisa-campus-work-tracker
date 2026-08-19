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
import { signUpYearValue, type SignUpFormState } from "../signup";
import { getAutoSemesterAndSchoolYearTags } from "../seasons";
import { normalizeTagList } from "../tags";

/**
 * Writes the new lead to `contacts` (stage defaults to the first `stages`
 * doc, falling back to "Lead") and best-effort broadcasts an ALL_ADMINS
 * notification. If `by` is supplied, stamps the creator/contacting actor.
 * Auto-tags with semester and school year (e.g. Fall 2026, 2026-27).
 * Returns the new contact id.
 */
export async function submitSignUp(
  db: Firestore,
  form: SignUpFormState,
  seasonTags: string[],
  by?: { uid?: string | null; name?: string | null },
): Promise<string> {
  const stagesSnapshot = await getDocs(query(collection(db, "stages"), limit(1)));
  const firstStage = stagesSnapshot.empty ? "Lead" : (stagesSnapshot.docs[0].data().label as string);

  const autoTags = getAutoSemesterAndSchoolYearTags();
  const allTags = normalizeTagList(["New Sign Up", ...autoTags, ...seasonTags]);

  const now = new Date();
  const contactData: Record<string, any> = {
    name: form.name.trim(),
    email: form.email.trim(),
    phone: form.phone.trim(),
    metVia: "Sign-up form",
    role: "Student",
    stage: firstStage,
    initials: getUserInitials(form.name),
    notes: form.notes.trim(),
    spiritualBackground: form.spiritualBackground,
    gender: form.gender,
    year: signUpYearValue(form),
    major: form.major,
    howHeard: form.howHeard || null,
    interests: form.interests,
    prayerRequest: form.prayerRequest.trim(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdTime: now.toISOString(),
    lastSeen: now.toLocaleDateString(),
    tags: allTags,
  };

  if (by?.uid) {
    contactData.createdBy = by.uid;
    contactData.createdByName = by.name ?? null;
    contactData.lastContactedById = by.uid;
    contactData.lastContactedBy = by.name ?? null;
    contactData.lastContactedDate = now.toISOString();
  }

  const docRef = await addDoc(collection(db, "contacts"), contactData);

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

