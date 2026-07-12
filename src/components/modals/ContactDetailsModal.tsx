import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  X,
  User,
  Briefcase,
  MapPin,
  Mail,
  Phone,
  Loader2,
  Trash2,
  Edit3,
  Calendar,
  MessageSquare,
  ChevronRight,
  Send,
  UserCircle,
  Clock,
  Plus,
  Tag,
  Sparkles,
  Heart,
  Footprints,
} from "lucide-react";
import {
  db,
  handleFirestoreError,
  OperationType,
  logActivity,
  sendNotification,
} from "../../lib/firebase";
import {
  doc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  limit,
  orderBy,
  getDocs,
  onSnapshot,
  addDoc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { cn, formatPhoneNumber, validatePhoneNumber } from "../../lib/utils";
import { format } from 'date-fns';
import { Contact, Stage, Interaction, Comment, Activity, PrayerRecord } from "../../types";
import { useAuth } from "../AuthProvider";
import { useMediaQuery } from '../../lib/useMediaQuery';
import { Skeleton } from "../ui/Skeleton";
import Thread from "../Thread";
import { useThreads, countFor } from "../../lib/threads";
import { traineesOf, walkingRecipient } from "../../lib/walking";

interface ContactDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  contact: Contact | null;
  // Deep-link the modal to a tab on open (e.g. the My Day inbox "Comment"
  // action). When initialInteractionId is set, opens that interaction's inline
  // thread; otherwise honours initialTab.
  initialTab?: "thread";
  initialInteractionId?: string | null;
}

function AuditActivityItem({
  activity,
  isLast,
  key
}: {
  activity: any;
  isLast: boolean;
  key?: React.Key;
}) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className="relative pl-8 pb-4 last:pb-0 group"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Timeline line */}
      {!isLast && (
        <div className="absolute left-4 top-10 bottom-0 w-[1px] bg-outline-variant group-hover:bg-primary/30 transition-colors" />
      )}

      {/* Icon Bubble */}
      <div
        className={cn(
          "absolute left-0 top-0.5 w-8 h-8 rounded-full border-2 border-surface-container flex items-center justify-center z-10 transition-transform group-hover:scale-110 shadow-sm",
          activity.type === "edit"
            ? "bg-tertiary-container text-on-tertiary-container"
            : activity.type === "create"
              ? "bg-primary-container text-on-primary-container"
              : activity.type === "comment"
                ? "bg-secondary-container text-on-secondary-container"
                : activity.type === "call"
                  ? "bg-primary-fixed text-on-primary-fixed"
                  : "bg-surface-container-highest text-on-surface-variant",
        )}
      >
        {activity.type === "edit" && <Edit3 className="w-4 h-4" />}
        {activity.type === "create" && <UserCircle className="w-4 h-4" />}
        {activity.type === "comment" && <MessageSquare className="w-4 h-4" />}
        {activity.type === "call" && <Phone className="w-4 h-4" />}
        {!["edit", "create", "comment", "call"].includes(activity.type) && (
          <Calendar className="w-4 h-4" />
        )}
      </div>

      <div className="flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mb-1">
          <span className="text-xs font-black text-on-surface uppercase tracking-tight">
            {activity.userName}
          </span>
          <span className="text-xs text-on-surface-variant">
            {activity.action === "logged an interaction for" ||
            activity.action === "logged a batch interaction for"
              ? activity.type === "call"
                ? "called"
                : activity.type === "email"
                  ? "emailed"
                  : activity.type === "event"
                    ? "had a meeting with"
                    : activity.type === "comment"
                      ? "left a note for"
                      : "interacted with"
              : activity.action === "updated an interaction for"
                ? "updated an interaction for"
                : activity.action.startsWith("updated") &&
                    activity.action !== "updated an interaction for" &&
                    activity.type === "edit" &&
                    activity.description
                ? `updated the ${activity.description
                    .split("\\n")
                    .map((line: string) => {
                      const field = line.includes(":") ? line.split(":")[0].trim() : line.trim();
                      if (field.toLowerCase() === "notes updated") return "Notes";
                      return field.charAt(0).toUpperCase() + field.slice(1).toLowerCase();
                    })
                    .filter((v: string, i: number, a: string[]) => v && a.indexOf(v) === i)
                    .join(", ")} for`
                : activity.action}
          </span>
          <span className="text-[10px] font-bold text-on-surface-variant/40 ml-auto uppercase tracking-widest whitespace-nowrap">
            {new Date(activity.createdAt).toLocaleDateString()} at{" "}
            {new Date(activity.createdAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>

        {activity.description && activity.type !== "edit" && (
          <div className="mt-2 p-3 rounded-xl bg-surface-container-high border border-outline-variant/30 text-[13px] leading-relaxed text-on-surface-variant italic">
            "{activity.description}"
          </div>
        )}
      </div>
    </div>
  );
}

