import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { joinPrayerBurden } from "../lib/contactComposer";
import {
  db,
  handleFirestoreError,
  OperationType,
  logActivity,
  sendNotification,
} from "../lib/firebase";
import { buildContactActivityPatch } from "../lib/contactActivity";
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
import type { Contact, Stage, Interaction, PrayerRecord, Gathering, Rhythm, SystemActivity } from "../types";
import { buildContactStory, type StoryEntry } from "../lib/contactStory";
import { subscribeRhythms } from "../lib/rhythms";
import { subscribeThreads, type ThreadMessage } from "../lib/threads";
import {
  subscribeInteractionRemovals,
  getPendingRemovalIds,
  scheduleInteractionRemoval,
  cancelInteractionRemoval,
} from "../lib/interactionRemoval";
import { contactKind, type ContactKind } from "../lib/contactKind";
import { visibleToOf } from "../lib/permissions";
import { carersAfterCollaboratorRemoval } from "../lib/carers";

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  initials: string;
  fullTimer: boolean;
}

export interface UseContactStoryOptions {
  enabled?: boolean;
  initialContact?: Contact | null;
  includeTeam?: boolean;
  t?: (key: string, fallback?: string) => string;
  threadMessages?: ThreadMessage[];
}

export type ContactPatch = Partial<Contact>;

export interface ContactStoryActions {
  toggleStoryMessage(message: ThreadMessage | { id: string }): Promise<void>;
  removeInteraction(interaction: Interaction, options?: { onUndo?: (cancel: () => void) => void }): void;
  updateInteraction(interactionId: string, data: { content: string; dateTime?: string; type?: string }): Promise<void>;
  addInteraction(data: {
    content: string;
    dateTime?: string;
    type?: string;
    userId?: string;
    userName?: string;
    userPhoto?: string;
    reacher?: { id: string; name: string } | null;
    t?: (key: string, fallback?: string) => string;
  }): Promise<void>;
  addPrayer(data: {
    text: string;
    date?: string;
    requestorName?: string;
    userId?: string;
    userName?: string;
    context?: string;
  }): Promise<void>;
  updatePrayerStatus(prayer: PrayerRecord, status: PrayerRecord["status"], answeredAtText?: string): Promise<void>;
  updatePrayerBurden(
    prayer: PrayerRecord,
    words: { text: string; context: string },
    by: { uid?: string | null; name?: string | null },
  ): Promise<void>;
  moveStage(newStage: string, meta?: { oldStage?: string; userName?: string; userId?: string }): Promise<void>;
  changeKind(kind: ContactKind, meta?: { userName?: string; userId?: string; kindLabelBefore?: string; kindLabelAfter?: string }): Promise<void>;
  updateContact(data: ContactPatch): Promise<void>;
  addShare(staffId: string, meta?: { staffName?: string }): Promise<void>;
  removeShare(staffId: string, meta?: { staffName?: string }): Promise<void>;
  reassignCreator(newStaffId: string, meta?: { newStaffName?: string; oldStaffName?: string }): Promise<void>;
  releaseContact(currentUid: string, meta?: { userName?: string }): Promise<void>;
  deleteContact(meta?: { userName?: string }): Promise<void>;
}

export interface UseContactStoryResult {
  story: StoryEntry[];
  contact: Contact | null;
  loading: boolean;
  error: Error | null;
  actions: ContactStoryActions;
  // Raw sub-collections & reference records
  interactions: Interaction[];
  prayers: PrayerRecord[];
  activities: SystemActivity[];
  gatherings: Gathering[];
  rhythms: Rhythm[];
  stages: Stage[];
  teamMembers: TeamMember[];
  threadMessages: ThreadMessage[];
  interactionsLoading: boolean;
  prayersLoading: boolean;
  activitiesLoading: boolean;
}

