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
  Sparkles,
  Heart,
  Footprints,
  Instagram,
  Check,
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
  arrayUnion,
  arrayRemove,
} from "firebase/firestore";
import { cn, formatPhoneNumber, validatePhoneNumber } from "../../lib/utils";
import { format } from 'date-fns';
import { Contact, Stage, Interaction, Comment, Activity, PrayerRecord } from "../../types";
import { useAuth } from "../AuthProvider";
import { canSeeContact, canSeeHistory } from "../../lib/permissions";
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
          "absolute left-0 top-0.5 w-8 h-8 rounded-full border-2 border-surface-container flex items-center justify-center z-10 transition-transform group-hover:scale-110 ",
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
          <span className="text-xs font-semibold text-on-surface  tracking-tight">
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
          <span className="text-[10px] font-semibold text-on-surface-variant/40 ml-auto   whitespace-nowrap">
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
  const { user, isAdmin, role } = useAuth();
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
  const [teamMembers, setTeamMembers] = useState<{ id: string; name: string; role: string; initials: string }[]>([]);
  const [sharing, setSharing] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "overview" | "interactions" | "thread" | "prayer" | "comments" | "history"
  >("overview");

  useEffect(() => {
    if (!isOpen) return;
    const unsub = onSnapshot(collection(db, "users"), (snap) => {
      setTeamMembers(
        snap.docs.map((d) => {
          const data = d.data();
          const name = data.name || data.displayName || data.email || "Staff";
          const parts = name.trim().split(/\s+/);
          const initials = parts.length >= 2 ? `${parts[0][0]}${parts[1][0]}`.toUpperCase() : name.slice(0, 2).toUpperCase();
          return {
            id: d.id,
            name,
            role: data.role === "admin" ? "Full-timer" : data.role === "manager" ? "Trainee" : "Staff",
            initials,
          };
        })
      );
    });
    return () => unsub();
  }, [isOpen]);
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

  const hasAccess = canSeeContact(role, user?.uid, contact);
  if (isOpen && !hasAccess) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
        <div className="w-full max-w-md bg-surface-container rounded-[28px] p-6 border border-outline-variant shadow-2xl text-on-surface">
          <h2 className="font-serif text-xl font-semibold mb-2">Access Restricted</h2>
          <p className="text-sm text-on-surface-variant mb-6">
            You do not have permission to view this contact record.
          </p>
          <div className="flex justify-end">
            <button
              onClick={onClose}
              className="px-5 py-2.5 rounded-full bg-primary text-on-primary text-xs font-semibold hover:opacity-90 transition-opacity"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  const walkLabel = "Follow-up";
  const threadRecipient = walkingRecipient(user?.uid, contact.createdBy || contact.addedBy);

  const coCreators = contact.coCreators || [];
  const sharedWith = teamMembers.filter((m) => coCreators.includes(m.id));
  const ownerId = contact.owner || contact.createdBy || contact.addedBy;
  const canShare = role === "admin" || ownerId === user?.uid;
  const shareOptions = teamMembers.filter(
    (m) => m.id !== ownerId && !coCreators.includes(m.id)
  );

  const addShare = async (staffId: string) => {
    if (!contact) return;
    const s = teamMembers.find((m) => m.id === staffId);
    await updateDoc(doc(db, "contacts", contact.id), {
      coCreators: arrayUnion(staffId),
    });
    contact.coCreators = [...(contact.coCreators || []), staffId];
    if (s) {
      await logActivity({
        action: "shared a person",
        targetId: contact.id,
        targetName: `${s.name} can now see ${contact.name.split(" ")[0]}.`,
        targetType: "contact",
        type: "edit",
        description: `Granted view access to ${s.name}`,
      });
    }
    setSharing(false);
  };

  const removeShare = async (staffId: string) => {
    if (!contact) return;
    const s = teamMembers.find((m) => m.id === staffId);
    await updateDoc(doc(db, "contacts", contact.id), {
      coCreators: arrayRemove(staffId),
    });
    contact.coCreators = (contact.coCreators || []).filter((x) => x !== staffId);
    if (s) {
      await logActivity({
        action: "unshared a person",
        targetId: contact.id,
        targetName: `${s.name} no longer sees ${contact.name.split(" ")[0]}.`,
        targetType: "contact",
        type: "edit",
        description: `Removed view access for ${s.name}`,
      });
    }
  };

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

      const userName = user.displayName || user.email?.split("@")[0] || "Anonymous";
      await updateDoc(doc(db, "contacts", contact.id), {
        lastSeen: newInteraction.dateTime,
        lastContactedBy: userName,
        lastContactedById: user.uid,
        lastContactedDate: newInteraction.dateTime,
        updatedAt: serverTimestamp(),
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

  // ── Desktop page aside data (Field Notes: how to reach / where they are /
  //    cared for by / who else can see / tags) ──
  const fmtDate = (v?: string | null): string => {
    if (!v) return "—";
    const d = new Date(v);
    return isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
  };
  const sinceText = contact.lastContactedDate
    ? `Last connected ${fmtDate(contact.lastContactedDate)}`
    : contact.lastSeen
      ? `Last seen ${fmtDate(contact.lastSeen)}`
      : "Not connected yet";
  const sinceBy = contact.lastContactedBy || null;
  const ownerInfo = teamMembers.find((m) => m.id === ownerId);
  const ownerName = ownerInfo?.name || contact.createdByName || "—";
  const ownerRole = ownerInfo?.role || "";
  const addedByName =
    contact.createdByName ||
    (contact.addedBy ? teamMembers.find((m) => m.id === contact.addedBy)?.name : null);
  const sortedStages = [...stages].sort((a, b) => a.order - b.order);
  const stageIdx = contact.stage
    ? sortedStages.findIndex((s) => s.label === contact.stage)
    : -1;
  const openPrayers = prayers.filter(
    (p) => p.status !== "answered" && p.status !== "unanswered",
  );
  const heldDays = (date?: string): number | null => {
    if (!date) return null;
    const d = new Date(date).getTime();
    return isNaN(d) ? null : Math.max(1, Math.floor((Date.now() - d) / 86_400_000));
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className={isMobile ? "cdm-page" : "cd-page"}>
          <div className={isMobile ? "cdm-page-main" : "cd-page-main"}>
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
                              className="text-[10px]  font-semibold  px-2 py-0.5 rounded-full bg-surface-variant text-on-surface-variant"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                        <p className="text-xs text-on-surface-variant cdm-meta mt-3">
                          {[contact.role, contact.location, contact.lastContactedBy ? `contacted by ${contact.lastContactedBy}` : null].filter(Boolean).join(" · ")}
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
              /* Desktop header — Field Notes: avatar, name, stage, since, actions */
              <header className="cd-head">
                <div className="w-14 h-14 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center font-semibold text-xl shrink-0">
                  {contact.initials}
                </div>
                <div className="cd-head-main">
                  <div className="cd-name-row">
                    <h2 className="cd-name">{isEditing ? "Edit details" : contact.name}</h2>
                    {!isEditing && contact.pronouns && (
                      <span className="cd-pronouns">{contact.pronouns}</span>
                    )}
                    {!isEditing && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-surface-variant text-on-surface-variant">
                        {contact.stage || "Unassigned"}
                      </span>
                    )}
                  </div>

                  {!isEditing && (
                    <>
                      <div className="cd-since">
                        {sinceText}
                        {sinceBy && <span className="cd-by">contacted by {sinceBy}</span>}
                      </div>
                      <div className="cd-meta">
                        <span>{[contact.year, contact.major].filter(Boolean).join(" · ") || "—"}</span>
                        {contact.location && (
                          <>
                            <span className="sep">·</span>
                            <span className="row"><MapPin className="w-3.5 h-3.5" /> {contact.location}</span>
                          </>
                        )}
                        <span className="sep">·</span>
                        <span>added {fmtDate(contact.createdAt)}</span>
                      </div>
                    </>
                  )}

                  {!isEditing && (
                    <div className="cd-actions">
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
                      <button
                        onClick={() => setIsEditing(true)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-outline-variant text-xs font-medium text-on-surface hover:bg-surface-variant transition-colors"
                        title="Edit details"
                        aria-label="Edit details"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-surface-container-high rounded-full transition-colors text-on-surface-variant shrink-0"
                  title="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </header>
            )}

            {/* Content Tab Switcher */}
            {!isEditing && (() => {
              const visibleTabList = [
                { id: "overview", label: "Overview" },
                { id: "thread", label: "Follow-up", count: countFor(threadMessages, null) },
                ...((role === "admin" || isAdmin) ? [{ id: "comments", label: "Discussion", count: countFor(threadMessages, null, "team") }] : []),
                { id: "interactions", label: "Interactions", count: interactions.length },
                { id: "prayer", label: "Prayer", count: prayers.length },
                ...(canSeeHistory(role) ? [{ id: "history", label: "History" }] : []),
              ];

              return isMobile ? (
                /* Mobile Dropdown Switcher */
                <div className="cdm-switch sticky top-0 z-10 bg-surface border-t border-b border-outline-variant/35 px-5 py-2.5">
                  <div className="relative">
                    <select
                      value={activeTab}
                      onChange={(e) => setActiveTab(e.target.value as any)}
                      className="w-full h-11 pl-4 pr-10 bg-surface-container-low border border-outline rounded-xl text-sm font-semibold appearance-none cursor-pointer text-on-surface cdm-select"
                    >
                      {visibleTabList.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.label} {"count" in t && t.count != null ? `(${t.count})` : ""}
                        </option>
                      ))}
                    </select>
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-xs text-on-surface-variant/75 cdm-select-caret">
                      ▾
                    </span>
                  </div>
                </div>
              ) : (
                /* Desktop Tab Bar — Field Notes */
                <div className="cd-tabs-bar">
                  {visibleTabList.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setActiveTab(t.id as any)}
                      className={cn("cd-tab", activeTab === t.id && "on")}
                    >
                      {t.label}
                      {"count" in t && t.count != null && (
                        <span className="count">{t.count}</span>
                      )}
                    </button>
                  ))}
                </div>
              );
            })()}

            {/* Content */}
            <div className={isMobile ? "cdm-page-body" : "cd-page-content"}>
              {isEditing ? (
                <form
                  id="edit-contact-form"
                  onSubmit={handleUpdate}
                  className={cn("space-y-6", !isMobile && "px-7 py-6")}
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* First Name */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-on-surface-variant flex items-center gap-2 px-1  ">
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
                        placeholder="First name is plenty"
                      />
                    </div>
                    {/* Last Name */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-on-surface-variant flex items-center gap-2 px-1  ">
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
                      <label className="text-xs font-semibold text-on-surface-variant flex items-center gap-2 px-1   text-accent">
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
                      <label className="text-xs font-semibold text-on-surface-variant flex items-center gap-2 px-1  ">
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
                      <label className="text-xs font-semibold text-on-surface-variant flex items-center gap-2 px-1  ">
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
                      <label className="text-xs font-semibold text-on-surface-variant flex items-center gap-2 px-1  ">
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
                            className="text-[10px] font-semibold text-error px-1  "
                          >
                            {phoneError}
                          </motion.p>
                        )}
                      </AnimatePresence>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-on-surface-variant flex items-center gap-2 px-1   text-accent">
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
                      <label className="text-xs font-semibold text-on-surface-variant flex items-center gap-2 px-1  ">
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
                      <label className="text-xs font-semibold text-on-surface-variant flex items-center gap-2 px-1  ">
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
                      <label className="text-xs font-semibold text-on-surface-variant flex items-center gap-2 px-1  ">
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
                          className="w-full flex items-center justify-center gap-2 px-4 h-11 rounded-xl text-error font-semibold text-sm border border-error/20 hover:bg-error/10 transition-colors disabled:opacity-50"
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
                    >
                      <div className="cd-sec">
                        <div className="cd-sec-head">
                          <h3 className="cd-sec-title">What we know</h3>
                        </div>
                        <div className="cd-prose">
                          {contact.notes || "No notes recorded for this contact yet."}
                        </div>
                      </div>

                      <div className="cd-sec">
                        <div className="cd-sec-head">
                          <h3 className="cd-sec-title">Lately</h3>
                          <span className="cd-sec-sub">Our last few conversations</span>
                        </div>
                        {interactionsLoading ? (
                          <div className="flex gap-3">
                            <Skeleton className="w-8 h-8 rounded-full shrink-0" />
                            <div className="flex-1 space-y-2">
                              <Skeleton className="h-3 w-24 rounded-full" />
                              <Skeleton className="h-12 w-full rounded-xl" />
                            </div>
                          </div>
                        ) : interactions.length === 0 ? (
                          <div className="cd-empty">No conversations logged yet.</div>
                        ) : (
                          <div className="cd-tl">
                            {[...interactions].reverse().slice(0, 3).map((i) => (
                              <div className="cd-tl-item" key={i.id}>
                                <div className="cd-tl-dot"></div>
                                <div className="cd-tl-title">{i.content}</div>
                                <div className="cd-tl-meta">
                                  {i.dateTime ? new Date(i.dateTime).toLocaleDateString() : ""}
                                  <span className="sep">·</span>
                                  <span>{i.userName || "Someone"}</span>
                                  {i.type && (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-surface-variant text-on-surface-variant">
                                      {i.type}
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="cd-sec">
                        <div className="cd-sec-head">
                          <h3 className="cd-sec-title">Prayers we're holding</h3>
                        </div>
                        {prayersLoading ? (
                          <Skeleton className="h-20 w-full rounded-2xl" />
                        ) : openPrayers.length === 0 ? (
                          <div className="cd-empty">Nothing open right now.</div>
                        ) : (
                          <div className="cd-pray">
                            {openPrayers.map((p) => {
                              const burden = p.burden || "";
                              const title = burden.split("\n\n")[0] || burden;
                              const context = burden.includes("\n\n") ? burden.split("\n\n").slice(1).join("\n\n") : null;
                              return (
                                <div key={p.id} className="cd-pray-card">
                                  <div className="cd-pray-top">
                                    <strong className="cd-pray-title">
                                      {title}
                                    </strong>
                                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-stage-violet-soft text-stage-violet">
                                      <span className="w-1.5 h-1.5 rounded-full bg-stage-violet" /> open
                                    </span>
                                  </div>
                                  {context && (
                                    <div className="cd-pray-body">
                                      {context}
                                    </div>
                                  )}
                                  <div className="cd-pray-foot">
                                    {heldDays(p.date) != null &&
                                      `Held ${heldDays(p.date)} ${heldDays(p.date) === 1 ? "day" : "days"}`}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
{activeTab === "interactions" && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="cd-sec"
                    >
                      <div className="cd-sec-head">
                        <h3 className="cd-sec-title">
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
                            className="space-y-3 p-4 rounded-3xl bg-surface-container-high border border-primary/20 overflow-hidden"
                          >
                            <div className="grid grid-cols-2 gap-3 pb-3">
                              <div className="space-y-1">
                                <label className="text-[10px] font-semibold text-on-surface-variant   flex items-center gap-1.5 px-1">
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
                                <label className="text-[10px] font-semibold text-on-surface-variant   flex items-center gap-1.5 px-1">
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
                              <label className="text-[10px] font-semibold text-on-surface-variant   flex items-center gap-1.5 px-1">
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
                                className="px-4 h-9 rounded-full bg-primary text-on-primary font-semibold   hover: active:scale-95 transition-all disabled:opacity-50 flex items-center gap-2 text-xs"
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

                      <div className="space-y-4">
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
                            <p className="text-xs font-semibold text-on-surface-variant/40  ">
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
                                    className="space-y-3 p-3 rounded-3xl bg-surface-container-high border border-primary/20"
                                  >
                                    <div className="grid grid-cols-2 gap-3">
                                      <div className="space-y-1">
                                        <label className="text-[10px] font-semibold text-on-surface-variant   px-1">
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
                                        <label className="text-[10px] font-semibold text-on-surface-variant   px-1">
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
                                      <label className="text-[10px] font-semibold text-on-surface-variant   px-1">
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
                                        className="h-7 px-3 text-[11px] font-semibold text-on-surface-variant hover:text-on-surface transition-colors focus:outline-none"
                                      >
                                        Cancel
                                      </button>
                                      <button
                                        type="submit"
                                        disabled={
                                          isUpdatingInteraction ||
                                          !editInteractionData.content.trim()
                                        }
                                        className="h-7 px-3 bg-primary text-on-primary rounded text-[11px] font-semibold disabled:opacity-50 transition-colors flex items-center gap-1.5 focus:outline-none"
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
                                        <span className="text-xs font-semibold text-on-surface  tracking-tight">
                                          {interaction.userName}
                                        </span>
                                        <span className="text-[10px] font-semibold text-accent bg-primary/10 px-2 py-0.5 rounded-full  ">
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
                                            className="text-[10px] font-semibold text-accent hover:text-accent-variant   focus:outline-none"
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
                                      <span className="text-[10px] font-semibold text-on-surface-variant/40  ">
                                        {interaction.createdAt
                                          ? `Logged ${new Date(interaction.createdAt).toLocaleDateString()} at ${new Date(interaction.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                                          : "Logging..."}
                                      </span>
                                      {(interaction.duration ||
                                        interaction.type) && (
                                        <span className="text-[10px] font-semibold text-on-surface-variant/40   flex items-center gap-1">
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
                                        className="inline-flex items-center gap-1.5 text-[11px] font-semibold   text-on-surface-variant/60 hover:text-accent transition-colors"
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
                    <div className="cd-sec">
                      <div className="cd-sec-head">
                        <h3 className="cd-sec-title">{walkLabel}</h3>
                        <span className="cd-sec-sub">
                          {`Comments on ${firstName} — anyone who can see them can weigh in, and reply to a comment.`}
                        </span>
                      </div>
                      <Thread
                        contactId={contact.id}
                        interactionId={null}
                        meStaffId={user?.uid ?? ""}
                        recipientUid={threadRecipient}
                        contactName={contact.name}
                      />
                    </div>
                  )}

                  {activeTab === "prayer" && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="cd-sec"
                    >
                      <div className="cd-sec-head">
                        <h3 className="cd-sec-title">
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
                            className="space-y-3 p-4 rounded-3xl bg-surface-container-high border border-primary/20 overflow-hidden"
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

                      <div className="space-y-3">
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
                                className="p-4 rounded-3xl bg-surface-container-high border border-outline-variant/40"
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

                  {activeTab === "comments" && (role === "admin" || isAdmin) && (
                    <div className="cd-sec">
                      <div className="cd-sec-head">
                        <h3 className="cd-sec-title">Discussion</h3>
                        <span className="cd-sec-sub">
                          {`Full-timers only — how the team is thinking about caring for ${firstName}.`}
                        </span>
                      </div>
                      <Thread
                        contactId={contact.id}
                        interactionId={null}
                        meStaffId={user?.uid ?? ""}
                        recipientUid={threadRecipient}
                        contactName={contact.name}
                        scope="team"
                      />
                    </div>
                  )}



                  {activeTab === "history" && (
                    <div className="cd-sec">
                      <div className="cd-sec-head">
                        <h3 className="cd-sec-title">Looking back</h3>
                      </div>

                      <div className="space-y-6">
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
                            <p className="text-[10px] font-semibold text-on-surface-variant/40  ">
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
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className={cn("cd-page-foot", isMobile && "hidden")}>
              <div className="hidden sm:block">
                <button
                  onClick={handleDelete}
                  disabled={loading}
                  className="flex items-center gap-2 px-4 h-10 rounded-full text-error font-semibold text-sm hover:bg-error/10 transition-colors disabled:opacity-50"
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
                      className="flex-1 sm:flex-none px-6 h-10 rounded-full font-semibold text-on-surface-variant hover:bg-surface-variant text-sm transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      form="edit-contact-form"
                      type="submit"
                      disabled={loading}
                      className="flex-[2] sm:flex-none px-8 h-10 rounded-full bg-primary text-on-primary font-semibold   hover: active:scale-[0.98] transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-70"
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
                    className="w-full sm:w-auto px-8 h-10 rounded-full bg-secondary-container text-on-secondary-container font-semibold  transition-all text-sm"
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
                className="w-full flex items-center justify-center gap-2 px-4 h-10 rounded-full text-error font-semibold text-sm border border-error/20 hover:bg-error/10 transition-colors disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                {loading ? (
                  <span className="animate-pulse">Deleting...</span>
                ) : (
                  "Delete Contact"
                )}
              </button>
            </div>
          </div>
          {!isMobile && (
            <aside className="cd-page-aside">
              <div className="cd-aside-sec">
                <h3 className="cd-aside-title">How to reach {firstName}</h3>
                <div className="cd-kv">
                  {contact.phone && (
                    <div className="cd-kv-row">
                      <Phone className="w-3.5 h-3.5 cd-kv-ico" />
                      <span className="cd-kv-val">{contact.phone}</span>
                    </div>
                  )}
                  {contact.email && (
                    <div className="cd-kv-row">
                      <Mail className="w-3.5 h-3.5 cd-kv-ico" />
                      <span className="cd-kv-val dim">{contact.email}</span>
                    </div>
                  )}
                  {contact.instagram && (
                    <div className="cd-kv-row">
                      <Instagram className="w-3.5 h-3.5 cd-kv-ico" />
                      <span className="cd-kv-val dim">{contact.instagram}</span>
                    </div>
                  )}
                  {contact.location && (
                    <div className="cd-kv-row">
                      <MapPin className="w-3.5 h-3.5 cd-kv-ico" />
                      <span className="cd-kv-val">{contact.location}</span>
                    </div>
                  )}
                  {contact.role && (
                    <div className="cd-kv-row">
                      <Briefcase className="w-3.5 h-3.5 cd-kv-ico" />
                      <span className="cd-kv-val dim">{contact.role}</span>
                    </div>
                  )}
                  {contact.spiritualBackground && (
                    <div className="cd-kv-row">
                      <Sparkles className="w-3.5 h-3.5 cd-kv-ico" />
                      <span className="cd-kv-val dim">{contact.spiritualBackground}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="cd-aside-sec">
                <h3 className="cd-aside-title">Where they are</h3>
                <div className="cd-journey">
                  {sortedStages.length === 0 && (
                    <span className="text-xs text-on-surface-variant">No steps shaped yet.</span>
                  )}
                  {sortedStages.map((s, i) => {
                    const state = stageIdx === -1 ? "" : i < stageIdx ? "done" : i === stageIdx ? "on" : "";
                    return (
                      <div key={s.id} className={cn("cd-journey-step", state)}>
                        <span className="cd-step-mark">
                          {state === "on" && <Check className="w-2.5 h-2.5 text-white" />}
                          {state === "done" && <span className="pd" />}
                        </span>
                        <span className="cd-step-name">{s.label}</span>
                        {state === "on" && <span className="cd-step-here">here now</span>}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="cd-aside-sec">
                <h3 className="cd-aside-title">Cared for by</h3>
                <div className="cd-owner">
                  <div className="w-10 h-10 rounded-full bg-primary/15 text-accent text-sm font-semibold grid place-items-center shrink-0">
                    {ownerInfo?.initials || "?"}
                  </div>
                  <div>
                    <div className="cd-owner-name">{ownerName}</div>
                    {ownerRole && <div className="cd-owner-role">{ownerRole}</div>}
                  </div>
                </div>
                {(addedByName || sinceBy) && (
                  <div className="cd-whowho">
                    {addedByName && (
                      <div className="cd-lastby">
                        <div className="w-6 h-6 rounded-full bg-primary/10 text-accent text-[10px] font-semibold grid place-items-center shrink-0">
                          {(addedByName.match(/\b\w/g) || []).slice(0, 2).join("").toUpperCase() || "?"}
                        </div>
                        <span>Added by <b>{addedByName}</b>{contact.createdAt ? ` · ${fmtDate(contact.createdAt)}` : ""}</span>
                      </div>
                    )}
                    {sinceBy && (
                      <div className="cd-lastby">
                        <div className="w-6 h-6 rounded-full bg-primary/10 text-accent text-[10px] font-semibold grid place-items-center shrink-0">
                          {(sinceBy.match(/\b\w/g) || []).slice(0, 2).join("").toUpperCase() || "?"}
                        </div>
                        <span>Last contacted by <b>{sinceBy}</b>{contact.lastContactedDate ? ` · ${fmtDate(contact.lastContactedDate)}` : ""}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="cd-aside-sec">
                <h3 className="cd-aside-title">Who else can see them</h3>
                <div className="cd-share">
                  {sharedWith.length === 0 && (
                    <span className="text-xs text-on-surface-variant">
                      Just {ownerName.split(" ")[0] || "you"} for now.
                    </span>
                  )}
                  {sharedWith.map((s) => (
                    <div key={s.id} className="cd-share-row">
                      <div className="w-7 h-7 rounded-full bg-primary/15 text-accent text-xs font-semibold grid place-items-center shrink-0">{s.initials}</div>
                      <span className="cd-share-name">{s.name}</span>
                      <span className="cd-share-role">{s.role}</span>
                      {canShare && (
                        <button className="cd-share-x" onClick={() => removeShare(s.id)} title="Remove access">×</button>
                      )}
                    </div>
                  ))}
                  {canShare && shareOptions.length > 0 && (
                    sharing ? (
                      <div className="flex items-center gap-2">
                        <select
                          className="cd-share-sel flex-1"
                          autoFocus
                          defaultValue=""
                          onChange={(e) => e.target.value && addShare(e.target.value)}
                        >
                          <option value="" disabled>Add someone…</option>
                          {shareOptions.map((s) => (
                            <option key={s.id} value={s.id}>{s.name} · {s.role}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => setSharing(false)}
                          className="px-2.5 py-1 text-xs text-on-surface-variant hover:text-on-surface transition-colors shrink-0"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setSharing(true)}
                        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border border-dashed border-outline-variant text-xs font-medium text-on-surface-variant hover:border-primary hover:text-accent transition-colors self-start"
                      >
                        <Plus className="w-3 h-3" /> add someone
                      </button>
                    )
                  )}
                </div>
              </div>

              <div className="cd-aside-sec">
                <h3 className="cd-aside-title">Tags</h3>
                <div className="cd-tags">
                  {formData.tags.length === 0 && !addingTag && (
                    <span className="text-xs text-on-surface-variant">None yet</span>
                  )}
                  {formData.tags.map((tag) => (
                    <span key={tag} className="cd-tag-item inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-surface-container-highest text-on-surface-variant text-xs font-medium border border-outline-variant/40">
                      {tag}
                      <button onClick={() => removeTag(tag)} className="cd-tag-x" title="Remove tag">×</button>
                    </span>
                  ))}
                  {addingTag ? (
                    <span className="cd-tag-input-wrap">
                      <input
                        className="cd-tag-input"
                        autoFocus
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        placeholder="new tag…"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitTag();
                          if (e.key === "Escape") { setTagInput(""); setAddingTag(false); }
                        }}
                        onBlur={commitTag}
                      />
                    </span>
                  ) : (
                    <button
                      onClick={() => setAddingTag(true)}
                      className="cd-tag-add inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border border-dashed border-outline-variant text-xs font-medium text-on-surface-variant hover:border-primary hover:text-accent transition-colors"
                    >
                      <Plus className="w-3 h-3" /> add
                    </button>
                  )}
                </div>
              </div>
            </aside>
          )}
        </div>
      )}
    </AnimatePresence>
  );
}
