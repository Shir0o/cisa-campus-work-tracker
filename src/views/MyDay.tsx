import { useEffect, useMemo, useState } from "react";
import { useMediaQuery } from "../lib/useMediaQuery";
import MyDayMobile from "./MyDayMobile";
import {
  HeartHandshake,
  ClipboardList,
  Check,
  CheckSquare,
  Pencil,
  Plus,
  FileText,
  Trash2,
  X,
  Eye,
  EyeOff,
  MessageSquare,
} from "lucide-react";
import { motion } from "motion/react";
import { useNavigate } from "react-router-dom";
import { format, isValid } from "date-fns";
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  limit,
  where,
  collectionGroup,
} from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { cn } from "../lib/utils";
import { useAuth } from "../components/AuthProvider";
import { useLayout } from "../App";
import { Contact, PrayerRecord, Event, Stage } from "../types";
import { Skeleton } from "../components/ui/Skeleton";
import { DataLoadError } from "../components/ui/DataLoadError";
import ContactDetailsModal from "../components/modals/ContactDetailsModal";
import PageContainer from "../components/layout/PageContainer";
import {
  addTodo,
  updateTodo,
  setTodoDone,
  deleteTodo,
  dueChip,
  dueToneClass,
  DUE_PRESETS,
  duePresetToISO,
  presetForDue,
  type DuePresetKey,
} from "../lib/todos";
import {
  subscribeUserPreferences,
  saveUserPreferences,
  type DesktopMessagingApp,
} from "../lib/userPreferences";
import {
  subscribePersonalPrayers,
  addPersonalPrayer,
  updatePersonalPrayer,
  deletePersonalPrayer,
  type PersonalPrayer,
} from "../lib/personalPrayers";
import { updatePrayerStatus } from "../lib/prayers";
import { openMessage } from "../lib/messaging";
import {
  parseMs,
  daysSince,
  DAY_MS,
  editInputClass,
  dueLabelClass,
  cardClass,
  getGreeting,
} from "../components/landing/helpers";
import { Avatar, StageChip, SectionHead, Figure } from "../components/landing/primitives";
import {
  TeamPrayerRow,
  PersonalPrayerRow,
  AddPersonalPrayer,
} from "../components/landing/PrayerRows";
import { ReachCard } from "../components/landing/ReachCard";
import FromTraineesInbox from "../components/landing/FromTraineesInbox";
import { UndoSnackbar } from "../components/UndoSnackbar";
import { useUndoSnack } from "../hooks/useUndoSnack";

interface MyTask {
  id: string;
  title: string;
  dueDate?: string | null;
  status: "pending" | "completed" | "canceled";
  assigneeId?: string | null;
  createdById?: string | null;
  createdByName?: string | null;
  sourceDocId?: string | null;
  sourceDocTitle?: string | null;
  sourceInteractionId?: string | null;
  sourceInteractionTitle?: string | null;
}

// done first? then due ascending — the shared ordering for both task groups.
const taskSort = (a: MyTask, b: MyTask) => {
  const rank = (t: MyTask) => (t.status === "completed" ? 1 : 0);
  if (rank(a) !== rank(b)) return rank(a) - rank(b);
  return (parseMs(a.dueDate) ?? Infinity) - (parseMs(b.dueDate) ?? Infinity);
};

// ── Round check button — shared by the task rows ──
function CheckButton({ done, onClick }: { done: boolean; onClick: () => void }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={done ? "Done — tap to reopen" : "Mark done"}
      aria-pressed={done}
      aria-label={done ? "Mark not done" : "Mark done"}
      className={cn(
        "mt-0.5 w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition-colors",
        done ? "bg-primary border-primary text-on-primary" : "border-outline hover:border-primary",
      )}
    >
      {done && <Check className="w-3 h-3" />}
    </button>
  );
}

