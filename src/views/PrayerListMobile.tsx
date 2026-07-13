import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { Plus, Search, X } from 'lucide-react';
import { cn, getUserInitials } from '../lib/utils';
import { Contact, PrayerRecord } from '../types';

type Status = PrayerRecord['status'];

interface PrayerListMobileProps {
  contacts: Contact[];
  prayers: PrayerRecord[];
  entries: { contact: Contact; prayers: PrayerRecord[] }[];
  suggestions: Contact[];
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  startHolding: (contact: Contact) => void;
  onAddBurden: (contactId: string, text: string) => Promise<boolean>;
  onUpdateStatus: (prayer: PrayerRecord, status: Status, answer?: string, answeredAt?: string) => void;
  onUpdateBurden: (prayer: PrayerRecord, text: string) => Promise<boolean>;
  onOpenContact: (contact: Contact) => void;
  answeredThisYear: number;
  awaiting: number;
  composeFor: string | null;
  setComposeFor: (id: string | null) => void;
  onStopHolding: (contactId: string) => void;
  isOperator: boolean;
}

const THIS_WEEK_START = (() => {
  const x = new Date();
  const off = (x.getDay() + 6) % 7; // Monday = 0
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - off);
  return x.getTime();
})();
const THIS_WEEK_END = THIS_WEEK_START + 7 * 24 * 3600 * 1000;
const prayerMs = (p: PrayerRecord) => new Date(p.date).getTime();
const EARLIER_CAP = 4;

const STATUS_LABEL: Record<Status, string> = {
  pending: 'Unmarked',
  ongoing: 'Ongoing',
  answered: 'Answered',
  unanswered: 'archive',
};

const STATUS_TONE: Record<Status, string> = {
  pending: 'text-on-surface-variant',
  ongoing: 'text-stage-accent',
  answered: 'text-success',
  unanswered: 'text-error',
};



const firstNameOf = (name: string) => name.split(' ')[0];

function formatDate(isoString: string) {
  const d = new Date(isoString);
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(d);
}

function Avatar({ contact, size = 'md' }: { contact: Contact; size?: 'sm' | 'md' | 'lg' }) {
  const dim = size === 'sm' ? 'w-8 h-8 text-xs' : size === 'lg' ? 'w-11 h-11 text-sm' : 'w-10 h-10 text-xs';
  const initials = contact.initials || getUserInitials(contact.name);
  if (contact.avatar) {
    return <img src={contact.avatar} alt={contact.name} className={cn(dim, 'rounded-full object-cover shrink-0')} />;
  }
  return (
    <div
      className={cn(
        dim,
        'rounded-full bg-primary-container text-on-primary-container font-semibold flex items-center justify-center shrink-0',
      )}
    >
      {initials}
    </div>
  );
}

