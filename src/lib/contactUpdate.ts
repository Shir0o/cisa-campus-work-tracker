import { doc, updateDoc } from "firebase/firestore";
import { db, logActivity } from "./firebase";
import { yearFromForm } from "./contactYear";
import { normalizeTagList } from "./tags";
import { contactKind, kindLabelKey } from "./contactKind";
import type { Contact } from "../types";
import type { ContactFormData } from "../components/contact/ContactEditForm";

export function getInitials(firstName: string, lastName: string) {
  return (firstName.charAt(0) + (lastName.charAt(0) || "")).toUpperCase();
}

export function splitName(fullName: string) {
  const parts = fullName.trim().split(" ");
  if (parts.length <= 1) return { first: fullName, last: "" };
  const last = parts.pop() || "";
  const first = parts.join(" ");
  return { first, last };
}

export async function executeContactUpdate({
  contact,
  currentContact,
  formData,
  editTagInput,
  user,
  isAdmin,
  t,
}: {
  contact: Contact;
  currentContact: Contact;
  formData: ContactFormData;
  editTagInput: string;
  user: { uid?: string; displayName?: string | null; email?: string | null } | null;
  isAdmin: boolean;
  t: (key: string, fallback?: string) => string;
}) {
  const contactRef = doc(db, "contacts", contact.id);
  const fullName = `${formData.firstName} ${formData.lastName}`.trim();

  const changes: string[] = [];
  if (fullName !== contact.name)
    changes.push(`name: "${contact.name}" → "${fullName}"`);
  if (formData.email !== contact.email)
    changes.push(`email: "${contact.email}" → "${formData.email}"`);
  if (formData.phone !== contact.phone)
    changes.push(`phone: "${contact.phone}" → "${formData.phone}"`);
  if (formData.stage !== contact.stage)
    changes.push(`stage: "${contact.stage}" → "${formData.stage}"`);
  if (formData.spiritualBackground !== contact.spiritualBackground)
    changes.push(`spiritualBackground: "${contact.spiritualBackground || ""}" → "${formData.spiritualBackground}"`);
  if (formData.gender !== contact.gender)
    changes.push(`gender: "${contact.gender || ""}" → "${formData.gender || ""}"`);
  const year = yearFromForm(formData);
  if (year !== (contact.year || ""))
    changes.push(`year: "${contact.year || ""}" → "${year}"`);
  const major = formData.major.trim();
  if (major !== (contact.major || ""))
    changes.push(`major: "${contact.major || ""}" → "${major}"`);
  if (formData.notes !== contact.notes) changes.push(`notes updated`);

  const typedTags = editTagInput.split(",").map((tag) => tag.trim()).filter(Boolean);
  const combinedFormTags = normalizeTagList([...formData.tags, ...typedTags]);

  const genderTagValue = formData.gender === "M" || formData.gender === "F" ? formData.gender : "";
  const tags = genderTagValue
    ? Array.from(new Set([...combinedFormTags.filter((tag) => tag !== "M" && tag !== "F"), genderTagValue]))
    : combinedFormTags.filter((tag) => tag !== "M" && tag !== "F");

  const updateData: any = {
    name: fullName,
    initials: getInitials(formData.firstName, formData.lastName),
    email: formData.email,
    phone: formData.phone,
    stage: formData.stage,
    gender: formData.gender,
    ...(year !== (contact.year || "") && { year }),
    ...(major !== (contact.major || "") && { major }),
    tags,
    notes: formData.notes,
    spiritualBackground: formData.spiritualBackground,
    updatedAt: new Date().toISOString(),
    updatedBy: user?.uid,
    updatedByName:
      user?.displayName || user?.email?.split("@")[0] || t("modals.contactDetails.unknown_user"),
  };
  await updateDoc(contactRef, updateData);

  const kindChanged =
    formData.inChurchLife !== !!contact.inChurchLife ||
    formData.isStudent !== !!contact.isStudent;
  if (isAdmin && kindChanged) {
    await updateDoc(contactRef, {
      inChurchLife: formData.inChurchLife,
      isStudent: formData.isStudent,
      kindSetBy: user?.uid,
      kindSetAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      updatedBy: user?.uid,
      updatedByName:
        user?.displayName || user?.email?.split("@")[0] || t("modals.contactDetails.unknown_user"),
    });

    const before = contactKind(contact);
    const after = contactKind({
      inChurchLife: formData.inChurchLife,
      isStudent: formData.isStudent,
    });
    const change = `kind: "${t(kindLabelKey(before))}" → "${t(kindLabelKey(after))}"`;
    logActivity({
      action: `updated ${change} for`,
      targetId: contact.id,
      targetName: currentContact.name,
      targetType: "contact",
      type: "edit",
      userName:
        user?.displayName || user?.email?.split("@")[0] || t("modals.contactDetails.unknown_user"),
      description: change,
    } as any);
  }

  logActivity({
    action:
      changes.length > 0
        ? `updated ${changes.join(", ")} for`
        : "updated contact details for",
    targetId: contact.id,
    targetName: fullName,
    targetType: "contact",
    type: "edit",
    userName:
      user?.displayName || user?.email?.split("@")[0] || t("modals.contactDetails.unknown_user"),
    description: changes.join("\n"),
  } as any);
}

export async function executePersistTags({
  contactId,
  contactName,
  updatedTags,
  prevTags,
  verb,
  tag,
  user,
  t,
}: {
  contactId: string;
  contactName: string;
  updatedTags: string[];
  prevTags: string[];
  verb: string;
  tag: string;
  user: { uid?: string; displayName?: string | null; email?: string | null } | null;
  t: (key: string, fallback?: string) => string;
}) {
  await updateDoc(doc(db, "contacts", contactId), {
    tags: updatedTags,
    updatedAt: new Date().toISOString(),
    updatedBy: user?.uid,
    updatedByName:
      user?.displayName || user?.email?.split("@")[0] || t("modals.contactDetails.unknown_user"),
  });
  logActivity({
    action: `${verb} tag #${tag} ${verb === "removed" ? "from" : "to"}`,
    targetId: contactId,
    targetName: contactName,
    targetType: "contact",
    type: "edit",
    description: `Tags: [${prevTags.join(", ")}] → [${updatedTags.join(", ")}]`,
  });
}