export function useContactStory(
  contactOrId: string | Contact | null | undefined,
  options: UseContactStoryOptions = {}
): UseContactStoryResult {
  const { enabled = true, initialContact, includeTeam = false, t, threadMessages: overrideThreads } = options;

  const contactId = typeof contactOrId === "string" ? contactOrId : contactOrId?.id ?? null;
  const initial = typeof contactOrId === "object" && contactOrId !== null ? contactOrId : initialContact ?? null;

  const [contact, setContact] = useState<Contact | null>(initial);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [prayers, setPrayers] = useState<PrayerRecord[]>([]);
  const [activities, setActivities] = useState<SystemActivity[]>([]);
  const [gatherings, setGatherings] = useState<Gathering[]>([]);
  const [rhythms, setRhythms] = useState<Rhythm[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [internalThreadMessages, setInternalThreadMessages] = useState<ThreadMessage[]>([]);

  const threadMessages = overrideThreads ?? internalThreadMessages;

  const [interactionsLoading, setInteractionsLoading] = useState(true);
  const [prayersLoading, setPrayersLoading] = useState(true);
  const [activitiesLoading, setActivitiesLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const [pendingRemovalIds, setPendingRemovalIds] = useState<string[]>(() => getPendingRemovalIds());

  useEffect(() => {
    return subscribeInteractionRemovals(() => setPendingRemovalIds(getPendingRemovalIds()));
  }, []);

  // Update contact when initial object changes
  useEffect(() => {
    if (initial) {
      setContact((prev) => (prev?.id === initial.id ? { ...initial, ...prev } : initial));
    } else if (!contactId) {
      setContact(null);
    }
  }, [initial, contactId]);

  // Nine subscriptions
  useEffect(() => {
    if (!enabled || !contactId) {
      setInteractions([]);
      setPrayers([]);
      setActivities([]);
      setGatherings([]);
      setRhythms([]);
      setStages([]);
      setTeamMembers([]);
      setInteractionsLoading(false);
      setPrayersLoading(false);
      setActivitiesLoading(false);
      return;
    }

    setInteractionsLoading(true);
    setPrayersLoading(true);
    setActivitiesLoading(true);
    setError(null);

    const unsubs: (() => void)[] = [];

    const handleError = (err: any, op: OperationType, path: string) => {
      const errorObj = err instanceof Error ? err : new Error(String(err));
      setError(errorObj);
      handleFirestoreError(err, op, path);
    };

    // 1. Contact document
    try {
      const unsub = onSnapshot(
        doc(db, "contacts", contactId),
        (snap: any) => {
          if (snap && typeof snap.data === "function" && (snap.exists === undefined || snap.exists())) {
            setContact({ id: snap.id, ...snap.data() } as Contact);
          }
        },
        (err: any) => handleError(err, OperationType.GET, `contacts/${contactId}`)
      );
      if (unsub) unsubs.push(unsub);
    } catch (e) {
      handleError(e, OperationType.GET, `contacts/${contactId}`);
    }

    // 2. Interactions subcollection
    try {
      const interactionsRef = collection(db, "contacts", contactId, "interactions");
      const qInteractions = query(interactionsRef, orderBy("createdAt", "asc"));
      const unsub = onSnapshot(
        qInteractions,
        (snapshot: any) => {
          const list = snapshot.docs.map((d: any) => {
            const data = d.data();
            return {
              id: d.id,
              ...data,
              createdAt:
                data.createdAt instanceof Timestamp
                  ? data.createdAt.toDate().toISOString()
                  : data.createdAt,
            } as Interaction;
          });
          setInteractions(list);
          setInteractionsLoading(false);
        },
        (err: any) => {
          setInteractionsLoading(false);
          handleError(err, OperationType.LIST, `contacts/${contactId}/interactions`);
        }
      );
      if (unsub) unsubs.push(unsub);
    } catch (e) {
      setInteractionsLoading(false);
      handleError(e, OperationType.LIST, `contacts/${contactId}/interactions`);
    }

    // 3. Prayers
    try {
      const qPrayers = query(collection(db, "prayers"), where("contactId", "==", contactId));
      const unsub = onSnapshot(
        qPrayers,
        (snapshot: any) => {
          const list = snapshot.docs
            .map((d: any) => ({ id: d.id, ...d.data() }) as PrayerRecord)
            .sort((a: any, b: any) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
          setPrayers(list);
          setPrayersLoading(false);
        },
        (err: any) => {
          setPrayersLoading(false);
          handleError(err, OperationType.LIST, "prayers");
        }
      );
      if (unsub) unsubs.push(unsub);
    } catch (e) {
      setPrayersLoading(false);
      handleError(e, OperationType.LIST, "prayers");
    }

    // 4. Activities
    try {
      const qActivities = query(
        collection(db, "activities"),
        where("targetId", "==", contactId),
        orderBy("createdAt", "desc"),
        limit(50)
      );
      const unsub = onSnapshot(
        qActivities,
        (snapshot: any) => {
          const list = snapshot.docs.map((d: any) => ({ id: d.id, ...d.data() }) as SystemActivity);
          setActivities(list);
          setActivitiesLoading(false);
        },
        (err: any) => {
          setActivitiesLoading(false);
          handleError(err, OperationType.LIST, "activities");
        }
      );
      if (unsub) unsubs.push(unsub);
    } catch (e) {
      setActivitiesLoading(false);
      handleError(e, OperationType.LIST, "activities");
    }

    // 5. Events / Gatherings (attendance)
    try {
      const qEvents = query(collection(db, "events"), where("attendance.present", "array-contains", contactId));
      const unsub = onSnapshot(
        qEvents,
        (snapshot: any) => {
          setGatherings(snapshot.docs.map((d: any) => ({ id: d.id, ...d.data() }) as Gathering));
        },
        (err: any) => handleError(err, OperationType.LIST, "events")
      );
      if (unsub) unsubs.push(unsub);
    } catch (e) {
      handleError(e, OperationType.LIST, "events");
    }

    // 6. Rhythms
    try {
      const unsub = subscribeRhythms((list) => setRhythms(list));
      if (unsub) unsubs.push(unsub);
    } catch {
      // ignore
    }

    // 7. Threads (messages)
    try {
      const unsub = subscribeThreads(
        contactId,
        (msgs) => setInternalThreadMessages(msgs),
        undefined,
        { includeTeam }
      );
      if (unsub) unsubs.push(unsub);
    } catch {
      // ignore
    }

    // 8. Users (Team members)
    try {
      const unsub = onSnapshot(collection(db, "users"), (snap: any) => {
        if (!snap?.docs) return;
        const list = snap.docs.map((d: any) => {
          const data = d.data();
          const staffRoleDefault = t ? t("modals.contactDetails.staff_role", "Staff") : "Staff";
          const fullTimerDefault = t ? t("modals.contactDetails.full_timer", "Full-timer") : "Full-timer";
          const traineeDefault = t ? t("modals.contactDetails.trainee", "Trainee") : "Trainee";
          const name = data.name || data.displayName || data.email || staffRoleDefault;
          const parts = name.trim().split(/\s+/);
          const initials = parts.length >= 2 ? `${parts[0][0]}${parts[1][0]}`.toUpperCase() : name.slice(0, 2).toUpperCase();
          return {
            id: d.id,
            name,
            role: data.role === "admin" ? fullTimerDefault : data.role === "manager" ? traineeDefault : staffRoleDefault,
            initials,
            fullTimer: data.role === "admin",
          };
        });
        setTeamMembers(list);
      });
      if (unsub) unsubs.push(unsub);
    } catch {
      // ignore
    }

    // 9. Stages
    try {
      const qStages = query(collection(db, "stages"), orderBy("order", "asc"));
      getDocs(qStages)
        .then((snapshot: any) => {
          if (snapshot?.docs) {
            setStages(snapshot.docs.map((d: any) => ({ id: d.id, ...d.data() }) as Stage));
          }
        })
        .catch((err: any) => {
          handleError(err, OperationType.LIST, "stages");
        });
      const unsub = onSnapshot(
        qStages,
        (snapshot: any) => {
          if (!snapshot?.docs) return;
          setStages(snapshot.docs.map((d: any) => ({ id: d.id, ...d.data() }) as Stage));
        },
        (err: any) => {
          handleError(err, OperationType.LIST, "stages");
        }
      );
      if (unsub) unsubs.push(unsub);
    } catch (e) {
      handleError(e, OperationType.LIST, "stages");
    }

    return () => {
      unsubs.forEach((unsub) => {
        try {
          unsub();
        } catch {
          // ignore cleanup errors
        }
      });
    };
  }, [enabled, contactId]);

  // Chronological story timeline aggregation
  const story = useMemo(() => {
    if (!contact) return [];
    return buildContactStory({
      contact,
      interactions,
      prayers,
      activities,
      gatherings,
      rhythms,
      storyMessages: threadMessages,
      pendingRemovalIds,
    });
  }, [contact, interactions, prayers, activities, gatherings, rhythms, threadMessages, pendingRemovalIds]);

  // Overall loading state
  const loading = interactionsLoading || prayersLoading || activitiesLoading;

  // Actions
  const currentContactRef = useRef<Contact | null>(contact);
  useEffect(() => {
    currentContactRef.current = contact;
  }, [contact]);

  const toggleStoryMessage = useCallback(
    async (message: ThreadMessage | { id: string }) => {
      const c = currentContactRef.current;
      if (!c?.id) return;
      const ids = c.storyMessageIds ?? [];
      const inStory = ids.includes(message.id);
      await updateDoc(doc(db, "contacts", c.id), {
        storyMessageIds: inStory ? arrayRemove(message.id) : arrayUnion(message.id),
      });
    },
    []
  );

  const removeInteraction = useCallback(
    (interaction: Interaction, options?: { onUndo?: (cancel: () => void) => void }) => {
      const c = currentContactRef.current;
      if (!c?.id) return;
      if (options?.onUndo) {
        options.onUndo(() => cancelInteractionRemoval(interaction.id));
      }
      scheduleInteractionRemoval(interaction.id, () => {
        deleteDoc(doc(db, "contacts", c.id, "interactions", interaction.id))
          .then(() =>
            logActivity({
              action: "deleted an interaction for",
              targetId: c.id,
              targetName: c.name,
              targetType: "contact",
              type: "edit",
              description: interaction.content?.trim() || "",
            })
          )
          .catch((e) =>
            handleFirestoreError(e, OperationType.DELETE, `contacts/${c.id}/interactions/${interaction.id}`)
          );
      });
    },
    []
  );

  const updateInteraction = useCallback(
    async (interactionId: string, data: { content: string; dateTime?: string; type?: string }) => {
      const c = currentContactRef.current;
      if (!c?.id) return;
      const updateData: any = {
        content: data.content,
      };
      if (data.dateTime) updateData.dateTime = data.dateTime;
      if (data.type) updateData.type = data.type;

      await updateDoc(doc(db, "contacts", c.id, "interactions", interactionId), updateData);
      await logActivity({
        action: "updated an interaction for",
        targetId: c.id,
        targetName: c.name,
        targetType: "contact",
        type: "edit",
        description: data.content.trim(),
      });
    },
    []
  );

  const addInteraction = useCallback(
    async (data: {
      content: string;
      dateTime?: string;
      type?: string;
      userId: string;
      userName: string;
      userPhoto?: string;
      reacher?: { id: string; name: string } | null;
      t?: (key: string, fallback?: string) => string;
    }) => {
      const c = currentContactRef.current;
      if (!c?.id) return;
      const interactionsRef = collection(db, "contacts", c.id, "interactions");
      await addDoc(interactionsRef, {
        userId: data.userId,
        userName: data.userName,
        userPhoto: data.userPhoto || "",
        ...(data.reacher ? { reachedById: data.reacher.id, reachedByName: data.reacher.name } : {}),
        content: data.content,
        dateTime: data.dateTime || new Date().toISOString(),
        type: data.type || "interaction",
        createdAt: serverTimestamp(),
      });

      const activityPatch = buildContactActivityPatch({
        date: data.dateTime || new Date().toISOString(),
        by: { uid: data.userId, name: data.userName },
        ...(data.reacher ? { reacher: { uid: data.reacher.id, name: data.reacher.name } } : {}),
        type: "interaction",
      });
      await updateDoc(doc(db, "contacts", c.id), activityPatch as Record<string, unknown>);

      if (data.reacher) {
        sendNotification({
          userId: data.reacher.id,
          title: data.t ? data.t("modals.contactDetails.on_behalf_title") : "Logged on your behalf",
          message: data.t
            ? data.t("modals.contactDetails.on_behalf_message")
                .replace("{logger}", data.userName)
                .replace("{name}", c.name)
            : `${data.userName} logged an interaction with ${c.name} on your behalf.`,
          type: "info",
          targetId: c.id,
          link: `/people/${c.id}`,
        });
      }

      await logActivity({
        action: "logged an interaction for",
        targetId: c.id,
        targetName: c.name,
        targetType: "contact",
        type:
          data.type === "meeting"
            ? "event"
            : data.type === "chat"
              ? "comment"
              : ((data.type || "interaction") as SystemActivity["type"]),
        description: data.content,
      });
    },
    []
  );

  const addPrayer = useCallback(
    async (data: {
      text: string;
      context?: string;
      userId?: string;
      userName?: string;
    }) => {
      const c = currentContactRef.current;
      if (!c?.id) return;
      const burden = joinPrayerBurden(data.text, data.context || "");
      const now = new Date().toISOString();
      await addDoc(collection(db, "prayers"), {
        contactId: c.id,
        date: now,
        burden,
        status: "pending",
        teamPrayer: false,
        updatedAt: now,
        updatedBy: data.userId || "",
        updatedByName: data.userName || "Unknown",
      });

      await logActivity({
        action: "added a prayer burden for",
        targetId: c.id,
        targetName: c.name,
        targetType: "contact",
        type: "comment",
        description: data.text.trim(),
      });
    },
    []
  );

  const updatePrayerStatus = useCallback(
    async (prayer: PrayerRecord, status: PrayerRecord["status"], answeredAtText?: string) => {
      const c = currentContactRef.current;
      if (!c?.id) return;
      const updateData: any = {
        status,
        updatedAt: new Date().toISOString(),
      };
      if (status === "answered" && answeredAtText) {
        updateData.answeredAt = answeredAtText;
      }

      await updateDoc(doc(db, "prayers", prayer.id), updateData);
      await logActivity({
        action: `marked a prayer burden as ${status} for`,
        targetId: c.id,
        targetName: c.name,
        targetType: "contact",
        type: "edit",
        description: `Status changed to ${status}`,
      });
    },
    []
  );

  // Rewrites a prayer's words from the story (#1674). Status is left alone.
  const updatePrayerBurden = useCallback(
    async (
      prayer: PrayerRecord,
      words: { text: string; context: string },
      by: { uid?: string | null; name?: string | null },
    ) => {
      const c = currentContactRef.current;
      if (!c?.id) return;
      await updateDoc(doc(db, "prayers", prayer.id), {
        burden: joinPrayerBurden(words.text, words.context),
        updatedAt: new Date().toISOString(),
        updatedBy: by.uid || null,
        updatedByName: by.name || null,
      });
      await logActivity({
        action: "edited a prayer burden for",
        targetId: c.id,
        targetName: c.name,
        targetType: "contact",
        type: "edit",
        description: words.text.trim(),
      });
    },
    []
  );

  const moveStage = useCallback(
    async (newStage: string, meta?: { oldStage?: string; userName?: string; userId?: string }) => {
      const c = currentContactRef.current;
      if (!c?.id) return;
      const oldStage = meta?.oldStage ?? c.stage ?? "";
      if (newStage === oldStage) return;
      const now = new Date().toISOString();
      await updateDoc(doc(db, "contacts", c.id), {
        stage: newStage,
        updatedAt: now,
        updatedBy: meta?.userId,
        updatedByName: meta?.userName,
      });
      const change = `stage: "${oldStage}" → "${newStage}"`;
      await logActivity({
        action: `updated ${change} for`,
        targetId: c.id,
        targetName: c.name,
        targetType: "contact",
        type: "edit",
        userName: meta?.userName,
        description: change,
      } as any);
    },
    []
  );

  const changeKind = useCallback(
    async (
      kind: ContactKind,
      meta?: {
        userName?: string;
        userId?: string;
        kindLabelBefore?: string;
        kindLabelAfter?: string;
      }
    ) => {
      const c = currentContactRef.current;
      if (!c?.id) return;
      const fields =
        kind === "contact"
          ? { inChurchLife: false }
          : { inChurchLife: true, isStudent: kind === "our-own" };
      const now = new Date().toISOString();
      await updateDoc(doc(db, "contacts", c.id), {
        ...fields,
        kindSetBy: meta?.userId,
        kindSetAt: now,
        updatedAt: now,
        updatedBy: meta?.userId,
        updatedByName: meta?.userName,
      });
      c.inChurchLife = fields.inChurchLife;
      if ("isStudent" in fields) c.isStudent = fields.isStudent;
      const labelBefore = meta?.kindLabelBefore ?? contactKind(c);
      const labelAfter = meta?.kindLabelAfter ?? kind;
      const change = `kind: "${labelBefore}" → "${labelAfter}"`;
      await logActivity({
        action: `updated ${change} for`,
        targetId: c.id,
        targetName: c.name,
        targetType: "contact",
        type: "edit",
        description: change,
      } as any);
    },
    []
  );

  const updateContact = useCallback(async (data: Partial<Contact>) => {
    const c = currentContactRef.current;
    if (!c?.id) return;
    await updateDoc(doc(db, "contacts", c.id), {
      ...data,
      updatedAt: serverTimestamp(),
    });
  }, []);

  const addShare = useCallback(async (staffId: string, meta?: { staffName?: string }) => {
    const c = currentContactRef.current;
    if (!c?.id) return;
    const nextCoCreators = [...(c.coCreators || []), staffId];
    const nextVisibleTo = visibleToOf({ ...c, coCreators: nextCoCreators });
    await updateDoc(doc(db, "contacts", c.id), {
      coCreators: arrayUnion(staffId),
      visibleTo: nextVisibleTo,
    });
    c.coCreators = nextCoCreators;
    c.visibleTo = nextVisibleTo;
    setContact({ ...c, coCreators: nextCoCreators, visibleTo: nextVisibleTo });
    if (meta?.staffName) {
      await logActivity({
        action: "shared a person",
        targetId: c.id,
        targetName: `${meta.staffName} can now see ${c.name.split(" ")[0]}.`,
        targetType: "contact",
        type: "edit",
        description: `Granted view access to ${meta.staffName}`,
      });
    }
  }, []);

  const removeShare = useCallback(async (staffId: string, meta?: { staffName?: string }) => {
    const c = currentContactRef.current;
    if (!c?.id) return;
    const isFounder = (c.founders || []).includes(staffId);
    const nextCoCreators = (c.coCreators || []).filter((x) => x !== staffId);
    const nextFounders = isFounder
      ? (c.founders || []).filter((x) => x !== staffId)
      : c.founders || [];
    const nextCarers = carersAfterCollaboratorRemoval(
      { ...c, coCreators: nextCoCreators, founders: nextFounders },
      staffId,
    );
    const nextVisibleTo = visibleToOf({
      ...c,
      coCreators: nextCoCreators,
      founders: nextFounders,
      carers: nextCarers,
    });
    const patch: Record<string, unknown> = {
      coCreators: arrayRemove(staffId),
      visibleTo: nextVisibleTo,
    };
    if (isFounder) patch.founders = arrayRemove(staffId);
    if ((c.carers || []).includes(staffId) && !nextCarers.includes(staffId)) {
      patch.carers = arrayRemove(staffId);
    }
    await updateDoc(doc(db, "contacts", c.id), patch);
    c.coCreators = nextCoCreators;
    if (isFounder) c.founders = nextFounders;
    c.carers = nextCarers;
    c.visibleTo = nextVisibleTo;
    setContact({
      ...c,
      coCreators: nextCoCreators,
      founders: nextFounders,
      carers: nextCarers,
      visibleTo: nextVisibleTo,
    });
    if (meta?.staffName) {
      await logActivity({
        action: "unshared a person",
        targetId: c.id,
        targetName: `${meta.staffName} no longer sees ${c.name.split(" ")[0]}.`,
        targetType: "contact",
        type: "edit",
        description: `Removed view access for ${meta.staffName}`,
      });
    }
  }, []);

  const reassignCreator = useCallback(
    async (newStaffId: string, meta?: { newStaffName?: string; oldStaffName?: string }) => {
      const c = currentContactRef.current;
      if (!c?.id) return;
      const prevCreatorId = c.createdBy || c.addedBy || "";
      const prevCoCreators = c.coCreators || [];
      const withoutNew = prevCoCreators.filter((id) => id !== newStaffId);
      const nextCoCreators = prevCreatorId && !withoutNew.includes(prevCreatorId)
        ? [...withoutNew, prevCreatorId]
        : withoutNew;

      const patch: any = {
        createdBy: newStaffId,
        addedBy: newStaffId,
        coCreators: nextCoCreators,
        updatedAt: serverTimestamp(),
      };
      if (meta?.newStaffName) patch.createdByName = meta.newStaffName;
      patch.visibleTo = visibleToOf({ ...c, ...patch });

      await updateDoc(doc(db, "contacts", c.id), patch);
      if (meta?.newStaffName && meta?.oldStaffName) {
        await logActivity({
          action: "reassigned creator for",
          targetId: c.id,
          targetName: c.name,
          targetType: "contact",
          type: "edit",
          description: `Reassigned creator from ${meta.oldStaffName} to ${meta.newStaffName}`,
        });
      }
    },
    []
  );

  const releaseContact = useCallback(
    async (currentUid: string, meta?: { userName?: string }) => {
      const c = currentContactRef.current;
      if (!c?.id || !currentUid) return;
      const nextUnfollowed = [...new Set([...(c.unfollowedBy || []), currentUid])];
      const nextCarers = (c.carers || []).filter((id) => id !== currentUid);
      const nextCoCreators = (c.coCreators || []).filter((id) => id !== currentUid);
      const isFounder = (c.founders || []).includes(currentUid);
      const nextFounders = isFounder
        ? (c.founders || []).filter((id) => id !== currentUid)
        : (c.founders || []);

      const nextContactState = {
        ...c,
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
        updatedByName: meta?.userName,
      };
      if ((c.carers || []).includes(currentUid)) {
        patch.carers = arrayRemove(currentUid);
      }
      if ((c.coCreators || []).includes(currentUid)) {
        patch.coCreators = arrayRemove(currentUid);
      }
      if (isFounder) {
        patch.founders = arrayRemove(currentUid);
      }

      await updateDoc(doc(db, "contacts", c.id), patch);
      c.unfollowedBy = nextUnfollowed;
      c.carers = nextCarers;
      c.coCreators = nextCoCreators;
      if (isFounder) c.founders = nextFounders;
      c.visibleTo = nextVisibleTo;
      setContact(nextContactState);

      await logActivity({
        action: "released a contact from queue",
        targetId: c.id,
        targetName: c.name,
        targetType: "contact",
        type: "edit",
        description: `Released ${c.name.split(" ")[0]} from personal queue`,
      });
    },
    []
  );

  const deleteContact = useCallback(async (meta?: { userName?: string }) => {
    const c = currentContactRef.current;
    if (!c?.id) return;
    await deleteDoc(doc(db, "contacts", c.id));
    await logActivity({
      action: "deleted contact",
      targetId: c.id,
      targetName: c.name,
      targetType: "contact",
      type: "edit",
      description: `Contact deleted by ${meta?.userName || "Staff"}`,
    });
  }, []);

  const actions = useMemo<ContactStoryActions>(
    () => ({
      toggleStoryMessage,
      removeInteraction,
      updateInteraction,
      addInteraction,
      addPrayer,
      updatePrayerStatus,
      updatePrayerBurden,
      moveStage,
      changeKind,
      updateContact,
      addShare,
      removeShare,
      reassignCreator,
      releaseContact,
      deleteContact,
    }),
    [
      toggleStoryMessage,
      removeInteraction,
      updateInteraction,
      addInteraction,
      addPrayer,
      updatePrayerStatus,
      updatePrayerBurden,
      moveStage,
      changeKind,
      updateContact,
      addShare,
      removeShare,
      reassignCreator,
      releaseContact,
      deleteContact,
    ]
  );

  return {
    story,
    contact,
    loading,
    error,
    actions,
    interactions,
    prayers,
    activities,
    gatherings,
    rhythms,
    stages,
    teamMembers,
    threadMessages,
    interactionsLoading,
    prayersLoading,
    activitiesLoading,
  };
}
