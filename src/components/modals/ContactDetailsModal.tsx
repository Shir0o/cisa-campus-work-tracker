import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  X,
  Plus,
  Clock,
  MessageSquare,
  Heart,
  Lock,
  Trash2,
} from "lucide-react";
import {
  db,
  handleFirestoreError,
  OperationType,
  logActivity,
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
import { Contact, Stage, Interaction, Activity, PrayerRecord } from "../../types";
import { useAuth } from "../AuthProvider";
import { canSeeContact, canSeeHistory, hasMinRole, canManageCollaborators, canRemoveContactMember, visibleToOf } from "../../lib/permissions";
import { partnersOf } from "../../lib/partners";
import { useMediaQuery } from '../../lib/useMediaQuery';
import { carerNamesOf, carersAfterCollaboratorRemoval } from '../../lib/carers';
import { Skeleton } from "../ui/Skeleton";
import { conversationAdapter } from "../stream/conversationAdapter";
import { fullTimersAdapter } from "../stream/fullTimersAdapter";
import { interactionAdapter } from "../stream/interactionAdapter";
import { contactStakeholdersOf } from "../../lib/threads";
import { useThreads, countFor, type ThreadMessage } from "../../lib/threads";
import { walkingRecipient } from "../../lib/walking";
import { unhidePrayerContact } from "../../lib/prayers";
import { useLanguage } from "../LanguageProvider";
import { buildContactActivityPatch } from "../../lib/contactActivity";
import { normalizeTagList } from "../../lib/tags";
import { Frecency, QUICK_CLOSE_THRESHOLD_MS } from "../../lib/frecency";
import { parseMs } from "../landing/helpers";
import { useUndoSnack } from "../../hooks/useUndoSnack";
import { StageMoveSheet } from "../ui/StagePicker";
import { UndoSnackbar } from "../UndoSnackbar";
import {
  scheduleInteractionRemoval,
  cancelInteractionRemoval,
  subscribeInteractionRemovals,
  getPendingRemovalIds,
} from "../../lib/interactionRemoval";
import { contactKind, kindLabelKey } from "../../lib/contactKind";
import { buildContactStory } from "../../lib/contactStory";

import ContactHead, { type ContactTab } from "../contact/ContactHead";
import ContactEditForm from "../contact/ContactEditForm";
import ContactDrawerHost from "../contact/ContactDrawerHost";
import ContactStory from "../contact/ContactStory";
import ContactJourney from "../contact/ContactJourney";
import ContactThreadLinks from "../contact/ContactThreadLinks";
import ContactStreamTab from "../contact/ContactStreamTab";
import ContactInteractionForm from "../contact/ContactInteractionForm";
import ContactPrayerForm from "../contact/ContactPrayerForm";
import ContactPrayerCard from "../contact/ContactPrayerCard";
import ContactInteractionItem from "../contact/ContactInteractionItem";
import ContactAuditItem from "../contact/ContactAuditItem";
import WhatWeKnow from "../contact/overview/WhatWeKnow";
import PrayersHeld from "../contact/overview/PrayersHeld";
import HowToReach from "../contact/overview/HowToReach";
import CaredForBy from "../contact/overview/CaredForBy";
import WhoCanSee from "../contact/overview/WhoCanSee";
import TagsSection from "../contact/overview/TagsSection";
import DeleteContact from "../contact/overview/DeleteContact";

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

export default function ContactDetailsModal({
  isOpen,
  onClose,
  contact,
  initialTab,
  initialInteractionId,
}: ContactDetailsModalProps) {
  const { user, isAdmin, role, effectiveUserId, isImpersonating } = useAuth();
  const { t, language } = useLanguage();
  const isMobile = useMediaQuery("(max-width: 768px)");
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [interactionsLoading, setInteractionsLoading] = useState(true);
  const [stages, setStages] = useState<Stage[]>([]);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState(true);
  const [prayers, setPrayers] = useState<PrayerRecord[]>([]);
  const [prayersLoading, setPrayersLoading] = useState(true);
  const [teamMembers, setTeamMembers] = useState<
    { id: string; name: string; role: string; initials: string; fullTimer: boolean }[]
  >([]);

  // True while the mobile "Where is {name} now?" stage sheet is open (#677).
  const [movingStage, setMovingStage] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [reassigningCreator, setReassigningCreator] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "overview" | "interactions" | "thread" | "prayer" | "discussion" | "history"
  >("overview");
  // Desktop has no tabs: the two conversation streams, and an Interaction's
  // Thread (openThread names the Interaction), open in a side drawer.
  const [drawer, setDrawer] = useState<null | "thread" | "discussion" | "interaction">(null);

  const [liveContact, setLiveContact] = useState<Contact | null>(contact);

  useEffect(() => {
    setLiveContact(contact);
  }, [contact]);

  useEffect(() => {
    if (!isOpen || !contact?.id) return;
    const unsub = onSnapshot(doc(db, "contacts", contact.id), (snap: any) => {
      if (snap && typeof snap.data === "function" && (snap.exists === undefined || snap.exists())) {
        setLiveContact({ id: snap.id, ...snap.data() } as Contact);
      }
    });
    return () => unsub();
  }, [isOpen, contact?.id]);

  useEffect(() => {
    if (!isOpen) return;
    const unsub = onSnapshot(collection(db, "users"), (snap) => {
      setTeamMembers(
        snap.docs.map((d) => {
          const data = d.data();
          const name = data.name || data.displayName || data.email || t('modals.contactDetails.staff_role');
          const parts = name.trim().split(/\s+/);
          const initials = parts.length >= 2 ? `${parts[0][0]}${parts[1][0]}`.toUpperCase() : name.slice(0, 2).toUpperCase();
          return {
            id: d.id,
            name,
            role: data.role === "admin" ? t('modals.contactDetails.full_timer') : data.role === "manager" ? t('modals.contactDetails.trainee') : t('modals.contactDetails.staff_role'),
            initials,
            fullTimer: data.role === "admin",
          };
        })
      );
    });
    return () => unsub();
  }, [isOpen]);
  // Walking-together threads on this contact (live), + which Interaction's
  // Thread the drawer is open on.
  const threadMessages = useThreads(contact?.id, { includeTeam: isAdmin });
  const [openThread, setOpenThread] = useState<string | null>(null);
  // The Conversation message a to-do is being made from (the stream's toolbar).
  const [todoFrom, setTodoFrom] = useState<ThreadMessage | null>(null);
  const { undoSnack, showUndoSnack, closeUndoSnack } = useUndoSnack();
  const [pendingRemovalIds, setPendingRemovalIds] = useState<string[]>(() => getPendingRemovalIds());
  useEffect(() => subscribeInteractionRemovals(() => setPendingRemovalIds(getPendingRemovalIds())), []);
  const [isAddingPrayer, setIsAddingPrayer] = useState(false);
  const [newPrayer, setNewPrayer] = useState({ burden: "", context: "" });
  const [submittingPrayer, setSubmittingPrayer] = useState(false);
  const [addingTag, setAddingTag] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [editTagInput, setEditTagInput] = useState("");
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
    email: "",
    phone: "",
    stage: "",
    gender: "",
    tags: [] as string[],
    notes: "",
    spiritualBackground: "",
    inChurchLife: false,
    isStudent: false,
  });

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

  const openedAtRef = React.useRef<number>(Date.now());
  const hasActionRef = React.useRef<boolean>(false);

  useEffect(() => {
    if (isOpen && contact?.id) {
      openedAtRef.current = Date.now();
      hasActionRef.current = false;
      if (user?.uid) {
        Frecency.recordOpen(user.uid, contact.id);
      }
    }
  }, [isOpen, contact?.id, user?.uid]);

  const handleClose = () => {
    if (
      !hasActionRef.current &&
      Date.now() - openedAtRef.current < QUICK_CLOSE_THRESHOLD_MS &&
      user?.uid &&
      contact?.id
    ) {
      Frecency.recordClose(user.uid, contact.id);
    }
    onClose();
  };

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // An open thread drawer closes first; the page closes on the next Esc.
      if (drawer) setDrawer(null);
      else handleClose();
    };
    if (isOpen) {
      window.addEventListener("keydown", handleEsc);
    }
    return () => window.removeEventListener("keydown", handleEsc);
  }, [isOpen, handleClose, drawer]);

  useEffect(() => {
    if (contact) {
      const { first, last } = splitName(contact.name || "");
      setFormData({
        firstName: first,
        lastName: last,
        role: contact.role || "",
        email: contact.email || "",
        phone: contact.phone || "",
        stage: contact.stage || "",
        gender: contact.gender || "",
        tags: contact.tags || [],
        notes: contact.notes || "",
        spiritualBackground: contact.spiritualBackground || "",
        inChurchLife: !!contact.inChurchLife,
        isStudent: !!contact.isStudent,
      });
      setEditTagInput("");
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
    setEditTagInput("");
    setOpenThread(initialInteractionId ?? null);
    // A thread deep-link opens its drawer: the contact-level Conversation, or
    // the Interaction's own Thread.
    setDrawer(initialInteractionId ? "interaction" : initialTab === "thread" ? "thread" : null);
  }, [contact?.id, isOpen, initialTab, initialInteractionId]);

  // An interaction deep-link on desktop scrolls the story to that
  // conversation, whose Thread is open in the drawer (openThread above).
  useEffect(() => {
    if (!isOpen || isMobile || !initialInteractionId || interactionsLoading) return;
    document.getElementById(`story-${initialInteractionId}`)?.scrollIntoView?.({ block: "center" });
  }, [isOpen, isMobile, initialInteractionId, interactionsLoading]);

  if (!contact) return null;

  const currentUid = effectiveUserId || user?.uid;
  const hasAccess = canSeeContact(role, currentUid, contact);

  const walkLabel = t('modals.contactDetails.follow_up');
  const threadRecipient = walkingRecipient(currentUid, contact.createdBy || contact.addedBy);

  // Every written surface on this page runs on the shared stream (ADR 0033),
  // each through its own adapter over the one subscription above.
  const streamViewer = { uid: currentUid ?? "", role };
  const adapterBase = {
    contactId: contact.id,
    contactName: contact.name,
    messages: threadMessages,
    me: { uid: currentUid ?? "", name: user?.displayName || "Someone", role },
    recipientUid: threadRecipient,
    stakeholders: contactStakeholdersOf(contact),
    teamMembers,
    t,
  };
  const conversation = conversationAdapter(adapterBase);
  const fullTimers = fullTimersAdapter(adapterBase);
  const interactionAdapterFor = (interaction: Interaction) =>
    interactionAdapter({ ...adapterBase, interaction, locale: language === "es" ? "es" : "en-US" });
  const openInteraction = interactions.find((i) => i.id === openThread) ?? null;
  const interactionThread = openInteraction ? interactionAdapterFor(openInteraction) : null;

  const founders = contact.founders || [];
  const coCreators = contact.coCreators || [];
  const sharedWith = teamMembers.filter((m) => founders.includes(m.id) || coCreators.includes(m.id));
  const canShare = !isImpersonating && canManageCollaborators(role, currentUid, contact);
  const shareOptions = teamMembers.filter(
    (m) => !founders.includes(m.id) && !coCreators.includes(m.id)
  );
  const canRemoveInteraction = (interaction: Interaction) =>
    !interaction.id.startsWith("visit_") &&
    (currentUid === interaction.userId || hasMinRole(role, "manager"));

  const handleRemoveInteraction = (interaction: Interaction) => {
    if (!contact) return;
    const threadCount = countFor(threadMessages, interaction.id);
    if (threadCount > 0) {
      const ok = window.confirm(
        t('modals.contactDetails.remove_interaction_confirm').replace('{count}', String(threadCount)),
      );
      if (!ok) return;
    }
    // Arm the snackbar's auto-dismiss BEFORE the commit timer (armed inside
    // scheduleInteractionRemoval), so the Undo offer is always gone by the
    // moment the delete fires — a late tap can never silently no-op.
    showUndoSnack(t('modals.contactDetails.interaction_removed'), () =>
      cancelInteractionRemoval(interaction.id),
    );
    scheduleInteractionRemoval(interaction.id, () => {
      deleteDoc(doc(db, "contacts", contact.id, "interactions", interaction.id))
        .then(() =>
          logActivity({
            action: "deleted an interaction for",
            targetId: contact.id,
            targetName: contact.name,
            targetType: "contact",
            type: "edit",
            description: interaction.content.trim(),
          }),
        )
        .catch((e) =>
          handleFirestoreError(e, OperationType.DELETE, `contacts/${contact.id}/interactions/${interaction.id}`),
        );
    });
  };

  const addShare = async (staffId: string) => {
    if (!contact) return;
    const s = teamMembers.find((m) => m.id === staffId);
    await updateDoc(doc(db, "contacts", contact.id), {
      coCreators: arrayUnion(staffId),
      // Keep the server-side access list in lockstep with the tie it mirrors.
      visibleTo: visibleToOf({ ...contact, coCreators: [...(contact.coCreators || []), staffId] }),
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
    const isFounder = (contact.founders || []).includes(staffId);
    const nextCoCreators = (contact.coCreators || []).filter((x) => x !== staffId);
    const nextFounders = isFounder
      ? (contact.founders || []).filter((x) => x !== staffId)
      : contact.founders || [];
    // Undoing a share also drops the carer tie that reached them, so a removed
    // collaborator cannot hold the person through their sheep (#1052). Removing
    // a founder (a Full-timer's genuine-mistake correction) takes them out of
    // the founding set too, and with it the carer tie that only that reach held.
    const nextCarers = carersAfterCollaboratorRemoval(
      { ...contact, coCreators: nextCoCreators, founders: nextFounders },
      staffId,
    );
    const patch: Record<string, unknown> = {
      coCreators: arrayRemove(staffId),
      visibleTo: visibleToOf({ ...contact, coCreators: nextCoCreators, founders: nextFounders, carers: nextCarers }),
    };
    if (isFounder) patch.founders = arrayRemove(staffId);
    if ((contact.carers || []).includes(staffId) && !nextCarers.includes(staffId)) {
      patch.carers = arrayRemove(staffId);
    }
    await updateDoc(doc(db, "contacts", contact.id), patch);
    contact.coCreators = nextCoCreators;
    if (isFounder) contact.founders = nextFounders;
    contact.carers = nextCarers;
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

  const handleReassignCreator = async (newStaffId: string) => {
    if (!contact) return;
    const targetMember = teamMembers.find((m) => m.id === newStaffId);
    if (!targetMember) return;

    const newCreatorName = targetMember.name;
    const partnerUids = partnersOf(newStaffId);

    // Compute updated coCreators: include new partners, exclude the new creator itself,
    // and keep previous coCreators
    const currentCoCreators = currentContact.coCreators || [];
    const coCreatorsSet = new Set(currentCoCreators);
    for (const p of partnerUids) {
      if (p !== newStaffId) {
        coCreatorsSet.add(p);
      }
    }
    coCreatorsSet.delete(newStaffId);
    const nextCoCreators = Array.from(coCreatorsSet);

    // Compute updated visibleTo
    const nextContactState = {
      ...currentContact,
      createdBy: newStaffId,
      createdByName: newCreatorName,
      coCreators: nextCoCreators,
    };
    const nextVisibleTo = visibleToOf(nextContactState);

    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {
      createdBy: newStaffId,
      createdByName: newCreatorName,
      coCreators: nextCoCreators,
      visibleTo: nextVisibleTo,
      updatedAt: now,
      updatedBy: currentUid || "system",
      updatedByName: user?.displayName || user?.email || "Admin",
    };

    await updateDoc(doc(db, "contacts", contact.id), patch);

    // Update in-memory contact object for immediate reflection
    contact.createdBy = newStaffId;
    contact.createdByName = newCreatorName;
    contact.coCreators = nextCoCreators;
    contact.visibleTo = nextVisibleTo;

    await logActivity({
      action: "reassigned creator for",
      targetId: contact.id,
      targetName: `${newCreatorName} is now the creator of ${contact.name.split(" ")[0]}.`,
      targetType: "contact",
      type: "edit",
      description: `Reassigned creator from ${addedByName || "unknown"} to ${newCreatorName}`,
    });

    setReassigningCreator(false);
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
        setPhoneError(t('modals.contactDetails.phone_too_short'));
      } else if (digits.length > 10) {
        setPhoneError(t('modals.contactDetails.phone_too_long'));
      } else {
        setPhoneError(null);
      }
    } else {
      setPhoneError(null);
    }
  };

  /**
   * Move the contact to `nextStage` ("" clears it) straight from their page
   * (#677). Writes the same `stage` field and the same history line the edit
   * form does, then offers the move back through the shared undo snackbar.
   *
   * Undo passes the stage it is reversing as `from` rather than letting this
   * re-read the contact: the live snapshot may not have caught up yet, and a
   * stale read would make the undo look like a no-op. `silent` keeps it from
   * offering to undo the undo.
   */
  const moveStage = async (
    nextStage: string,
    opts?: { from?: string; silent?: boolean },
  ) => {
    const previous = opts?.from ?? (currentContact.stage || "");
    if (nextStage === previous) return;
    hasActionRef.current = true;
    try {
      await updateDoc(doc(db, "contacts", contact.id), {
        stage: nextStage,
        updatedAt: new Date().toISOString(),
        updatedBy: user?.uid,
        updatedByName:
          user?.displayName || user?.email?.split("@")[0] || t('modals.contactDetails.unknown_user'),
      });

      const change = `stage: "${previous}" → "${nextStage}"`;
      logActivity({
        action: `updated ${change} for`,
        targetId: contact.id,
        targetName: currentContact.name,
        targetType: "contact",
        type: "edit",
        userName:
          user?.displayName || user?.email?.split("@")[0] || t('modals.contactDetails.unknown_user'),
        description: change,
      } as any);

      if (!opts?.silent) {
        const message = nextStage
          ? t('modals.contactDetails.moved_to').replace('{stage}', nextStage)
          : t('modals.contactDetails.moved_out_of_steps');
        showUndoSnack(message, () => moveStage(previous, { from: nextStage, silent: true }));
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `contacts/${contact.id}`);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (phoneError) return;
    hasActionRef.current = true;
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
      if (formData.role !== contact.role)
        changes.push(`group: "${contact.role}" → "${formData.role}"`);
      if (formData.stage !== contact.stage)
        changes.push(`stage: "${contact.stage}" → "${formData.stage}"`);
      if (formData.spiritualBackground !== contact.spiritualBackground)
        changes.push(`spiritualBackground: "${contact.spiritualBackground || ''}" → "${formData.spiritualBackground}"`);
      if (formData.gender !== contact.gender)
        changes.push(`gender: "${contact.gender || ''}" → "${formData.gender || ''}"`);
      if (formData.notes !== contact.notes) changes.push(`notes updated`);

      const typedTags = editTagInput.split(",").map((t) => t.trim()).filter(Boolean);
      const combinedFormTags = normalizeTagList([...formData.tags, ...typedTags]);

      // Keep an "M"/"F" tag in sync with the gender field so the prayer page's
      // brother/sister filter stays consistent even when gender is corrected.
      const genderTagValue = formData.gender === "M" || formData.gender === "F" ? formData.gender : "";
      const tags = genderTagValue
        ? Array.from(new Set([...combinedFormTags.filter((t) => t !== "M" && t !== "F"), genderTagValue]))
        : combinedFormTags.filter((t) => t !== "M" && t !== "F");

      const updateData: any = {
        name: fullName,
        initials: getInitials(formData.firstName, formData.lastName),
        role: formData.role,
        email: formData.email,
        phone: formData.phone,
        stage: formData.stage,
        gender: formData.gender,
        tags,
        notes: formData.notes,
        spiritualBackground: formData.spiritualBackground,
        updatedAt: new Date().toISOString(),
        updatedBy: user?.uid,
        updatedByName:
          user?.displayName || user?.email?.split("@")[0] || t('modals.contactDetails.unknown_user'),
      };
      await updateDoc(contactRef, updateData);

      // The kind of person (#1152) is a Full-timer-only write on its own rules
      // branch, so it never travels with the profile edit above. The stamp
      // moves with it: a kind is only ever set by someone deciding.
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
            user?.displayName || user?.email?.split("@")[0] || t('modals.contactDetails.unknown_user'),
        });

        // Recognising someone as being in the church life is never silent —
        // it lands in History the way a stage move does (#1152).
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
            user?.displayName || user?.email?.split("@")[0] || t('modals.contactDetails.unknown_user'),
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
          user?.displayName || user?.email?.split("@")[0] || t('modals.contactDetails.unknown_user'),
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
    if (!confirm(t('modals.contactDetails.confirm_delete'))) return;
    hasActionRef.current = true;
    setLoading(true);
    try {
      const contactId = contact.id;
      const contactName = contact.name;

      // Fetch subcollections to capture their count before deleting
      const interactionsSnap = await getDocs(
        collection(db, "contacts", contactId, "interactions"),
      );

      const fieldsLog = [
        `Group: ${contact.role}`,
        `Stage: ${contact.stage}`,
        `Email: ${contact.email || "N/A"}`,
        `Phone: ${contact.phone || "N/A"}`,
        `Total Interactions: ${interactionsSnap.size}`,
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

    hasActionRef.current = true;
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
        userName: user.displayName || user.email?.split("@")[0] || t('modals.contactDetails.anonymous'),
        userPhoto: user.photoURL || "",
        content: newInteraction.content.trim(),
        dateTime: newInteraction.dateTime,
        type: newInteraction.type,
        createdAt: serverTimestamp(),
      });

      const userName = user.displayName || user.email?.split("@")[0] || t('modals.contactDetails.anonymous');
      const activityPatch = buildContactActivityPatch({
        date: newInteraction.dateTime,
        by: { uid: user.uid, name: userName },
        type: 'interaction',
      });
      await updateDoc(doc(db, "contacts", contact.id), activityPatch as Record<string, unknown>);

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

    hasActionRef.current = true;
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

  const handleAddPrayer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPrayer.burden.trim() || !contact) return;

    hasActionRef.current = true;
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
        // A burden typed on a contact's tab is that contact's, not the team's.
        // `isTeamPrayer` treats an absent flag as team, so this must be
        // explicit or the prayer surfaces on "On our hearts" (#1042).
        teamPrayer: false,
        updatedAt: now,
        updatedBy: user?.uid || "",
        updatedByName:
          user?.displayName || user?.email?.split("@")[0] || t('modals.contactDetails.unknown_user'),
      });

      // Auto-unhide contact from "On our hearts" page (#565)
      unhidePrayerContact(contact.id);

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

  const handleUpdatePrayerStatus = async (prayer: PrayerRecord, status: PrayerRecord["status"]) => {
    if (!contact) return;
    try {
      const now = new Date().toISOString();
      const patch: Record<string, any> = {
        status,
        updatedAt: now,
        updatedBy: user?.uid || "",
        updatedByName:
          user?.displayName || user?.email?.split("@")[0] || t('modals.contactDetails.unknown_user'),
      };
      if (status === "answered") {
        patch.answeredAt =
          prayer.answeredAt ||
          new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
      }
      await updateDoc(doc(db, "prayers", prayer.id), patch);
      logActivity({
        action: `marked a prayer burden as ${status} for`,
        targetId: contact.id,
        targetName: contact.name,
        targetType: "contact",
        type: "edit",
        description: `Status changed to ${status}`,
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, "prayers");
    }
  };

  // ── Inline tag add / remove (persist to the contact's tags array) ──
  const persistTags = async (updatedTags: string[], verb: string, tag: string) => {
    hasActionRef.current = true;
    const prevTags = formData.tags;
    setFormData((f) => ({ ...f, tags: updatedTags }));
    try {
      await updateDoc(doc(db, "contacts", contact.id), {
        tags: updatedTags,
        updatedAt: new Date().toISOString(),
        updatedBy: user?.uid,
        updatedByName:
          user?.displayName || user?.email?.split("@")[0] || t('modals.contactDetails.unknown_user'),
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
  const fmtDate = (v?: string | null): string | null => {
    if (!v) return null;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d.toLocaleDateString();
  };
  const currentContact = liveContact || contact;

  // Interactions are sorted by the date they happened (dateTime), not by when
  // they were entered into the app (createdAt). This keeps backdated log
  // entries in the right place (#399).
  const sortedInteractions = useMemo(() => {
    return [...interactions].sort((a, b) => {
      const aMs = parseMs(a.dateTime || a.createdAt) ?? 0;
      const bMs = parseMs(b.dateTime || b.createdAt) ?? 0;
      return bMs - aMs;
    });
  }, [interactions]);
  // Pending removals leave the list the moment Remove is tapped, even though
  // the Firestore delete only commits after the Undo window.
  const visibleInteractions = useMemo(
    () => sortedInteractions.filter((i) => !pendingRemovalIds.includes(i.id)),
    [sortedInteractions, pendingRemovalIds],
  );

  const latestInteraction = useMemo(() => {
    if (visibleInteractions.length === 0) return null;
    let newest = visibleInteractions[0];
    let newestMs = parseMs(newest.dateTime || newest.createdAt) ?? -Infinity;
    for (let i = 1; i < visibleInteractions.length; i++) {
      const ms = parseMs(visibleInteractions[i].dateTime || visibleInteractions[i].createdAt) ?? -Infinity;
      if (ms > newestMs) {
        newest = visibleInteractions[i];
        newestMs = ms;
      }
    }
    return newest;
  }, [visibleInteractions]);

  const effectiveLastContactedDate =
    latestInteraction?.dateTime ||
    latestInteraction?.createdAt ||
    currentContact?.lastContactedDate ||
    currentContact?.lastSeen;

  const lastConnectedDate = fmtDate(effectiveLastContactedDate);
  const sinceText = lastConnectedDate
    ? t('modals.contactDetails.last_connected').replace('{date}', lastConnectedDate)
    : t('modals.contactDetails.not_connected_yet');
  const sinceBy = latestInteraction?.userName || currentContact?.lastContactedBy || null;
  // "Cared for by" derives from the carers tie (#1051) — everyone holding this
  // person in their sheep — and names zero, one or several people.
  const carerNames = carerNamesOf(
    currentContact?.carers,
    Object.fromEntries(teamMembers.map((m) => [m.id, m.name])),
  );
  const carerMembers = teamMembers.filter((m) => (currentContact?.carers || []).includes(m.id));
  const addedByName =
    currentContact.createdByName ||
    ((currentContact.createdBy || currentContact.addedBy)
      ? teamMembers.find((m) => m.id === (currentContact.createdBy || currentContact.addedBy))?.name
      : null);
  const sortedStages = [...stages].sort((a, b) => a.order - b.order);
  const stageIdx = currentContact.stage
    ? sortedStages.findIndex((s) => s.label === currentContact.stage)
    : -1;
  // Moving a stage is an edit, so it sits behind the same gate as the Edit
  // action: operator and up. Viewers keep the read-only pill and step list.
  const canMoveStage = (isAdmin || hasMinRole(role, "operator")) && sortedStages.length > 0;
  const currentStageIndex = stageIdx === -1 ? 0 : stageIdx;
  const currentStageInfo = stageIdx === -1 ? undefined : sortedStages[stageIdx];
  const canUpdatePrayers = isAdmin || hasMinRole(role, "operator");
  const openPrayers = prayers.filter(
    (p) => p.status !== "answered" && p.status !== "unanswered",
  );

  if (isOpen && !hasAccess) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
        <div className="w-full max-w-md bg-surface-container rounded-[28px] p-6 border border-outline-variant shadow-2xl text-on-surface">
          <h2 className="font-serif text-xl font-semibold mb-2">{t('modals.contactDetails.access_restricted')}</h2>
          <p className="text-sm text-on-surface-variant mb-6">
            {t('modals.contactDetails.no_permission')}
          </p>
          <div className="flex justify-end">
            <button
              onClick={handleClose}
              className="px-5 py-2.5 rounded-full bg-primary text-on-primary text-xs font-semibold hover:opacity-90 transition-opacity"
            >
              {t('modals.contactDetails.close')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Shared by the phone tabs and the desktop story (#design-D): the log form,
  // one conversation, the add-prayer form and one prayer card.
  const logInteractionForm = (
    <ContactInteractionForm
      open={isLoggingInteraction}
      value={newInteraction}
      onChange={setNewInteraction}
      submitting={submittingInteraction}
      onSubmit={handleAddInteraction}
    />
  );

  const addPrayerForm = (
    <ContactPrayerForm
      open={isAddingPrayer}
      value={newPrayer}
      onChange={setNewPrayer}
      submitting={submittingPrayer}
      onSubmit={handleAddPrayer}
      firstName={firstName}
    />
  );

  const renderInteractionItem = (interaction: Interaction) => (
    <ContactInteractionItem
      interaction={interaction}
      canEdit={user?.uid === interaction.userId || isAdmin}
      canRemove={canRemoveInteraction(interaction)}
      editing={editingInteractionId === interaction.id}
      editData={editInteractionData}
      onEditDataChange={setEditInteractionData}
      onStartEdit={() => {
        setEditingInteractionId(interaction.id);
        setEditInteractionData({
          content: interaction.content,
          dateTime: interaction.dateTime,
          type: interaction.type || "interaction",
        });
      }}
      onCancelEdit={() => setEditingInteractionId(null)}
      onUpdate={handleUpdateInteraction}
      updating={isUpdatingInteraction}
      onRemove={() => handleRemoveInteraction(interaction)}
      adapterFor={interactionAdapterFor}
      viewer={streamViewer}
      threadOpen={drawer === "interaction" && openThread === interaction.id}
      onOpenThread={() => {
        setOpenThread(interaction.id);
        setDrawer("interaction");
      }}
    />
  );

  const renderPrayerCard = (p: PrayerRecord) => (
    <ContactPrayerCard
      prayer={p}
      canUpdatePrayers={canUpdatePrayers}
      onUpdateStatus={handleUpdatePrayerStatus}
    />
  );

  // "Where they are": in Overview on phones, the band across the top of the
  // desktop story page.
  const journeySection = (
    <ContactJourney
      stages={sortedStages}
      stageIdx={stageIdx}
      canMoveStage={canMoveStage}
      onMoveStage={moveStage}
    />
  );

  // ── Desktop story page (design D) ──
  // No tabs: "Where they are" runs across the top, the story fills the main
  // column, and the profile groups sit beside it. The two threads open in a
  // drawer; the full audit log lives on the History page.
  const story = buildContactStory({
    contact,
    interactions,
    prayers,
    activities,
    pendingRemovalIds,
  });
  const canSeeTeamThread = role === "admin" || isAdmin;

  const storySection = (
    <ContactStory
      story={story}
      fmtDate={fmtDate}
      isLoggingInteraction={isLoggingInteraction}
      isAddingPrayer={isAddingPrayer}
      onCancelCompose={() => {
        setIsLoggingInteraction(false);
        setIsAddingPrayer(false);
      }}
      onStartLog={() => setIsLoggingInteraction(true)}
      onStartPrayer={() => setIsAddingPrayer(true)}
      interactionsLoading={interactionsLoading}
      logInteractionForm={logInteractionForm}
      addPrayerForm={addPrayerForm}
      renderInteraction={renderInteractionItem}
      renderPrayerCard={renderPrayerCard}
    />
  );

  const threadLinks = (
    <ContactThreadLinks
      firstName={firstName}
      walkLabel={walkLabel}
      walkCount={countFor(threadMessages, null)}
      teamCount={countFor(threadMessages, null, "team")}
      canSeeTeamThread={canSeeTeamThread}
      onOpenThread={() => setDrawer("thread")}
      onOpenDiscussion={() => setDrawer("discussion")}
    />
  );

  const wrapDesktopStory = (content: React.ReactNode) =>
    isMobile ? (
      content
    ) : (
      <>
        <div className="cd-journey-band">{journeySection}</div>
        <div className="cd-story-layout">
          {storySection}
          <div className="cd-story-aside">
            {threadLinks}
            {content}
          </div>
        </div>
      </>
    );

  // An Interaction's Thread also opens on a phone, over the page: its entry is
  // on the phone's Interactions tab too.
  const drawerOpen =
    (drawer === "interaction" && !!interactionThread) ||
    (!isMobile && (drawer === "thread" || (drawer === "discussion" && canSeeTeamThread)));
  const drawerLabel = drawer === "discussion" ? t('modals.contactDetails.discussion') : walkLabel;

  const visibleTabList: ContactTab[] = [
    { id: "overview", label: t('modals.contactDetails.overview') },
    { id: "thread", label: t('modals.contactDetails.follow_up'), count: countFor(threadMessages, null) },
    ...((role === "admin" || isAdmin) ? [{ id: "discussion", label: t('modals.contactDetails.discussion'), count: countFor(threadMessages, null, "team") }] : []),
    { id: "interactions", label: t('modals.contactDetails.interactions'), count: visibleInteractions.length },
    { id: "prayer", label: t('modals.contactDetails.prayer'), count: prayers.length },
    ...(canSeeHistory(role) ? [{ id: "history", label: t('modals.contactDetails.history') }] : []),
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <div className={isMobile ? "cdm-page" : "cd-page"}>
          <div className={isMobile ? "cdm-page-main" : "cd-page-main"}>
            <ContactHead
              isMobile={isMobile}
              isEditing={isEditing}
              contact={contact}
              currentContact={currentContact}
              stages={sortedStages}
              canMoveStage={canMoveStage}
              currentStageIndex={currentStageIndex}
              currentStageInfo={currentStageInfo}
              sinceText={sinceText}
              carerNames={carerNames}
              role={role}
              activeTab={activeTab}
              tabs={visibleTabList}
              onClose={handleClose}
              onEdit={() => setIsEditing(true)}
              onCancelEdit={() => setIsEditing(false)}
              onCall={callContact}
              onText={textContact}
              onEmail={emailContact}
              onLogInteraction={startLogInteraction}
              onStartPrayer={startAddPrayer}
              onMoveStage={moveStage}
              onOpenMoveSheet={() => setMovingStage(true)}
              onChangeTab={(tab) => setActiveTab(tab as any)}
            />

            {/* Content */}
            <div className={isMobile ? "cdm-page-body" : "cd-page-content"}>
              {isEditing ? (
                <ContactEditForm
                  formData={formData}
                  onChange={setFormData}
                  stages={stages}
                  isAdmin={isAdmin}
                  phoneError={phoneError}
                  onPhoneBlur={handlePhoneBlur}
                  onClearPhoneError={() => setPhoneError(null)}
                  editTagInput={editTagInput}
                  onEditTagInputChange={setEditTagInput}
                  onSubmit={handleUpdate}
                  isMobile={isMobile}
                  onDelete={handleDelete}
                  loading={loading}
                />
              ) : (
                wrapDesktopStory(<>
                {(!isMobile || activeTab === "overview") && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                    >
                      <WhatWeKnow notes={contact.notes} />

                      <PrayersHeld loading={prayersLoading} prayers={openPrayers} />

                      {/* The five groups that used to be the 320px aside. They pair up
                          once the column can hold two — a container query, because the
                          rail's 232/76px collapse changes the available width without
                          the viewport moving (#780). */}
                      <div className="cd-overview-grid">
                        <HowToReach contact={contact} firstName={firstName} />

                        {isMobile && journeySection}

                        <CaredForBy
                          carerMembers={carerMembers}
                          addedByName={addedByName}
                          sinceBy={sinceBy}
                          fmtDate={fmtDate}
                          isAdmin={isAdmin}
                          isImpersonating={isImpersonating}
                          reassigningCreator={reassigningCreator}
                          onStartReassign={() => setReassigningCreator(true)}
                          onCancelReassign={() => setReassigningCreator(false)}
                          teamMembers={teamMembers}
                          onReassignCreator={handleReassignCreator}
                          contact={contact}
                        />

                        <WhoCanSee
                          sharedWith={sharedWith}
                          founders={founders}
                          canRemove={(staffId) => canShare && canRemoveContactMember(role, currentUid, contact, staffId)}
                          onRemoveShare={removeShare}
                          shareOptions={shareOptions}
                          canShare={canShare}
                          sharing={sharing}
                          onStartShare={() => setSharing(true)}
                          onCancelShare={() => setSharing(false)}
                          onAddShare={addShare}
                          firstName={firstName}
                        />

                        <TagsSection
                          tags={formData.tags}
                          addingTag={addingTag}
                          tagInput={tagInput}
                          onTagInputChange={setTagInput}
                          onStartAdd={() => setAddingTag(true)}
                          onCancelAdd={() => setAddingTag(false)}
                          onCommitTag={commitTag}
                          onRemoveTag={removeTag}
                          onAddTag={(tag) => persistTags([...formData.tags, tag], "added", tag)}
                        />
                      </div>

                      {role !== 'viewer' && (
                        <DeleteContact onDelete={handleDelete} loading={loading} />
                      )}
                    </motion.div>
                  )}
{isMobile && activeTab === "interactions" && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="cd-sec"
                    >
                      <div className="cd-sec-head">
                        <h3 className="cd-sec-title">
                          {t('contactDetails.every_conversation', 'Every conversation')}
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
                          {isLoggingInteraction ? t('modals.contactDetails.cancel') : t('modals.contactDetails.log_interaction')}
                        </button>
                      </div>

                      {/* Log Interaction Form */}
                      {logInteractionForm}

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
                              {t('modals.contactDetails.no_interactions')}
                            </p>
                          </div>
                        ) : (
                          visibleInteractions.map((interaction) => renderInteractionItem(interaction))
                        )}
                      </div>
                    </motion.div>
                  )}

                  {isMobile && activeTab === "thread" && (
                    <div className="cd-pane cd-sec">
                      <div className="cd-sec-head">
                        <h3 className="cd-sec-title">{walkLabel}</h3>
                      </div>
                      <ContactStreamTab adapter={conversation} viewer={streamViewer} onMakeTodo={(m) => setTodoFrom(m)} />
                    </div>
                  )}

                  {isMobile && activeTab === "prayer" && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="cd-sec"
                    >
                      <div className="cd-sec-head">
                        <h3 className="cd-sec-title">
                          {t('modals.contactDetails.prayers_we_re_holding')}
                        </h3>
                        <button
                          onClick={() => setIsAddingPrayer(!isAddingPrayer)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-outline-variant text-xs font-medium text-on-surface hover:bg-surface-variant transition-colors"
                        >
                          {isAddingPrayer ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                          {isAddingPrayer ? t('modals.contactDetails.cancel') : t('modals.contactDetails.add_prayer')}
                        </button>
                      </div>

                      {/* Add Prayer Form */}
                      {addPrayerForm}

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
                          prayers.map((p) => renderPrayerCard(p))
                        )}
                      </div>
                    </motion.div>
                  )}

                  {isMobile && activeTab === "discussion" && (role === "admin" || isAdmin) && (
                    <div className="cd-pane cd-sec">
                      <div className="cd-sec-head">
                        <h3 className="cd-sec-title inline-flex items-center gap-2">
                          <Lock className="w-4 h-4" aria-hidden />
                          {t('modals.contactDetails.discussion')}
                        </h3>
                      </div>
                      <ContactStreamTab adapter={fullTimers} viewer={streamViewer} />
                    </div>
                  )}



                  {isMobile && activeTab === "history" && (
                    <div className="cd-sec">
                      <div className="cd-sec-head">
                        <h3 className="cd-sec-title">{t('modals.contactDetails.looking_back')}</h3>
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
                              {t('modals.contactDetails.no_audit_history')}
                            </p>
                          </div>
                        ) : (
                          activities.map((activity, idx) => (
                            <ContactAuditItem
                              key={activity.id || idx}
                              activity={activity}
                              isLast={idx === activities.length - 1}
                            />
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </>)
              )}
            </div>

            {/* Footer: Save/Cancel only while editing. Read mode has no
               persistent chrome — Delete moved to the end of Overview (#780). */}
            {isEditing && !isMobile && (
              <div className="cd-page-foot">
                <div className="flex gap-3 w-full sm:w-auto ml-auto">
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
                      <span className="animate-pulse">{t('modals.contactDetails.saving')}</span>
                    ) : (
                      t('modals.contactDetails.save_changes')
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Mobile-only delete button */}
            <div className={cn("sm:hidden px-6 pb-6 pt-0", isMobile && "hidden")}>
              <button
                onClick={handleDelete}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 px-4 h-10 rounded-full text-error font-semibold text-sm border border-error/20 hover:bg-error/10 transition-colors disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                {loading ? (
                  <span className="animate-pulse">{t('modals.contactDetails.deleting')}</span>
                ) : (
                  t('modals.contactDetails.delete_contact')
                )}
              </button>
            </div>

            <ContactDrawerHost
              drawerOpen={drawerOpen}
              drawer={drawer}
              conversation={conversation}
              fullTimers={fullTimers}
              interactionThread={interactionThread}
              viewer={streamViewer}
              drawerLabel={drawerLabel}
              onCloseDrawer={() => setDrawer(null)}
              onMakeTodo={(m) => setTodoFrom(m)}
              todoFrom={todoFrom}
              onCloseTodo={() => setTodoFrom(null)}
              contact={contact}
              teamMembers={teamMembers}
              currentUid={currentUid}
              meName={user?.displayName || "Someone"}
            />
          </div>
        </div>
      )}

      {movingStage && (
        <StageMoveSheet
          stages={sortedStages}
          current={currentContact.stage || ""}
          contactName={currentContact.name}
          onSelect={moveStage}
          onClose={() => setMovingStage(false)}
        />
      )}
      <UndoSnackbar undoSnack={undoSnack} onClose={closeUndoSnack} />
    </AnimatePresence>
  );
}
