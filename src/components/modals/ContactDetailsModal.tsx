import React, { useState, useEffect, useMemo, useRef } from "react";
import { AnimatePresence } from "motion/react";
import {
  db,
  handleFirestoreError,
  OperationType,
  logActivity,
} from "../../lib/firebase";
import {
  doc,
  updateDoc,
  collection,
  addDoc,
  serverTimestamp,
  arrayUnion,
} from "firebase/firestore";
import { formatPhoneNumber, validatePhoneNumber } from "../../lib/utils";
import { format } from "date-fns";
import { Contact, Interaction, Activity, PrayerRecord } from "../../types";
import { useAuth } from "../AuthProvider";
import { canSeeContact, hasMinRole, canManageCollaborators, canRemoveContactMember, canReleaseContact } from "../../lib/permissions";
import { useMediaQuery } from "../../lib/useMediaQuery";
import { conversationAdapter } from "../stream/conversationAdapter";
import { fullTimersAdapter } from "../stream/fullTimersAdapter";
import { interactionAdapter } from "../stream/interactionAdapter";
import { contactStakeholdersOf } from "../../lib/threads";
import { useThreads, countFor, type ThreadMessage } from "../../lib/threads";
import { walkingRecipient } from "../../lib/walking";
import { useLanguage } from "../LanguageProvider";
import { yearToForm } from "../../lib/contactYear";
import { Frecency, QUICK_CLOSE_THRESHOLD_MS } from "../../lib/frecency";
import { fmtContactDate, computeContactDerivedModel } from "../../lib/contactViewModel";
import { useUndoSnack } from "../../hooks/useUndoSnack";
import { StageMoveSheet } from "../ui/StagePicker";
import { UndoSnackbar } from "../UndoSnackbar";
import { cancelInteractionRemoval } from "../../lib/interactionRemoval";
import { contactKind, kindLabelKey, type ContactKind } from "../../lib/contactKind";
import AboutSheet from "../contact/AboutSheet";
import DelegateSheet from "../contact/DelegateSheet";
import { emptyComposer, type ComposerValue } from "../../lib/contactComposer";
import { useContactStory, type UseContactStoryResult } from "../../hooks/useContactStory";

import ContactHead, { type ContactHeaderModel, type ContactHeaderActions } from "../contact/ContactHead";
import CombinedFromBanner from "../contact/CombinedFromBanner";
import ContactEditForm from "../contact/ContactEditForm";
import ContactStorySection from "../contact/ContactStorySection";
import ContactComposer from "../contact/ContactComposer";
import ContactReachPrompt from "../contact/ContactReachPrompt";
import ContactStreamPane, { type ContactPaneView } from "../contact/ContactStreamPane";
import ContactAboutContent from "../contact/ContactAboutContent";
import ContactEditFooter from "../contact/ContactEditFooter";
import { executeContactUpdate, executePersistTags, splitName } from "../../lib/contactUpdate";

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
  /** Clean seam allowing story timeline calculation and subscription aggregation
   * to be substituted with mock data fixtures in tests (#1589). */
  storyModel?: Partial<UseContactStoryResult>;
}

