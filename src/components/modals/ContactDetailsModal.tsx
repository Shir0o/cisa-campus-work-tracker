import React, { useState, useEffect, useMemo, useRef } from "react";
import { AnimatePresence } from "motion/react";
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
import { formatPhoneNumber, validatePhoneNumber } from "../../lib/utils";
import { format } from 'date-fns';
import { Contact, Stage, Interaction, Activity, PrayerRecord, Gathering, Rhythm } from "../../types";
import { useAuth } from "../AuthProvider";
import { canSeeContact, hasMinRole, canManageCollaborators, canRemoveContactMember, canReleaseContact, visibleToOf } from "../../lib/permissions";
import { partnersOf } from "../../lib/partners";
import { useMediaQuery } from '../../lib/useMediaQuery';
import { carerNamesOf, carersAfterCollaboratorRemoval } from '../../lib/carers';
import { conversationAdapter } from "../stream/conversationAdapter";
import { fullTimersAdapter } from "../stream/fullTimersAdapter";
import { interactionAdapter } from "../stream/interactionAdapter";
import { contactStakeholdersOf } from "../../lib/threads";
import { useThreads, countFor, type ThreadMessage } from "../../lib/threads";
import { walkingRecipient } from "../../lib/walking";
import { useLanguage } from "../LanguageProvider";
import { buildContactActivityPatch } from "../../lib/contactActivity";
import { normalizeTagList } from "../../lib/tags";
import { yearFromForm, yearToForm } from "../../lib/contactYear";
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
import { contactKind, kindLabelKey, type ContactKind } from "../../lib/contactKind";
import AboutSheet from "../contact/AboutSheet";
import DelegateSheet from "../contact/DelegateSheet";
import { buildContactStory } from "../../lib/contactStory";
import { emptyComposer, type ComposerValue } from "../../lib/contactComposer";
import { subscribeRhythms } from "../../lib/rhythms";

import ContactHead from "../contact/ContactHead";
import { PopupFrame } from "../ui/PopupFrame";
import CombinedFromBanner from "../contact/CombinedFromBanner";
import ContactEditForm from "../contact/ContactEditForm";
import ContactStory from "../contact/ContactStory";
import ContactComposer from "../contact/ContactComposer";
import ContactReachPrompt from "../contact/ContactReachPrompt";
import ContactPrayerCard from "../contact/ContactPrayerCard";
import ContactInteractionItem from "../contact/ContactInteractionItem";
import ContactStreamPane, { type ContactPaneView } from "../contact/ContactStreamPane";
import WhatWeKnow from "../contact/overview/WhatWeKnow";
import HowToReach from "../contact/overview/HowToReach";
import CaredForBy from "../contact/overview/CaredForBy";
import WhoCanSee from "../contact/overview/WhoCanSee";
import TagsSection from "../contact/overview/TagsSection";

interface ContactDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  contact: Contact | null;
  // Deep-link the modal to the pane on open (e.g. the My Day inbox "Comment"
  // action). When initialInteractionId is set, opens that interaction's inline
  // thread; otherwise honours initialTab — "discussion" lands on Full-timers,
  // anything else on the Conversation.
  initialTab?: "thread" | "discussion";
  initialInteractionId?: string | null;
  /** A deep link onto one Conversation or Full-timers message's Thread, from a
   * notification (#1303). */
  initialThreadId?: string | null;
}

