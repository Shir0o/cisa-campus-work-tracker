import React, { useState, useMemo } from 'react';
import { useAuth } from '../components/AuthProvider';
import { Contact, Event, PrayerRecord, Stage } from '../types';
import { format, isValid } from 'date-fns';
import {
  MessageSquare,
  Calendar,
  ChevronRight,
  HeartHandshake,
  ClipboardList,
  Check,
  CheckSquare,
  Pencil,
  Plus,
  Trash2,
  X,
  Heart,
  Bell,
  Eye,
  EyeOff,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { Avatar, StageChip, SectionHead, Figure } from '../components/landing/primitives';
import { TeamPrayerRow, PersonalPrayerRow, AddPersonalPrayer } from '../components/landing/PrayerRows';
import FromTraineesInbox from '../components/landing/FromTraineesInbox';
import { duePresetToISO, DUE_PRESETS, presetForDue, DuePresetKey } from '../lib/todos';

interface MyTask {
  id: string;
  title: string;
  dueDate?: string | null;
  status: 'pending' | 'completed' | 'canceled';
  assigneeId?: string | null;
  createdById?: string | null;
  createdByName?: string | null;
  sourceDocId?: string | null;
  sourceDocTitle?: string | null;
  sourceInteractionId?: string | null;
  sourceInteractionTitle?: string | null;
}

interface MyDayMobileProps {
  contacts: Contact[];
  events: Event[];
  prayers: PrayerRecord[];
  stages: Stage[];
  uid?: string;
  myLeaders?: { contact: Contact; days: number; note: string }[];
  staleLeader?: { contact: Contact; days: number; note: string };
  assignedTasks?: MyTask[];
  personalTasks?: MyTask[];
  contactPrayers?: PrayerRecord[];
  activePersonalPrayers?: any[];
  thisWeek?: { ev: Event; ms: number }[];
  leftToDo?: number;
  prayersCount?: number;
  personalContactIds?: Set<string>;
  onOpenContact?: (contact: Contact | null, opts?: any) => void;
  onToggleTask?: (todo: MyTask) => void;
  onUpdateTaskDue?: (todo: MyTask, days: number | null) => void;
  onUpdatePersonalTask?: (id: string, patch: any) => void;
  onDeletePersonalTask?: (id: string) => void;
  onAddPersonalTask?: (title: string, dueDate: string | null) => void;
  hideCompleted?: boolean;
  onToggleHideCompleted?: () => void;
  hasCompleted?: boolean;
  onUpdatePrayerStatus?: (id: string, status: string, answer?: string, answeredAt?: string | null) => void;
  onUpdatePersonalPrayer?: (id: string, patch: any) => void;
  onDeletePersonalPrayer?: (id: string) => void;
  onAddPersonalPrayer?: (title: string, contactId?: string) => void;
  onTogglePersonalContact?: (id: string) => void;
  onMessage?: (contact: Contact) => void;
  onOpenBoard?: () => void;
  onOpenPrayer?: () => void;
}

// Due-date presets for inline editors
function DuePresetPills({
  value,
  onPick,
}: {
  value: DuePresetKey;
  onPick: (key: DuePresetKey, days: number | null) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
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

export default function MyDayMobile({
  contacts,
  events,
  prayers,
  stages,
  uid,
  myLeaders: rawMyLeaders = [],
  staleLeader,
  assignedTasks = [],
  personalTasks = [],
  contactPrayers: rawContactPrayers = [],
  activePersonalPrayers: rawActivePersonalPrayers = [],
  thisWeek: rawThisWeek = [],
  leftToDo: rawLeftToDo = 0,
  prayersCount: rawPrayersCount = 0,
  personalContactIds = new Set(),
  onOpenContact = () => {},
  onToggleTask = () => {},
  onUpdateTaskDue = () => {},
  onUpdatePersonalTask = () => {},
  onDeletePersonalTask = () => {},
  onAddPersonalTask = () => {},
  hideCompleted = true,
  onToggleHideCompleted = () => {},
  hasCompleted = false,
  onUpdatePrayerStatus = () => {},
  onUpdatePersonalPrayer = () => {},
  onDeletePersonalPrayer = () => {},
  onAddPersonalPrayer = () => {},
  onTogglePersonalContact = () => {},
  onMessage = () => {},
  onOpenBoard = () => {},
  onOpenPrayer = () => {},
}: MyDayMobileProps) {
  const { user } = useAuth();
  const firstName = user?.displayName?.split(" ")[0] || "friend";

  const myLeaders = useMemo(() => {
    if (rawMyLeaders.length > 0) return rawMyLeaders;
    return contacts.map((c) => ({ contact: c, days: 0, note: "" }));
  }, [rawMyLeaders, contacts]);

  const thisWeek = useMemo(() => {
    if (rawThisWeek.length > 0) return rawThisWeek;
    return events.map((ev) => ({ ev, ms: ev.date ? new Date(ev.date).getTime() : Date.now() }));
  }, [rawThisWeek, events]);

  const contactPrayers = useMemo(() => {
    if (rawContactPrayers.length > 0) return rawContactPrayers;
    return prayers.filter(p => p.contactId);
  }, [rawContactPrayers, prayers]);

  const activePersonalPrayers = useMemo(() => {
    if (rawActivePersonalPrayers.length > 0) return rawActivePersonalPrayers;
    return prayers.filter(p => !p.contactId);
  }, [rawActivePersonalPrayers, prayers]);

  const leftToDo = rawLeftToDo || assignedTasks.length + personalTasks.length;
  const prayersCount = rawPrayersCount || contactPrayers.length + activePersonalPrayers.length;

  const [pickerOpen, setPickerOpen] = useState(false);
  const [addingTask, setAddingTask] = useState(false);
  const [newTaskText, setNewTaskText] = useState("");
  const [newTaskDuePreset, setNewTaskDuePreset] = useState<DuePresetKey>("week");
  const [newTaskDue, setNewTaskDue] = useState<string | null>(() => duePresetToISO(5));

  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editTaskText, setEditTaskText] = useState("");
  const [editTaskDuePreset, setEditTaskDuePreset] = useState<DuePresetKey>("week");
  const [editTaskDue, setEditTaskDue] = useState<string | null>(null);

  const [addPP, setAddPP] = useState(false);

  const featuredEvent = thisWeek[0];
  const restOfWeekEvents = thisWeek.slice(1);

  const commitNewTask = () => {
    const t = newTaskText.trim();
    if (!t) return;
    onAddPersonalTask(t, newTaskDue);
    setNewTaskText("");
    setNewTaskDuePreset("week");
    setNewTaskDue(duePresetToISO(5));
    setAddingTask(false);
  };

  const startEditTask = (task: MyTask) => {
    setEditingTaskId(task.id);
    setEditTaskText(task.title);
    const preset = presetForDue(task.dueDate);
    setEditTaskDuePreset(preset);
    setEditTaskDue(task.dueDate || null);
  };

  const saveTaskEdit = (task: MyTask) => {
    const t = editTaskText.trim();
    if (!t) return;
    onUpdatePersonalTask(task.id, { title: t, dueDate: editTaskDue });
    setEditingTaskId(null);
  };

  return (
    <div className="flex flex-col min-h-screen bg-surface-container-lowest pb-28 md-page md-mobile" data-role="ft">
      {/* ── Mobile Hero ── */}
      <header className="px-5 pt-8 pb-6 bg-surface border-b border-outline-variant/30 mdm-hero">
        <div className="mdm-eyebrow text-xs   text-on-surface-variant/80 font-semibold mb-1">
          {format(new Date(), "EEEE, MMMM d")}
        </div>
        <h1 className="font-serif text-[32px] leading-tight text-on-surface mdm-greet">
          Good morning, {firstName}.
        </h1>
        <p className="text-[15px] text-on-surface-variant/90 leading-relaxed mt-2 mdm-line">
          You're caring for <b className="font-semibold text-on-surface">{myLeaders.length}</b> people this season — <b className="font-semibold text-on-surface">{leftToDo}</b> things to tend, <b className="font-semibold text-on-surface">{prayersCount}</b> prayers to hold.
        </p>
        <div className="flex gap-2.5 mt-4 mdm-actions">
          <button
            onClick={onOpenBoard}
            className="flex-1 inline-flex items-center justify-center gap-2 h-[46px] rounded-xl border border-outline-variant bg-surface text-sm font-semibold text-on-surface active:bg-surface-variant/60 transition-colors mdm-action"
          >
            <ClipboardList className="w-4 h-4" /> The board
          </button>
          <button
            onClick={onOpenPrayer}
            className="flex-1 inline-flex items-center justify-center gap-2 h-[46px] rounded-xl border border-outline-variant bg-surface text-sm font-semibold text-on-surface active:bg-surface-variant/60 transition-colors mdm-action"
          >
            <HeartHandshake className="w-4 h-4" /> Pray together
          </button>
        </div>
      </header>

      {/* ── Relational Nudge Prompt ── */}
      {staleLeader && (
        <div className="px-5 mt-4">
          <button
            onClick={() => onOpenContact(staleLeader.contact)}
            className="w-full flex items-center gap-3.5 bg-stage-accent-soft border border-primary/20 rounded-2xl p-4 text-left active:brightness-95 transition-all mdm-nudge"
          >
            <div className="w-9 h-9 rounded-full bg-surface text-accent flex items-center justify-center mdm-nudge-ico shrink-0">
              <Heart className="w-[17px] h-[17px] fill-current" />
            </div>
            <span className="text-[14.5px] leading-snug text-on-surface-variant flex-1 mdm-nudge-txt">
              It's been <b className="font-semibold text-on-surface">{Math.max(1, Math.round(staleLeader.days / 7))} {Math.max(1, Math.round(staleLeader.days / 7)) === 1 ? "week" : "weeks"}</b> since you sat with {staleLeader.contact.name.split(" ")[0]}. Maybe today.
            </span>
            <ChevronRight className="w-5 h-5 text-accent shrink-0 mdm-nudge-chev" />
          </button>
        </div>
      )}

      {/* ── From the team — relational inbox ── */}
      {uid && (
        <div className="px-5 mt-2">
          <FromTraineesInbox meUid={uid} contacts={contacts} onOpenContact={onOpenContact} mobile={true} />
        </div>
      )}

      {/* ── On the horizon checklist ── */}
      <section className="mt-8 px-5 dash-sec">
        <div className="flex items-center justify-between gap-2 mb-3 dash-sec-head">
          <h2 className="font-serif text-xl text-on-surface dash-sec-title">On the horizon</h2>
          <div className="flex items-center gap-2">
            <span className="text-xs text-on-surface-variant dash-sec-sub">
              {leftToDo > 0 ? `${leftToDo} small things this week.` : "All clear."}
            </span>
            {hasCompleted && (
              <button
                onClick={onToggleHideCompleted}
                title={hideCompleted ? "Show completed tasks" : "Hide completed tasks"}
                aria-pressed={hideCompleted}
                className="text-xs font-semibold text-on-surface-variant inline-flex items-center gap-1 dash-sec-link"
              >
                {hideCompleted ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                {hideCompleted ? "Show done" : "Hide done"}
              </button>
            )}
          </div>
        </div>

        <div className="bg-surface rounded-3xl border border-outline-variant/50 p-4  flex flex-col divide-y divide-outline-variant/30">
          {/* Assigned tasks */}
          {assignedTasks.map((todo) => {
            const done = todo.status === "completed";
            return (
              <div key={todo.id} className="py-3.5 first:pt-0 last:pb-0 flex items-start gap-3">
                <button
                  onClick={() => onToggleTask(todo)}
                  className={cn(
                    "mt-0.5 w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition-colors bd-check",
                    done ? "bg-primary border-primary text-on-primary" : "border-outline hover:border-primary",
                  )}
                >
                  {done && <Check className="w-3 h-3" />}
                </button>
                <div className="min-w-0 flex-1">
                  <div className={cn("text-[14.5px] leading-snug font-medium text-on-surface", done && "line-through text-on-surface-variant")}>
                    {todo.title}
                  </div>
                  {todo.sourceDocTitle && (
                    <div className="text-xs text-on-surface-variant mt-1">
                      From {todo.sourceDocTitle}
                    </div>
                  )}
                  {!todo.sourceDocTitle && todo.sourceInteractionId && todo.sourceInteractionTitle && (
                    <div className="text-xs text-on-surface-variant mt-1">
                      From {todo.sourceInteractionTitle}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Personal tasks */}
          {personalTasks.map((todo) => {
            const done = todo.status === "completed";
            const isEditing = editingTaskId === todo.id;
            return (
              <div key={todo.id} className="py-3.5 first:pt-0 last:pb-0">
                {isEditing ? (
                  <div className="flex flex-col gap-2">
                    <input
                      autoFocus
                      className="w-full px-3 py-2 bg-surface-container border border-outline rounded-xl text-sm focus:border-primary outline-none"
                      value={editTaskText}
                      onChange={(e) => setEditTaskText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveTaskEdit(todo);
                        if (e.key === "Escape") setEditingTaskId(null);
                      }}
                    />
                    <DuePresetPills
                      value={editTaskDuePreset}
                      onPick={(key, days) => {
                        setEditTaskDuePreset(key);
                        setEditTaskDue(duePresetToISO(days));
                      }}
                    />
                    <div className="flex items-center justify-between mt-2">
                      <button
                        onClick={() => onDeletePersonalTask(todo.id)}
                        className="text-xs text-error font-medium inline-flex items-center gap-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Delete
                      </button>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setEditingTaskId(null)}
                          className="px-3 py-1.5 rounded-full text-xs text-on-surface hover:bg-surface-variant"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => saveTaskEdit(todo)}
                          disabled={!editTaskText.trim()}
                          className="px-3 py-1.5 rounded-full text-xs bg-primary text-on-primary font-semibold disabled:opacity-50"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3" onClick={() => !done && startEditTask(todo)}>
                    <button
                      onClick={() => onToggleTask(todo)}
                      className={cn(
                        "mt-0.5 w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition-colors bd-check",
                        done ? "bg-primary border-primary text-on-primary" : "border-outline hover:border-primary",
                      )}
                    >
                      {done && <Check className="w-3 h-3" />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className={cn("text-[14.5px] leading-snug font-medium text-on-surface", done && "line-through text-on-surface-variant")}>
                        {todo.title}
                      </div>
                      {todo.dueDate && (
                        <div className="text-xs text-on-surface-variant mt-1">
                          Due: {format(new Date(todo.dueDate), "MMM d")}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Add a task composer */}
          {addingTask ? (
            <div className="py-3.5 first:pt-0 last:pb-0 flex flex-col gap-2">
              <input
                autoFocus
                className="w-full px-3 py-2 bg-surface-container border border-outline rounded-xl text-base focus:border-primary outline-none"
                placeholder="What needs doing?"
                value={newTaskText}
                onChange={(e) => setNewTaskText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newTaskText.trim()) commitNewTask();
                  if (e.key === "Escape") setAddingTask(false);
                }}
              />
              <div className="text-xs text-on-surface-variant mt-1 font-semibold">Due</div>
              <DuePresetPills
                value={newTaskDuePreset}
                onPick={(key, days) => {
                  setNewTaskDuePreset(key);
                  setNewTaskDue(duePresetToISO(days));
                }}
              />
              <div className="flex justify-end gap-2 mt-2">
                <button
                  onClick={() => setAddingTask(false)}
                  className="px-3 py-1.5 rounded-full text-xs text-on-surface hover:bg-surface-variant"
                >
                  Cancel
                </button>
                <button
                  onClick={commitNewTask}
                  disabled={!newTaskText.trim()}
                  className="px-3 py-1.5 rounded-full text-xs bg-primary text-on-primary font-semibold disabled:opacity-50"
                >
                  Add
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setAddingTask(true)}
              className="w-full py-2.5 text-left text-sm text-accent font-medium inline-flex items-center gap-1.5 active:text-accent-hover myd-addpp-link"
            >
              <Plus className="w-4 h-4" /> Add a task
            </button>
          )}
        </div>
      </section>

      {/* ── Your sheep — native list style ── */}
      <section className="mt-8 px-5 dash-sec">
        <div className="flex items-center justify-between mb-3 dash-sec-head">
          <h2 className="font-serif text-xl text-on-surface dash-sec-title">Your sheep</h2>
          <button
            onClick={() => setPickerOpen(true)}
            className="text-xs font-semibold text-accent inline-flex items-center gap-1 dash-sec-link"
          >
            <Pencil className="w-3 h-3" /> Your contacts
          </button>
        </div>

        {myLeaders.length > 0 ? (
          <div className="space-y-2 mdm-people">
            {myLeaders.map(({ contact, days, note }) => {
              const overdue = days >= 7;
              return (
                <div
                  key={contact.id}
                  onClick={() => onOpenContact(contact)}
                  className="flex items-center justify-between p-3.5 bg-surface rounded-3xl border border-outline-variant/40 active:bg-surface-variant/40 transition-colors mdm-person"
                >
                  <div className="flex items-center gap-3.5 min-w-0 flex-1 mdm-person-main">
                    <Avatar contact={contact} size="md" />
                    <div className="min-w-0 flex-1">
                      <div className="font-serif font-medium text-[16.5px] text-on-surface truncate mdm-person-name">
                        {contact.name}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 mdm-person-sub">
                        <StageChip stage={contact.stage} stages={stages} />
                        {contact.role && (
                          <span className="text-xs text-on-surface-variant/60 font-medium">
                            {contact.role}
                          </span>
                        )}
                        <span className={cn("text-xs text-on-surface-variant/70 mdm-person-since", overdue && "over text-error font-medium")}>
                          {days === 0 ? "Connected today" : days === 1 ? "Last connected yesterday" : `Last connected ${days} days ago`}
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onMessage(contact);
                    }}
                    className="ml-3 p-2.5 bg-accent-soft text-accent rounded-xl active:scale-95 transition-all mdm-person-msg"
                    aria-label={`Message ${contact.name}`}
                  >
                    <MessageSquare className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-on-surface-variant py-4 bg-surface rounded-2xl border border-outline-variant/40 text-center">
            No contacts in your care yet.
          </p>
        )}
      </section>

      {/* ── Your week — featured gathering huddle + rest of week ── */}
      <section className="mt-8 px-5 dash-sec">
        <div className="flex items-center justify-between mb-3 dash-sec-head">
          <h2 className="font-serif text-xl text-on-surface dash-sec-title">Your week</h2>
          <span className="text-xs text-accent font-semibold dash-sec-link">Calendar</span>
        </div>

        {featuredEvent ? (
          <div className="space-y-3">
            {/* Featured Event Card */}
            <div className="bg-stage-accent-soft rounded-3xl border border-primary/20 p-5  md-huddle">
              <div className="text-[11px] font-semibold   text-accent md-huddle-eyebrow">
                {isValid(new Date(featuredEvent.ev.date))
                  ? format(new Date(featuredEvent.ev.date), "EEEE, MMM d")
                  : "This week"}{" "}
                {featuredEvent.ev.location ? `· ${featuredEvent.ev.location}` : ""}
              </div>
              <h3 className="font-serif text-xl text-on-surface mt-1.5 md-huddle-title">
                {featuredEvent.ev.name}
              </h3>
              <p className="text-xs text-on-surface-variant mt-2 leading-relaxed md-huddle-lead">
                A good chance to be present with the people in your care.
              </p>
              <div className="flex flex-wrap gap-2 mt-3 md-focus">
                {featuredEvent.ev.type && (
                  <span className="bg-surface rounded-full px-2.5 py-1 text-xs border border-outline-variant/60 text-on-surface-variant/80 md-focus-item">
                    {featuredEvent.ev.type}
                  </span>
                )}
              </div>
            </div>

            {/* Rest of week */}
            {restOfWeekEvents.length > 0 && (
              <div className="bg-surface rounded-3xl border border-outline-variant/50 p-4  divide-y divide-outline-variant/30">
                {restOfWeekEvents.map(({ ev }) => {
                  const d = new Date(ev.date);
                  return (
                    <div key={ev.id} className="py-3 first:pt-0 last:pb-0 flex items-center gap-3.5">
                      <div className="text-center shrink-0 w-10">
                        <div className="font-serif text-xl text-on-surface leading-none">
                          {isValid(d) ? format(d, "d") : "–"}
                        </div>
                        <div className="text-[10px]   text-on-surface-variant/80 mt-0.5">
                          {isValid(d) ? format(d, "MMM") : ""}
                        </div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-on-surface truncate">{ev.name}</div>
                        <div className="text-xs text-on-surface-variant/85 mt-0.5 truncate">
                          {ev.location || "No location set"}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-on-surface-variant py-4 bg-surface rounded-2xl border border-outline-variant/40 text-center">
            Nothing on the calendar this week.
          </p>
        )}
      </section>

      {/* ── Your prayers ── */}
      <section className="mt-8 px-5 dash-sec">
        <div className="flex items-center justify-between mb-3 dash-sec-head">
          <h2 className="font-serif text-xl text-on-surface dash-sec-title">Your prayers</h2>
          <button
            onClick={() => setPickerOpen(true)}
            className="text-xs font-semibold text-accent inline-flex items-center gap-1 dash-sec-link"
          >
            <Pencil className="w-3 h-3" /> Your contacts
          </button>
        </div>

        <div className="bg-surface rounded-3xl border border-outline-variant/50 p-4  flex flex-col divide-y divide-outline-variant/30">
          {contactPrayers.length === 0 && activePersonalPrayers.length === 0 && (
            <p className="text-sm text-on-surface-variant py-4 text-center">
              No prayers held currently.
            </p>
          )}

          {contactPrayers.map((p) => (
            <div key={p.id} className="py-3 first:pt-0 last:pb-0">
              <TeamPrayerRow
                prayer={p}
                contact={contacts.find((c) => c.id === p.contactId)}
                first={true}
                onUpdateStatus={onUpdatePrayerStatus}
                onOpenContact={onOpenContact}
                onOpenPrayerLog={() => {}}
              />
            </div>
          ))}

          {activePersonalPrayers.map((p) => (
            <div key={p.id} className="py-3 first:pt-0 last:pb-0">
              <PersonalPrayerRow
                prayer={p}
                first={true}
                contacts={contacts}
                onUpdate={onUpdatePersonalPrayer}
                onDelete={onDeletePersonalPrayer}
                onOpenContact={onOpenContact}
              />
            </div>
          ))}

          {addPP ? (
            <div className="py-3 first:pt-0 last:pb-0">
              <AddPersonalPrayer
                contacts={contacts}
                onAdd={(title, contactId) => {
                  onAddPersonalPrayer(title, contactId);
                  setAddPP(false);
                }}
              />
              <button
                onClick={() => setAddPP(false)}
                className="mt-2 w-full py-2 text-center text-xs text-on-surface-variant hover:bg-surface-variant rounded-xl"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setAddPP(true)}
              className="w-full py-2.5 text-left text-sm text-accent font-medium inline-flex items-center gap-1.5 active:text-accent-hover myd-addpp-link"
            >
              <Plus className="w-4 h-4" /> Add a personal prayer
            </button>
          )}
        </div>
      </section>

      {/* ── Mobile Figures Footer ── */}
      <div className="mt-10 px-5 pt-5 border-t border-outline-variant/30 flex flex-wrap gap-x-8 gap-y-4 mdm-figures">
        <Figure n={myLeaders.length} label="contacts" />
        <Figure n={prayersCount} label="prayers" />
        <Figure n={leftToDo} label="tasks" />
        <Figure n={thisWeek.length} label="gatherings" />
        <span className="text-[13px] text-on-surface-variant/70 italic w-full mt-2">
          Numbers are just a way of noticing people.
        </span>
      </div>

      {/* ── Your-contacts picker bottom sheet ── */}
      {pickerOpen && (
        <div
          className="fixed inset-0 z-[200] bg-black/35 flex items-end justify-center myd-picker-scrim"
          onClick={() => setPickerOpen(false)}
        >
          <div
            className="bg-surface rounded-t-2xl shadow-2xl w-full max-h-[85vh] flex flex-col overflow-hidden myd-picker animate-in slide-in-from-bottom duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 rounded-full bg-outline/20 mx-auto my-3 shrink-0" />
            <div className="flex items-center justify-between px-5 pt-1">
              <h3 className="font-serif text-lg text-on-surface myd-picker-title">Your personal contacts</h3>
              <button
                onClick={() => setPickerOpen(false)}
                className="p-1.5 rounded-full text-on-surface-variant hover:bg-surface-variant transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="px-5 mt-1.5 mb-3 text-xs text-on-surface-variant/90 leading-relaxed myd-picker-desc">
              Prayers and reminders for these contacts appear in your day. Everyone is still
              visible on the People page.
            </p>
            <div className="overflow-y-auto px-4 pb-8 flex flex-col gap-0.5 myd-picker-list">
              {contacts.map((c) => {
                const checked = personalContactIds.has(c.id);
                return (
                  <button
                    key={c.id}
                    onClick={() => onTogglePersonalContact(c.id)}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-xl text-left cursor-pointer transition-colors myd-picker-row w-full",
                      checked ? "bg-stage-accent-soft on" : "hover:bg-surface-variant",
                    )}
                  >
                    <Avatar contact={c} size="sm" />
                    <span className="text-sm text-on-surface flex-1 min-w-0 truncate">
                      {c.name}
                    </span>
                    <StageChip stage={c.stage} stages={stages} />
                    {checked && <Check className="w-4 h-4 text-accent shrink-0 ml-2" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