export default function ContactDetailsModal({
  isOpen,
  onClose,
  contact,
  initialTab,
  initialInteractionId,
  initialThreadId,
  storyModel,
}: ContactDetailsModalProps) {
  const { user, isAdmin, role, effectiveUserId, isImpersonating } = useAuth();
  const { t, language } = useLanguage();
  const isMobile = useMediaQuery("(max-width: 768px)");
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);

  const liveThreads = useThreads(contact?.id, { includeTeam: isAdmin });

  // Deep reactive hook encapsulates subscriptions for all 9 collections & story timeline
  const storyHook = useContactStory(contact, {
    enabled: isOpen && !storyModel,
    includeTeam: isAdmin,
    threadMessages: liveThreads,
    t,
  });

  const currentContact = storyModel?.contact ?? storyHook.contact ?? contact;
  const story = storyModel?.story ?? storyHook.story;
  const interactions = storyModel?.interactions ?? storyHook.interactions;
  const prayers = storyModel?.prayers ?? storyHook.prayers;
  const stages = storyModel?.stages ?? storyHook.stages;
  const teamMembers = storyModel?.teamMembers ?? storyHook.teamMembers;
  const threadMessages = storyModel?.threadMessages ?? (liveThreads.length > 0 ? liveThreads : storyHook.threadMessages);
  const interactionsLoading = storyModel?.interactionsLoading ?? storyHook.interactionsLoading;
  const actions = storyModel?.actions ?? storyHook.actions;

  // True while the mobile "Where is {name} now?" stage sheet is open (#677).
  const [movingStage, setMovingStage] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [reassigningCreator, setReassigningCreator] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [delegateOpen, setDelegateOpen] = useState(false);

  // Pinned pane (ADR 0034)
  const [paneView, setPaneView] = useState<ContactPaneView>("conversation");
  const [paneOpen, setPaneOpen] = useState(false);
  const [openThread, setOpenThread] = useState<string | null>(null);

  const [fullTimersSeenAt, setFullTimersSeenAt] = useState("");
  useEffect(() => {
    if (!contact?.id) return;
    setFullTimersSeenAt(localStorage.getItem(`cisa.contactFullTimersSeen.${contact.id}`) || "");
  }, [contact?.id]);

  const [todoFrom, setTodoFrom] = useState<ThreadMessage | null>(null);
  const { undoSnack, showUndoSnack, closeUndoSnack } = useUndoSnack();

  const [editTagInput, setEditTagInput] = useState("");

  const [composer, setComposer] = useState<ComposerValue>(() => emptyComposer());
  const [composerOpen, setComposerOpen] = useState(false);
  const [submittingComposer, setSubmittingComposer] = useState(false);

  const [reachPromptType, setReachPromptType] = useState<null | "call" | "chat">(null);
  const reachPendingRef = useRef<null | "call" | "chat">(null);
  const reachPageHiddenRef = useRef(false);

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

  const openedAtRef = useRef<number>(Date.now());
  const hasActionRef = useRef<boolean>(false);

  useEffect(() => {
    if (isOpen && contact?.id) {
      openedAtRef.current = Date.now();
      hasActionRef.current = false;
      if (user?.uid) {
        Frecency.recordOpen(user.uid, contact.id);
      }
    }
  }, [isOpen, contact?.id, user?.uid]);

  // Reach prompt on return from phone/chat app
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

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (openThread && !isMobile) setOpenThread(null);
      else if (paneOpen) setPaneOpen(false);
      else if (openThread) setOpenThread(null);
      else handleClose();
    };
    if (isOpen) {
      window.addEventListener("keydown", handleEsc);
    }
    return () => window.removeEventListener("keydown", handleEsc);
  }, [isOpen, handleClose, openThread, paneOpen, isMobile]);

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
    if (!isOpen) return;
    setComposerOpen(false);
    setEditTagInput("");
    setOpenThread(initialInteractionId ?? null);
    setPaneView(initialTab === "discussion" ? "fullTimers" : "conversation");
    setPaneOpen(Boolean(initialInteractionId || initialTab || initialThreadId));
  }, [contact?.id, isOpen, initialTab, initialInteractionId, initialThreadId]);

  useEffect(() => {
    if (!isOpen || isMobile || !initialInteractionId || interactionsLoading) return;
    document.getElementById(`story-${initialInteractionId}`)?.scrollIntoView?.({ block: "center" });
  }, [isOpen, isMobile, initialInteractionId, interactionsLoading]);

  if (!contact) return null;

  const currentUid = effectiveUserId || user?.uid;
  const hasAccess = canSeeContact(role, currentUid, contact);
  const threadRecipient = walkingRecipient(currentUid, contact.createdBy || contact.addedBy);

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

  const founders = currentContact.founders || [];
  const coCreators = currentContact.coCreators || [];
  const sharedWith = teamMembers.filter((m) => founders.includes(m.id) || coCreators.includes(m.id));
  const canShare = !isImpersonating && canManageCollaborators(role, currentUid, currentContact);
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
    showUndoSnack(t('modals.contactDetails.interaction_removed'), () =>
      cancelInteractionRemoval(interaction.id),
    );
    actions.removeInteraction(interaction);
  };

  const toggleStoryMessage = (message: ThreadMessage) => {
    actions.toggleStoryMessage(message).catch((error) => {
      showUndoSnack(t("modals.contactDetails.story_update_failed"));
      try {
        handleFirestoreError(error, OperationType.UPDATE, "contacts");
      } catch {
        // Logged
      }
    });
  };

  const addShare = async (staffId: string) => {
    if (!contact) return;
    const s = teamMembers.find((m) => m.id === staffId);
    await actions.addShare(staffId, { staffName: s?.name });
    contact.coCreators = [...(contact.coCreators || []), staffId];
    setSharing(false);
  };

  const removeShare = async (staffId: string) => {
    if (!contact) return;
    const s = teamMembers.find((m) => m.id === staffId);
    await actions.removeShare(staffId, { staffName: s?.name });
    contact.coCreators = (contact.coCreators || []).filter((id) => id !== staffId);
  };

  const handleReassignCreator = async (newStaffId: string) => {
    if (!contact) return;
    const newStaff = teamMembers.find((m) => m.id === newStaffId);
    const oldStaff = teamMembers.find((m) => m.id === (contact.createdBy || contact.addedBy));
    await actions.reassignCreator(newStaffId, {
      newStaffName: newStaff?.name,
      oldStaffName: oldStaff?.name,
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

    try {
      await actions.releaseContact(currentUid, {
        userName: user?.displayName || user?.email?.split('@')[0] || t('modals.contactDetails.unknown_user'),
      });
      showUndoSnack(
        t('modals.contactDetails.release_done', 'Released {name} from your queue.').replace(
          '{name}',
          firstName,
        ),
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `contacts/${contact.id}`);
    }
  };

  const changeKind = async (kind: ContactKind) => {
    if (!contact || !isAdmin || isImpersonating) return;
    const before = contactKind(contact);
    try {
      await actions.changeKind(kind, {
        userId: user?.uid,
        userName: user?.displayName || user?.email?.split("@")[0] || t('modals.contactDetails.unknown_user'),
        kindLabelBefore: t(kindLabelKey(before)),
        kindLabelAfter: t(kindLabelKey(kind)),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, "contacts");
    }
  };

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

  const moveStage = async (
    nextStage: string,
    opts?: { from?: string; silent?: boolean },
  ) => {
    const previous = opts?.from ?? (currentContact.stage || "");
    if (nextStage === previous) return;
    hasActionRef.current = true;
    try {
      await actions.moveStage(nextStage, {
        oldStage: previous,
        userId: user?.uid,
        userName: user?.displayName || user?.email?.split("@")[0] || t('modals.contactDetails.unknown_user'),
      });

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
      await executeContactUpdate({
        contact,
        currentContact,
        formData,
        editTagInput,
        user,
        isAdmin,
        t,
      });
      setIsEditing(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `contacts/${contact.id}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(t('modals.contactDetails.confirm_delete'))) return;
    hasActionRef.current = true;
    setLoading(true);
    try {
      await actions.deleteContact({
        userName: user?.displayName || user?.email?.split("@")[0] || t('modals.contactDetails.unknown_user'),
      });
      onClose();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `contacts/${contact.id}`);
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
      const loggerName =
        user.displayName || user.email?.split("@")[0] || t("modals.contactDetails.anonymous");
      const selectedReacher =
        isAdmin && !isImpersonating
          ? teamMembers.find((m) => m.id === composer.reachedById)
          : undefined;
      const reacher =
        selectedReacher && selectedReacher.id !== user.uid
          ? { id: selectedReacher.id, name: selectedReacher.name }
          : null;

      await actions.addInteraction({
        content: composer.text.trim(),
        dateTime: composer.dateTime,
        type: composer.type,
        userId: user.uid,
        userName: loggerName,
        userPhoto: user.photoURL || "",
        reacher,
        t,
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

  const handleUpdateInteraction = async (
    interactionId: string,
    data: { content: string; dateTime?: string; type?: string },
  ) => {
    hasActionRef.current = true;
    try {
      await actions.updateInteraction(interactionId, data);
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.UPDATE,
        `contacts/${contact.id}/interactions/${interactionId}`,
      );
    }
  };

  const handleAddPrayer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!composer.text.trim() || !contact) return;

    hasActionRef.current = true;
    setSubmittingComposer(true);
    try {
      await actions.addPrayer({
        text: composer.text.trim(),
        context: composer.context.trim(),
        userId: user?.uid,
        userName:
          user?.displayName || user?.email?.split("@")[0] || t("modals.contactDetails.unknown_user"),
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
      const answeredText =
        prayer.answeredAt ||
        new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
      await actions.updatePrayerStatus(prayer, status, answeredText);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, "prayers");
    }
  };

  const persistTags = async (updatedTags: string[], verb: string, tag: string) => {
    hasActionRef.current = true;
    const prevTags = formData.tags;
    setFormData((f) => ({ ...f, tags: updatedTags }));
    try {
      await executePersistTags({
        contactId: contact.id,
        contactName: contact.name,
        updatedTags,
        prevTags,
        verb,
        tag,
        user,
        t,
      });
    } catch (error) {
      setFormData((f) => ({ ...f, tags: prevTags }));
      handleFirestoreError(error, OperationType.UPDATE, `contacts/${contact.id}`);
    }
  };


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

  const fmtDate = fmtContactDate;

  const {
    carerNames,
    carerMembers,
    addedByName,
    sinceText,
    sinceBy,
    sortedStages,
    canMoveStage,
    canDelete,
    currentStageIndex,
    currentStageInfo,
    openPrayers,
  } = useMemo(
    () =>
      computeContactDerivedModel({
        currentContact,
        interactions,
        prayers,
        stages,
        teamMembers,
        isAdmin,
        role,
        t,
      }),
    [currentContact, interactions, prayers, stages, teamMembers, isAdmin, role, t],
  );
  const canUpdatePrayers = isAdmin || hasMinRole(role, "operator");

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

  const canSeeTeamThread = role === "admin" || isAdmin;
  const storyMessageIds = new Set(currentContact.storyMessageIds ?? []);

  const storySection = (
    <ContactStorySection
      story={story}
      fmtDate={fmtDate}
      composer={composerNode}
      interactionsLoading={interactionsLoading}
      currentContact={currentContact}
      currentUid={currentUid}
      role={role}
      user={user}
      isAdmin={isAdmin}
      canUpdatePrayers={canUpdatePrayers}
      openThread={openThread}
      onOpenThread={(id) => {
        setOpenThread(id);
        setPaneOpen(true);
      }}
      onOpenConversation={(messageId) => {
        setOpenThread(null);
        setPaneView("conversation");
        setPaneOpen(true);
        if (messageId) {
          setTimeout(() => {
            document.querySelector(`[data-stream-row="${messageId}"]`)?.scrollIntoView?.({ block: "center" });
          }, 0);
        }
      }}
      onRemoveInteraction={handleRemoveInteraction}
      onUpdateInteraction={handleUpdateInteraction}
      onUpdatePrayerStatus={handleUpdatePrayerStatus}
      interactionAdapterFor={interactionAdapterFor}
      streamViewer={streamViewer}
    />
  );

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

  // Consolidated Header Model & Actions eliminates 35 drilled individual props
  const headerModel: ContactHeaderModel = {
    contact,
    currentContact,
    stages: sortedStages,
    canMoveStage,
    currentStageIndex,
    currentStageInfo,
    sinceText,
    carerNames,
    role,
    isAdmin,
    showDelete: canDelete,
    showRelease: canReleaseContact(currentUid, currentContact),
    canEditKind: isAdmin && !isImpersonating,
    openPrayerCount: openPrayers.length,
    canDelegate: canShare,
    conversationUnread: fullTimersUnread,
  };

  const headerActions: ContactHeaderActions = {
    onClose: handleClose,
    onEdit: () => setIsEditing(true),
    onCancelEdit: () => setIsEditing(false),
    onCall: callContact,
    onText: textContact,
    onEmail: emailContact,
    onLogInteraction: () => startComposer("interaction"),
    onStartPrayer: () => startComposer("prayer"),
    onMoveStage: moveStage,
    onOpenMoveSheet: () => setMovingStage(true),
    onOpenAbout: () => setAboutOpen(true),
    onOpenDelegate: () => setDelegateOpen(true),
    onChangeKind: changeKind,
    onChangeCreator: () => setReassigningCreator(true),
    onDelete: handleDelete,
    onRelease: handleReleaseContact,
    onOpenPrayers: () => {
      requestAnimationFrame(() =>
        document
          .querySelector('[data-kind="prayer"], [data-kind="prayer-answered"]')
          ?.scrollIntoView?.({ block: "center" }),
      );
    },
    onOpenConversation: () => {
      setPaneView("conversation");
      setPaneOpen(true);
    },
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className={isMobile ? "cdm-page" : "cd-page"}>
          <div className={isMobile ? "cdm-page-main" : "cd-page-main"}>
            <ContactHead
              model={headerModel}
              actions={headerActions}
              isMobile={isMobile}
              isEditing={isEditing}
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

            {/* Footer: Save/Cancel only while editing */}
            {isEditing && !isMobile && (
              <ContactEditFooter
                onCancel={() => setIsEditing(false)}
                loading={loading}
              />
            )}
          </div>
        </div>
      )}

      {aboutOpen && (
        <AboutSheet open={aboutOpen} name={contact.name} onClose={() => setAboutOpen(false)}>
          <ContactAboutContent
            contact={contact}
            firstName={firstName}
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
            tags={formData.tags}
            onPersistTags={persistTags}
            sharedWith={sharedWith}
            founders={founders}
            canRemoveShare={(staffId) => canShare && canRemoveContactMember(role, currentUid, contact, staffId)}
            onRemoveShare={removeShare}
            shareOptions={shareOptions}
            canShare={canShare}
            sharing={sharing}
            onStartShare={() => setSharing(true)}
            onCancelShare={() => setSharing(false)}
            onAddShare={addShare}
          />
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
