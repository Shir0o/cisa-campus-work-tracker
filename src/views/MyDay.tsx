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
import { Translate } from "../components/Translate";
import { useLanguage } from "../components/LanguageProvider";
import {
  useCalendarSync,
  calStartOfDay,
  calAddDays,
  type UnifiedGathering,
} from "../lib/calendar/calendarSync";
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
import { subscribeAllThreads } from "../lib/threads";
import { useDayGoal, goalNewToday } from "../lib/goal";
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
import AttentionFeed from "../components/landing/AttentionFeed";
import { subscribeInboxState } from "../lib/inboxState";
import AskStack from "../components/landing/AskStack";
import FirstRunCard from "../components/landing/FirstRunCard";
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
  const { t } = useLanguage();
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={done ? t('myDay.done_tap_reopen') : t('myDay.mark_done')}
      aria-pressed={done}
      aria-label={done ? t('myDay.mark_not_done') : t('myDay.mark_done')}
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
  const { t } = useLanguage();
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
          <Translate
            as="div"
            className={cn(
              "text-on-surface font-medium leading-snug",
              done && "line-through text-on-surface-variant",
            )}
            text={todo.title}
          />

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
              <span className="truncate">{t('myDay.from')} {todo.sourceDocTitle}</span>
            </button>
          )}

          {!open && !todo.sourceDocId && todo.sourceInteractionId && todo.sourceInteractionTitle && (
            <span className="inline-flex items-center gap-1 mt-1 text-sm text-accent font-medium max-w-[18rem]">
              <MessageSquare className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{t('myDay.from')} {todo.sourceInteractionTitle}</span>
            </span>
          )}

          {open && (
            <div className="mt-2.5 flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
              {todo.sourceDocId && (
                <div className="inline-flex flex-wrap items-center gap-1.5 text-xs text-on-surface-variant">
                  <FileText className="w-3 h-3 shrink-0" />
                  <span>{t('myDay.to_change_the_text')}</span>
                  <button
                    type="button"
                    className="text-accent hover:underline"
                    onClick={() => {
                      onJumpToSource(todo.sourceDocId as string);
                      setOpen(false);
                    }}
                  >
                    {t('myDay.open_it_on_the_board')}
                  </button>
                </div>
              )}
              <div className={dueLabelClass}>{t('myDay.due')}</div>
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
  const { t } = useLanguage();
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
          <Translate
            as="div"
            className={cn(
              "text-on-surface font-medium leading-snug",
              done && "line-through text-on-surface-variant",
            )}
            text={todo.title}
          />

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
                placeholder={t('myDay.what_needs_doing')}
              />
              <div className={dueLabelClass}>{t('myDay.due')}</div>
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
                  <Trash2 className="w-3.5 h-3.5" /> {t('actions.delete')}
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
  const { t } = useLanguage();
  const [text, setText] = useState("");
  const [preset, setPreset] = useState<DuePresetKey>("week");
  const [dueDate, setDueDate] = useState<string | null>(() => duePresetToISO(5));
  const commit = () => {
    const textValue = text.trim();
    if (!textValue) return;
    onAdd(textValue, dueDate);
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
        placeholder={t('myDay.what_needs_doing')}
      />
      <div className={dueLabelClass}>{t('myDay.due')}</div>
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
  const { user, role, effectiveUserId, effectiveUserName } = useAuth();
  const { t } = useLanguage();
  const { setSelectedContact: setGlobalSelectedContact } = useLayout();
  const isMobile = useMediaQuery("(max-width: 768px)");
  const navigate = useNavigate();
  const firstName = (effectiveUserName || user?.displayName || user?.email)?.split(" ")[0] || "friend";
  const uid = effectiveUserId || user?.uid;

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

  const { getMergedGatherings, getAwaySentence } = useCalendarSync(contacts);
  const calWeekFrom = useMemo(() => calStartOfDay(new Date()), []);
  const calWeekTo = useMemo(() => calAddDays(calWeekFrom, 8), [calWeekFrom]);

  // The day's goal (#544): the full-timer sees the day in aggregate — one
  // quiet figure, and only when there is one. Never a per-trainee column.
  const { goal } = useDayGoal();
  const newPeopleToday = useMemo(() => goalNewToday(contacts), [contacts]);

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
      showUndoSnack(t('myDay.personal_prayer_archived'), () => {
        updatePersonalPrayer(uid, id, { status: previousStatus });
      });
    } else {
      await updatePersonalPrayer(uid, id, patch);
    }
  };

  const handleUpdatePrayerStatus = async (id: string, status: PrayerRecord["status"], answer?: string, answeredAt?: string, archiveReason?: string) => {
    const oldPrayer = prayers.find(p => p.id === id);
    if (status === "unanswered" && oldPrayer && oldPrayer.status !== "unanswered") {
      const previousStatus = oldPrayer.status;
      const previousAnswer = oldPrayer.answer;
      const previousAnsweredAt = oldPrayer.answeredAt;
      const previousArchiveReason = oldPrayer.archiveReason;
      await updatePrayerStatus(id, status, { uid, name: user?.displayName }, answer, answeredAt, archiveReason);
      showUndoSnack(t('myDay.prayer_archived'), () => {
        updatePrayerStatus(id, previousStatus, { uid, name: user?.displayName }, previousAnswer || undefined, previousAnsweredAt || undefined, previousArchiveReason || undefined);
      });
    } else {
      await updatePrayerStatus(id, status, { uid, name: user?.displayName }, answer, answeredAt, archiveReason);
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

    const unsubThreads = subscribeAllThreads((messages) => {
      // Threads are the single per-person conversation surface. Team-scope
      // Discussion messages are Full-timer-only, so don't surface them as a
      // public "last connected" touch.
      commentTouches = messages
        .filter((m) => m.scope !== "team")
        .map((m) => ({
          contactId: m.contactId,
          ms: parseMs(m.at) ?? NaN,
          note: m.body.trim(),
        }));
      publish();
    });

    return () => {
      unsubContacts();
      unsubStages();
      unsubEvents();
      unsubPrayers();
      unsubInteractions();
      unsubThreads();
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
    // The My Day worklist's two axes, seen and completed (#813). Seeded from
    // whatever this browser already had, so nobody's history reappears as new
    // the first time the server document is written.
    const unsubInbox = subscribeInboxState(uid);
    return () => {
      unsubTasks();
      unsubPrefs();
      unsubPersonalPrayers();
      unsubInbox();
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

  // The picker shows checked (personal) contacts first, then the rest; both
  // groups alphabetical (#400).
  const pickerContacts = useMemo(() => {
    return [...contacts].sort((a, b) => {
      const aChecked = personalContactIds.has(a.id);
      const bChecked = personalContactIds.has(b.id);
      if (aChecked !== bChecked) return aChecked ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [contacts, personalContactIds]);

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

  // This week — unified calendar events & gatherings dated within the next 7 days.
  const thisWeek = useMemo(() => {
    return getMergedGatherings(events, calWeekFrom, calWeekTo);
  }, [getMergedGatherings, events, calWeekFrom, calWeekTo]);

  const awaySentence = useMemo(() => {
    return getAwaySentence(calWeekFrom, calWeekTo);
  }, [getAwaySentence, calWeekFrom, calWeekTo]);

  // Contact (corporate) prayers — shared prayers on my personal contacts that
  // are still open (not answered or archived), oldest first. #464 keeps home
  // focused on what we're still carrying.
  const contactPrayers = useMemo(
    () =>
      prayers
        .filter(
          (p) =>
            p.contactId &&
            personalContactIds.has(p.contactId) &&
            p.status !== "answered" &&
            p.status !== "unanswered",
        )
        .sort((a, b) => (parseMs(a.date) ?? 0) - (parseMs(b.date) ?? 0)),
    [prayers, personalContactIds],
  );
  // Personal prayers — mine, still open (not answered or archived). #464
  const activePersonalPrayers = useMemo(
    () =>
      personalPrayers.filter(
        (p) => p.status !== "answered" && p.status !== "archived",
      ),
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

  if (isMobile) {
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
          awaySentence={awaySentence}
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
          onOpenCalendar={() => navigate("/attendance")}
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
              {format(new Date(), 'EEEE, MMMM d')} · {t('myDay.your_day')}
            </p>
            <h1 className="font-serif text-3xl sm:text-4xl text-on-surface mt-1">
              {getGreeting()}, {firstName}.
            </h1>
            <p className="text-base text-on-surface-variant leading-relaxed mt-3 max-w-2xl">
              {t('myDay.working_closely')
                .replace('{contacts}', `${myLeaders.length} ${myLeaders.length === 1 ? t('myDay.contact') : t('myDay.contacts')}`)
                .replace('{isAre}', leftToDo === 1 ? t('myDay.is') : t('myDay.are'))
                .replace('{tasks}', String(leftToDo))
                .replace('{thingThings}', leftToDo === 1 ? t('myDay.thing') : t('myDay.things'))
                .replace('{isAre2}', leftToDo === 1 ? t('myDay.is') : t('myDay.are'))}
              {staleLeader && (
                <>{" "}{t('myDay.its_been_since')
                  .replace('{weeks}', `${Math.max(1, Math.round(staleLeader.days / 7))} ${Math.max(1, Math.round(staleLeader.days / 7)) === 1 ? t('myDay.week') : t('myDay.weeks')}`)
                  .replace('{name}', staleLeader.contact.name.split(" ")[0])}</>
              )}{" "}
              {t('myDay.and_prayers_to_hold')
                .replace('{prayers}', String(prayersCount))
                .replace('{unit}', prayersCount === 1 ? t('myDay.prayer') : t('myDay.prayers'))}
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => navigate("/prayer")}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-outline-variant text-sm font-medium text-on-surface hover:bg-surface-variant transition-colors"
            >
              <HeartHandshake className="w-4 h-4" /> {t('myDay.pray_together')}
            </button>
            <button
              onClick={() => navigate("/coordination")}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary text-on-primary text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <ClipboardList className="w-4 h-4" /> {t('myDay.the_teams_board')}
            </button>
          </div>
        </header>

        {/* ── Questions for the team — person-less trainee questions (#545) ── */}
        {uid && <AskStack className="mt-8" />}

        {/* ── Needs your attention — the unified attention feed ── */}
        {uid && (
          <AttentionFeed
            contacts={contacts}
            personalContactIds={personalContactIds}
            onOpenContact={openContact}
            className="mt-8"
          />
        )}

        {/* ── Top Bento Row: Next Up Card + Figures Card ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-8">
          {/* Next up — a solid accent card. The ink MUST be `accent-on`, not a
              literal white: `--accent-strong` is near-black in light and near-WHITE
              in dark, so hardcoded white text disappears entirely in dark mode.
              This card was the one place that still did it. docs/design/DRIFT.md #9. */}
          <div className="lg:col-span-6 rounded-3xl p-6 text-accent-on bg-accent-strong flex flex-col justify-between shadow-xs md-next">
            {thisWeek.length > 0 ? (() => {
              const lead = thisWeek[0];
              const d = new Date(lead.date);
              const facts = [lead.type, lead.time, lead.location].filter(Boolean) as string[];
              return (
                <>
                  <div>
                    <div className="text-xs font-medium text-accent-on/75 flex items-center gap-2">
                      <span>{t('myDay.next_up')} {isValid(d) ? format(d, 'EEEE, MMM d') : t('myDay.this_week')}</span>
                      {lead.synced && (
                        <span className="cal-mark s">{t('calendar.badge', 'calendar')}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2.5 mt-2">
                      <h3 className="text-2xl font-semibold text-accent-on truncate">{lead.title || lead.name}</h3>
                    </div>
                    <p className="text-sm text-accent-on/80 leading-relaxed mt-1.5 max-w-2xl">
                      {t('myDay.good_chance')}
                    </p>
                  </div>
                  {facts.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-4">
                      {facts.map((f) => (
                        <span
                          key={f}
                          className="text-xs text-accent-on/85 bg-accent-on/15 border border-accent-on/20 rounded-full px-3 py-1"
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
                <div className="text-xs font-medium text-accent-on/75">{t('myDay.this_week')}</div>
                <h3 className="text-2xl font-semibold text-accent-on mt-2">{t('myDay.all_clear_this_week')}</h3>
                <p className="text-sm text-accent-on/80 leading-relaxed mt-1.5">
                  {t('myDay.no_gatherings_scheduled')}
                </p>
              </div>
            )}
          </div>

          {/* Figures card */}
          <div className="lg:col-span-6 bg-surface rounded-3xl border border-outline-variant/60 p-6 flex flex-col justify-between gap-4">
            <div className="flex flex-wrap items-baseline gap-x-8 gap-y-4">
              <Figure n={myLeaders.length} label={t('myDay.contacts_in_care')} />
              <Figure n={prayersCount} label={t('myDay.prayers_to_hold')} />
              <Figure n={leftToDo} label={t('myDay.tasks_to_hold')} />
              <Figure n={thisWeek.length} label={t('myDay.gatherings_this_week')} />
              {role === 'admin' && goal.on && newPeopleToday > 0 && (
                <Figure
                  n={newPeopleToday}
                  label={t('myDay.new_people_today_across_team', 'new people today, across the team')}
                />
              )}
            </div>
            <span className="text-xs text-on-surface-variant/80 italic mt-2">
              {t('myDay.numbers_notice')}
            </span>
          </div>
        </div>

        <FirstRunCard
          role={role}
          userId={uid}
          context={{
            contactsCount: contacts.length,
            interactionsCount: touches.length,
            prayersCount: personalPrayers.length + prayers.length,
            todosCreatedCount: tasks.filter((t) => t.createdById === uid).length,
            todosCompletedCount: tasks.filter((t) => t.status === "completed").length,
            docsCount: 1,
            messagesCount: 1,
            feedbackCount: 0,
          }}
          className="mt-8"
        />

        {/* ── Two-Column Bento Grid: Left (Horizon + Prayers) & Right (Your Sheep + Week) ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-10 items-start">
          {/* ── Left Column: On the horizon + Your prayers ── */}
          <div className="flex flex-col gap-10 min-w-0">
            {/* On the horizon */}
            <section>
              <SectionHead
                title={t('myDay.on_the_horizon')}
                sub={
                  leftToDo > 0
                    ? t('myDay.small_things_this_week').replace('{n}', String(leftToDo))
                    : t('myDay.all_clear_nothing')
                }
                action={
                  completedCount > 0 ? (
                    <button
                      onClick={() => setHideCompleted((h) => !h)}
                      title={hideCompleted ? t('myDay.show_completed_tasks') : t('myDay.hide_completed_tasks')}
                      aria-pressed={hideCompleted}
                      className="text-sm font-medium text-on-surface-variant hover:text-accent inline-flex items-center gap-1 cursor-pointer"
                    >
                      {hideCompleted ? (
                        <EyeOff className="w-3.5 h-3.5" />
                      ) : (
                        <Eye className="w-3.5 h-3.5" />
                      )}
                      {hideCompleted ? t('myDay.show_completed') : t('myDay.hide_completed')}
                    </button>
                  ) : undefined
                }
              />
              <div className={cardClass}>
                {assignedTasks.length > 0 && (
                  <div className="pt-2">
                    <div className="inline-flex items-center gap-1.5 text-xs font-medium text-on-surface-variant py-2">
                      <CheckSquare className="w-3 h-3" /> {t('myDay.assigned_to_you')}
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
                        <Pencil className="w-3 h-3" /> {t('myDay.your_tasks')}
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
                    {t('myDay.nothing_on_horizon')}
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
                    <Plus className="w-3.5 h-3.5" /> {t('myDay.add_a_task')}
                  </button>
                )}
              </div>
            </section>

            {/* Prayers you're holding */}
            <section>
              <SectionHead
                title={t('myDay.your_prayers')}
                sub={
                  <>
                    {t('myDay.prayers_for_people')}{" "}
                    <button
                      onClick={() => navigate("/prayer")}
                      className="text-accent hover:underline"
                    >
                      {t('myDay.team_prayers')}
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
                    {t('myDay.no_prayers_in_care')}
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
                title={t('myDay.your_sheep')}
                sub={t('myDay.sheep_sub')}
                action={
                  <button
                    onClick={() => setPickerOpen(true)}
                    className="text-sm font-medium text-on-surface-variant hover:text-accent inline-flex items-center gap-1"
                  >
                    <Pencil className="w-3.5 h-3.5" /> {t('myDay.your_contacts')}
                  </button>
                }
                linkLabel={t('myDay.see_everyone')}
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
                  {t('myDay.no_one_in_care')}
                </p>
              )}
            </section>

            {/* ── Your week ── */}
            <section>
              <SectionHead
                title={t('myDay.your_week')}
                sub={t('myDay.week_sub')}
                linkLabel={t('myDay.full_calendar')}
                onLink={() => navigate("/attendance")}
              />
              {thisWeek.length > 1 ? (
                <div className={cardClass}>
                  {thisWeek.slice(1).map((ev, i) => {
                    const rd = new Date(ev.date);
                    return (
                      <div
                        key={ev.id}
                        className={cn(
                          "flex items-center gap-4 py-4 px-2 -mx-2 rounded-xl",
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
                          <div className="flex items-center gap-2">
                            <div className="font-medium text-on-surface truncate">{ev.title || ev.name}</div>
                            {ev.synced && <span className="cal-mark s">{t('calendar.badge', 'calendar')}</span>}
                          </div>
                          <div className="text-xs text-on-surface-variant mt-0.5 flex items-center gap-1.5 flex-wrap">
                            <span>{isValid(rd) ? format(rd, "EEEE") : ""}</span>
                            {ev.time && <span>· {ev.time}</span>}
                            {ev.location && <span>· {ev.location}</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-on-surface-variant py-2">
                  {thisWeek.length === 1 ? t('myDay.that_is_everything') : t('myDay.nothing_on_calendar_yet')}
                </p>
              )}
              {awaySentence && <p className="md-week-away">{awaySentence}</p>}
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
                <h3 className="font-serif text-lg text-on-surface">{t('myDay.your_personal_contacts')}</h3>
                <button
                  onClick={() => setPickerOpen(false)}
                  className="p-1.5 rounded-full text-on-surface-variant hover:bg-surface-variant transition-colors"
                  aria-label={t('actions.close')}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="px-5 mt-1.5 mb-3 text-sm text-on-surface-variant leading-relaxed">
                {t('myDay.picker_desc')}
              </p>
              <div className="overflow-y-auto px-3 pb-3 flex flex-col gap-0.5">
                {pickerContacts.map((c) => {
                  const checked = personalContactIds.has(c.id);
                  return (
                    <label
                      key={c.id}
                      className={cn(
                        "flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors",
                        checked ? "bg-primary text-on-primary" : "hover:bg-surface-variant",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => togglePersonalContact(c.id)}
                        className="accent-primary shrink-0"
                      />
                      <Avatar contact={c} size="sm" />
                      <span className={cn('text-sm flex-1 min-w-0 truncate', checked ? 'text-on-primary' : 'text-on-surface')}>
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