export default function ContactDetailsModal({
  isOpen,
  onClose,
  contact,
  initialTab,
  initialInteractionId,
}: ContactDetailsModalProps) {
  const { user, isAdmin } = useAuth();
  const isMobile = useMediaQuery("(max-width: 768px)");
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [interactionsLoading, setInteractionsLoading] = useState(true);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [stages, setStages] = useState<Stage[]>([]);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState(true);
  const [prayers, setPrayers] = useState<PrayerRecord[]>([]);
  const [prayersLoading, setPrayersLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<
    "overview" | "interactions" | "thread" | "prayer" | "comments" | "history"
  >("overview");
  // Walking-together threads on this contact (live), + which interaction's
  // inline thread is expanded.
  const threadMessages = useThreads(contact?.id);
  const [openThread, setOpenThread] = useState<string | null>(null);
  const [isAddingPrayer, setIsAddingPrayer] = useState(false);
  const [newPrayer, setNewPrayer] = useState({ burden: "", context: "" });
  const [submittingPrayer, setSubmittingPrayer] = useState(false);
  const [addingTag, setAddingTag] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [newComment, setNewComment] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [newInteraction, setNewInteraction] = useState({
    content: "",
    dateTime: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
    duration: "",
    type: "interaction",
  });
  const [submittingInteraction, setSubmittingInteraction] = useState(false);
  const [isLoggingInteraction, setIsLoggingInteraction] = useState(false);
  const [editingInteractionId, setEditingInteractionId] = useState<
    string | null
  >(null);
  const [editInteractionData, setEditInteractionData] = useState({
    content: "",
    dateTime: "",
    type: "interaction",
  });
  const [isUpdatingInteraction, setIsUpdatingInteraction] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    role: "",
    location: "",
    email: "",
    phone: "",
    stage: "",
    tags: [] as string[],
    notes: "",
    spiritualBackground: "",
  });

  const capitalize = (str: string) => {
    return str.charAt(0).toUpperCase() + str.slice(1);
  };

  const getInitials = (firstName: string, lastName: string) => {
    return (firstName.charAt(0) + (lastName.charAt(0) || "")).toUpperCase();
  };

  const splitName = (fullName: string) => {
    const parts = fullName.trim().split(" ");
    if (parts.length <= 1) return { first: fullName, last: "" };
    const last = parts.pop() || "";
    const first = parts.join(" ");
    return { first, last };
  };

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      window.addEventListener("keydown", handleEsc);
    }
    return () => window.removeEventListener("keydown", handleEsc);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (contact) {
      const { first, last } = splitName(contact.name || "");
      setFormData({
        firstName: first,
        lastName: last,
        role: contact.role || "",
        location: contact.location || "",
        email: contact.email || "",
        phone: contact.phone || "",
        stage: contact.stage || "",
        tags: contact.tags || [],
        notes: contact.notes || "",
        spiritualBackground: contact.spiritualBackground || "",
      });
      setIsEditing(false);
    }
  }, [contact]);

  useEffect(() => {
    if (isOpen) {
      const fetchStages = async () => {
        try {
          const q = query(collection(db, "stages"), orderBy("order", "asc"));
          const querySnapshot = await getDocs(q);
          const stageData = querySnapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          })) as Stage[];
          setStages(stageData);
        } catch (error) {
          handleFirestoreError(error, OperationType.LIST, "stages");
        }
      };
      fetchStages();
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && contact) {
      const interactionsRef = collection(
        db,
        "contacts",
        contact.id,
        "interactions",
      );
      const q = query(interactionsRef, orderBy("createdAt", "asc"));

      setInteractionsLoading(true);
      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const interactionData = snapshot.docs.map((doc) => {
            const data = doc.data();
            return {
              id: doc.id,
              ...data,
              createdAt:
                data.createdAt instanceof Timestamp
                  ? data.createdAt.toDate().toISOString()
                  : data.createdAt,
            } as Interaction;
          });
          setInteractions(interactionData);
          setInteractionsLoading(false);
        },
        (error) => {
          handleFirestoreError(
            error,
            OperationType.LIST,
            `contacts/${contact.id}/interactions`,
          );
        },
      );

      return () => unsubscribe();
    }
  }, [isOpen, contact]);

  useEffect(() => {
    if (isOpen && contact) {
      const commentsRef = collection(db, "contacts", contact.id, "comments");
      const q = query(commentsRef, orderBy("createdAt", "asc"));

      setCommentsLoading(true);
      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const commentData = snapshot.docs.map((doc) => {
            const data = doc.data();
            return {
              id: doc.id,
              ...data,
              createdAt:
                data.createdAt instanceof Timestamp
                  ? data.createdAt.toDate().toISOString()
                  : data.createdAt,
            } as Comment;
          });
          setComments(commentData);
          setCommentsLoading(false);
        },
        (error) => {
          handleFirestoreError(
            error,
            OperationType.LIST,
            `contacts/${contact.id}/comments`,
          );
        },
      );

      return () => unsubscribe();
    }
  }, [isOpen, contact]);

  useEffect(() => {
    if (isOpen && contact) {
      const q = query(
        collection(db, "activities"),
        where("targetId", "==", contact.id),
        orderBy("createdAt", "desc"),
        limit(50),
      );

      setActivitiesLoading(true);
      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const activityData = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }));
          setActivities(activityData);
          setActivitiesLoading(false);
        },
        (error) => {
          setActivitiesLoading(false);
          handleFirestoreError(error, OperationType.LIST, "activities");
        },
      );

      return () => unsubscribe();
    }
  }, [isOpen, contact]);

  useEffect(() => {
    if (isOpen && contact) {
      const q = query(
        collection(db, "prayers"),
        where("contactId", "==", contact.id),
      );

      setPrayersLoading(true);
      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const prayerData = snapshot.docs
            .map((doc) => ({ id: doc.id, ...doc.data() }) as PrayerRecord)
            .sort(
              (a, b) =>
                new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime(),
            );
          setPrayers(prayerData);
          setPrayersLoading(false);
        },
        (error) => {
          setPrayersLoading(false);
          handleFirestoreError(error, OperationType.LIST, "prayers");
        },
      );

      return () => unsubscribe();
    }
  }, [isOpen, contact]);

  // On open: reset to Overview, unless a deep-link asks for a thread. An
  // interaction deep-link opens the Conversations tab with that thread expanded;
  // otherwise initialTab ("thread") opens the contact-level "Walking together".
  useEffect(() => {
    if (!isOpen) return;
    setActiveTab(initialInteractionId ? "interactions" : initialTab ?? "overview");
    setIsAddingPrayer(false);
    setAddingTag(false);
    setTagInput("");
    setOpenThread(initialInteractionId ?? null);
  }, [contact?.id, isOpen, initialTab, initialInteractionId]);

  if (!contact) return null;

  // "Alongside" tab: when the viewer is the full-timer for a contact a trainee
  // of theirs added, name the person they're alongside.
  const viewerWalksWithAdder =
    !!contact.createdBy && traineesOf(user?.uid).includes(contact.createdBy);
  const walkLabel =
    viewerWalksWithAdder && contact.createdByName
      ? `Alongside ${contact.createdByName.split(" ")[0]}`
      : "Alongside";
  // The other party in the walk — pinged on the bell when a thread msg is posted.
  const threadRecipient = walkingRecipient(user?.uid, contact.createdBy);

  const handlePhoneBlur = () => {
    if (!formData.phone) {
      setPhoneError(null);
      return;
    }
    const formatted = formatPhoneNumber(formData.phone);
    setFormData((f) => ({ ...f, phone: formatted }));

    if (!validatePhoneNumber(formData.phone)) {
      const digits = formData.phone.replace(/[^\d]/g, "");
      if (digits.length < 10) {
        setPhoneError("Phone number too short (need 10 digits)");
      } else if (digits.length > 10) {
        setPhoneError("Phone number too long (need 10 digits)");
      } else {
        setPhoneError(null);
      }
    } else {
      setPhoneError(null);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (phoneError) return;
    setLoading(true);
    try {
      const contactRef = doc(db, "contacts", contact.id);
      const fullName = `${formData.firstName} ${formData.lastName}`.trim();

      const changes: string[] = [];
      if (fullName !== contact.name)
        changes.push(`name: "${contact.name}" → "${fullName}"`);
      if (formData.email !== contact.email)
        changes.push(`email: "${contact.email}" → "${formData.email}"`);
      if (formData.phone !== contact.phone)
        changes.push(`phone: "${contact.phone}" → "${formData.phone}"`);
      if (formData.location !== contact.location) {
        const locLabel = formData.tags?.includes('New Sign Up') ? 'residence hall' : 'first met';
        changes.push(
          `${locLabel}: "${contact.location}" → "${formData.location}"`,
        );
      }
      if (formData.role !== contact.role)
        changes.push(`group: "${contact.role}" → "${formData.role}"`);
      if (formData.stage !== contact.stage)
        changes.push(`stage: "${contact.stage}" → "${formData.stage}"`);
      if (formData.spiritualBackground !== contact.spiritualBackground)
        changes.push(`spiritualBackground: "${contact.spiritualBackground || ''}" → "${formData.spiritualBackground}"`);
      if (formData.notes !== contact.notes) changes.push(`notes updated`);

      const updateData: any = {
        name: fullName,
        initials: getInitials(formData.firstName, formData.lastName),
        role: formData.role,
        location: formData.location,
        email: formData.email,
        phone: formData.phone,
        stage: formData.stage,
        tags: formData.tags,
        notes: formData.notes,
        spiritualBackground: formData.spiritualBackground,
        updatedAt: new Date().toISOString(),
        updatedBy: user?.uid,
        updatedByName:
          user?.displayName || user?.email?.split("@")[0] || "Unknown User",
      };

      await updateDoc(contactRef, updateData);

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
          user?.displayName || user?.email?.split("@")[0] || "Unknown User",
        description: changes.join("\n"),
      } as any);

      setIsEditing(false);
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.UPDATE,
        `contacts/${contact.id}`,
      );
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this contact?")) return;
    setLoading(true);
    try {
      const contactId = contact.id;
      const contactName = contact.name;

      // Fetch subcollections to capture their count before deleting
      const interactionsSnap = await getDocs(
        collection(db, "contacts", contactId, "interactions"),
      );
      const commentsSnap = await getDocs(
        collection(db, "contacts", contactId, "comments"),
      );

      const fieldsLog = [
        `Group: ${contact.role}`,
        `Stage: ${contact.stage}`,
        `Location: ${contact.location}`,
        `Email: ${contact.email || "N/A"}`,
        `Phone: ${contact.phone || "N/A"}`,
        `Total Interactions: ${interactionsSnap.size}`,
        `Total Comments: ${commentsSnap.size}`,
      ].join("\\n");

      await deleteDoc(doc(db, "contacts", contactId));

      logActivity({
        action: "deleted contact",
        targetId: contactId,
        targetName: contactName,
        targetType: "contact",
        type: "alert",
        description: fieldsLog,
      });

      onClose();
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.DELETE,
        `contacts/${contact.id}`,
      );
    } finally {
      setLoading(false);
    }
  };

  const handleAddInteraction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !newInteraction.content.trim() ||
      !newInteraction.dateTime ||
      !user ||
      !contact
    )
      return;

    setSubmittingInteraction(true);
    try {
      const interactionsRef = collection(
        db,
        "contacts",
        contact.id,
        "interactions",
      );
      const docRef = await addDoc(interactionsRef, {
        userId: user.uid,
        userName: user.displayName || user.email?.split("@")[0] || "Anonymous",
        userPhoto: user.photoURL || "",
        content: newInteraction.content.trim(),
        dateTime: newInteraction.dateTime,
        type: newInteraction.type,
        createdAt: serverTimestamp(),
      });

      logActivity({
        action: "logged an interaction for",
        targetId: contact.id,
        targetName: contact.name,
        targetType: "contact",
        type:
          newInteraction.type === "meeting"
            ? "event"
            : newInteraction.type === "chat"
              ? "comment"
              : (newInteraction.type as Activity["type"]),
        description: newInteraction.content.trim(),
      });

      setNewInteraction({
        content: "",
        dateTime: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
        duration: "",
        type: "interaction",
      });
      setIsLoggingInteraction(false);
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.CREATE,
        `contacts/${contact.id}/interactions`,
      );
    } finally {
      setSubmittingInteraction(false);
    }
  };

  const handleUpdateInteraction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !editInteractionData.content.trim() ||
      !contact ||
      !editingInteractionId
    )
      return;

    setIsUpdatingInteraction(true);
    try {
      const interactionRef = doc(
        db,
        "contacts",
        contact.id,
        "interactions",
        editingInteractionId,
      );
      await updateDoc(interactionRef, {
        content: editInteractionData.content.trim(),
        dateTime: editInteractionData.dateTime,
        type: editInteractionData.type,
      });

      logActivity({
        action: "updated an interaction for",
        targetId: contact.id,
        targetName: contact.name,
        targetType: "contact",
        type: "edit",
        description: editInteractionData.content.trim(),
      });

      setEditingInteractionId(null);
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.UPDATE,
        `contacts/${contact.id}/interactions/${editingInteractionId}`,
      );
    } finally {
      setIsUpdatingInteraction(false);
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !user || !contact) return;

    setSubmittingComment(true);
    try {
      const commentsRef = collection(db, "contacts", contact.id, "comments");
      const commentData: any = {
        userId: user.uid,
        userName: user.displayName || user.email?.split("@")[0] || "Anonymous",
        userPhoto: user.photoURL || "",
        text: newComment.trim(),
        createdAt: serverTimestamp(),
      };
      if (replyingTo) {
        commentData.parentId = replyingTo;
      }
      const docRef = await addDoc(commentsRef, commentData);

      logActivity({
        action: "left a comment on",
        targetId: contact.id,
        targetName: contact.name,
        targetType: "contact",
        type: "comment",
        description: newComment.trim(),
      });

      // Send notification to contact creator if it's not the current user
      if (contact.createdBy && contact.createdBy !== user.uid) {
        await sendNotification({
          userId: contact.createdBy,
          title: "New Comment",
          message: `${user.displayName || user.email} commented on ${contact.name}: "${newComment.trim().substring(0, 50)}${newComment.length > 50 ? "..." : ""}"`,
          type: "info",
          link: `/directory`, // Focus on directory for now, or just notify
          targetId: contact.id,
        });
      }

      setNewComment("");
      setReplyingTo(null);
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.CREATE,
        `contacts/${contact.id}/comments`,
      );
    } finally {
      setSubmittingComment(true); // Keep spinner until next tick or just reset
      setSubmittingComment(false);
    }
  };

  const handleAddPrayer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPrayer.burden.trim() || !contact) return;

    setSubmittingPrayer(true);
    try {
      const burden = [newPrayer.burden.trim(), newPrayer.context.trim()]
        .filter(Boolean)
        .join("\n\n");
      const now = new Date().toISOString();
      await addDoc(collection(db, "prayers"), {
        contactId: contact.id,
        date: now,
        burden,
        status: "pending",
        updatedAt: now,
        updatedBy: user?.uid || "",
        updatedByName:
          user?.displayName || user?.email?.split("@")[0] || "Unknown User",
      });

      logActivity({
        action: "added a prayer burden for",
        targetId: contact.id,
        targetName: contact.name,
        targetType: "contact",
        type: "comment",
        description: newPrayer.burden.trim(),
      });

      setNewPrayer({ burden: "", context: "" });
      setIsAddingPrayer(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, "prayers");
    } finally {
      setSubmittingPrayer(false);
    }
  };

  // ── Inline tag add / remove (persist to the contact's tags array) ──
  const persistTags = async (updatedTags: string[], verb: string, tag: string) => {
    const prevTags = formData.tags;
    setFormData((f) => ({ ...f, tags: updatedTags }));
    try {
      await updateDoc(doc(db, "contacts", contact.id), {
        tags: updatedTags,
        updatedAt: new Date().toISOString(),
        updatedBy: user?.uid,
        updatedByName:
          user?.displayName || user?.email?.split("@")[0] || "Unknown User",
      });
      logActivity({
        action: `${verb} tag #${tag} ${verb === "removed" ? "from" : "to"}`,
        targetId: contact.id,
        targetName: contact.name,
        targetType: "contact",
        type: "edit",
        description: `Tags: [${prevTags.join(", ")}] → [${updatedTags.join(", ")}]`,
      });
    } catch (error) {
      setFormData((f) => ({ ...f, tags: prevTags }));
      handleFirestoreError(error, OperationType.UPDATE, `contacts/${contact.id}`);
    }
  };

  const commitTag = () => {
    const val = tagInput.trim();
    if (val && !formData.tags.includes(val)) {
      persistTags([...formData.tags, val], "added", val);
    }
    setTagInput("");
    setAddingTag(false);
  };

  const removeTag = (tag: string) => {
    persistTags(formData.tags.filter((t) => t !== tag), "removed", tag);
  };

  // ── Contact actions: Call / Text / Email ──
  const callContact = () => {
    if (contact.phone) window.open(`tel:${contact.phone}`);
  };
  const textContact = () => {
    if (contact.phone) window.open(`sms:${contact.phone}`);
  };
  const emailContact = () => {
    if (contact.email) window.open(`mailto:${contact.email}`);
  };
  const startLogInteraction = () => {
    setActiveTab("interactions");
    setIsLoggingInteraction(true);
  };
  const startAddPrayer = () => {
    setActiveTab("prayer");
    setIsAddingPrayer(true);
  };

  const firstName = contact.name.split(" ")[0];

  return (
    <AnimatePresence>
      {isOpen && (
        <div className={cn("fixed inset-0 z-[100] flex", isMobile ? "w-full h-full bg-surface" : "items-center justify-center p-4 md:p-10")}>
          {!isMobile && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[-1]"
            />
          )}

          <motion.div
            initial={isMobile ? { opacity: 0, y: 80 } : { opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={isMobile ? { opacity: 0, y: 80 } : { opacity: 0, scale: 0.95, y: 20 }}
            className={cn(
              "relative flex flex-col overflow-hidden max-h-full",
              isMobile
                ? "w-full h-full bg-surface-container-lowest"
                : "w-full max-w-2xl bg-surface-container rounded-[28px] shadow-2xl border border-outline-variant"
            )}
          >
            {isMobile ? (
              isEditing ? (
                /* Mobile Editing Header */
                <div className="flex items-center justify-between px-4 py-3 bg-surface border-b border-outline-variant shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="text-sm font-semibold text-on-surface-variant"
                  >
                    Cancel
                  </button>
                  <h3 className="font-serif text-base text-on-surface font-semibold">Edit details</h3>
                  <button
                    type="submit"
                    form="edit-contact-form"
                    className="px-3.5 py-1.5 bg-primary text-on-primary rounded-full text-xs font-semibold"
                  >
                    Save
                  </button>
                </div>
              ) : (
                /* Mobile Profile Header */
                <div className="shrink-0 flex flex-col bg-surface border-b border-outline-variant/30">
                  {/* Top back bar */}
                  <div className="cdm-top px-5 pt-4 flex items-center justify-between">
                    <button
                      onClick={onClose}
                      className="cdm-back text-on-surface-variant font-medium text-sm inline-flex items-center gap-1"
                    >
                      <ChevronRight className="w-4.5 h-4.5 rotate-180 cdm-back-ico text-on-surface-variant" />
                      <span>People</span>
                    </button>
                    {isAdmin && (
                      <button
                        onClick={() => setIsEditing(true)}
                        className="px-3.5 py-1.5 rounded-full border border-outline-variant text-xs font-semibold text-on-surface-variant"
                      >
                        Edit
                      </button>
                    )}
                  </div>

                  {/* Hero Block */}
                  <div className="cdm-hero px-5 pt-1 pb-4">
                    <div className="flex items-start gap-4">
                      <div className="w-14 h-14 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center font-semibold text-xl shrink-0">
                        {contact.initials}
                      </div>
                      <div className="cdm-hero-main min-w-0 flex-1">
                        <h2 className="font-serif text-2xl text-on-surface leading-tight truncate cd-name">
                          {contact.name}
                        </h2>
                        <div className="cdm-chip-row flex flex-wrap gap-1 mt-1.5">
                          {contact.tags?.map((t) => (
                            <span
                              key={t}
                              className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-surface-variant text-on-surface-variant"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                        <p className="text-xs text-on-surface-variant cdm-meta mt-3">
                          {[contact.role, contact.location].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Communication Tiles */}
                  <div className="cdm-comm px-5 pb-4">
                    {contact.phone && (
                      <button onClick={callContact}>
                        <span className="cdm-comm-ico"><Phone className="w-4.5 h-4.5" /></span>
                        <span>Call</span>
                      </button>
                    )}
                    {contact.phone && (
                      <button onClick={textContact}>
                        <span className="cdm-comm-ico"><MessageSquare className="w-4.5 h-4.5" /></span>
                        <span>Text</span>
                      </button>
                    )}
                    {contact.email && (
                      <button onClick={emailContact}>
                        <span className="cdm-comm-ico"><Mail className="w-4.5 h-4.5" /></span>
                        <span>Email</span>
                      </button>
                    )}
                  </div>

                  {/* Two Primary Actions */}
                  <div className="cdm-primary px-5 pb-5 flex gap-2">
                    <button onClick={startLogInteraction} className="btn bg-primary text-on-primary font-semibold flex items-center justify-center gap-2 flex-1 min-h-[48px] rounded-xl text-sm">
                      <MessageSquare className="w-4 h-4" /> Log interaction
                    </button>
                    <button onClick={startAddPrayer} className="btn bg-stage-violet-soft text-stage-violet font-semibold flex items-center justify-center gap-2 border border-stage-violet/20 flex-1 min-h-[48px] rounded-xl text-sm">
                      <Heart className="w-4 h-4" /> Prayer
                    </button>
                  </div>
                </div>
              )
            ) : (
              /* Desktop Header */
              <div className="px-6 py-5 border-b border-outline-variant shrink-0">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-14 h-14 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center font-semibold text-xl shrink-0">
                      {contact.initials}
                    </div>
                    <div className="min-w-0">
                      <h2 className="font-serif text-2xl text-on-surface leading-tight line-clamp-1">
                        {isEditing ? "Edit details" : contact.name}
                      </h2>
                      {!isEditing && (
                        <p className="text-sm text-on-surface-variant mt-0.5 truncate">
                          {[contact.role, contact.location].filter(Boolean).join(" · ")}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {!isEditing && (
                      <button
                        onClick={() => setIsEditing(true)}
                        className="p-2 hover:bg-surface-container-high rounded-full transition-colors text-on-surface-variant"
                        title="Edit details"
                      >
                        <Edit3 className="w-5 h-5" />
                      </button>
                    )}
                    <button
                      onClick={onClose}
                      className="p-2 hover:bg-surface-container-high rounded-full transition-colors text-on-surface-variant"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Header actions */}
                {!isEditing && (
                  <div className="flex flex-wrap gap-2 mt-4">
                    {contact.phone && (
                      <button
                        onClick={callContact}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-outline-variant text-xs font-medium text-on-surface hover:bg-surface-variant transition-colors"
                      >
                        <Phone className="w-3.5 h-3.5" /> Call
                      </button>
                    )}
                    {contact.phone && (
                      <button
                        onClick={textContact}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-outline-variant text-xs font-medium text-on-surface hover:bg-surface-variant transition-colors"
                      >
                        <MessageSquare className="w-3.5 h-3.5" /> Text
                      </button>
                    )}
                    {contact.email && (
                      <button
                        onClick={emailContact}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-outline-variant text-xs font-medium text-on-surface hover:bg-surface-variant transition-colors"
                      >
                        <Mail className="w-3.5 h-3.5" /> Email
                      </button>
                    )}
                    <button
                      onClick={startLogInteraction}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-outline-variant text-xs font-medium text-on-surface hover:bg-surface-variant transition-colors"
                    >
                      <MessageSquare className="w-3.5 h-3.5" /> Log interaction
                    </button>
                    <button
                      onClick={startAddPrayer}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-outline-variant text-xs font-medium text-on-surface hover:bg-surface-variant transition-colors"
                    >
                      <Heart className="w-3.5 h-3.5" /> Add prayer
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Content Tab Switcher */}
            {!isEditing && (
              isMobile ? (
                /* Mobile Dropdown Switcher */
                <div className="cdm-switch sticky top-0 z-10 bg-surface border-t border-b border-outline-variant/35 px-5 py-2.5">
                  <div className="relative">
                    <select
                      value={activeTab}
                      onChange={(e) => setActiveTab(e.target.value as any)}
                      className="w-full h-11 pl-4 pr-10 bg-surface-container-low border border-outline rounded-xl text-sm font-semibold appearance-none cursor-pointer text-on-surface cdm-select"
                    >
                      <option value="overview">Overview</option>
                      <option value="interactions">Conversations ({interactions.length})</option>
                      <option value="thread">{walkLabel} ({countFor(threadMessages, null)})</option>
                      <option value="prayer">Prayer ({prayers.length})</option>
                      <option value="comments">Discussion ({comments.length})</option>
                      <option value="history">History</option>
                    </select>
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-xs text-on-surface-variant/75 cdm-select-caret">
                      ▾
                    </span>
                  </div>
                </div>
              ) : (
                /* Desktop Tab Bar */
                <div className="flex px-6 border-b border-outline-variant bg-surface-container-low/30 shrink-0 overflow-x-auto no-scrollbar">
                {([
                  { id: "overview", label: "Overview" },
                  { id: "interactions", label: "Conversations", count: interactions.length },
                  { id: "thread", label: walkLabel, count: countFor(threadMessages, null) },
                  { id: "prayer", label: "Prayer", count: prayers.length },
                  { id: "comments", label: "Discussion", count: comments.length },
                  { id: "history", label: "History" },
                ] as const).map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setActiveTab(t.id)}
                    className={cn(
                      "px-4 py-3 text-sm font-medium transition-colors relative whitespace-nowrap",
                      activeTab === t.id
                        ? "text-primary"
                        : "text-on-surface-variant/70 hover:text-on-surface",
                    )}
                  >
                    {t.label}
                    {"count" in t && t.count != null && (
                      <span className="ml-1.5 text-on-surface-variant/50">{t.count}</span>
                    )}
                    {activeTab === t.id && (
                      <motion.div
                        layoutId="activeTab"
                        className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-t-full"
                      />
                    )}
                  </button>
                ))}
              </div>
            )
          )}

            {/* Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
              {isEditing ? (
                <form
                  id="edit-contact-form"
                  onSubmit={handleUpdate}
                  className="space-y-6"
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* First Name */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-on-surface-variant flex items-center gap-2 px-1 uppercase tracking-wider">
                        <User className="w-3.5 h-3.5" /> FIRST NAME
                      </label>
                      <input
                        required
                        type="text"
                        value={formData.firstName}
                        onChange={(e) =>
                          setFormData((f) => ({
                            ...f,
                            firstName: capitalize(e.target.value),
                          }))
                        }
                        className="w-full h-11 px-4 rounded-xl bg-surface-container-high border border-outline focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-sm"
                        placeholder="e.g. Alex"
                      />
                    </div>
                    {/* Last Name */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-on-surface-variant flex items-center gap-2 px-1 uppercase tracking-wider">
                        <User className="w-3.5 h-3.5" /> LAST NAME
                      </label>
                      <input
                        type="text"
                        value={formData.lastName}
                        onChange={(e) =>
                          setFormData((f) => ({
                            ...f,
                            lastName: capitalize(e.target.value),
                          }))
                        }
                        className="w-full h-11 px-4 rounded-xl bg-surface-container-high border border-outline focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-sm"
                        placeholder="e.g. Johnson"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-on-surface-variant flex items-center gap-2 px-1 uppercase tracking-wider text-primary">
                        <Briefcase className="w-3.5 h-3.5" /> CONTACT GROUP
                      </label>
                      <input
                        required
                        type="text"
                        value={formData.role}
                        onChange={(e) =>
                          setFormData((f) => ({ ...f, role: e.target.value }))
                        }
                        className="w-full h-11 px-4 rounded-xl bg-surface-container-high border border-outline focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-sm"
                        placeholder="e.g. Student, Faculty"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-on-surface-variant flex items-center gap-2 px-1 uppercase tracking-wider">
                        <MapPin className="w-3.5 h-3.5" /> {formData.tags?.includes('New Sign Up') ? 'RESIDENCE HALL' : 'FIRST MET'}
                      </label>
                      <input
                        required
                        type="text"
                        value={formData.location}
                        onChange={(e) =>
                          setFormData((f) => ({
                            ...f,
                            location: e.target.value,
                          }))
                        }
                        className="w-full h-11 px-4 rounded-xl bg-surface-container-high border border-outline focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-sm"
                        placeholder="e.g. Campus Coffee"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-on-surface-variant flex items-center gap-2 px-1 uppercase tracking-wider">
                        <Mail className="w-3.5 h-3.5" /> EMAIL
                      </label>
                      <input
                        required
                        type="email"
                        value={formData.email}
                        onChange={(e) =>
                          setFormData((f) => ({ ...f, email: e.target.value }))
                        }
                        className="w-full h-11 px-4 rounded-xl bg-surface-container-high border border-outline focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-sm"
                        placeholder="alex@campus.edu"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-on-surface-variant flex items-center gap-2 px-1 uppercase tracking-wider">
                        <Phone className="w-3.5 h-3.5" /> PHONE
                      </label>
                      <input
                        type="tel"
                        value={formData.phone}
                        onChange={(e) => {
                          setFormData((f) => ({ ...f, phone: e.target.value }));
                          if (phoneError) setPhoneError(null);
                        }}
                        onBlur={handlePhoneBlur}
                        className={cn(
                          "w-full h-11 px-4 rounded-xl bg-surface-container-high border outline-none transition-all text-sm",
                          phoneError
                            ? "border-error focus:border-error focus:ring-1 focus:ring-error"
                            : "border-outline focus:border-primary focus:ring-1 focus:ring-primary",
                        )}
                        placeholder="(555) 000-0000"
                      />
                      <AnimatePresence>
                        {phoneError && (
                          <motion.p
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="text-[10px] font-bold text-error px-1 uppercase tracking-wider"
                          >
                            {phoneError}
                          </motion.p>
                        )}
                      </AnimatePresence>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-on-surface-variant flex items-center gap-2 px-1 uppercase tracking-wider text-primary">
                        <Calendar className="w-3.5 h-3.5" /> PIPELINE STAGE
                      </label>
                      <select
                        value={stages.some(s => s.label === formData.stage) ? formData.stage : "Unassigned"}
                        onChange={(e) =>
                          setFormData((f) => ({ ...f, stage: e.target.value }))
                        }
                        className="w-full h-11 px-4 rounded-xl bg-surface-container-high border border-outline focus:border-primary outline-none transition-all text-sm appearance-none"
                      >
                        <option value="Unassigned">Unassigned</option>
                        {stages.map((s) => (
                          <option key={s.id} value={s.label}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1.5 md:col-span-2">
                      <label className="text-xs font-bold text-on-surface-variant flex items-center gap-2 px-1 uppercase tracking-wider">
                        TAGS (COMMA SEPARATED)
                      </label>
                      <input
                        type="text"
                        value={formData.tags.join(", ")}
                        onChange={(e) =>
                          setFormData((f) => ({
                            ...f,
                            tags: e.target.value
                              .split(",")
                              .map((t) => t.trim())
                              .filter(Boolean),
                          }))
                        }
                        placeholder="e.g. Lead, Fall2023"
                        className="w-full h-11 px-4 rounded-xl bg-surface-container-high border border-outline focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-sm"
                      />
                    </div>
                    {/* Spiritual Background Field */}
                    <div className="space-y-1.5 md:col-span-2">
                      <label className="text-xs font-bold text-on-surface-variant flex items-center gap-2 px-1 uppercase tracking-wider">
                        <Sparkles className="w-3.5 h-3.5" /> SPIRITUAL BACKGROUND
                      </label>
                      <select
                        value={formData.spiritualBackground}
                        onChange={(e) =>
                          setFormData((f) => ({ ...f, spiritualBackground: e.target.value }))
                        }
                        className="w-full h-11 px-4 rounded-xl bg-surface-container-high border border-outline focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-sm appearance-none"
                      >
                        <option value="">Select background...</option>
                        <option value="Exploring">Exploring Faith</option>
                        <option value="Christian">Christian</option>
                        <option value="Catholic">Catholic</option>
                        <option value="Other">Other Religion / Background</option>
                        <option value="None">None</option>
                      </select>
                    </div>
                    {/* Notes Field */}
                    <div className="space-y-1.5 md:col-span-2">
                      <label className="text-xs font-bold text-on-surface-variant flex items-center gap-2 px-1 uppercase tracking-wider">
                        <MessageSquare className="w-3.5 h-3.5" /> NOTES
                      </label>
                      <textarea
                        required
                        value={formData.notes}
                        onChange={(e) =>
                          setFormData((f) => ({ ...f, notes: e.target.value }))
                        }
                        className="w-full min-h-[120px] p-4 rounded-xl bg-surface-container-high border border-outline focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-sm resize-none"
                        placeholder="Add some context about this contact..."
                      />
                    </div>
                    {isMobile && (
                      <div className="pt-4 border-t border-outline-variant/30 md:col-span-2">
                        <button
                          type="button"
                          onClick={handleDelete}
                          disabled={loading}
                          className="w-full flex items-center justify-center gap-2 px-4 h-11 rounded-xl text-error font-bold text-sm border border-error/20 hover:bg-error/10 transition-colors disabled:opacity-50"
                        >
                          <Trash2 className="w-4 h-4" />
                          {loading ? (
                            <span className="animate-pulse">Deleting...</span>
                          ) : (
                            "Delete Contact"
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                </form>
              ) : (
                <div className="min-h-[400px]">
                  {activeTab === "overview" && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-8"
                    >
                      {/* Info Grid */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-y-6 gap-x-12">
                        <div className="flex items-start gap-4">
                          <div className="w-10 h-10 rounded-xl bg-surface-container-high flex items-center justify-center text-primary shrink-0 transition-colors">
                            <Mail className="w-5 h-5" />
                          </div>
                          <div>
                            <p className="text-xs font-medium text-on-surface-variant mb-0.5">
                              Email Address
                            </p>
                            <p className="text-sm font-bold text-on-surface break-all">
                              {contact.email}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-start gap-4">
                          <div className="w-10 h-10 rounded-xl bg-surface-container-high flex items-center justify-center text-primary shrink-0">
                            <Phone className="w-5 h-5" />
                          </div>
                          <div>
                            <p className="text-xs font-medium text-on-surface-variant mb-0.5">
                              Phone Number
                            </p>
                            <p className="text-sm font-bold text-on-surface">
                              {contact.phone || "Not provided"}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-start gap-4">
                          <div className="w-10 h-10 rounded-xl bg-surface-container-high flex items-center justify-center text-primary shrink-0">
                            <MapPin className="w-5 h-5" />
                          </div>
                          <div>
                            <p className="text-xs font-medium text-on-surface-variant mb-0.5">
                              {contact?.tags?.includes('New Sign Up') ? 'Residence Hall' : 'First Met'}
                            </p>
                            <p className="text-sm font-bold text-on-surface">
                              {contact.location || "Not recorded"}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-start gap-4">
                          <div className="w-10 h-10 rounded-xl bg-surface-container-high flex items-center justify-center text-primary shrink-0">
                            <Briefcase className="w-5 h-5" />
                          </div>
                          <div>
                            <p className="text-xs font-medium text-on-surface-variant mb-0.5">
                              Stage
                            </p>
                            <div className="flex flex-col gap-1 mt-1">
                              <span className="px-2.5 py-0.5 rounded-full bg-surface-variant text-on-surface-variant text-xs font-medium w-fit">
                                {stages.some(s => s.label === contact.stage) ? contact.stage : "Unassigned"}
                              </span>
                            </div>
                          </div>
                        </div>
                        {contact.spiritualBackground && (
                          <div className="flex items-start gap-4">
                            <div className="w-10 h-10 rounded-xl bg-surface-container-high flex items-center justify-center text-primary shrink-0">
                              <Sparkles className="w-5 h-5" />
                            </div>
                            <div>
                              <p className="text-xs font-medium text-on-surface-variant mb-0.5">
                                Spiritual Background
                              </p>
                              <p className="text-sm font-bold text-on-surface">
                                {contact.spiritualBackground}
                              </p>
                            </div>
                          </div>
                        )}
                        <div className="flex items-start gap-4 md:col-span-2">
                          <div className="w-10 h-10 rounded-xl bg-surface-container-high flex items-center justify-center text-primary shrink-0">
                            <Tag className="w-5 h-5" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-on-surface-variant mb-1.5">
                              Tags
                            </p>
                            <div className="flex flex-wrap items-center gap-2">
                              {formData.tags.map((tag) => (
                                <span
                                  key={tag}
                                  className="group/tag inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-surface-container-highest text-on-surface-variant text-xs font-medium border border-outline-variant/40"
                                >
                                  {tag}
                                  <button
                                    onClick={() => removeTag(tag)}
                                    className="text-on-surface-variant/50 hover:text-error transition-colors"
                                    title="Remove tag"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </span>
                              ))}
                              {addingTag ? (
                                <input
                                  autoFocus
                                  value={tagInput}
                                  onChange={(e) => setTagInput(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      commitTag();
                                    }
                                    if (e.key === "Escape") {
                                      setTagInput("");
                                      setAddingTag(false);
                                    }
                                  }}
                                  onBlur={commitTag}
                                  placeholder="new tag…"
                                  className="h-7 px-2.5 rounded-full bg-surface border border-primary/40 text-xs text-on-surface outline-none w-28"
                                />
                              ) : (
                                <button
                                  onClick={() => setAddingTag(true)}
                                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border border-dashed border-outline-variant text-xs font-medium text-on-surface-variant hover:border-primary hover:text-primary transition-colors"
                                >
                                  <Plus className="w-3 h-3" /> add
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Notes Section */}
                      <div className="p-5 rounded-[20px] bg-surface-container-low border border-outline-variant">
                        <h3 className="font-serif text-lg text-on-surface flex items-center gap-2 mb-3">
                          <MessageSquare className="w-4 h-4 text-primary" /> What we know
                        </h3>
                        <div className="text-sm text-on-surface-variant leading-relaxed whitespace-pre-wrap min-h-[60px]">
                          {contact.notes ||
                            "No notes recorded for this contact yet."}
                        </div>
                      </div>

                      {/* Timestamps */}
                      <div className="flex items-center justify-between px-2 pt-3 border-t border-outline-variant/30">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-xs text-on-surface-variant/70">
                            Last seen {contact.lastSeen || "—"}
                          </span>
                          <span className="text-xs text-on-surface-variant/50">
                            Added{" "}
                            {new Date(
                              contact.createdAt || "",
                            ).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {activeTab === "interactions" && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-4"
                    >
                      <div className="flex items-center justify-between px-2">
                        <h3 className="font-serif text-lg text-on-surface">
                          Every conversation
                        </h3>
                        <button
                          onClick={() =>
                            setIsLoggingInteraction(!isLoggingInteraction)
                          }
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-outline-variant text-xs font-medium text-on-surface hover:bg-surface-variant transition-colors"
                        >
                          {isLoggingInteraction ? (
                            <X className="w-3.5 h-3.5" />
                          ) : (
                            <Plus className="w-3.5 h-3.5" />
                          )}
                          {isLoggingInteraction ? "Cancel" : "Log interaction"}
                        </button>
                      </div>

                      {/* Log Interaction Form */}
                      <AnimatePresence>
                        {isLoggingInteraction && (
                          <motion.form
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            onSubmit={handleAddInteraction}
                            className="space-y-3 p-4 rounded-2xl bg-surface-container-high border border-primary/20 overflow-hidden"
                          >
                            <div className="grid grid-cols-2 gap-3 pb-3">
                              <div className="space-y-1">
                                <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest flex items-center gap-1.5 px-1">
                                  <Calendar className="w-3 h-3" /> Date & Time
                                </label>
                                <input
                                  required
                                  type="datetime-local"
                                  value={newInteraction.dateTime}
                                  onChange={(e) =>
                                    setNewInteraction((prev) => ({
                                      ...prev,
                                      dateTime: e.target.value,
                                    }))
                                  }
                                  className="w-full h-9 px-3 rounded-lg bg-surface-container border border-outline-variant focus:border-primary outline-none transition-all text-xs"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest flex items-center gap-1.5 px-1">
                                  <MessageSquare className="w-3 h-3" /> Type
                                </label>
                                <select
                                  value={newInteraction.type}
                                  onChange={(e) =>
                                    setNewInteraction((prev) => ({
                                      ...prev,
                                      type: e.target.value,
                                    }))
                                  }
                                  className="w-full h-9 px-3 rounded-lg bg-surface-container border border-outline-variant focus:border-primary outline-none transition-all text-xs"
                                >
                                  <option value="chat">Chat / Message</option>
                                  <option value="call">Phone Call</option>
                                  <option value="meeting">Meeting</option>
                                  <option value="email">Email</option>
                                </select>
                              </div>
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest flex items-center gap-1.5 px-1">
                                <MessageSquare className="w-3 h-3" /> Content
                              </label>
                              <textarea
                                required
                                placeholder="Describe the interaction..."
                                value={newInteraction.content}
                                onChange={(e) =>
                                  setNewInteraction((prev) => ({
                                    ...prev,
                                    content: e.target.value,
                                  }))
                                }
                                className="w-full min-h-[80px] p-3 rounded-lg bg-surface-container border border-outline-variant focus:border-primary outline-none transition-all text-xs resize-none"
                              />
                            </div>
                            <div className="flex justify-end gap-2 pt-1">
                              <button
                                type="submit"
                                disabled={
                                  submittingInteraction ||
                                  !newInteraction.content.trim()
                                }
                                className="px-4 h-9 rounded-full bg-primary text-on-primary font-bold shadow-lg shadow-primary/20 hover:shadow-primary/30 active:scale-95 transition-all disabled:opacity-50 flex items-center gap-2 text-xs"
                              >
                                {submittingInteraction ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Send className="w-3.5 h-3.5" />
                                )}
                                Log Interaction
                              </button>
                            </div>
                          </motion.form>
                        )}
                      </AnimatePresence>

                      <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                        {interactionsLoading ? (
                          <div className="space-y-3">
                            {[1, 2, 3].map((i) => (
                              <div key={i} className="flex gap-3">
                                <Skeleton className="w-8 h-8 rounded-full shrink-0" />
                                <div className="flex-1 space-y-2">
                                  <Skeleton className="h-3 w-24 rounded-full" />
                                  <Skeleton className="h-12 w-full rounded-xl" />
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : interactions.length === 0 ? (
                          <div className="text-center py-12 px-4 rounded-[20px] bg-surface-container-low/50 border border-dashed border-outline-variant">
                            <MessageSquare className="w-10 h-10 text-on-surface-variant/20 mx-auto mb-2" />
                            <p className="text-xs font-bold text-on-surface-variant/40 uppercase tracking-wider">
                              No interactions logged yet.
                            </p>
                          </div>
                        ) : (
                          [...interactions].reverse().map((interaction) => (
                            <div
                              key={interaction.id}
                              className="flex gap-3 group"
                            >
                              <div className="shrink-0 mt-0.5">
                                {interaction.userPhoto ? (
                                  <img
                                    src={interaction.userPhoto}
                                    alt={interaction.userName}
                                    className="w-8 h-8 rounded-full border border-outline-variant"
                                    referrerPolicy="no-referrer"
                                  />
                                ) : (
                                  <div className="w-8 h-8 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center">
                                    <UserCircle className="w-5 h-5" />
                                  </div>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                {editingInteractionId === interaction.id ? (
                                  <form
                                    onSubmit={handleUpdateInteraction}
                                    className="space-y-3 p-3 rounded-2xl bg-surface-container-high border border-primary/20"
                                  >
                                    <div className="grid grid-cols-2 gap-3">
                                      <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest px-1">
                                          Date
                                        </label>
                                        <input
                                          type="datetime-local"
                                          required
                                          value={editInteractionData.dateTime}
                                          onChange={(e) =>
                                            setEditInteractionData((prev) => ({
                                              ...prev,
                                              dateTime: e.target.value,
                                            }))
                                          }
                                          className="w-full h-8 px-2 rounded-md bg-surface border border-outline-variant focus:border-primary outline-none text-xs"
                                        />
                                      </div>
                                      <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest px-1">
                                          Type
                                        </label>
                                        <select
                                          value={editInteractionData.type}
                                          onChange={(e) =>
                                            setEditInteractionData((prev) => ({
                                              ...prev,
                                              type: e.target.value,
                                            }))
                                          }
                                          className="w-full h-8 px-2 rounded-md bg-surface border border-outline-variant focus:border-primary outline-none text-xs"
                                        >
                                          <option value="chat">
                                            Chat / Message
                                          </option>
                                          <option value="call">
                                            Phone Call
                                          </option>
                                          <option value="meeting">
                                            Meeting
                                          </option>
                                          <option value="email">Email</option>
                                          <option value="interaction">
                                            Other
                                          </option>
                                        </select>
                                      </div>
                                    </div>
                                    <div className="space-y-1">
                                      <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest px-1">
                                        Content
                                      </label>
                                      <textarea
                                        required
                                        value={editInteractionData.content}
                                        onChange={(e) =>
                                          setEditInteractionData((prev) => ({
                                            ...prev,
                                            content: e.target.value,
                                          }))
                                        }
                                        className="w-full min-h-[60px] p-2 rounded-md bg-surface border border-outline-variant focus:border-primary outline-none text-xs resize-none"
                                      />
                                    </div>
                                    <div className="flex justify-end gap-2 pt-1 border-t border-outline-variant/30">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setEditingInteractionId(null)
                                        }
                                        className="h-7 px-3 text-[11px] font-bold text-on-surface-variant hover:text-on-surface transition-colors focus:outline-none"
                                      >
                                        Cancel
                                      </button>
                                      <button
                                        type="submit"
                                        disabled={
                                          isUpdatingInteraction ||
                                          !editInteractionData.content.trim()
                                        }
                                        className="h-7 px-3 bg-primary text-on-primary rounded text-[11px] font-bold disabled:opacity-50 transition-colors flex items-center gap-1.5 focus:outline-none"
                                      >
                                        {isUpdatingInteraction ? (
                                          <Loader2 className="w-3 h-3 animate-spin" />
                                        ) : (
                                          "Save"
                                        )}
                                      </button>
                                    </div>
                                  </form>
                                ) : (
                                  <>
                                    <div className="flex items-center justify-between mb-1">
                                      <div className="flex items-center gap-2">
                                        <span className="text-xs font-black text-on-surface uppercase tracking-tight">
                                          {interaction.userName}
                                        </span>
                                        <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full uppercase tracking-widest">
                                          {new Date(
                                            interaction.dateTime,
                                          ).toLocaleDateString()}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-2 transition-opacity">
                                        {(user?.uid === interaction.userId || isAdmin) && (
                                          <button
                                            onClick={() => {
                                              setEditingInteractionId(
                                                interaction.id,
                                              );
                                              setEditInteractionData({
                                                content: interaction.content,
                                                dateTime: interaction.dateTime,
                                                type:
                                                  interaction.type ||
                                                  "interaction",
                                              });
                                            }}
                                            className="text-[10px] font-bold text-primary hover:text-primary-variant uppercase tracking-widest focus:outline-none"
                                          >
                                            Edit
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                    <div className="p-3 rounded-2xl rounded-tl-none bg-surface-container-high text-on-surface text-sm leading-relaxed border border-outline-variant/30 group-hover:border-outline-variant transition-colors whitespace-pre-wrap">
                                      {interaction.content}
                                    </div>
                                    <div className="mt-1 flex items-center justify-between gap-2">
                                      <span className="text-[10px] font-bold text-on-surface-variant/40 uppercase tracking-widest">
                                        {interaction.createdAt
                                          ? `Logged ${new Date(interaction.createdAt).toLocaleDateString()} at ${new Date(interaction.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                                          : "Logging..."}
                                      </span>
                                      {(interaction.duration ||
                                        interaction.type) && (
                                        <span className="text-[10px] font-bold text-on-surface-variant/40 uppercase tracking-widest flex items-center gap-1">
                                          {interaction.type && (
                                            <span className="px-1.5 py-0.5 rounded bg-surface-container-high">
                                              {interaction.type}
                                            </span>
                                          )}
                                          {interaction.duration && (
                                            <span className="flex items-center gap-0.5">
                                              <Clock className="w-3 h-3" />
                                              {interaction.duration}
                                            </span>
                                          )}
                                        </span>
                                      )}
                                    </div>
                                    {/* Walk through this interaction together */}
                                    <div className="mt-2">
                                      <button
                                        onClick={() =>
                                          setOpenThread(
                                            openThread === interaction.id
                                              ? null
                                              : interaction.id,
                                          )
                                        }
                                        className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant/60 hover:text-primary transition-colors"
                                      >
                                        <Footprints className="w-3.5 h-3.5" />
                                        {countFor(threadMessages, interaction.id) > 0
                                          ? `Alongside · ${countFor(threadMessages, interaction.id)}`
                                          : "Think this through together"}
                                      </button>
                                      {openThread === interaction.id && (
                                        <div className="mt-2 pl-3 border-l-2 border-outline-variant/40">
                                          <Thread
                                            contactId={contact.id}
                                            interactionId={interaction.id}
                                            meStaffId={user?.uid ?? ""}
                                            recipientUid={threadRecipient}
                                            contactName={contact.name}
                                            compact
                                          />
                                        </div>
                                      )}
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </motion.div>
                  )}

                  {activeTab === "thread" && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                    >
                      <Thread
                        contactId={contact.id}
                        interactionId={null}
                        meStaffId={user?.uid ?? ""}
                        recipientUid={threadRecipient}
                        contactName={contact.name}
                      />
                    </motion.div>
                  )}

                  {activeTab === "prayer" && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-4"
                    >
                      <div className="flex items-center justify-between px-2">
                        <h3 className="font-serif text-lg text-on-surface">
                          Prayers we're holding
                        </h3>
                        <button
                          onClick={() => setIsAddingPrayer(!isAddingPrayer)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-outline-variant text-xs font-medium text-on-surface hover:bg-surface-variant transition-colors"
                        >
                          {isAddingPrayer ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                          {isAddingPrayer ? "Cancel" : "Add prayer"}
                        </button>
                      </div>

                      {/* Add Prayer Form */}
                      <AnimatePresence>
                        {isAddingPrayer && (
                          <motion.form
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            onSubmit={handleAddPrayer}
                            className="space-y-3 p-4 rounded-2xl bg-surface-container-high border border-primary/20 overflow-hidden"
                          >
                            <div className="space-y-1">
                              <label className="text-xs font-medium text-on-surface-variant px-1">
                                What are we praying for?
                              </label>
                              <input
                                required
                                autoFocus
                                type="text"
                                placeholder={`e.g. ${firstName}'s family back home`}
                                value={newPrayer.burden}
                                onChange={(e) =>
                                  setNewPrayer((p) => ({ ...p, burden: e.target.value }))
                                }
                                className="w-full h-10 px-3 rounded-lg bg-surface border border-outline-variant focus:border-primary outline-none transition-colors text-sm"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs font-medium text-on-surface-variant px-1">
                                More context <span className="text-on-surface-variant/60">(optional)</span>
                              </label>
                              <textarea
                                placeholder="Any background worth knowing as we pray…"
                                value={newPrayer.context}
                                onChange={(e) =>
                                  setNewPrayer((p) => ({ ...p, context: e.target.value }))
                                }
                                className="w-full min-h-[70px] p-3 rounded-lg bg-surface border border-outline-variant focus:border-primary outline-none transition-colors text-sm resize-none"
                              />
                            </div>
                            <div className="flex justify-end pt-1">
                              <button
                                type="submit"
                                disabled={submittingPrayer || !newPrayer.burden.trim()}
                                className="inline-flex items-center gap-2 px-4 h-9 rounded-full bg-primary text-on-primary text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                              >
                                {submittingPrayer ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Heart className="w-3.5 h-3.5" />
                                )}
                                Add prayer
                              </button>
                            </div>
                          </motion.form>
                        )}
                      </AnimatePresence>

                      <div className="space-y-3 max-h-[460px] overflow-y-auto pr-2 custom-scrollbar">
                        {prayersLoading ? (
                          <div className="space-y-3">
                            {[1, 2].map((i) => (
                              <Skeleton key={i} className="h-20 w-full rounded-2xl" />
                            ))}
                          </div>
                        ) : prayers.length === 0 ? (
                          <div className="text-center py-12 px-4 rounded-[20px] bg-surface-container-low/50 border border-dashed border-outline-variant">
                            <Heart className="w-10 h-10 text-on-surface-variant/20 mx-auto mb-2" />
                            <p className="text-sm text-on-surface-variant/60">
                              No prayers recorded for {firstName} yet.
                            </p>
                          </div>
                        ) : (
                          prayers.map((p) => {
                            const answered = p.status === "answered";
                            const heldDays = p.date
                              ? Math.max(
                                  0,
                                  Math.floor(
                                    (Date.now() - new Date(p.date).getTime()) / 86_400_000,
                                  ),
                                )
                              : null;
                            return (
                              <div
                                key={p.id}
                                className="p-4 rounded-2xl bg-surface-container-high border border-outline-variant/40"
                              >
                                <div className="flex items-center justify-between gap-2 mb-1.5">
                                  <span
                                    className={cn(
                                      "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium",
                                      answered
                                        ? "bg-stage-teal-soft text-stage-teal"
                                        : p.status === "unanswered"
                                          ? "bg-surface-variant text-on-surface-variant"
                                          : "bg-stage-violet-soft text-stage-violet",
                                    )}
                                  >
                                    <span
                                      className={cn(
                                        "w-1.5 h-1.5 rounded-full",
                                        answered
                                          ? "bg-stage-teal"
                                          : p.status === "unanswered"
                                            ? "bg-on-surface-variant"
                                            : "bg-stage-violet",
                                      )}
                                    />
                                    {answered
                                      ? "answered"
                                      : p.status === "unanswered"
                                        ? "closed"
                                        : "open"}
                                  </span>
                                  {heldDays != null && (
                                    <span className="text-xs text-on-surface-variant/60">
                                      held {heldDays} {heldDays === 1 ? "day" : "days"}
                                    </span>
                                  )}
                                </div>
                                <p className="text-sm text-on-surface leading-relaxed whitespace-pre-wrap">
                                  {p.burden}
                                </p>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </motion.div>
                  )}

                  {activeTab === "comments" && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-4"
                    >
                      <h3 className="font-serif text-lg text-on-surface px-2">
                        Team discussion
                      </h3>

                      <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                        {commentsLoading ? (
                          <div className="space-y-3">
                            {[1, 2, 3].map((i) => (
                              <div key={i} className="flex gap-3">
                                <Skeleton className="w-8 h-8 rounded-full shrink-0" />
                                <div className="flex-1 space-y-2">
                                  <Skeleton className="h-3 w-24 rounded-full" />
                                  <Skeleton className="h-12 w-full rounded-xl" />
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : comments.length === 0 ? (
                          <div className="text-center py-12 px-4 rounded-[20px] bg-surface-container-low/50 border border-dashed border-outline-variant">
                            <MessageSquare className="w-10 h-10 text-on-surface-variant/20 mx-auto mb-2" />
                            <p className="text-[10px] font-bold text-on-surface-variant/40 uppercase tracking-wider">
                              No comments yet. Start the conversation.
                            </p>
                          </div>
                        ) : (
                          comments.filter((c) => !c.parentId).map((comment) => (
                            <div key={comment.id} className="space-y-3">
                              <div className="flex gap-3 group">
                                <div className="shrink-0 mt-0.5">
                                  {comment.userPhoto ? (
                                    <img
                                      src={comment.userPhoto}
                                      alt={comment.userName}
                                      className="w-8 h-8 rounded-full border border-outline-variant"
                                      referrerPolicy="no-referrer"
                                    />
                                  ) : (
                                    <div className="w-8 h-8 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center">
                                      <UserCircle className="w-5 h-5" />
                                    </div>
                                  )}
                                </div>
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="text-xs font-black text-on-surface uppercase tracking-tight">
                                      {comment.userName}
                                    </span>
                                    <span className="text-[10px] font-bold text-on-surface-variant/40">
                                      {comment.createdAt
                                        ? `${new Date(comment.createdAt).toLocaleDateString()} at ${new Date(comment.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                                        : "Sending..."}
                                    </span>
                                  </div>
                                  <div className="p-3 rounded-2xl rounded-tl-none bg-surface-container-high text-on-surface text-sm leading-relaxed border border-outline-variant/30 group-hover:border-outline-variant transition-colors">
                                    {comment.text}
                                  </div>
                                  <div className="mt-1 flex items-center gap-4">
                                    <button
                                      type="button"
                                      onClick={() => setReplyingTo(comment.id)}
                                      className="text-[10px] font-bold text-on-surface-variant hover:text-primary transition-colors flex items-center gap-1"
                                    >
                                      <MessageSquare className="w-3 h-3" /> Reply
                                    </button>
                                  </div>
                                </div>
                              </div>
                              
                              {/* Replies */}
                              {comments.filter(c => c.parentId === comment.id).length > 0 && (
                                <div className="ml-11 space-y-3 pl-4 border-l-2 border-outline-variant/30">
                                  {comments.filter(c => c.parentId === comment.id).map(reply => (
                                    <div key={reply.id} className="flex gap-3 group">
                                      <div className="shrink-0 mt-0.5">
                                        {reply.userPhoto ? (
                                          <img
                                            src={reply.userPhoto}
                                            alt={reply.userName}
                                            className="w-6 h-6 rounded-full border border-outline-variant"
                                            referrerPolicy="no-referrer"
                                          />
                                        ) : (
                                          <div className="w-6 h-6 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center">
                                            <UserCircle className="w-4 h-4" />
                                          </div>
                                        )}
                                      </div>
                                      <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                          <span className="text-[11px] font-black text-on-surface uppercase tracking-tight">
                                            {reply.userName}
                                          </span>
                                          <span className="text-[9px] font-bold text-on-surface-variant/40">
                                            {reply.createdAt
                                              ? `${new Date(reply.createdAt).toLocaleDateString()} at ${new Date(reply.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                                              : "Sending..."}
                                          </span>
                                        </div>
                                        <div className="p-2.5 rounded-2xl rounded-tl-none bg-surface-container text-on-surface text-sm leading-relaxed border border-outline-variant/30 group-hover:border-outline-variant transition-colors">
                                          {reply.text}
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))
                        )}
                      </div>

                      {/* New Comment Input */}
                      <form
                        onSubmit={handleAddComment}
                        className="relative mt-2"
                      >
                        {replyingTo && (
                          <div className="flex items-center justify-between bg-surface-container px-4 py-2 rounded-t-[20px] mb-[-10px] pb-[14px]">
                            <span className="text-[10px] font-bold text-on-surface-variant flex items-center gap-1.5">
                              <MessageSquare className="w-3 h-3" />
                              Replying to {comments.find(c => c.id === replyingTo)?.userName}
                            </span>
                            <button
                              type="button"
                              onClick={() => setReplyingTo(null)}
                              className="text-[10px] font-bold text-error hover:opacity-80"
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                        <div className="relative group">
                          <textarea
                            placeholder={replyingTo ? "Type your reply..." : "Add a comment to the discussion..."}
                            value={newComment}
                            onChange={(e) => setNewComment(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                handleAddComment(e);
                              }
                            }}
                            className="w-full min-h-[100px] p-4 pr-12 rounded-[24px] bg-surface-container-high border border-outline-variant focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-sm resize-none"
                          />
                          <button
                            type="submit"
                            disabled={submittingComment || !newComment.trim()}
                            className="absolute right-3 bottom-3 p-2 bg-primary text-on-primary rounded-full shadow-lg shadow-primary/20 hover:shadow-primary/30 active:scale-95 transition-all disabled:opacity-50 disabled:shadow-none"
                          >
                            {submittingComment ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Send className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </form>
                    </motion.div>
                  )}

                  {activeTab === "history" && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-4"
                    >
                      <h3 className="font-serif text-lg text-on-surface px-2">
                        Looking back
                      </h3>

                      <div className="space-y-6 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                        {activitiesLoading ? (
                          <div className="space-y-4">
                            {[1, 2, 3, 4].map((i) => (
                              <div key={i} className="flex gap-4">
                                <Skeleton className="w-10 h-10 rounded-full shrink-0" />
                                <div className="flex-1 space-y-2">
                                  <Skeleton className="h-4 w-1/3 rounded-full" />
                                  <Skeleton className="h-8 w-full rounded-xl" />
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : activities.length === 0 ? (
                          <div className="text-center py-12 px-4 rounded-[20px] bg-surface-container-low/50 border border-dashed border-outline-variant">
                            <Clock className="w-10 h-10 text-on-surface-variant/20 mx-auto mb-2" />
                            <p className="text-[10px] font-bold text-on-surface-variant/40 uppercase tracking-wider">
                              No audit history found for this contact.
                            </p>
                          </div>
                        ) : (
                          activities.map((activity, idx) => (
                            <AuditActivityItem
                              key={activity.id || idx}
                              activity={activity}
                              isLast={idx === activities.length - 1}
                            />
                          ))
                        )}
                      </div>
                    </motion.div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className={cn("px-6 py-4 border-t border-outline-variant shrink-0 flex items-center justify-between bg-surface-container-low/50", isMobile && "hidden")}>
              <div className="hidden sm:block">
                <button
                  onClick={handleDelete}
                  disabled={loading}
                  className="flex items-center gap-2 px-4 h-10 rounded-full text-error font-bold text-sm hover:bg-error/10 transition-colors disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" />
                  {loading ? (
                    <span className="animate-pulse">Deleting...</span>
                  ) : (
                    "Delete Contact"
                  )}
                </button>
              </div>

              <div className="flex gap-3 w-full sm:w-auto">
                {isEditing ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setIsEditing(false)}
                      className="flex-1 sm:flex-none px-6 h-10 rounded-full font-bold text-on-surface-variant hover:bg-surface-variant text-sm transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      form="edit-contact-form"
                      type="submit"
                      disabled={loading}
                      className="flex-[2] sm:flex-none px-8 h-10 rounded-full bg-primary text-on-primary font-bold shadow-lg shadow-primary/20 hover:shadow-primary/30 active:scale-[0.98] transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-70"
                    >
                      {loading ? (
                        <span className="animate-pulse">Saving...</span>
                      ) : (
                        "Save Changes"
                      )}
                    </button>
                  </>
                ) : (
                  <button
                    onClick={onClose}
                    className="w-full sm:w-auto px-8 h-10 rounded-full bg-secondary-container text-on-secondary-container font-bold hover:shadow-md transition-all text-sm"
                  >
                    Done
                  </button>
                )}
              </div>
            </div>

            {/* Mobile-only delete button */}
            <div className={cn("sm:hidden px-6 pb-6 pt-0", isMobile && "hidden")}>
              <button
                onClick={handleDelete}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 px-4 h-10 rounded-full text-error font-bold text-sm border border-error/20 hover:bg-error/10 transition-colors disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                {loading ? (
                  <span className="animate-pulse">Deleting...</span>
                ) : (
                  "Delete Contact"
                )}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
