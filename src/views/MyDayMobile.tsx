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
import AttentionFeed from '../components/landing/AttentionFeed';
import AskStack from '../components/landing/AskStack';
import { duePresetToISO, DUE_PRESETS, presetForDue, DuePresetKey } from '../lib/todos';
import { Translate } from '../components/Translate';
import { useLanguage } from '../components/LanguageProvider';
import type { UnifiedGathering } from '../lib/calendar/calendarSync';

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
  thisWeek?: UnifiedGathering[];
  awaySentence?: string;
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
  onUpdatePrayerStatus?: (id: string, status: string, answer?: string, answeredAt?: string | null, archiveReason?: string) => void;
  onUpdatePersonalPrayer?: (id: string, patch: any) => void;
  onDeletePersonalPrayer?: (id: string) => void;
  onAddPersonalPrayer?: (title: string, contactId?: string) => void;
  onTogglePersonalContact?: (id: string) => void;
  onMessage?: (contact: Contact) => void;
  onOpenBoard?: () => void;
  onOpenPrayer?: () => void;
  onOpenCalendar?: () => void;
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
          <Translate text={p.label} />
        </button>
      ))}
    </div>
  );
}

export default function MyDayMobile({
  contacts = [],
  events = [],
  prayers = [],
  stages = [],
  uid: propUid,
  myLeaders: rawMyLeaders = [],
  staleLeader,
  assignedTasks = [],
  personalTasks = [],
  contactPrayers: rawContactPrayers = [],
  activePersonalPrayers: rawActivePersonalPrayers = [],
  thisWeek: rawThisWeek = [],
  awaySentence = '',
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
  onOpenCalendar = () => {},
}: MyDayMobileProps) {
  const { user, effectiveUserId, effectiveUserName } = useAuth();
  const { t } = useLanguage();
  const uid = propUid || effectiveUserId || user?.uid;
  const firstName = (effectiveUserName || user?.displayName || user?.email)?.split(" ")[0] || t('myDay.friend');

  const myLeaders = useMemo(() => {
    if (rawMyLeaders.length > 0) return rawMyLeaders;
    return contacts.map((c) => ({ contact: c, days: 0, note: "" }));
  }, [rawMyLeaders, contacts]);

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

  const thisWeek = useMemo<UnifiedGathering[]>(() => {
    if (rawThisWeek.length > 0) return rawThisWeek;
    return events.map((ev) => ({
      id: ev.id,
      title: ev.name,
      name: ev.name,
      date: ev.date,
      location: ev.location,
      type: ev.type || '',
      synced: false,
    }));
  }, [rawThisWeek, events]);

  const contactPrayers = useMemo(() => {
    if (rawContactPrayers.length > 0) return rawContactPrayers;
    return prayers.filter(
      (p) => p.contactId && p.status !== "answered" && p.status !== "unanswered",
    );
  }, [rawContactPrayers, prayers]);

  const activePersonalPrayers = useMemo(() => {
    if (rawActivePersonalPrayers.length > 0) return rawActivePersonalPrayers;
    return prayers.filter(
      (p) => !p.contactId && p.status !== "answered" && p.status !== "unanswered",
    );
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
          {t('myDay.good_morning').replace('{name}', firstName)}
        </h1>
        <p className="text-[15px] text-on-surface-variant/90 leading-relaxed mt-2 mdm-line">
          {t('myDay.caring_for').replace('{people}', String(myLeaders.length)).replace('{tasks}', String(leftToDo)).replace('{prayers}', String(prayersCount))}
        </p>
        <div className="flex gap-2.5 mt-4 mdm-actions">
          <button
            onClick={onOpenBoard}
            className="flex-1 inline-flex items-center justify-center gap-2 h-[46px] rounded-xl border border-outline-variant bg-surface text-sm font-semibold text-on-surface active:bg-surface-variant/60 transition-colors mdm-action"
          >
            <ClipboardList className="w-4 h-4" /> {t('myDay.the_board')}
          </button>
          <button
            onClick={onOpenPrayer}
            className="flex-1 inline-flex items-center justify-center gap-2 h-[46px] rounded-xl border border-outline-variant bg-surface text-sm font-semibold text-on-surface active:bg-surface-variant/60 transition-colors mdm-action"
          >
            <HeartHandshake className="w-4 h-4" /> {t('myDay.pray_together')}
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
              {t('myDay.its_been').replace('{weeks}', String(Math.max(1, Math.round(staleLeader.days / 7)))).replace('{unit}', Math.max(1, Math.round(staleLeader.days / 7)) === 1 ? t('myDay.week') : t('myDay.weeks')).replace('{name}', staleLeader.contact.name.split(' ')[0])}
            </span>
            <ChevronRight className="w-5 h-5 text-accent shrink-0 mdm-nudge-chev" />
          </button>
        </div>
      )}

      {/* ── Questions for the team — person-less trainee questions (#545) ── */}
      {uid && (
        <div className="px-5 mt-2">
          <AskStack mobile={true} />
        </div>
      )}

      {/* ── Needs your attention — unified attention feed ── */}
      {uid && (
        <div className="px-5 mt-2">
          <AttentionFeed
            contacts={contacts}
            personalContactIds={personalContactIds}
            onOpenContact={onOpenContact}
            mobile={true}
          />
        </div>
      )}

      {/* ── On the horizon checklist ── */}
      <section className="mt-8 px-5 dash-sec">
        <div className="flex items-center justify-between gap-2 mb-3 dash-sec-head">
          <h2 className="font-serif text-xl text-on-surface dash-sec-title">{t('myDay.on_the_horizon')}</h2>
          <div className="flex items-center gap-2">
            <span className="text-xs text-on-surface-variant dash-sec-sub">
              {leftToDo > 0 ? t('myDay.small_things_this_week').replace('{n}', String(leftToDo)) : t('myDay.all_clear')}
            </span>
            {hasCompleted && (
              <button
                onClick={onToggleHideCompleted}
                title={hideCompleted ? t('myDay.show_completed_tasks') : t('myDay.hide_completed_tasks')}
                aria-pressed={hideCompleted}
                className="text-xs font-semibold text-on-surface-variant inline-flex items-center gap-1 dash-sec-link"
              >
                {hideCompleted ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                {hideCompleted ? t('myDay.show_done') : t('myDay.hide_done')}
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
                  <Translate
                    as="div"
                    className={cn("text-[14.5px] leading-snug font-medium text-on-surface", done && "line-through text-on-surface-variant")}
                    text={todo.title}
                  />
                  {todo.sourceDocTitle && (
                    <div className="text-xs text-on-surface-variant mt-1">
                      {t('myDay.from')} {todo.sourceDocTitle}
                    </div>
                  )}
                  {!todo.sourceDocTitle && todo.sourceInteractionId && todo.sourceInteractionTitle && (
                    <div className="text-xs text-on-surface-variant mt-1">
                      {t('myDay.from')} {todo.sourceInteractionTitle}
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
                        <Trash2 className="w-3.5 h-3.5" /> {t('actions.delete')}
                      </button>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setEditingTaskId(null)}
                          className="px-3 py-1.5 rounded-full text-xs text-on-surface hover:bg-surface-variant"
                        >
                          {t('actions.cancel')}
                        </button>
                        <button
                          onClick={() => saveTaskEdit(todo)}
                          disabled={!editTaskText.trim()}
                          className="px-3 py-1.5 rounded-full text-xs bg-primary text-on-primary font-semibold disabled:opacity-50"
                        >
                          {t('actions.save')}
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
                      <Translate
                        as="div"
                        className={cn("text-[14.5px] leading-snug font-medium text-on-surface", done && "line-through text-on-surface-variant")}
                        text={todo.title}
                      />
                      {todo.dueDate && (
                        <div className="text-xs text-on-surface-variant mt-1">
                          {t('myDay.due_colon')} {format(new Date(todo.dueDate), "MMM d")}
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
                placeholder={t('myDay.what_needs_doing')}
                value={newTaskText}
                onChange={(e) => setNewTaskText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newTaskText.trim()) commitNewTask();
                  if (e.key === "Escape") setAddingTask(false);
                }}
              />
              <div className="text-xs text-on-surface-variant mt-1 font-semibold">{t('myDay.due')}</div>
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
                  {t('actions.cancel')}
                </button>
                <button
                  onClick={commitNewTask}
                  disabled={!newTaskText.trim()}
                  className="px-3 py-1.5 rounded-full text-xs bg-primary text-on-primary font-semibold disabled:opacity-50"
                >
                  {t('actions.add')}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setAddingTask(true)}
              className="w-full py-2.5 text-left text-sm text-accent font-medium inline-flex items-center gap-1.5 active:text-accent-hover myd-addpp-link"
            >
              <Plus className="w-4 h-4" /> {t('myDay.add_a_task')}
            </button>
          )}
        </div>
      </section>

      {/* ── Your sheep — native list style ── */}
      <section className="mt-8 px-5 dash-sec">
        <div className="flex items-center justify-between mb-3 dash-sec-head">
          <h2 className="font-serif text-xl text-on-surface dash-sec-title">{t('myDay.your_sheep')}</h2>
          <button
            onClick={() => setPickerOpen(true)}
            className="text-xs font-semibold text-accent inline-flex items-center gap-1 dash-sec-link"
          >
            <Pencil className="w-3 h-3" /> {t('myDay.your_contacts')}
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
                          <span className="text-xs text-on-surface-variant/80 font-medium">
                            {contact.role}
                          </span>
                        )}
                        <span className={cn("text-xs text-on-surface-variant/70 mdm-person-since", overdue && "over text-error font-medium")}>
                          {!Number.isFinite(days) ? t('myDay.not_connected_yet') : days === 0 ? t('myDay.connected_today') : days === 1 ? t('myDay.last_connected_yesterday') : t('myDay.last_connected_days_ago').replace('{n}', String(days))}
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
                    aria-label={`${t('myDay.message')} ${contact.name}`}
                  >
                    <MessageSquare className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-on-surface-variant py-4 bg-surface rounded-2xl border border-outline-variant/40 text-center">
            {t('myDay.no_contacts_in_care')}
          </p>
        )}
      </section>

      {/* ── Your week — featured gathering huddle + rest of week ── */}
      <section className="mt-8 px-5 dash-sec">
        <div className="flex items-center justify-between mb-3 dash-sec-head">
          <h2 className="font-serif text-xl text-on-surface dash-sec-title">{t('myDay.your_week')}</h2>
          <button
            onClick={onOpenCalendar}
            className="text-xs text-accent font-semibold dash-sec-link cursor-pointer"
          >
            {t('myDay.full_calendar')}
          </button>
        </div>

        {featuredEvent ? (
          <div className="space-y-3">
            {/* Featured Event Card */}
            <div
              className="bg-stage-accent-soft rounded-3xl border border-primary/20 p-5 md-huddle md-next"
            >
              <div className="text-[11px] font-semibold text-accent md-huddle-eyebrow flex items-center justify-between">
                <span>
                  {isValid(new Date(featuredEvent.date))
                    ? format(new Date(featuredEvent.date), "EEEE, MMM d")
                    : t('myDay.this_week')}
                  {featuredEvent.location ? ` · ${featuredEvent.location}` : ""}
                </span>
                {featuredEvent.synced && (
                  <span className="cal-mark s">{t('calendar.badge', 'calendar')}</span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-1.5">
                <h3 className="font-serif text-xl text-on-surface md-huddle-title truncate">
                  {featuredEvent.title || featuredEvent.name}
                </h3>
              </div>
              <p className="text-xs text-on-surface-variant mt-2 leading-relaxed md-huddle-lead">
                {t('myDay.good_chance')}
              </p>
              <div className="flex flex-wrap gap-2 mt-3 md-focus">
                {featuredEvent.time && (
                  <span className="bg-surface rounded-full px-2.5 py-1 text-xs border border-outline-variant/60 text-on-surface-variant/80 md-focus-item font-medium">
                    {featuredEvent.time}
                  </span>
                )}
                {featuredEvent.type && (
                  <span className="bg-surface rounded-full px-2.5 py-1 text-xs border border-outline-variant/60 text-on-surface-variant/80 md-focus-item">
                    {featuredEvent.type}
                  </span>
                )}
              </div>
            </div>

            {/* Rest of week */}
            {restOfWeekEvents.length > 0 && (
              <div className="bg-surface rounded-3xl border border-outline-variant/50 p-4 divide-y divide-outline-variant/30">
                {restOfWeekEvents.map((ev) => {
                  const d = new Date(ev.date);
                  return (
                    <div
                      key={ev.id}
                      className="py-3 first:pt-0 last:pb-0 flex items-center gap-3.5"
                    >
                      <div className="text-center shrink-0 w-10">
                        <div className="font-serif text-xl text-on-surface leading-none">
                          {isValid(d) ? format(d, "d") : "–"}
                        </div>
                        <div className="text-[10px] text-on-surface-variant/80 mt-0.5">
                          {isValid(d) ? format(d, "MMM") : ""}
                        </div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <div className="font-medium text-on-surface truncate">{ev.title || ev.name}</div>
                          {ev.synced && <span className="cal-mark s">{t('calendar.badge', 'calendar')}</span>}
                        </div>
                        <div className="text-xs text-on-surface-variant/85 mt-0.5 truncate flex items-center gap-1">
                          {ev.time && <span>{ev.time} · </span>}
                          <span>{ev.location || ev.type || t('myDay.no_location_set')}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {awaySentence && <p className="md-week-away">{awaySentence}</p>}
          </div>
        ) : (
          <p className="text-sm text-on-surface-variant py-4 bg-surface rounded-2xl border border-outline-variant/40 text-center">
            {t('myDay.nothing_on_calendar')}
          </p>
        )}
      </section>

      {/* ── Your prayers ── */}
      <section className="mt-8 px-5 dash-sec">
        <div className="flex items-center justify-between mb-3 dash-sec-head">
          <h2 className="font-serif text-xl text-on-surface dash-sec-title">{t('myDay.your_prayers')}</h2>
          <button
            onClick={() => setPickerOpen(true)}
            className="text-xs font-semibold text-accent inline-flex items-center gap-1 dash-sec-link"
          >
            <Pencil className="w-3 h-3" /> {t('myDay.your_contacts')}
          </button>
        </div>

        <div className="bg-surface rounded-3xl border border-outline-variant/50 p-4  flex flex-col divide-y divide-outline-variant/30">
          {contactPrayers.length === 0 && activePersonalPrayers.length === 0 && (
            <p className="text-sm text-on-surface-variant py-4 text-center">
              {t('myDay.no_prayers_held')}
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
                {t('actions.cancel')}
              </button>
            </div>
          ) : (
            <button
              onClick={() => setAddPP(true)}
              className="w-full py-2.5 text-left text-sm text-accent font-medium inline-flex items-center gap-1.5 active:text-accent-hover myd-addpp-link"
            >
              <Plus className="w-4 h-4" /> {t('myDay.add_a_personal_prayer')}
            </button>
          )}
        </div>
      </section>

      {/* ── Mobile Figures Footer ── */}
      <div className="mt-10 px-5 pt-5 border-t border-outline-variant/30 flex flex-wrap gap-x-8 gap-y-4 mdm-figures">
        <Figure n={myLeaders.length} label={t('myDay.contacts_label')} />
        <Figure n={prayersCount} label={t('myDay.prayers_label')} />
        <Figure n={leftToDo} label={t('myDay.tasks_label')} />
        <Figure n={thisWeek.length} label={t('myDay.gatherings_label')} />
        <span className="text-[13px] text-on-surface-variant/70 italic w-full mt-2">
          {t('myDay.numbers_notice')}
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
              <h3 className="font-serif text-lg text-on-surface myd-picker-title">{t('myDay.your_personal_contacts')}</h3>
              <button
                onClick={() => setPickerOpen(false)}
                className="p-1.5 rounded-full text-on-surface-variant hover:bg-surface-variant transition-colors"
                aria-label={t('actions.close')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="px-5 mt-1.5 mb-3 text-xs text-on-surface-variant/90 leading-relaxed myd-picker-desc">
              {t('myDay.picker_desc')}
            </p>
            <div className="overflow-y-auto px-4 pb-8 flex flex-col gap-0.5 myd-picker-list">
              {pickerContacts.map((c) => {
                const checked = personalContactIds.has(c.id);
                return (
                  <button
                    key={c.id}
                    onClick={() => onTogglePersonalContact(c.id)}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-xl text-left cursor-pointer transition-colors myd-picker-row w-full",
                      checked && "on",
                    )}
                  >
                    <Avatar contact={c} size="sm" />
                    <span className={cn('text-sm flex-1 min-w-0 truncate', checked ? 'text-on-primary' : 'text-on-surface')}>
                      {c.name}
                    </span>
                    <StageChip stage={c.stage} stages={stages} />
                    {checked && <Check className="w-4 h-4 text-on-primary shrink-0 ml-2" />}
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