// ── Due-date preset pills (used inside the inline task editors) ──
function DuePresetPills({
  value,
  onPick,
}: {
  value: DuePresetKey;
  onPick: (key: DuePresetKey, days: number | null) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {DUE_PRESETS.map((p) => (
        <button
          key={p.key}
          type="button"
          onClick={() => onPick(p.key, p.days)}
          className={cn(
            "text-xs font-medium border rounded-full px-2.5 py-1 transition-colors",
            value === p.key
              ? "bg-primary text-on-primary border-primary"
              : "border-outline-variant text-on-surface hover:bg-surface-variant",
          )}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

// ── On the horizon: team todo row (has a source / assigned by others) ──
// Text is read-only here — the shared decision lives on The Board. Only the
// due date is adjustable, plus marking done.
function AssignedTaskRow({
  todo,
  first,
  onToggle,
  onJumpToSource,
  onUpdateDue,
}: {
  todo: MyTask;
  first: boolean;
  onToggle: (todo: MyTask) => void;
  onJumpToSource: (docId: string) => void;
  onUpdateDue: (todo: MyTask, days: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const done = todo.status === "completed";
  const due = done ? null : dueChip(todo.dueDate);
  const preset = presetForDue(todo.dueDate);

  return (
    <div
      className={cn(
        "py-4",
        !first && "border-t border-outline-variant/40",
        open && "bg-surface-variant/40 rounded-xl px-3 -mx-3",
      )}
    >
      <div className="flex items-start gap-3.5">
        <CheckButton done={done} onClick={() => onToggle(todo)} />
        <div className="min-w-0 flex-1 cursor-pointer" onClick={() => setOpen((o) => !o)}>
          <div
            className={cn(
              "text-on-surface font-medium leading-snug",
              done && "line-through text-on-surface-variant",
            )}
          >
            {todo.title}
          </div>

          {!open && todo.sourceDocId && todo.sourceDocTitle && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onJumpToSource(todo.sourceDocId as string);
              }}
              className="inline-flex items-center gap-1 mt-1 text-sm text-accent font-medium max-w-[18rem] hover:underline"
              title={todo.sourceDocTitle}
            >
              <FileText className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">From {todo.sourceDocTitle}</span>
            </button>
          )}

          {!open && !todo.sourceDocId && todo.sourceInteractionId && todo.sourceInteractionTitle && (
            <span className="inline-flex items-center gap-1 mt-1 text-sm text-accent font-medium max-w-[18rem]">
              <MessageSquare className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">From {todo.sourceInteractionTitle}</span>
            </span>
          )}

          {open && (
            <div className="mt-2.5 flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
              {todo.sourceDocId && (
                <div className="inline-flex flex-wrap items-center gap-1.5 text-xs text-on-surface-variant">
                  <FileText className="w-3 h-3 shrink-0" />
                  <span>To change the text,</span>
                  <button
                    type="button"
                    className="text-accent hover:underline"
                    onClick={() => {
                      onJumpToSource(todo.sourceDocId as string);
                      setOpen(false);
                    }}
                  >
                    open it on The Board
                  </button>
                </div>
              )}
              <div className={dueLabelClass}>Due</div>
              <DuePresetPills value={preset} onPick={(_k, days) => onUpdateDue(todo, days)} />
              <div className="flex">
                <div className="flex-1" />
                <button
                  type="button"
                  className="px-3 py-1.5 rounded-full text-sm text-on-surface hover:bg-surface-variant"
                  onClick={() => setOpen(false)}
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>

        {!open && due && (
          <span
            className={cn(
              "text-xs font-medium whitespace-nowrap shrink-0 mt-0.5",
              dueToneClass[due.tone],
            )}
          >
            {due.label}
          </span>
        )}
      </div>
    </div>
  );
}

// ── On the horizon: personal task row (your own, no source) ──
// Fully editable: text, due date, delete.
function PersonalTaskRow({
  todo,
  first,
  onToggle,
  onUpdate,
  onDelete,
}: {
  todo: MyTask;
  first: boolean;
  onToggle: (todo: MyTask) => void;
  onUpdate: (id: string, patch: { title?: string; dueDate?: string | null }) => void;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(todo.title);
  const [preset, setPreset] = useState<DuePresetKey>(() => presetForDue(todo.dueDate));
  const [dueDate, setDueDate] = useState<string | null | undefined>(todo.dueDate);
  const done = todo.status === "completed";
  const due = done ? null : dueChip(todo.dueDate);

  const openEdit = () => {
    setText(todo.title);
    setPreset(presetForDue(todo.dueDate));
    setDueDate(todo.dueDate);
    setOpen(true);
  };
  const save = () => {
    const t = text.trim();
    if (!t) return;
    onUpdate(todo.id, { title: t, dueDate: dueDate ?? null });
    setOpen(false);
  };

  return (
    <div
      className={cn(
        "py-4",
        !first && "border-t border-outline-variant/40",
        open && "bg-surface-variant/40 rounded-xl px-3 -mx-3",
      )}
    >
      <div className="flex items-start gap-3.5">
        <CheckButton done={done} onClick={() => onToggle(todo)} />
        <div
          className={cn("min-w-0 flex-1", !done && !open && "cursor-pointer")}
          onClick={() => !done && !open && openEdit()}
        >
          <div
            className={cn(
              "text-on-surface font-medium leading-snug",
              done && "line-through text-on-surface-variant",
            )}
          >
            {todo.title}
          </div>

          {open && (
            <div className="mt-2.5 flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
              <input
                autoFocus
                className={editInputClass}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") save();
                  if (e.key === "Escape") setOpen(false);
                }}
                placeholder="What needs doing?"
              />
              <div className={dueLabelClass}>Due</div>
              <DuePresetPills
                value={preset}
                onPick={(key, days) => {
                  setPreset(key);
                  setDueDate(duePresetToISO(days));
                }}
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-sm text-on-surface-variant hover:text-error transition-colors"
                  onClick={() => onDelete(todo.id)}
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </button>
                <div className="flex-1" />
                <button
                  type="button"
                  className="px-3 py-1.5 rounded-full text-sm text-on-surface hover:bg-surface-variant"
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!text.trim()}
                  className="px-3 py-1.5 rounded-full text-sm bg-primary text-on-primary disabled:opacity-50"
                  onClick={save}
                >
                  Save
                </button>
              </div>
            </div>
          )}
        </div>

        {!open && due && (
          <span
            className={cn(
              "text-xs font-medium whitespace-nowrap shrink-0 mt-0.5",
              dueToneClass[due.tone],
            )}
          >
            {due.label}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Inline composer for a new personal task ──
function AddTaskRow({
  onAdd,
  onClose,
}: {
  onAdd: (title: string, dueDate: string | null) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [preset, setPreset] = useState<DuePresetKey>("week");
  const [dueDate, setDueDate] = useState<string | null>(() => duePresetToISO(5));
  const commit = () => {
    const t = text.trim();
    if (!t) return;
    onAdd(t, dueDate);
    onClose();
  };
  return (
    <div className="py-4 border-t border-outline-variant/40 flex flex-col gap-2">
      <input
        autoFocus
        className={editInputClass}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") onClose();
        }}
        placeholder="What needs doing?"
      />
      <div className={dueLabelClass}>Due</div>
      <DuePresetPills
        value={preset}
        onPick={(key, days) => {
          setPreset(key);
          setDueDate(duePresetToISO(days));
        }}
      />
      <div className="flex items-center gap-2">
        <div className="flex-1" />
        <button
          type="button"
          className="px-3 py-1.5 rounded-full text-sm text-on-surface hover:bg-surface-variant"
          onClick={onClose}
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!text.trim()}
          className="px-3 py-1.5 rounded-full text-sm bg-primary text-on-primary disabled:opacity-50"
          onClick={commit}
        >
          Add
        </button>
      </div>
    </div>
  );
}

export default function MyDay() {
  const { user } = useAuth();
  const { setSelectedContact: setGlobalSelectedContact } = useLayout();
  const isMobile = useMediaQuery("(max-width: 768px)");
  const navigate = useNavigate();
  const firstName = user?.displayName?.split(" ")[0] || "friend";
  const uid = user?.uid;

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [prayers, setPrayers] = useState<PrayerRecord[]>([]);
  const [tasks, setTasks] = useState<MyTask[]>([]);
  const [touches, setTouches] = useState<{ contactId: string; ms: number; note: string }[]>([]);
  const [personalPrayers, setPersonalPrayers] = useState<PersonalPrayer[]>([]);
  const [prefContactIds, setPrefContactIds] = useState<string[] | null>(null);
  const [desktopMessagingApp, setDesktopMessagingApp] = useState<DesktopMessagingApp | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Clear state before handleFirestoreError (which throws), so the skeleton always
  // clears and the failure surfaces instead of a stuck/partial view.
  const onLoadError = (e: unknown, path: string) => {
    setError("your day");
    setLoading(false);
    handleFirestoreError(e, OperationType.LIST, path);
  };

  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [initialTab, setInitialTab] = useState<"thread" | undefined>(undefined);
  const [initialInteractionId, setInitialInteractionId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [addingTask, setAddingTask] = useState(false);
  const [hideCompleted, setHideCompleted] = useState(true);

  const { undoSnack, showUndoSnack, closeUndoSnack } = useUndoSnack();

  const handleUpdatePersonalPrayer = async (id: string, patch: any) => {
    if (!uid) return;
    const oldPrayer = personalPrayers.find(p => p.id === id);
    if (patch.status === "archived" && oldPrayer && oldPrayer.status !== "archived") {
      const previousStatus = oldPrayer.status;
      await updatePersonalPrayer(uid, id, patch);
      showUndoSnack("Personal prayer archived", () => {
        updatePersonalPrayer(uid, id, { status: previousStatus });
      });
    } else {
      await updatePersonalPrayer(uid, id, patch);
    }
  };

  const handleUpdatePrayerStatus = async (id: string, status: PrayerRecord["status"], answer?: string, answeredAt?: string) => {
    const oldPrayer = prayers.find(p => p.id === id);
    if (status === "unanswered" && oldPrayer && oldPrayer.status !== "unanswered") {
      const previousStatus = oldPrayer.status;
      const previousAnswer = oldPrayer.answer;
      const previousAnsweredAt = oldPrayer.answeredAt;
      await updatePrayerStatus(id, status, { uid, name: user?.displayName }, answer, answeredAt);
      showUndoSnack("Prayer archived", () => {
        updatePrayerStatus(id, previousStatus, { uid, name: user?.displayName }, previousAnswer || undefined, previousAnsweredAt || undefined);
      });
    } else {
      await updatePrayerStatus(id, status, { uid, name: user?.displayName }, answer, answeredAt);
    }
  };

  useEffect(() => {
    const unsubContacts = onSnapshot(
      query(collection(db, "contacts")),
      (snap) => {
        setContacts(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Contact[]);
        setLoading(false);
      },
      (e) => onLoadError(e, "contacts"),
    );

    const unsubStages = onSnapshot(
      query(collection(db, "stages"), orderBy("order", "asc")),
      (snap) => setStages(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Stage[]),
      (e) => onLoadError(e, "stages"),
    );

    const unsubEvents = onSnapshot(
      query(collection(db, "events")),
      (snap) => setEvents(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Event[]),
      (e) => onLoadError(e, "events"),
    );

    const unsubPrayers = onSnapshot(
      query(collection(db, "prayers")),
      (snap) => setPrayers(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as PrayerRecord[]),
      (e) => onLoadError(e, "prayers"),
    );

    // Last-touch signal: most recent interaction/comment per contact (createdAt is ISO or Timestamp).
    const ingest = (
      snap: { docs: { id: string; data: () => unknown; ref: { path: string } }[] },
      noteKey: "content" | "text",
    ) =>
      snap.docs.map((d) => {
        const data = d.data() as Record<string, unknown>;
        const rawDate = data.dateTime || data.createdAt || data.date;
        return {
          contactId: d.ref.path.split("/")[1],
          ms: parseMs(rawDate) ?? NaN,
          note: ((data[noteKey] as string) ?? "").trim(),
        };
      });

    let interactionTouches: { contactId: string; ms: number; note: string }[] = [];
    let commentTouches: { contactId: string; ms: number; note: string }[] = [];
    const publish = () =>
      setTouches([...interactionTouches, ...commentTouches].filter((t) => !Number.isNaN(t.ms)));

    const unsubInteractions = onSnapshot(
      query(collectionGroup(db, "interactions"), orderBy("createdAt", "desc"), limit(500)),
      (snap) => {
        interactionTouches = ingest(snap as never, "content");
        publish();
      },
      (e) => onLoadError(e, "interactions (collectionGroup)"),
    );

    const unsubComments = onSnapshot(
      query(collectionGroup(db, "comments"), orderBy("createdAt", "desc"), limit(500)),
      (snap) => {
        commentTouches = ingest(snap as never, "text");
        publish();
      },
      (e) => onLoadError(e, "comments (collectionGroup)"),
    );

    return () => {
      unsubContacts();
      unsubStages();
      unsubEvents();
      unsubPrayers();
      unsubInteractions();
      unsubComments();
    };
  }, []);

  // Tasks assigned to me, my preferences, and my personal prayers — depend on uid.
  useEffect(() => {
    if (!uid) return;
    const unsubTasks = onSnapshot(
      query(collection(db, "tasks"), where("assigneeId", "==", uid)),
      (snap) => setTasks(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as MyTask[]),
      (e) => onLoadError(e, "tasks"),
    );
    const unsubPrefs = subscribeUserPreferences(uid, (prefs) => {
      setPrefContactIds(prefs.personalContactIds ?? null);
      setDesktopMessagingApp(prefs.desktopMessagingApp);
    });
    const unsubPersonalPrayers = subscribePersonalPrayers(uid, setPersonalPrayers);
    return () => {
      unsubTasks();
      unsubPrefs();
      unsubPersonalPrayers();
    };
  }, [uid]);

  // most-recent touch (+ its note) per contact
  const lastTouchByContact = useMemo(() => {
    const map = new Map<string, { ms: number; note: string }>();
    for (const t of touches) {
      const cur = map.get(t.contactId);
      if (!cur || t.ms > cur.ms) map.set(t.contactId, { ms: t.ms, note: t.note });
    }
    return map;
  }, [touches]);

  // Contacts I created — the fallback "mine" set before any explicit picker choice.
  const myCreatedIds = useMemo(() => {
    const set = new Set<string>();
    for (const c of contacts) if (uid && c.createdBy === uid) set.add(c.id);
    return set;
  }, [contacts, uid]);

  // The effective personal-contacts set: explicit picker choice, else created-by-me.
  const personalContactIds = useMemo(
    () => (prefContactIds != null ? new Set(prefContactIds) : myCreatedIds),
    [prefContactIds, myCreatedIds],
  );

  // Leaders I'm caring for — my personal contacts, longest-since-connected first.
  const myLeaders = useMemo(() => {
    return contacts
      .filter((c) => personalContactIds.has(c.id))
      .map((c) => {
        const touch = lastTouchByContact.get(c.id);
        const contactLastMs = parseMs(c.lastContactedDate) ?? parseMs(c.lastSeen);
        const touchMs = touch?.ms;
        const bestMs = Math.max(touchMs ?? -Infinity, contactLastMs ?? -Infinity);
        const ms = Number.isFinite(bestMs) && bestMs > 0 ? bestMs : parseMs(c.createdAt);
        const days = ms == null ? Infinity : daysSince(ms);
        return { contact: c, days, note: touch?.note || c.notes || "" };
      })
      .sort((a, b) => b.days - a.days);
  }, [contacts, personalContactIds, lastTouchByContact]);

  // The leader I've gone longest without sitting with (for the prose nudge).
  const staleLeader = useMemo(
    () => myLeaders.find((l) => Number.isFinite(l.days) && l.days >= 7),
    [myLeaders],
  );

  // On the horizon — two tiers. Team todos have a source (or were assigned by
  // someone else); personal tasks are your own, sourceless. Completed tasks can
  // be hidden from both tiers via the "Hide completed" toggle.
  const activeTasks = useMemo(() => tasks.filter((t) => t.status !== "canceled"), [tasks]);
  const completedCount = useMemo(
    () => activeTasks.filter((t) => t.status === "completed").length,
    [activeTasks],
  );
  const visibleTasks = useMemo(
    () => activeTasks.filter((t) => !hideCompleted || t.status !== "completed"),
    [activeTasks, hideCompleted],
  );
  const assignedTasks = useMemo(
    () => visibleTasks.filter((t) => t.sourceDocId || t.createdById !== uid).sort(taskSort),
    [visibleTasks, uid],
  );
  const personalTasks = useMemo(
    () => visibleTasks.filter((t) => !t.sourceDocId && t.createdById === uid).sort(taskSort),
    [visibleTasks, uid],
  );
  const leftToDo = useMemo(
    () => activeTasks.filter((t) => t.status === "pending").length,
    [activeTasks],
  );

  // This week — events dated within the next 7 days, soonest first.
  const thisWeek = useMemo(() => {
    const now = Date.now();
    const horizon = now + 7 * DAY_MS;
    return events
      .map((ev) => ({ ev, ms: parseMs(ev.date) }))
      .filter((x): x is { ev: Event; ms: number } => x.ms != null)
      .filter((x) => x.ms >= now - DAY_MS && x.ms <= horizon)
      .sort((a, b) => a.ms - b.ms || (a.ev.order ?? 0) - (b.ev.order ?? 0));
  }, [events]);

  // Contact (corporate) prayers — shared prayers on my personal contacts that
  // aren't archived (unanswered = archived-equivalent), oldest first.
  const contactPrayers = useMemo(
    () =>
      prayers
        .filter((p) => p.contactId && personalContactIds.has(p.contactId) && p.status !== "unanswered")
        .sort((a, b) => (parseMs(a.date) ?? 0) - (parseMs(b.date) ?? 0)),
    [prayers, personalContactIds],
  );
  // Personal prayers — mine, not archived (already date-sorted by the query).
  const activePersonalPrayers = useMemo(
    () => personalPrayers.filter((p) => p.status !== "archived"),
    [personalPrayers],
  );
  const prayersCount = contactPrayers.length + activePersonalPrayers.length;

  const contactById = (id?: string) => contacts.find((c) => c.id === id);

  const openContact = (
    c: Contact | undefined | null,
    opts?: { tab?: "thread"; interactionId?: string | null },
  ) => {
    if (!c) return;
    if (setGlobalSelectedContact) {
      setGlobalSelectedContact(c);
    } else {
      setSelectedContact(c);
      setInitialTab(opts?.tab);
      setInitialInteractionId(opts?.interactionId ?? null);
      setIsDetailsModalOpen(true);
    }
  };

  const togglePersonalContact = (id: string) => {
    if (!uid) return;
    const next = new Set(personalContactIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    saveUserPreferences(uid, { personalContactIds: [...next] });
  };

  const jumpToSource = (docId: string) =>
    navigate("/coordination", { state: { focusDocId: docId } });

  if (error) {
    return <DataLoadError label={error} />;
  }

  if (isMobile && !loading && !error) {
    return (
      <>
        <MyDayMobile
          contacts={contacts}
          events={events}
          prayers={prayers}
          stages={stages}
          uid={uid}
          myLeaders={myLeaders}
          staleLeader={staleLeader}
          assignedTasks={assignedTasks}
          personalTasks={personalTasks}
          contactPrayers={contactPrayers}
          activePersonalPrayers={activePersonalPrayers}
          thisWeek={thisWeek}
          leftToDo={leftToDo}
          prayersCount={prayersCount}
          personalContactIds={personalContactIds}
          onOpenContact={openContact}
          onToggleTask={(todo) => setTodoDone(todo.id, todo.status !== "completed")}
          onUpdateTaskDue={(todo, days) => updateTodo(todo.id, { dueDate: duePresetToISO(days) })}
          onUpdatePersonalTask={(id, patch) => updateTodo(id, patch)}
          onDeletePersonalTask={(id) => deleteTodo(id)}
          hideCompleted={hideCompleted}
          onToggleHideCompleted={() => setHideCompleted((h) => !h)}
          hasCompleted={completedCount > 0}
          onAddPersonalTask={(title, dueDate) =>
            uid &&
            addTodo(
              { title, assigneeId: uid, dueDate, source: null },
              { uid, name: user?.displayName || "" },
            )
          }
          onUpdatePrayerStatus={handleUpdatePrayerStatus}
          onUpdatePersonalPrayer={handleUpdatePersonalPrayer}
          onDeletePersonalPrayer={(id) => uid && deletePersonalPrayer(uid, id)}
          onAddPersonalPrayer={(title, contactId) => uid && addPersonalPrayer(uid, { title, contactId })}
          onTogglePersonalContact={togglePersonalContact}
          onMessage={(contact) => openMessage(contact.phone, desktopMessagingApp)}
          onOpenBoard={() => navigate("/coordination")}
          onOpenPrayer={() => navigate("/prayer")}
        />
        <UndoSnackbar undoSnack={undoSnack} onClose={closeUndoSnack} />
      </>
    );
  }

  if (loading) {
    return (
      <PageContainer variant="wide" className="space-y-8 animate-pulse">
        <div className="space-y-3">
          <Skeleton className="h-4 w-64 opacity-70" />
          <Skeleton className="h-10 w-72" />
          <Skeleton className="h-16 w-full max-w-2xl opacity-70" />
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-2xl" />
          ))}
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer variant="wide">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
      >
        {/* ── Greeting + the state of your own day, in prose ── */}
        <header className="flex flex-col sm:flex-row sm:items-end gap-4 sm:gap-6">
          <div className="flex-1">
            <p className="text-sm text-on-surface-variant">
              {format(new Date(), "EEEE, MMMM d")} · Your day
            </p>
            <h1 className="font-serif text-3xl sm:text-4xl text-on-surface mt-1">
              {getGreeting()}, {firstName}.
            </h1>
            <p className="text-base text-on-surface-variant leading-relaxed mt-3 max-w-2xl">
              You're working closely with{" "}
              <b className="text-on-surface font-semibold">
                {myLeaders.length} {myLeaders.length === 1 ? "contact" : "contacts"}
              </b>{" "}
              this season, and there {leftToDo === 1 ? "is" : "are"}{" "}
              <span className="text-on-surface font-medium">{leftToDo}</span>{" "}
              {leftToDo === 1 ? "thing" : "things"} that {leftToDo === 1 ? "is" : "are"} yours to
              tend before the week is out.
              {staleLeader && (
                <>
                  {" "}
                  It's been{" "}
                  <b className="text-on-surface font-semibold">
                    {Math.max(1, Math.round(staleLeader.days / 7))} weeks
                  </b>{" "}
                  since you sat with {staleLeader.contact.name.split(" ")[0]} — maybe today.
                </>
              )}{" "}
              And <span className="text-on-surface font-medium">{prayersCount}</span>{" "}
              {prayersCount === 1 ? "prayer" : "prayers"} to hold.
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => navigate("/prayer")}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-outline-variant text-sm font-medium text-on-surface hover:bg-surface-variant transition-colors"
            >
              <HeartHandshake className="w-4 h-4" /> Pray together
            </button>
            <button
              onClick={() => navigate("/coordination")}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary text-on-primary text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <ClipboardList className="w-4 h-4" /> The team's board
            </button>
          </div>
        </header>

        {/* ── From the team — the full-timer inbox ── */}
        {uid && (
          <FromTraineesInbox meUid={uid} contacts={contacts} onOpenContact={openContact} />
        )}

        {/* ── Top Bento Row: Next Up Card + Figures Card ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-8">
          {/* Next up solid violet card */}
          <div className="lg:col-span-6 rounded-3xl p-6 text-white bg-accent-strong flex flex-col justify-between shadow-xs">
            {thisWeek.length > 0 ? (() => {
              const [{ ev: lead, ms: leadMs }] = thisWeek;
              const d = new Date(leadMs);
              const facts = [lead.type, lead.location].filter(Boolean) as string[];
              return (
                <>
                  <div>
                    <div className="text-xs font-medium text-white/75">
                      Next up · {isValid(d) ? format(d, "EEEE, MMM d") : "This week"}
                      {lead.location ? ` · ${lead.location}` : ""}
                    </div>
                    <h3 className="text-2xl font-semibold text-white mt-2">{lead.name}</h3>
                    <p className="text-sm text-white/80 leading-relaxed mt-1.5 max-w-2xl">
                      A good chance to be present with the people in your care.
                    </p>
                  </div>
                  {facts.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-4">
                      {facts.map((f) => (
                        <span
                          key={f}
                          className="text-xs text-white/85 bg-white/15 border border-white/20 rounded-full px-3 py-1"
                        >
                          {f}
                        </span>
                      ))}
                    </div>
                  )}
                </>
              );
            })() : (
              <div>
                <div className="text-xs font-medium text-white/75">This week</div>
                <h3 className="text-2xl font-semibold text-white mt-2">All clear this week</h3>
                <p className="text-sm text-white/80 leading-relaxed mt-1.5">
                  No gatherings scheduled.
                </p>
              </div>
            )}
          </div>

          {/* Figures card */}
          <div className="lg:col-span-6 bg-surface rounded-3xl border border-outline-variant/60 p-6 flex flex-col justify-between gap-4">
            <div className="flex flex-wrap items-baseline gap-x-8 gap-y-4">
              <Figure n={myLeaders.length} label="contacts in care" />
              <Figure n={prayersCount} label="prayers to hold" />
              <Figure n={leftToDo} label="tasks to hold" />
              <Figure n={thisWeek.length} label="gatherings this week" />
            </div>
            <span className="text-xs text-on-surface-variant/80 italic mt-2">
              Numbers are just a way of noticing people.
            </span>
          </div>
        </div>

        {/* ── Two-Column Bento Grid: Left (Horizon + Prayers) & Right (Your Sheep + Week) ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-10 items-start">
          {/* ── Left Column: On the horizon + Your prayers ── */}
          <div className="flex flex-col gap-10 min-w-0">
            {/* On the horizon */}
            <section>
              <SectionHead
                title="On the horizon"
                sub={
                  leftToDo > 0
                    ? `${leftToDo} small ${leftToDo === 1 ? "thing" : "things"} this week.`
                    : "All clear — nothing waiting on you."
                }
                action={
                  completedCount > 0 ? (
                    <button
                      onClick={() => setHideCompleted((h) => !h)}
                      title={hideCompleted ? "Show completed tasks" : "Hide completed tasks"}
                      aria-pressed={hideCompleted}
                      className="text-sm font-medium text-on-surface-variant hover:text-accent inline-flex items-center gap-1 cursor-pointer"
                    >
                      {hideCompleted ? (
                        <EyeOff className="w-3.5 h-3.5" />
                      ) : (
                        <Eye className="w-3.5 h-3.5" />
                      )}
                      {hideCompleted ? "Show completed" : "Hide completed"}
                    </button>
                  ) : undefined
                }
              />
              <div className={cardClass}>
                {assignedTasks.length > 0 && (
                  <div className="pt-2">
                    <div className="inline-flex items-center gap-1.5 text-xs font-medium text-on-surface-variant py-2">
                      <CheckSquare className="w-3 h-3" /> Assigned to you
                    </div>
                    {assignedTasks.map((t, i) => (
                      <AssignedTaskRow
                        key={t.id}
                        todo={t}
                        first={i === 0}
                        onToggle={(todo) => setTodoDone(todo.id, todo.status !== "completed")}
                        onJumpToSource={jumpToSource}
                        onUpdateDue={(todo, days) =>
                          updateTodo(todo.id, { dueDate: duePresetToISO(days) })
                        }
                      />
                    ))}
                  </div>
                )}
                {personalTasks.length > 0 && (
                  <div
                    className={cn(
                      "pt-2",
                      assignedTasks.length > 0 && "border-t border-outline-variant/40 mt-1",
                    )}
                  >
                    {assignedTasks.length > 0 && (
                      <div className="inline-flex items-center gap-1.5 text-xs font-medium text-on-surface-variant py-2">
                        <Pencil className="w-3 h-3" /> Your tasks
                      </div>
                    )}
                    {personalTasks.map((t, i) => (
                      <PersonalTaskRow
                        key={t.id}
                        todo={t}
                        first={i === 0}
                        onToggle={(todo) => setTodoDone(todo.id, todo.status !== "completed")}
                        onUpdate={(id, patch) => updateTodo(id, patch)}
                        onDelete={(id) => deleteTodo(id)}
                      />
                    ))}
                  </div>
                )}
                {assignedTasks.length === 0 && personalTasks.length === 0 && !addingTask && (
                  <p className="text-sm text-on-surface-variant py-4">
                    Nothing on the horizon right now — a rare, quiet moment.
                  </p>
                )}
                {addingTask ? (
                  <AddTaskRow
                    onAdd={(title, dueDate) =>
                      uid &&
                      addTodo(
                        { title, assigneeId: uid, dueDate, source: null },
                        { uid, name: user?.displayName || "" },
                      )
                    }
                    onClose={() => setAddingTask(false)}
                  />
                ) : (
                  <button
                    onClick={() => setAddingTask(true)}
                    className="inline-flex items-center gap-1.5 text-sm text-on-surface-variant hover:text-accent transition-colors py-3"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add a task
                  </button>
                )}
              </div>
            </section>

            {/* Prayers you're holding */}
            <section>
              <SectionHead
                title="Your prayers"
                sub={
                  <>
                    Prayers for the people you're personally caring for.{" "}
                    <button
                      onClick={() => navigate("/prayer")}
                      className="text-accent hover:underline"
                    >
                      Team prayers →
                    </button>
                  </>
                }
              />
              <div className={cardClass}>
                {contactPrayers.map((p, i) => (
                  <TeamPrayerRow
                    key={p.id}
                    prayer={p}
                    contact={contactById(p.contactId)}
                    first={i === 0}
                    onUpdateStatus={handleUpdatePrayerStatus}
                    onOpenContact={openContact}
                    onOpenPrayerLog={() => navigate("/prayer")}
                  />
                ))}
                {activePersonalPrayers.map((p, i) => (
                  <PersonalPrayerRow
                    key={p.id}
                    prayer={p}
                    first={i === 0 && contactPrayers.length === 0}
                    contacts={contacts}
                    onUpdate={handleUpdatePersonalPrayer}
                    onDelete={(id) => uid && deletePersonalPrayer(uid, id)}
                    onOpenContact={openContact}
                  />
                ))}
                {contactPrayers.length === 0 && activePersonalPrayers.length === 0 && (
                  <p className="text-sm text-on-surface-variant py-4">
                    No prayers in your care right now.
                  </p>
                )}
                <AddPersonalPrayer
                  contacts={contacts}
                  onAdd={(title, contactId) => uid && addPersonalPrayer(uid, { title, contactId })}
                />
              </div>
            </section>
          </div>

          {/* ── Right Column: Your sheep + Your week ── */}
          <div className="flex flex-col gap-10 min-w-0">
            {/* ── The leaders you're caring for (Your sheep) ── */}
            <section>
              <SectionHead
                title="Your sheep"
                sub="The contacts you are personally connected with."
                action={
                  <button
                    onClick={() => setPickerOpen(true)}
                    className="text-sm font-medium text-on-surface-variant hover:text-accent inline-flex items-center gap-1"
                  >
                    <Pencil className="w-3.5 h-3.5" /> Your contacts
                  </button>
                }
                linkLabel="See everyone"
                onLink={() => navigate("/directory")}
              />
              {myLeaders.length > 0 ? (
                <div className="flex flex-col gap-3">
                  {myLeaders.map(({ contact, days, note }) => (
                    <ReachCard
                      key={contact.id}
                      contact={contact}
                      days={days}
                      note={note}
                      stages={stages}
                      onOpen={() => openContact(contact)}
                      onMessage={() => openMessage(contact.phone, desktopMessagingApp)}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-on-surface-variant py-2">
                  No one's in your care yet — pick your contacts to gather them here.
                </p>
              )}
            </section>

            {/* ── Your week ── */}
            <section>
              <SectionHead
                title="Your week"
                sub="Where you're needed."
                linkLabel="Full calendar"
                onLink={() => navigate("/attendance")}
              />
              {thisWeek.length > 1 ? (
                <div className={cardClass}>
                  {thisWeek.slice(1).map(({ ev, ms }, i) => {
                    const rd = new Date(ms);
                    return (
                      <div
                        key={ev.id}
                        className={cn(
                          "flex items-center gap-4 py-4",
                          i > 0 && "border-t border-outline-variant/40",
                        )}
                      >
                        <div className="text-center w-11 shrink-0">
                          <div className="text-2xl font-semibold text-on-surface leading-none">
                            {isValid(rd) ? format(rd, "d") : "–"}
                          </div>
                          <div className="text-xs text-on-surface-variant mt-1">
                            {isValid(rd) ? format(rd, "MMM") : ""}
                          </div>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-on-surface truncate">{ev.name}</div>
                          <div className="text-xs text-on-surface-variant mt-0.5">
                            {isValid(rd) ? format(rd, "EEEE") : ""}
                            {ev.location ? ` · ${ev.location}` : ""}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-on-surface-variant py-2">
                  {thisWeek.length === 1 ? "That's everything on the calendar this week." : "Nothing on the calendar this week yet."}
                </p>
              )}
            </section>
          </div>
        </div>

        {/* ── Your-contacts picker ── */}
        {pickerOpen && (
          <div
            className="fixed inset-0 z-[200] bg-black/35 flex items-center justify-center p-4"
            onClick={() => setPickerOpen(false)}
          >
            <div
              className="bg-surface rounded-2xl shadow-2xl w-full max-w-md max-h-[72vh] flex flex-col overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 pt-5">
                <h3 className="font-serif text-lg text-on-surface">Your personal contacts</h3>
                <button
                  onClick={() => setPickerOpen(false)}
                  className="p-1.5 rounded-full text-on-surface-variant hover:bg-surface-variant transition-colors"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="px-5 mt-1.5 mb-3 text-sm text-on-surface-variant leading-relaxed">
                Prayers and reminders for these contacts appear in your day. Everyone is still
                visible on the People page.
              </p>
              <div className="overflow-y-auto px-3 pb-3 flex flex-col gap-0.5">
                {contacts.map((c) => {
                  const checked = personalContactIds.has(c.id);
                  return (
                    <label
                      key={c.id}
                      className={cn(
                        "flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors",
                        checked ? "bg-accent-soft" : "hover:bg-surface-variant",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => togglePersonalContact(c.id)}
                        className="accent-primary shrink-0"
                      />
                      <Avatar contact={c} size="sm" />
                      <span className="text-sm text-on-surface flex-1 min-w-0 truncate">
                        {c.name}
                      </span>
                      <StageChip stage={c.stage} stages={stages} />
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        <ContactDetailsModal
          isOpen={isDetailsModalOpen}
          onClose={() => setIsDetailsModalOpen(false)}
          contact={selectedContact}
          initialTab={initialTab}
          initialInteractionId={initialInteractionId}
        />
        <UndoSnackbar undoSnack={undoSnack} onClose={closeUndoSnack} />
      </motion.div>
    </PageContainer>
  );
}