export default function ContactDetailsModal({
  isOpen,
  onClose,
  contact,
  initialTab,
  initialInteractionId,
  initialThreadId,
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
  const [gatherings, setGatherings] = useState<Gathering[]>([]);
  const [rhythms, setRhythms] = useState<Rhythm[]>([]);
  const [teamMembers, setTeamMembers] = useState<
    { id: string; name: string; role: string; initials: string; fullTimer: boolean }[]
  >([]);

  // True while the mobile "Where is {name} now?" stage sheet is open (#677).
  const [movingStage, setMovingStage] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [reassigningCreator, setReassigningCreator] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [delegateOpen, setDelegateOpen] = useState(false);
  // The pinned pane (ADR 0034): which of the two streams it shows, whether it
  // is open full-screen on a narrow screen. The Interaction Thread it replaces
  // the stream with is tracked by openThread below.
  const [paneView, setPaneView] = useState<ContactPaneView>("conversation");
  const [paneOpen, setPaneOpen] = useState(false);

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
    return () => unsub?.();
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
    return () => unsub?.();
  }, [isOpen]);
  // Walking-together threads on this contact (live), + which Interaction's
  // Thread the pane is open on.
  const threadMessages = useThreads(contact?.id, { includeTeam: isAdmin });
  const [openThread, setOpenThread] = useState<string | null>(null);
  // When the reader last opened the Full-timers side of the pane, per person,
  // so the switch can show an unread dot (ADR 0034 decision 2).
  const [fullTimersSeenAt, setFullTimersSeenAt] = useState("");
  useEffect(() => {
    if (!contact?.id) return;
    setFullTimersSeenAt(localStorage.getItem(`cisa.contactFullTimersSeen.${contact.id}`) || "");
  }, [contact?.id]);
  // The Conversation message a to-do is being made from (the stream's toolbar).
  const [todoFrom, setTodoFrom] = useState<ThreadMessage | null>(null);
  const { undoSnack, showUndoSnack, closeUndoSnack } = useUndoSnack();
  const [pendingRemovalIds, setPendingRemovalIds] = useState<string[]>(() => getPendingRemovalIds());
  useEffect(() => subscribeInteractionRemovals(() => setPendingRemovalIds(getPendingRemovalIds())), []);
  const [addingTag, setAddingTag] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [editTagInput, setEditTagInput] = useState("");
  // The story's one composer (#1292): text first, with the kind, the type, the
  // time and the By chip held here so a submit posts exactly what it shows.
  const [composer, setComposer] = useState<ComposerValue>(() => emptyComposer());
  const [composerOpen, setComposerOpen] = useState(false);
  const [submittingComposer, setSubmittingComposer] = useState(false);
  // A Call or Text leaves the page for the dialer/messages app; when the page
  // comes back, the pending reach asks to be logged (#1297).
  const [reachPromptType, setReachPromptType] = useState<null | "call" | "chat">(null);
  const reachPendingRef = React.useRef<null | "call" | "chat">(null);
  const reachPageHiddenRef = React.useRef(false);
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
    email: "",
    phone: "",
    stage: "",
    gender: "",
    year: "",
    yearOther: "",
    major: "",
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

  // Offer to log the reach when the page becomes visible again after a Call or
  // Text. Nothing is written unless the offer is accepted.
  useEffect(() => {
    if (!isOpen) return;
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        if (reachPendingRef.current) reachPageHiddenRef.current = true;
        return;
      }
      if (
        document.visibilityState === "visible" &&
        reachPendingRef.current &&
        reachPageHiddenRef.current
      ) {
        setReachPromptType(reachPendingRef.current);
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [isOpen]);

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

  // Close is layered: an Interaction's Thread closes back to the stream first,
  // then the full-screen pane, then the page. The frame routes its Close,
  // Escape and scrim through here so the order is unchanged.
  const requestClose = () => {
    if (openThread && !isMobile) setOpenThread(null);
    else if (paneOpen) setPaneOpen(false);
    else if (openThread) setOpenThread(null);
    else handleClose();
  };

  useEffect(() => {
    if (contact) {
      const { first, last } = splitName(contact.name || "");
      setFormData({
        firstName: first,
        lastName: last,
        email: contact.email || "",
        phone: contact.phone || "",
        stage: contact.stage || "",
        gender: contact.gender || "",
        ...yearToForm(contact.year),
        major: contact.major || "",
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

      return () => unsubscribe?.();
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

      return () => unsubscribe?.();
    }
  }, [isOpen, contact]);

  // Attendance is read live from Gatherings, never copied into the person's
  // interactions, so unmarking someone takes their story entry back out (#1291).
  useEffect(() => {
    if (isOpen && contact) {
      const q = query(
        collection(db, "events"),
        where("attendance.present", "array-contains", contact.id),
      );

      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          setGatherings(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Gathering));
        },
        (error) => handleFirestoreError(error, OperationType.LIST, "events"),
      );

      return () => unsubscribe?.();
    }
  }, [isOpen, contact]);

  // Rhythm names are read live so a rename reads back on past attendance.
  useEffect(() => {
    if (!isOpen) return;
    return subscribeRhythms(setRhythms);
  }, [isOpen]);

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

      return () => unsubscribe?.();
    }
  }, [isOpen, contact]);

  // On open: the pane starts on the Conversation and closed on a narrow screen,
  // unless a deep-link asks for the Full-timers side or an Interaction's Thread
  // (a notification, Around the team). Both open the pane.
  useEffect(() => {
    if (!isOpen) return;
    setComposerOpen(false);
    setAddingTag(false);
    setTagInput("");
    setEditTagInput("");
    setOpenThread(initialInteractionId ?? null);
    setPaneView(initialTab === "discussion" ? "fullTimers" : "conversation");
    setPaneOpen(Boolean(initialInteractionId || initialTab || initialThreadId));
  }, [contact?.id, isOpen, initialTab, initialInteractionId, initialThreadId]);

  // An interaction deep-link on desktop scrolls the story to that
  // conversation, whose Thread is open in the pane (openThread above).
  useEffect(() => {
    if (!isOpen || isMobile || !initialInteractionId || interactionsLoading) return;
    document.getElementById(`story-${initialInteractionId}`)?.scrollIntoView?.({ block: "center" });
  }, [isOpen, isMobile, initialInteractionId, interactionsLoading]);

  if (!contact) return null;

  const currentUid = effectiveUserId || user?.uid;
  const hasAccess = canSeeContact(role, currentUid, contact);

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

  const toggleStoryMessage = (message: ThreadMessage) => {
    const ids = (liveContact || contact).storyMessageIds ?? [];
    const inStory = ids.includes(message.id);
    updateDoc(doc(db, "contacts", contact.id), {
      storyMessageIds: inStory ? arrayRemove(message.id) : arrayUnion(message.id),
    }).catch((error) => {
      // The optimistic toggle has already snapped back; say why.
      showUndoSnack(t("modals.contactDetails.story_update_failed"));
      try {
        handleFirestoreError(error, OperationType.UPDATE, "contacts");
      } catch {
        // Logged above; rethrowing here would only be an unhandled rejection.
      }
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

  const handleReleaseContact = async () => {
    if (!contact || !currentUid) return;
    const confirmMsg = t(
      'modals.contactDetails.release_confirm',
      'Release {name} from your queue? You will stop receiving notifications and "On you" items for this person, while creation history remains preserved.',
    ).replace('{name}', firstName);
    if (!window.confirm(confirmMsg)) {
      return;
    }

    const nextUnfollowed = [...new Set([...(contact.unfollowedBy || []), currentUid])];
    const nextCarers = (contact.carers || []).filter((id) => id !== currentUid);
    const nextCoCreators = (contact.coCreators || []).filter((id) => id !== currentUid);
    const isFounder = (contact.founders || []).includes(currentUid);
    const nextFounders = isFounder
      ? (contact.founders || []).filter((id) => id !== currentUid)
      : (contact.founders || []);

    const nextContactState = {
      ...contact,
      unfollowedBy: nextUnfollowed,
      carers: nextCarers,
      coCreators: nextCoCreators,
      founders: nextFounders,
    };
    const nextVisibleTo = visibleToOf(nextContactState);

    const patch: Record<string, unknown> = {
      unfollowedBy: arrayUnion(currentUid),
      visibleTo: nextVisibleTo,
      updatedAt: new Date().toISOString(),
      updatedBy: currentUid,
      updatedByName: user?.displayName || user?.email?.split('@')[0] || t('modals.contactDetails.unknown_user'),
    };
    if ((contact.carers || []).includes(currentUid)) {
      patch.carers = arrayRemove(currentUid);
    }
    if ((contact.coCreators || []).includes(currentUid)) {
      patch.coCreators = arrayRemove(currentUid);
    }
    if (isFounder) {
      patch.founders = arrayRemove(currentUid);
    }

    try {
      await updateDoc(doc(db, "contacts", contact.id), patch);
      contact.unfollowedBy = nextUnfollowed;
      contact.carers = nextCarers;
      contact.coCreators = nextCoCreators;
      if (isFounder) contact.founders = nextFounders;
      contact.visibleTo = nextVisibleTo;

      await logActivity({
        action: "released a contact from queue",
        targetId: contact.id,
        targetName: contact.name,
        targetType: "contact",
        type: "edit",
        description: `Released ${contact.name.split(" ")[0]} from personal queue`,
      });

      showUndoSnack(t('modals.contactDetails.release_done', 'Released from your queue'));
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `contacts/${contact.id}`);
    }
  };

  // The kind chip in the head writes the same two booleans and stamp the edit
  // form does, on its own rules branch (#1152, ADR 0030), and lands in History.
  const changeKind = async (kind: ContactKind) => {
    if (!contact || !isAdmin || isImpersonating) return;
    const fields = kind === "contact"
      ? { inChurchLife: false }
      : { inChurchLife: true, isStudent: kind === "our-own" };
    const before = contactKind(contact);
    const now = new Date().toISOString();
    await updateDoc(doc(db, "contacts", contact.id), {
      ...fields,
      kindSetBy: user?.uid,
      kindSetAt: now,
      updatedAt: now,
      updatedBy: user?.uid,
      updatedByName:
        user?.displayName || user?.email?.split("@")[0] || t('modals.contactDetails.unknown_user'),
    });
    contact.inChurchLife = fields.inChurchLife;
    if ("isStudent" in fields) contact.isStudent = fields.isStudent;
    const change = `kind: "${t(kindLabelKey(before))}" → "${t(kindLabelKey(kind))}"`;
    logActivity({
      action: `updated ${change} for`,
      targetId: contact.id,
      targetName: currentContact.name,
      targetType: "contact",
      type: "edit",
      description: change,
    } as any);
  };

  // Delegate = Share + an @mention carrying the optional note, through the
  // contact's Conversation and the existing mention path (ADR 0034, ADR 0007).
  const handleDelegate = async (staffId: string, note: string) => {
    if (!contact || !staffId) return;
    const member = teamMembers.find((m) => m.id === staffId);
    await addShare(staffId);
    const body = note ? `@${member?.name ?? ""} ${note}`.trim() : `@${member?.name ?? ""}`.trim();
    await conversation.post({ body, kind: "comment", mentionedUserIds: [staffId] });
    setDelegateOpen(false);
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
      if (formData.stage !== contact.stage)
        changes.push(`stage: "${contact.stage}" → "${formData.stage}"`);
      if (formData.spiritualBackground !== contact.spiritualBackground)
        changes.push(`spiritualBackground: "${contact.spiritualBackground || ''}" → "${formData.spiritualBackground}"`);
      if (formData.gender !== contact.gender)
        changes.push(`gender: "${contact.gender || ''}" → "${formData.gender || ''}"`);
      const year = yearFromForm(formData);
      if (year !== (contact.year || ""))
        changes.push(`year: "${contact.year || ''}" → "${year}"`);
      const major = formData.major.trim();
      if (major !== (contact.major || ""))
        changes.push(`major: "${contact.major || ''}" → "${major}"`);
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
        email: formData.email,
        phone: formData.phone,
        stage: formData.stage,
        gender: formData.gender,
        // Only a changed value is written, so saving something else never
        // rewrites an off-list year or stamps an empty one on a record.
        ...(year !== (contact.year || "") && { year }),
        ...(major !== (contact.major || "") && { major }),
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
      !composer.text.trim() ||
      !composer.dateTime ||
      !user ||
      !contact
    )
      return;

    hasActionRef.current = true;
    setSubmittingComposer(true);
    try {
      const content = composer.text.trim();
      const loggerName =
        user.displayName || user.email?.split("@")[0] || t('modals.contactDetails.anonymous');
      // Only a Full-timer may name a teammate other than themselves (#1288);
      // the Firestore create rule enforces the same cut.
      const selectedReacher =
        isAdmin && !isImpersonating
          ? teamMembers.find((m) => m.id === composer.reachedById)
          : undefined;
      const reacher =
        selectedReacher && selectedReacher.id !== user.uid
          ? { id: selectedReacher.id, name: selectedReacher.name }
          : null;

      const interactionsRef = collection(
        db,
        "contacts",
        contact.id,
        "interactions",
      );
      await addDoc(interactionsRef, {
        userId: user.uid,
        userName: loggerName,
        userPhoto: user.photoURL || "",
        ...(reacher ? { reachedById: reacher.id, reachedByName: reacher.name } : {}),
        content,
        dateTime: composer.dateTime,
        type: composer.type,
        createdAt: serverTimestamp(),
      });

      const activityPatch = buildContactActivityPatch({
        date: composer.dateTime,
        by: { uid: user.uid, name: loggerName },
        ...(reacher ? { reacher: { uid: reacher.id, name: reacher.name } } : {}),
        type: 'interaction',
      });
      await updateDoc(doc(db, "contacts", contact.id), activityPatch as Record<string, unknown>);

      // The teammate named as reacher hears about it, so a wrong entry can be
      // corrected (the bell entry also pushes, ADR 0031).
      if (reacher) {
        sendNotification({
          userId: reacher.id,
          title: t('modals.contactDetails.on_behalf_title'),
          message: t('modals.contactDetails.on_behalf_message')
            .replace('{logger}', loggerName)
            .replace('{name}', contact.name),
          type: 'info',
          targetId: contact.id,
          link: `/people/${contact.id}`,
        });
      }

      logActivity({
        action: "logged an interaction for",
        targetId: contact.id,
        targetName: contact.name,
        targetType: "contact",
        type:
          composer.type === "meeting"
            ? "event"
            : composer.type === "chat"
              ? "comment"
              : (composer.type as Activity["type"]),
        description: content,
      });

      setComposer(emptyComposer());
      setComposerOpen(false);
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.CREATE,
        `contacts/${contact.id}/interactions`,
      );
    } finally {
      setSubmittingComposer(false);
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
    if (!composer.text.trim() || !contact) return;

    hasActionRef.current = true;
    setSubmittingComposer(true);
    try {
      const burden = [composer.text.trim(), composer.context.trim()]
        .filter(Boolean)
        .join("\n\n");
      const now = new Date().toISOString();
      await addDoc(collection(db, "prayers"), {
        contactId: contact.id,
        date: now,
        burden,
        status: "pending",
        // A burden typed on a contact's tab belongs to that contact; only
        // burdens written on "On our hearts" belong on the team page (#1042).
        // It must not put a removed person back on that page (#1406).
        teamPrayer: false,
        updatedAt: now,
        updatedBy: user?.uid || "",
        updatedByName:
          user?.displayName || user?.email?.split("@")[0] || t('modals.contactDetails.unknown_user'),
      });

      logActivity({
        action: "added a prayer burden for",
        targetId: contact.id,
        targetName: contact.name,
        targetType: "contact",
        type: "comment",
        description: composer.text.trim(),
      });

      setComposer(emptyComposer());
      setComposerOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, "prayers");
    } finally {
      setSubmittingComposer(false);
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
    if (contact.phone) {
      reachPendingRef.current = "call";
      reachPageHiddenRef.current = false;
      window.open(`tel:${contact.phone}`);
    }
  };
  const textContact = () => {
    if (contact.phone) {
      reachPendingRef.current = "chat";
      reachPageHiddenRef.current = false;
      window.open(`sms:${contact.phone}`);
    }
  };
  const emailContact = () => {
    if (contact.email) window.open(`mailto:${contact.email}`);
  };
  const acceptReachPrompt = () => {
    const type = reachPromptType;
    setReachPromptType(null);
    reachPendingRef.current = null;
    reachPageHiddenRef.current = false;
    if (!type) return;
    setComposer((prev) => ({
      ...prev,
      mode: "interaction",
      type,
      dateTime: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
    }));
    setComposerOpen(true);
  };
  const dismissReachPrompt = () => {
    setReachPromptType(null);
    reachPendingRef.current = null;
    reachPageHiddenRef.current = false;
  };
  const startComposer = (mode: ComposerValue["mode"]) => {
    setComposer((prev) => ({ ...prev, mode }));
    setComposerOpen(true);
  };
  const cancelComposer = () => {
    setComposer(emptyComposer());
    setComposerOpen(false);
  };
  const handleComposerSubmit = (e: React.FormEvent) => {
    if (composer.mode === "prayer") handleAddPrayer(e);
    else handleAddInteraction(e);
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
  const sinceBy =
    latestInteraction?.reachedByName ||
    latestInteraction?.userName ||
    currentContact?.lastContactedBy ||
    null;
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
  // Deleting a contact needs isManager (Full-timer or Trainee), the same gate
  // Firestore enforces (#1367). Kept separate from Edit so they can't drift.
  const canDelete = isAdmin || hasMinRole(role, "manager");
  const currentStageIndex = stageIdx === -1 ? 0 : stageIdx;
  const currentStageInfo = stageIdx === -1 ? undefined : sortedStages[stageIdx];
  const canUpdatePrayers = isAdmin || hasMinRole(role, "operator");
  const openPrayers = prayers.filter(
    (p) => p.status !== "answered" && p.status !== "unanswered",
  );

  // The edit baseline lets the shared frame ask before discarding a changed
  // form; entering edit mode with no changes stays clean.
  const editBaselineRef = useRef<string>("");
  const beginEdit = () => {
    editBaselineRef.current = JSON.stringify(formData);
    setIsEditing(true);
  };
  const editDirty = isEditing && JSON.stringify(formData) !== editBaselineRef.current;
  // The frame owns the pinned footer, so its Save submits the form by id.
  const requestEditSubmit = () => {
    const form = document.getElementById("edit-contact-form") as HTMLFormElement | null;
    form?.requestSubmit?.();
  };

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

  // The story's composer (#1292): one box for an interaction or a prayer,
  // shared by the phone story and the desktop story column.
  const composerNode = (
    <ContactComposer
      open={composerOpen}
      value={composer}
      onChange={setComposer}
      onOpen={() => setComposerOpen(true)}
      onCancel={cancelComposer}
      onSubmit={handleComposerSubmit}
      submitting={submittingComposer}
      canLogOnBehalf={isAdmin && !isImpersonating}
      teamMembers={teamMembers}
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
      threadOpen={openThread === interaction.id}
      onOpenThread={() => {
        setOpenThread(interaction.id);
        setPaneOpen(true);
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

  const story = buildContactStory({
    contact: currentContact,
    interactions,
    prayers,
    activities,
    gatherings,
    rhythms,
    storyMessages: threadMessages,
    pendingRemovalIds,
  });
  const storyMessageIds = new Set(currentContact.storyMessageIds ?? []);
  const openStoryMessage = (messageId: string) => {
    setOpenThread(null);
    setPaneView("conversation");
    setPaneOpen(true);
    setTimeout(() => {
      document.querySelector(`[data-stream-row="${messageId}"]`)?.scrollIntoView?.({ block: "center" });
    }, 0);
  };
  const canSeeTeamThread = role === "admin" || isAdmin;

  const storySection = (
    <ContactStory
      story={story}
      fmtDate={fmtDate}
      composer={composerNode}
      interactionsLoading={interactionsLoading}
      renderInteraction={renderInteractionItem}
      renderPrayerCard={renderPrayerCard}
      onOpenStoryMessage={openStoryMessage}
    />
  );

  // The open Follow-up asks in the Conversation, so the pane header can say how
  // many are waiting and jump to the first (ADR 0034 decision 2).
  const openAsks = conversation.messages.filter(
    (m) => !m.parentId && m.kind === "nudge" && !m.closedAt,
  );
  const jumpToOpenAsk = () => {
    setPaneView("conversation");
    setPaneOpen(true);
    const first = openAsks[0];
    if (!first) return;
    setTimeout(() => {
      document.querySelector(`[data-stream-row="${first.id}"]`)?.scrollIntoView?.({ block: "center" });
    }, 0);
  };

  // A Full-timers unread dot: anything team-scoped newer than the last time the
  // reader opened that side of the pane.
  const latestTeamAt = threadMessages
    .filter((m) => m.scope === "team" && !m.parentId)
    .reduce((max, m) => (m.at > max ? m.at : max), "");
  const fullTimersUnread = !!latestTeamAt && latestTeamAt > fullTimersSeenAt;
  const markFullTimersSeen = () => {
    const stamp = new Date().toISOString();
    setFullTimersSeenAt(stamp);
    if (contact?.id) localStorage.setItem(`cisa.contactFullTimersSeen.${contact.id}`, stamp);
  };
  const selectPaneView = (view: ContactPaneView) => {
    setPaneView(view);
    if (view === "fullTimers") markFullTimersSeen();
  };

  const streamPane = (
    <ContactStreamPane
      isMobile={isMobile}
      open={paneOpen}
      view={paneView}
      onViewChange={selectPaneView}
      conversation={conversation}
      fullTimers={fullTimers}
      interactionThread={interactionThread}
      viewer={streamViewer}
      isFullTimer={canSeeTeamThread}
      onBack={() => setOpenThread(null)}
      onClose={() => setPaneOpen(false)}
      onMakeTodo={(m) => setTodoFrom(m)}
      onAddToStory={toggleStoryMessage}
      storyMessageIds={storyMessageIds}
      todoFrom={todoFrom}
      onCloseTodo={() => setTodoFrom(null)}
      contact={contact}
      teamMembers={teamMembers}
      currentUid={currentUid}
      meName={user?.displayName || "Someone"}
      openAskCount={openAsks.length}
      onJumpToAsk={jumpToOpenAsk}
      fullTimersUnread={fullTimersUnread}
      initialThreadId={initialThreadId}
    />
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <PopupFrame
          open
          onClose={requestClose}
          size="lg"
          title={t('modals.contactDetails.title')}
          dirty={editDirty}
          discardQuestion={t('modals.contactDetails.discard_edit')}
          cancelLabel={isEditing ? t('modals.contactDetails.cancel') : undefined}
          onCancel={isEditing ? () => setIsEditing(false) : undefined}
          primary={
            isEditing
              ? {
                  label: t('modals.contactDetails.save_changes'),
                  onClick: requestEditSubmit,
                  saving: loading,
                  savingLabel: t('modals.contactDetails.saving'),
                }
              : undefined
          }
        >
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
              isAdmin={isAdmin}
              showDelete={canDelete}
              showRelease={canReleaseContact(currentUid, currentContact)}
              onRelease={handleReleaseContact}
              canEditKind={isAdmin && !isImpersonating}
              openPrayerCount={openPrayers.length}
              canDelegate={canShare}
              onClose={handleClose}
              onEdit={beginEdit}
              onCancelEdit={() => setIsEditing(false)}
              onCall={callContact}
              onText={textContact}
              onEmail={emailContact}
              onLogInteraction={() => startComposer("interaction")}
              onStartPrayer={() => startComposer("prayer")}
              onMoveStage={moveStage}
              onOpenMoveSheet={() => setMovingStage(true)}
              onOpenAbout={() => setAboutOpen(true)}
              onOpenDelegate={() => setDelegateOpen(true)}
              onChangeKind={changeKind}
              onChangeCreator={() => setReassigningCreator(true)}
              onDelete={handleDelete}
              onOpenPrayers={() => {
                requestAnimationFrame(() =>
                  document
                    .querySelector('[data-kind="prayer"], [data-kind="prayer-answered"]')
                    ?.scrollIntoView?.({ block: "center" }),
                );
              }}
              onOpenConversation={() => {
                setPaneView("conversation");
                setPaneOpen(true);
              }}
              conversationUnread={fullTimersUnread}
            />

            {!isEditing && currentContact.combinedFrom && (
              <CombinedFromBanner
                combinedFrom={currentContact.combinedFrom}
                isFullTimer={isAdmin && !isImpersonating}
              />
            )}

            {reachPromptType && (
              <ContactReachPrompt
                name={firstName}
                onAccept={acceptReachPrompt}
                onDismiss={dismissReachPrompt}
              />
            )}

            {/* Content */}
            <div className={isMobile ? "cdm-page-body" : "cd-page-content"}>
              {isEditing ? (
                <div className="cd-story-scroll">
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
                    showDelete={canDelete}
                    onDelete={handleDelete}
                    loading={loading}
                  />
                </div>
              ) : isMobile ? (
                <>
                  {storySection}
                  {streamPane}
                </>
              ) : (
                <div className="cd-story-layout">
                  <div className="cd-story-scroll">{storySection}</div>
                  {streamPane}
                </div>
              )}
            </div>
          </div>
        </div>
        </PopupFrame>
      )}

      {aboutOpen && (
        <AboutSheet open={aboutOpen} name={contact.name} onClose={() => setAboutOpen(false)}>
          <div className="space-y-2">
            <WhatWeKnow notes={contact.notes} />
            <HowToReach contact={contact} firstName={firstName} />
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
          </div>
        </AboutSheet>
      )}

      <DelegateSheet
        open={delegateOpen}
        name={contact.name}
        members={shareOptions}
        onClose={() => setDelegateOpen(false)}
        onDelegate={handleDelegate}
      />

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