export default function PrayerListMobile({
  contacts,
  prayers,
  entries,
  suggestions,
  searchQuery,
  setSearchQuery,
  startHolding,
  onAddBurden,
  onUpdateStatus,
  onUpdateBurden,
  onOpenContact,
  answeredThisYear,
  awaiting,
  composeFor,
  setComposeFor,
  onStopHolding,
  isOperator,
}: PrayerListMobileProps) {
  const navigate = useNavigate();
  const [pickerOpen, setPickerOpen] = useState(false);

  // Suggestions for bottom sheet
  const allAddable = useMemo(() => {
    const held = new Set(entries.map((e) => e.contact.id));
    const q = searchQuery.trim().toLowerCase();
    return contacts
      .filter((c) => !held.has(c.id) && (q === "" || c.name.toLowerCase().includes(q)))
      .slice(0, 30);
  }, [contacts, entries, searchQuery]);

  return (
    <div className="flex flex-col min-h-screen bg-surface-container-lowest pb-28 md-page md-mobile page page-prayer prm" data-role="ft">
      {/* ── Mobile Hero ── */}
      <header className="px-5 pt-8 pb-6 bg-surface border-b border-outline-variant/30 prm-hero">
        <div className="text-xs uppercase tracking-wider text-on-surface-variant/80 font-semibold mb-1 prm-eyebrow">
          Prayer
        </div>
        <h1 className="font-serif text-[32px] leading-tight text-on-surface prm-title">
          Who we're carrying
        </h1>
        <p className="text-[15px] text-on-surface-variant/90 leading-relaxed mt-2 prm-line">
          <b className="font-semibold text-on-surface">{answeredThisYear}</b> {answeredThisYear === 1 ? "prayer" : "prayers"} answered this year
          {awaiting > 0 ? (
            <>
              {" · "}
              <b className="font-semibold text-on-surface">{awaiting}</b> from last week {awaiting === 1 ? "needs" : "need"} an update.
            </>
          ) : (
            "."
          )}
        </p>

        {/* Hold someone button */}
        {isOperator && (
          <button
            onClick={() => {
              setSearchQuery("");
              setPickerOpen(true);
            }}
            className="mt-4 w-full min-h-[48px] display flex items-center justify-between bg-stage-accent-soft border border-primary/20 text-primary rounded-2xl px-4 text-sm font-semibold active:brightness-95 transition-all prm-choose"
          >
            <div className="flex items-center gap-2">
              <Plus className="w-4 h-4" />
              <span>Hold someone in prayer</span>
            </div>
            <span className="text-xs px-2.5 py-1 rounded-full bg-surface text-primary font-bold shadow-sm prm-choose-n">
              {entries.length}
            </span>
          </button>
        )}
      </header>

      {/* ── Toggle buttons ── */}
      <div className="px-5 mt-4 flex border-b border-outline-variant/35 ans-toggle">
        <button className="flex-1 py-3 text-center text-sm font-semibold border-b-2 border-primary text-primary ans-toggle-opt on">
          On our hearts
        </button>
        <button
          onClick={() => navigate('/answered')}
          className="flex-1 py-3 text-center text-sm font-semibold text-on-surface-variant hover:text-on-surface ans-toggle-opt"
        >
          Answered
        </button>
      </div>

      {/* ── Prayer Threads List ── */}
      <div className="mt-4 px-5 flex flex-col gap-4 prt-list">
        {entries.length === 0 && (
          <div className="py-12 text-center text-sm italic text-on-surface-variant bg-surface/40 rounded-2xl border border-dashed border-outline-variant/30 pr-picker-empty shadow-inner">
            No one here yet — tap "Hold someone in prayer" to start.
          </div>
        )}

        {entries.map((e) => (
          <PrayerThreadCard
            key={e.contact.id}
            contact={e.contact}
            prayers={e.prayers}
            autoCompose={composeFor === e.contact.id}
            onAddBurden={onAddBurden}
            onUpdateStatus={onUpdateStatus}
            onUpdateBurden={onUpdateBurden}
            onOpenProfile={() => onOpenContact(e.contact)}
            onRemove={() => onStopHolding(e.contact.id)}
            setComposeFor={setComposeFor}
            isOperator={isOperator}
          />
        ))}
      </div>

      {/* ── Hold someone in prayer picker bottom sheet ── */}
      {pickerOpen && (
        <div
          className="fixed inset-0 z-[200] bg-black/35 flex items-end justify-center scrim"
          onClick={() => setPickerOpen(false)}
        >
          <div
            className="bg-surface rounded-t-2xl shadow-2xl w-full max-h-[85vh] flex flex-col overflow-hidden modal ibxs animate-in slide-in-from-bottom duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 rounded-full bg-outline/20 mx-auto my-3 shrink-0 ibxs-grab" />
            <div className="flex items-center justify-between px-5 pt-1 ibxs-head">
              <div className="ibxs-headtext">
                <h3 className="font-serif text-lg text-on-surface ibxs-title">Hold someone in prayer</h3>
                <p className="text-xs text-on-surface-variant mt-0.5 ibxs-meta">
                  Anyone from the roster — they'll show up in this week's walk.
                </p>
              </div>
              <button
                onClick={() => setPickerOpen(false)}
                className="p-1.5 rounded-full text-on-surface-variant hover:bg-surface-variant transition-colors modal-x"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-y-auto px-4 pb-8 pt-4 flex flex-col gap-4 mds-body">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
                <input
                  autoFocus
                  type="text"
                  placeholder="Search anyone to hold in prayer…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 h-11 bg-surface-container border border-outline rounded-xl text-sm focus:border-primary outline-none transition-all text-on-surface"
                />
              </div>

              <div className="flex flex-col gap-1.5 prm-picker">
                {allAddable.length === 0 && (
                  <div className="text-center py-6 text-xs text-on-surface-variant italic">
                    {searchQuery ? "No one matches that." : "Everyone's already here."}
                  </div>
                )}
                {allAddable.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      startHolding(c);
                      setPickerOpen(false);
                    }}
                    className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-surface-variant text-left w-full pr-picker-row"
                  >
                    <Avatar contact={c} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-on-surface truncate pr-picker-name">{c.name}</div>
                      <div className="text-xs text-on-surface-variant truncate pr-picker-meta mt-0.5">{[c.role, c.location].filter(Boolean).join(' · ')}</div>
                    </div>
                    <Plus className="w-4 h-4 text-primary shrink-0 ml-2 pr-picker-add" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface PrayerThreadCardProps {
  contact: Contact;
  prayers: PrayerRecord[];
  autoCompose: boolean;
  onAddBurden: (contactId: string, text: string) => Promise<boolean>;
  onUpdateStatus: (prayer: PrayerRecord, status: Status, answer?: string, answeredAt?: string) => void;
  onUpdateBurden: (prayer: PrayerRecord, text: string) => Promise<boolean>;
  onOpenProfile: () => void;
  onRemove: () => void;
  setComposeFor: (id: string | null) => void;
  isOperator: boolean;
}

function PrayerThreadCard({
  contact,
  prayers,
  autoCompose,
  onAddBurden,
  onUpdateStatus,
  onUpdateBurden,
  onOpenProfile,
  onRemove,
  setComposeFor,
  isOperator,
}: PrayerThreadCardProps) {
  const [showEarlier, setShowEarlier] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const sorted = useMemo(() => [...prayers].sort((a, b) => prayerMs(b) - prayerMs(a)), [prayers]);
  const weekItem = sorted.find((p) => prayerMs(p) >= THIS_WEEK_START && prayerMs(p) < THIS_WEEK_END) || null;
  const rest = sorted.filter((p) => p !== weekItem);
  const lastItem = rest[0] || null;
  const earlier = rest.slice(1);

  const ongoingCount = prayers.filter((p) => p.status === 'ongoing').length;
  const needsMark = !!lastItem && lastItem.status === 'pending';
  const firstName = firstNameOf(contact.name);

  // carry summary reduced to one tone-coded label for the mobile header
  const carry = ongoingCount > 0
    ? { label: `${ongoingCount} ongoing`, tone: 'accent' }
    : prayers.length === 0
    ? { label: 'Newly added', tone: 'muted' }
    : { label: 'At rest', tone: 'rest' };

  return (
    <article className="bg-surface border border-outline-variant/45 rounded-2xl p-4 shadow-sm flex flex-col gap-3 prt-card prt-card--m relative">
      {/* Card Header */}
      <div className="flex items-start justify-between gap-2 prt-head prt-head--m">
        <button onClick={onOpenProfile} className="flex items-center gap-3 text-left min-w-0 flex-1 prt-person">
          <Avatar contact={contact} size="lg" />
          <div className="min-w-0 flex-1 prt-person-id">
            <h4 className="font-serif text-lg text-on-surface leading-tight truncate prt-name">{contact.name}</h4>
            <div className="text-xs text-on-surface-variant truncate mt-0.5 prt-meta">
              {[contact.role, contact.location].filter(Boolean).join(' · ')}
            </div>
            <div className="flex items-center gap-2 mt-2 prt-substatus">
              <span className={cn(
                "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full prt-statuspill",
                carry.tone === 'accent' && "bg-stage-accent-soft text-stage-accent",
                carry.tone === 'rest' && "bg-success/15 text-success",
                carry.tone === 'muted' && "bg-surface-variant text-on-surface-variant"
              )}>
                {carry.label}
              </span>
            </div>
          </div>
        </button>

        {/* Remove Button */}
        {isOperator && (
          confirmRemove ? (
            <div className="flex gap-1.5 shrink-0 self-start prt-remove-confirm">
              <button
                onClick={onRemove}
                className="px-2 py-1 rounded-lg bg-error-container text-on-error-container text-xs font-semibold border border-error/20 prt-remove-yes"
              >
                Remove
              </button>
              <button
                onClick={() => setConfirmRemove(false)}
                className="px-2 py-1 rounded-lg bg-surface-container border border-outline text-xs font-semibold prt-remove-no"
              >
                Keep
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmRemove(true)}
              className="p-1 rounded-full text-on-surface-variant hover:bg-surface-variant shrink-0 self-start prt-remove"
              title={`Remove ${firstName} from prayer list`}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )
        )}
      </div>

      {/* This week */}
      <div className="mt-2 prt-week">
        <SectionEyebrow label="This week" />
        {weekItem ? (
          <PrayerItemMobile
            prayer={weekItem}
            variant="week"
            onUpdateStatus={onUpdateStatus}
            onUpdateBurden={onUpdateBurden}
            isOperator={isOperator}
          />
        ) : isOperator ? (
          <AddThisWeekMobile
            firstName={firstName}
            defaultOpen={autoCompose}
            onAdd={async (text) => {
              const ok = await onAddBurden(contact.id, text);
              if (ok) setComposeFor(null);
              return ok;
            }}
          />
        ) : (
          <div className="text-xs text-on-surface-variant/65 italic pl-3.5 py-1">
            No prayer recorded for this week
          </div>
        )}
      </div>

      {/* Last week */}
      {lastItem && (
        <div className="mt-3">
          <SectionEyebrow label="Last week" nudge={needsMark ? 'Needs an update' : undefined} />
          <PrayerItemMobile
            prayer={lastItem}
            variant="last"
            needsMark={needsMark}
            onUpdateStatus={onUpdateStatus}
            onUpdateBurden={onUpdateBurden}
            isOperator={isOperator}
          />
        </div>
      )}

      {/* Earlier */}
      {earlier.length > 0 && (
        <div className="mt-3">
          <button
            onClick={() => setShowEarlier((v) => !v)}
            className="flex items-center gap-3 w-full group py-1"
          >
            <span
              className={cn(
                'text-on-surface-variant transition-transform text-[10px]',
                showEarlier && 'rotate-90',
              )}
              aria-hidden
            >
              ▶
            </span>
            <span className="font-sans text-[11px] uppercase tracking-[0.08em] text-on-surface-variant group-hover:text-on-surface transition-colors">
              {showEarlier ? 'Hide' : 'Earlier'} — {earlier.length} {earlier.length === 1 ? 'prayer' : 'prayers'}
            </span>
            <span className="flex-1 h-px bg-outline-variant" />
          </button>
          {showEarlier && (
            <div className="mt-2 space-y-2">
              {earlier.slice(0, EARLIER_CAP).map((p) => (
                <PrayerItemMobile
                  key={p.id}
                  prayer={p}
                  variant="earlier"
                  onUpdateStatus={onUpdateStatus}
                  onUpdateBurden={onUpdateBurden}
                  isOperator={isOperator}
                />
              ))}
              {earlier.length > EARLIER_CAP && (
                <div className="text-[12px] text-on-surface-variant pt-2 pl-1">
                  {earlier.length - EARLIER_CAP} older{' '}
                  {earlier.length - EARLIER_CAP === 1 ? 'prayer' : 'prayers'} —{' '}
                  <button onClick={onOpenProfile} className="text-primary font-semibold hover:underline">
                    see {firstName}&rsquo;s full history
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function SectionEyebrow({ label, nudge }: { label: string; nudge?: string }) {
  return (
    <div className="flex items-center gap-2.5 mb-1.5">
      <span className="font-sans text-[10px] uppercase tracking-[0.08em] text-on-surface-variant">{label}</span>
      {nudge && (
        <span className="font-sans text-[10px] uppercase tracking-[0.08em] text-error font-semibold">{nudge}</span>
      )}
      <span className="flex-1 h-px bg-outline-variant/60" />
    </div>
  );
}

// Mobile individual prayer item with drop-down mark selector
function PrayerItemMobile({
  prayer,
  variant,
  needsMark,
  onUpdateStatus,
  onUpdateBurden,
  isOperator,
}: {
  prayer: PrayerRecord;
  variant: 'week' | 'last' | 'earlier';
  needsMark?: boolean;
  onUpdateStatus: (prayer: PrayerRecord, status: Status, answer?: string, answeredAt?: string) => void;
  onUpdateBurden: (prayer: PrayerRecord, text: string) => Promise<boolean>;
  isOperator: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState(prayer.burden);
  const [answering, setAnswering] = useState(false);
  const [howDraft, setHowDraft] = useState(prayer.answer || '');

  const startEdit = () => {
    setDraft(prayer.burden);
    setEditing(true);
  };
  const save = async () => {
    setSaving(true);
    const ok = await onUpdateBurden(prayer, draft);
    setSaving(false);
    if (ok) setEditing(false);
  };

  const dimmed = prayer.status === 'answered' || variant === 'earlier';

  const MARK_OPTIONS: Status[] = ['ongoing', 'answered', 'unanswered'];

  return (
    <div
      className={cn(
        'pl-3.5 border-l-2 py-1 prt-prayer prt-prayer--m',
        variant === 'week'
          ? 'border-l-primary'
          : prayer.status === 'answered'
            ? 'border-l-success/50'
            : 'border-l-outline-variant',
      )}
    >
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-[12px] text-on-surface-variant/80">{formatDate(prayer.date)}</span>
        {prayer.status !== 'pending' ? (
          <span className={cn('text-[10px] uppercase tracking-[0.08em] font-bold', STATUS_TONE[prayer.status])}>
            {STATUS_LABEL[prayer.status]}
          </span>
        ) : variant !== 'week' ? (
          <span className="text-[10px] uppercase tracking-[0.08em] font-bold text-on-surface-variant/70">
            Unmarked
          </span>
        ) : null}
        {!editing && isOperator && (
          <button
            onClick={startEdit}
            className="text-xs text-on-surface-variant/80 hover:text-primary transition-colors ml-auto prt-prayer-edit prt-prayer-edit--m"
          >
            Edit
          </button>
        )}
      </div>

      {editing ? (
        <div className="mt-2 flex flex-col gap-2">
          <textarea
            autoFocus
            rows={3}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="w-full p-2.5 rounded-xl bg-surface-container-low border border-outline-variant focus:border-primary outline-none text-sm text-on-surface resize-none"
          />
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => {
                setDraft(prayer.burden);
                setEditing(false);
              }}
              className="px-3.5 py-1.5 rounded-full text-xs text-on-surface-variant hover:text-on-surface"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={!draft.trim() || saving}
              className="px-3.5 py-1.5 bg-primary text-on-primary rounded-full text-xs font-semibold disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      ) : (
        <p className={cn('text-sm leading-relaxed mt-1 whitespace-pre-wrap prt-prayer-text', dimmed ? 'text-on-surface-variant' : 'text-on-surface')}>
          {prayer.burden}
        </p>
      )}

      {/* Answer testimony */}
      {!editing && !answering && prayer.status === 'answered' && (prayer.answer || prayer.answeredAt) && (
        <div className="mt-2.5 text-xs bg-success/5 border border-success/15 rounded-xl p-3 max-w-full">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-success uppercase tracking-wider">
              Answered{prayer.answeredAt ? ` · ${prayer.answeredAt}` : ""}
            </span>
            {isOperator && (
              <button
                onClick={() => {
                  setHowDraft(prayer.answer || "");
                  setAnswering(true);
                }}
                className="text-[10px] text-on-surface-variant/80 hover:text-primary font-semibold"
              >
                Edit Testimony
              </button>
            )}
          </div>
          {prayer.answer && (
            <p className="font-serif text-[14px] text-on-surface mt-1 leading-relaxed italic">
              "{prayer.answer}"
            </p>
          )}
        </div>
      )}

      {/* Testimony compose box */}
      {answering && (
        <div className="mt-2.5 p-3 bg-surface-variant/30 rounded-xl border border-outline-variant/60">
          <label className="block text-[10px] uppercase tracking-wider font-bold text-on-surface-variant mb-1">
            How was it answered?
          </label>
          <textarea
            className="w-full p-2.5 rounded-xl bg-surface border border-outline-variant focus:border-primary outline-none text-xs text-on-surface resize-none"
            autoFocus
            rows={2}
            value={howDraft}
            onChange={(e) => setHowDraft(e.target.value)}
            placeholder="A sentence on how God answered — the testimony."
          />
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              className="px-3 py-1 rounded-full text-[11px] text-on-surface-variant hover:bg-surface-variant"
              onClick={() => setAnswering(false)}
            >
              Skip
            </button>
            <button
              type="button"
              className="px-3 py-1 rounded-full text-[11px] bg-primary text-on-primary font-semibold"
              onClick={() => {
                onUpdateStatus(prayer, 'answered', howDraft.trim(), prayer.answeredAt || format(new Date(), 'MMM d'));
                setAnswering(false);
              }}
            >
              Save
            </button>
          </div>
        </div>
      )}

      {/* Marks status dropdown */}
      {isOperator && (
        <div className="mt-3.5 flex flex-col gap-1.5 prt-mark">
          <span className="text-[10.5px] uppercase tracking-wider text-on-surface-variant/75 prt-mark-label">
            {variant === 'last' && needsMark ? 'Where did it land?' : 'Mark status'}
          </span>
          <div className={cn(
            "relative border rounded-xl bg-surface-container-low transition-all prt-mark-select",
            prayer.status && `status-${prayer.status}`
          )}>
            <select
              value={prayer.status || ""}
              onChange={(e) => {
                const val = e.target.value as Status | '';
                if (!val) {
                  onUpdateStatus(prayer, 'pending');
                  return;
                }
                if (val === 'answered') {
                  onUpdateStatus(prayer, 'answered', prayer.answer || undefined, prayer.answeredAt || format(new Date(), 'MMM d'));
                  if (!prayer.answer) {
                    setHowDraft("");
                    setAnswering(true);
                  }
                } else {
                  setAnswering(false);
                  onUpdateStatus(prayer, val);
                }
              }}
              className="w-full h-11 pl-3.5 pr-9 bg-transparent outline-none border-0 text-sm font-semibold appearance-none cursor-pointer text-on-surface-variant/90"
            >
              <option value="">Not yet marked</option>
              {MARK_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {STATUS_LABEL[o]}
                </option>
              ))}
            </select>
            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-xs text-on-surface-variant/60 prt-mark-select-caret">
              ▾
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// AddThisWeek composer for mobile card
function AddThisWeekMobile({
  firstName,
  defaultOpen,
  onAdd,
}: {
  firstName: string;
  defaultOpen?: boolean;
  onAdd: (text: string) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  const [saving, setSaving] = useState(false);
  const [val, setVal] = useState('');

  const save = async () => {
    const t = val.trim();
    if (!t) return;
    setSaving(true);
    const ok = await onAdd(t);
    setSaving(false);
    if (ok) {
      setVal('');
      setOpen(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 border border-dashed border-outline-variant hover:border-primary text-xs font-semibold rounded-xl text-on-surface-variant/95 transition-colors prt-week-add"
      >
        <Plus className="w-3.5 h-3.5" />
        <span>Write what we're holding for {firstName} this week</span>
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 mt-1">
      <textarea
        autoFocus
        rows={3}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        placeholder={`What are we praying for ${firstName} this week?`}
        className="w-full p-2.5 rounded-xl bg-surface-container-low border border-outline-variant focus:border-primary outline-none text-sm text-on-surface resize-none"
      />
      <div className="flex gap-2 justify-end">
        <button
          onClick={() => {
            setVal('');
            setOpen(false);
          }}
          className="px-3.5 py-1.5 rounded-full text-xs text-on-surface-variant hover:text-on-surface"
        >
          Cancel
        </button>
        <button
          onClick={save}
          disabled={!val.trim() || saving}
          className="px-3.5 py-1.5 bg-primary text-on-primary rounded-full text-xs font-semibold disabled:opacity-50"
        >
          {saving ? 'Adding…' : 'Add prayer'}
        </button>
      </div>
    </div>
  );
}
