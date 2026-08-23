// Outreach — once a month a team goes to a park, hands out Bibles, tracts and
// booklets, and talks to whoever stops. Logged AFTER the fact, like a visit —
// but the record exists for the NAMES: whoever leaves a number becomes a real
// contact that same moment, and sits in "people we met, not yet reached" until
// someone rings them, usually the next day.
//
// Ported from the design project (views/outreach.jsx). One deliberate change:
// full-timers only — trainees and community members don't see this page
// (`/outreach` is gated at admin in src/lib/permissions.ts).
import React, { useState, useEffect, useMemo } from 'react';
import { Plus, ChevronDown, X, Trash2, Pencil, Check, Image as ImageIcon, BookOpen } from 'lucide-react';
import {
  collection,
  collectionGroup,
  onSnapshot,
  query,
  orderBy,
  limit,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  getDocs,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, logActivity } from '../lib/firebase';
import { addTodo } from '../lib/todos';
import { addThreadMessage, subscribeAllThreads } from '../lib/threads';
import { canLogOutreach } from '../lib/permissions';
import { cn, getUserInitials } from '../lib/utils';
import { useAuth } from '../components/AuthProvider';
import { useLanguage } from '../components/LanguageProvider';
import { Translate } from '../components/Translate';
import { Contact } from '../types';
import PageContainer from '../components/layout/PageContainer';
import ContactDetailsModal from '../components/modals/ContactDetailsModal';
import { usePreserveScroll } from '../lib/usePreserveScroll';
import { Skeleton } from '../components/ui/Skeleton';
import { DataLoadError } from '../components/ui/DataLoadError';
import { RowActions } from '../components/ui/RowActions';
import { buildContactRowActions } from '../lib/rowActions';
import { UserEntityState } from '../lib/userEntityState';

// ── types (the web app has no @cisa/core dependency — own copy) ────────────
interface OutreachName {
  id: string;
  name: string;
  contact: string;
  spokeWith: string;
  note: string;
  contactId: string | null;
  takenBy: string | null;
}
interface OutreachRecord {
  id: string;
  date: string;
  where: string;
  went: string[];
  others: number;
  handed: { bibles: number; tracts: number; booklets: number };
  how: string;
  photoCount: number;
  names: OutreachName[];
  createdById?: string | null;
  createdAt?: string;
}
interface AppUser {
  uid: string;
  displayName?: string;
  role?: string;
  approved?: boolean;
  email?: string;
}

// ── dates & derivations (mirror the shared @cisa/core outreach module) ─────
// Outing dates are stored as UTC calendar dates (toISOString().slice(0, 10)),
// so day/month/days-since are read straight off the string / parsed as UTC —
// parsing them as local time would shift days near midnight boundaries.
const DAY_MS = 86_400_000;
const MO_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const otDayNum = (s: string) => parseInt(s.slice(8, 10), 10);
const otMonth = (s: string) => MO_SHORT[parseInt(s.slice(5, 7), 10) - 1] ?? '';
const outreachDaysSince = (dateStr: string) => Math.round((Date.now() - new Date(dateStr + 'T12:00:00Z').getTime()) / DAY_MS);
const otWhen = (s: string, t: (key: string, fallback?: string) => string) => {
  const n = outreachDaysSince(s);
  if (n <= 0) return t('outreach.today');
  if (n === 1) return t('outreach.yesterday');
  if (n < 21) return t('outreach.days_ago').replace('{n}', String(n));
  return `${otMonth(s)} ${otDayNum(s)}`;
};
const otFirst = (n: string) => (n || '').split(' ')[0];
const otAnd = (a: string[], t: (key: string, fallback?: string) => string) =>
  a.length <= 1 ? a[0] || '' : a.length === 2 ? `${a[0]} ${t('outreach.and')} ${a[1]}` : `${a.slice(0, -1).join(', ')} ${t('outreach.and')} ${a[a.length - 1]}`;
const otHandedLine = (h: OutreachRecord['handed'] | undefined, t: (key: string, fallback?: string) => string) =>
  [
    h && h.bibles ? `${h.bibles} ${t('outreach.bibles')}` : null,
    h && h.tracts ? `${h.tracts} ${t('outreach.tracts')}` : null,
    h && h.booklets ? `${h.booklets} ${t('outreach.booklets')}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
const outreachMonthKey = (s: string) => s.slice(0, 7);

type Touch = { contactId: string; ms: number; note: string };
const contactIdFromPath = (path: string) => path.split('/')[1] ?? '';
const outreachReached = (o: OutreachRecord, n: OutreachName, touches: Touch[]) => {
  if (!n.contactId) return false;
  const after = new Date(o.date + 'T23:59:00Z').getTime();
  return touches.some((t) => t.contactId === n.contactId && t.ms > after);
};
const outreachPending = (records: OutreachRecord[], touches: Touch[]) =>
  records
    .flatMap((o) => (o.names || []).map((n) => ({ o, n, days: outreachDaysSince(o.date) })))
    .filter((p) => !outreachReached(p.o, p.n, touches))
    .sort((a, b) => b.days - a.days);
const outreachNewestFirst = (records: OutreachRecord[]) =>
  [...records].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

// ── the app's flat last-touch feed (same as My Day) ────────────────────────
function useTouches(): { touches: Touch[] } {
  const [touches, setTouches] = useState<Touch[]>([]);
  useEffect(() => {
    const onError = (e: unknown) => handleFirestoreError(e, OperationType.LIST, 'interactions (collectionGroup)');
    const unsubI = onSnapshot(
      query(collectionGroup(db, 'interactions'), orderBy('createdAt', 'desc'), limit(500)),
      (snap) =>
        setTouches(
          snap.docs
            .map((d) => {
              const data = d.data();
              return { contactId: contactIdFromPath(d.ref.path), ms: new Date(data.createdAt ?? '').getTime(), note: (data.content ?? '').trim() };
            })
            .filter((t) => !Number.isNaN(t.ms)),
        ),
      onError,
    );
    const unsubT = subscribeAllThreads((messages) => {
      // Threads are the single per-person conversation surface. Team-scope
      // Discussion messages are Full-timer-only, so don't surface them as a
      // public outreach touch.
      const threadTouches = messages
        .filter((m) => m.scope !== 'team')
        .map((m) => ({
          contactId: m.contactId,
          ms: new Date(m.at).getTime(),
          note: m.body.trim(),
        }))
        .filter((t) => !Number.isNaN(t.ms));
      setTouches((prev) => threadTouches.concat(prev));
    });
    return () => {
      unsubI();
      unsubT();
    };
  }, []);
  return { touches };
}

function useOutreachData() {
  const [records, setRecords] = useState<OutreachRecord[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onError = (e: unknown, path: string) => {
      setError(`Couldn't load ${path}.`);
      setLoading(false);
      handleFirestoreError(e, OperationType.LIST, path);
    };
    const unsubOutreach = onSnapshot(
      query(collection(db, 'outreach'), orderBy('date', 'desc')),
      (snap) => {
        setRecords(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<OutreachRecord, 'id'>) })));
        setLoading(false);
      },
      (e) => onError(e, 'outreach'),
    );
    const unsubContacts = onSnapshot(
      collection(db, 'contacts'),
      (snap) => setContacts(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Contact, 'id'>) }))),
      (e) => onError(e, 'contacts'),
    );
    const unsubUsers = onSnapshot(query(collection(db, 'users'), orderBy('displayName', 'asc')), (snap) =>
      setUsers(
        snap.docs
          .map((d) => ({ uid: d.id, ...(d.data() as Omit<AppUser, 'uid'>) }))
          .filter(
            (u) =>
              u.approved &&
              !((u.email || '').toLowerCase().startsWith('cisa-') || (u.displayName || '').toLowerCase().startsWith('cisa-')),
          ),
      ),
    );
    return () => {
      unsubOutreach();
      unsubContacts();
      unsubUsers();
    };
  }, []);

  const { touches } = useTouches();
  const contactById = (id?: string | null) => contacts.find((c) => c.id === id);
  const userById = (id?: string | null) => users.find((u) => u.uid === id);
  const pending = useMemo(() => outreachPending(records, touches), [records, touches]);
  const newest = useMemo(() => outreachNewestFirst(records), [records]);
  const thisMonth = newest.filter((o) => outreachMonthKey(o.date) === outreachMonthKey(new Date().toISOString().slice(0, 10)));
  const earlier = newest.filter((o) => !thisMonth.includes(o));
  const stats = useMemo(
    () => ({
      months: records.length,
      names: records.reduce((n, o) => n + (o.names || []).length, 0),
      bibles: records.reduce((n, o) => n + (o.handed?.bibles || 0), 0),
    }),
    [records],
  );

  return { records, contacts, users, loading, error, touches, contactById, userById, pending, newest, thisMonth, earlier, stats };
}

// ── shared bits ────────────────────────────────────────────────────────────
const INPUT =
  'w-full h-11 px-4 rounded-xl bg-surface-container-high border border-outline focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-sm text-on-surface';
const BTN_PRIMARY =
  'inline-flex items-center justify-center gap-2 h-11 px-6 rounded-full bg-primary text-on-primary font-semibold   text-sm cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed transition-all hover: active:scale-[0.98]';
const BTN_GHOST = 'inline-flex items-center justify-center gap-2 h-11 px-6 rounded-full font-semibold text-accent hover:bg-primary/5 text-sm cursor-pointer';
const BTN_SM = 'inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-full font-semibold text-xs cursor-pointer transition-all';
const BTN_SM_PRIMARY = cn(BTN_SM, 'bg-primary text-on-primary   hover: active:scale-[0.98]');
const BTN_SM_GHOST = cn(BTN_SM, 'text-accent hover:bg-primary/5');

function Face({ label, title, lg }: { label: string; title?: string; lg?: boolean }) {
  return (
    <span
      title={title}
      className={cn(
        'inline-grid place-items-center rounded-full font-semibold text-on-surface-variant shrink-0',
        lg
          ? 'h-10 w-10 text-[13px] bg-stage-accent-soft text-stage-accent border border-stage-accent'
          : 'h-[26px] w-[26px] text-[10.5px] border border-outline-variant',
      )}
    >
      {label}
    </span>
  );
}

const firstStageLabel = async () => {
  try {
    const snap = await getDocs(query(collection(db, 'stages'), orderBy('order', 'asc'), limit(1)));
    return snap.empty ? 'Lead' : (snap.docs[0].data().label as string);
  } catch {
    return 'Lead';
  }
};
const dueTomorrow = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString();
};
const initialsOf = (name?: string, fallback?: string) => getUserInitials(name) || (fallback || '?').slice(0, 2).toUpperCase();

// ── the queue: names still waiting on a first call ─────────────────────────
function PendingRow({
  item,
  me,
  isAdmin,
  onOpenContact,
  onTake,
  onNudge,
  contactById,
  userById,
}: {
  item: { o: OutreachRecord; n: OutreachName; days: number };
  me: string;
  /** Take / Remind write tasks + threads, which the rules keep operator+ —
   * community (viewer) sees the queue and can open people, nothing more. */
  isAdmin: boolean;
  onOpenContact: (c: Contact) => void;
  onTake: (o: OutreachRecord, n: OutreachName) => void;
  onNudge: (o: OutreachRecord, n: OutreachName) => void;
  contactById: (id?: string | null) => Contact | undefined;
  userById: (id?: string | null) => AppUser | undefined;
}) {
  const { t } = useLanguage();
  const { o, n, days } = item;
  const who = userById(n.spokeWith);
  const mine = n.takenBy ? n.takenBy === me : n.spokeWith === me;
  const cold = days >= 7;
  const contact = n.contactId ? contactById(n.contactId) : undefined;
  return (
    <div className={cn('rounded-3xl border bg-surface-container p-4 flex flex-col gap-3', cold ? 'border-warning' : 'border-outline-variant')}>
      <div className="flex items-start gap-3">
        <Face label={initialsOf(undefined, n.name)} lg title={n.name} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="font-semibold text-on-surface">{n.name}</span>
            <span className={cn('text-xs', cold ? 'text-warning' : 'text-on-surface-variant')}>
              {days <= 0 ? t('outreach.met_today') : days === 1 ? t('outreach.met_yesterday') : t('outreach.days_waiting').replace('{n}', String(days))}
            </span>
          </div>
          <p className="text-sm text-on-surface-variant mt-0.5">
            {n.contact || t('outreach.no_number_written')} · {t('outreach.met_at').replace('{where}', o.where)}
            {n.note && <> · <Translate text={n.note} /></>}
          </p>
          <p className="text-xs text-on-surface-variant mt-0.5">
            {(who?.displayName || n.spokeWith) && <>{who?.displayName || n.spokeWith} {t('outreach.spoke_with').replace('{name}', otFirst(n.name))}</>}
            {n.takenBy && (
              <>
                {' '}
                · <b>{n.takenBy === me ? t('outreach.youre_following_up') : t('outreach.is_following_up').replace('{name}', otFirst(userById(n.takenBy)?.displayName || n.takenBy))}</b>
              </>
            )}
          </p>
        </div>
        <RowActions
          className="shrink-0"
          label={t('outreach.more_for').replace('{name}', n.name)}
          items={buildContactRowActions({
            contact: contact || {
              id: '',
              name: n.name,
              role: '',
              location: '',
              email: '',
              phone: '',
              stage: '',
              lastSeen: '',
              initials: '',
            },
            onOpen: contact ? () => onOpenContact(contact) : undefined,
            onMakeTodo: isAdmin && !n.takenBy ? () => onTake(o, n) : undefined,
            onFollowUp: contact
              ? () => {
                  UserEntityState.markDone(me, `contact:${contact.id}`);
                  UserEntityState.markDone(me, contact.id);
                }
              : undefined,
            hide: ['share', ...(contact ? [] : ['open'])],
          })}
        />
      </div>
      <div className="flex gap-2 flex-wrap">
        {isAdmin && n.spokeWith !== me && !n.takenBy && (
          <button className={BTN_SM_GHOST} onClick={() => onNudge(o, n)}>
            {t('outreach.remind').replace('{name}', otFirst(who?.displayName || n.spokeWith || t('outreach.them')))}
          </button>
        )}
        {isAdmin && !n.takenBy && (
          <button className={BTN_SM_PRIMARY} onClick={() => onTake(o, n)}>
            {t('outreach.ill_take_this')}
          </button>
        )}
        {contact && (
          <button className={BTN_SM_PRIMARY} onClick={() => onOpenContact(contact)}>
            {mine ? t('outreach.ring_them') : t('outreach.open')}
          </button>
        )}
      </div>
    </div>
  );
}

// ── one month out ──────────────────────────────────────────────────────────
function OutreachCard({
  item,
  open,
  onToggle,
  onOpenContact,
  onEdit,
  onRemove,
  isAdmin,
  touches,
  contactById,
  userById,
}: {
  item: OutreachRecord;
  open: boolean;
  onToggle: () => void;
  onOpenContact: (c: Contact) => void;
  onEdit: () => void;
  onRemove: () => void;
  /** Edit / Remove are admin-only (the rules keep outreach update/delete
   * admin); community (viewer) reads the record and opens the people. */
  isAdmin: boolean;
  touches: Touch[];
  contactById: (id?: string | null) => Contact | undefined;
  userById: (id?: string | null) => AppUser | undefined;
}) {
  const { t } = useLanguage();
  const [confirm, setConfirm] = useState(false);
  const names = item.names || [];
  const reached = names.filter((n) => outreachReached(item, n, touches)).length;
  const nPhotos = item.photoCount || 0;
  const went = item.went || [];
  return (
    <article className={cn('rounded-3xl border bg-surface-container  overflow-hidden', open ? 'border-stage-accent' : 'border-outline-variant')}>
      <button className="w-full text-left px-4 sm:px-5 py-4 flex items-start gap-4 hover:bg-surface-container-high/40" onClick={onToggle}>
        <div className="flex flex-col items-center pt-0.5 w-[52px] shrink-0">
          <span className="font-serif text-[26px] leading-none text-on-surface">{otDayNum(item.date)}</span>
          <span className="text-[11px]   text-on-surface-variant">{otMonth(item.date)}</span>
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-serif text-[19px] font-medium text-on-surface leading-snug">{item.where}</h3>
          <div className="flex items-center gap-2 flex-wrap text-[13px] text-on-surface-variant mt-1">
            <span>{otWhen(item.date, t)}</span>
            <span>·</span>
            <span>{t('outreach.of_us_went').replace('{n}', String(went.length + (item.others || 0)))}</span>
            {otHandedLine(item.handed, t) && (
              <>
                <span>·</span>
                <span>{otHandedLine(item.handed, t)}</span>
              </>
            )}
          </div>
          {!open && item.how && <p className="mt-2 text-sm text-on-surface-variant line-clamp-2"><Translate text={item.how.split('\n')[0]} /></p>}
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <div className="flex">
            {went.slice(0, 4).map((id) => (
              <span key={id} className="-ml-1.5 first:ml-0">
                <Face label={initialsOf(userById(id)?.displayName, id)} title={userById(id)?.displayName || id} />
              </span>
            ))}
            {item.others > 0 && (
              <span className="-ml-1.5 inline-grid place-items-center h-[26px] w-[26px] rounded-full border border-outline-variant bg-surface-container-high text-[10px] text-on-surface-variant">+{item.others}</span>
            )}
          </div>
          <div className="flex gap-1.5 items-center">
            {names.length > 0 ? (
              <span className="inline-flex items-center gap-1 h-5 px-2 rounded-full text-[11px] font-semibold bg-stage-accent-soft text-stage-accent whitespace-nowrap">
                {names.length} {names.length === 1 ? t('outreach.name') : t('outreach.names')}
                {reached > 0 && <span className="border-l border-current opacity-65 pl-1.5 font-medium">{reached} {t('outreach.reached')}</span>}
              </span>
            ) : (
              <span className="inline-flex h-5 px-2 rounded-full text-[11px] font-medium italic bg-surface-container-high text-on-surface-variant">{t('outreach.no_names')}</span>
            )}
            {nPhotos > 0 && (
              <span className="inline-flex items-center gap-1 h-5 px-2 rounded-full text-[11px] font-semibold bg-surface-container-high text-on-surface-variant">
                <ImageIcon className="w-3 h-3" />
                {nPhotos}
              </span>
            )}
          </div>
        </div>
        <ChevronDown className={cn('w-4 h-4 text-on-surface-variant shrink-0 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="px-4 sm:px-5 pb-4 pt-3 border-t border-outline-variant space-y-4">
          <div>
            <div className="text-[11px]   text-on-surface-variant mb-1.5">{t('outreach.how_it_went')}</div>
            {item.how ? (
              item.how.split('\n').filter(Boolean).map((p, i) => (
                <p key={i} className="text-[15px] leading-relaxed text-on-surface">
                  <Translate text={p} />
                </p>
              ))
            ) : (
              <p className="text-sm italic text-on-surface-variant">{t('outreach.nothing_written_down_yet')}</p>
            )}
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <div className="text-[11px]   text-on-surface-variant mb-1.5">{t('outreach.who_went')}</div>
              <div className="flex flex-wrap gap-2">
                {went.map((id) => (
                  <span key={id} className="inline-flex items-center gap-2 text-sm text-on-surface-variant">
                    <Face label={initialsOf(userById(id)?.displayName, id)} />
                    {userById(id)?.displayName || id}
                  </span>
                ))}
                {item.others > 0 && <span className="text-sm italic text-on-surface-variant">{t('outreach.and_others_from_church').replace('{n}', String(item.others))}</span>}
              </div>
            </div>
            <div>
              <div className="text-[11px]   text-on-surface-variant mb-1.5">{t('outreach.what_we_handed_out')}</div>
              <div className="flex gap-4 flex-wrap">
                {(
                  [
                    ['bibles', 'outreach.bibles'],
                    ['tracts', 'outreach.tracts'],
                    ['booklets', 'outreach.booklets'],
                  ] as const
                ).map(([k, label]) => (
                  <span key={k} className="text-sm text-on-surface-variant">
                    <b className="font-serif text-xl font-medium text-on-surface mr-1.5">{item.handed?.[k] || 0}</b>
                    {t(label)}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div>
            <div className="text-[11px]   text-on-surface-variant mb-1.5">{t('outreach.who_left_us_their_number')}</div>
            {names.length === 0 ? (
              <p className="text-sm italic text-on-surface-variant">{t('outreach.nobody_this_time')}</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {names.map((n) => {
                  const done = outreachReached(item, n, touches);
                  const contact = n.contactId ? contactById(n.contactId) : undefined;
                  return (
                    <button
                      key={n.id}
                      className={cn('flex items-center gap-3 w-full text-left px-3 py-2 rounded-xl bg-surface-container-high border border-outline-variant hover:border-stage-accent', done && 'opacity-80')}
                      onClick={() => contact && onOpenContact(contact)}
                    >
                      <Face label={initialsOf(undefined, n.name)} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-on-surface">{n.name}</span>
                        <span className="block text-xs text-on-surface-variant truncate">
                          {n.contact}
                          {n.note && <> · <Translate text={n.note} /></>}
                        </span>
                      </span>
                      <span className={cn('text-xs shrink-0 inline-flex items-center gap-1', done ? 'text-success' : 'text-on-surface-variant')}>
                        {done ? (
                          <>
                            <Check className="w-3 h-3" /> {t('outreach.reached')}
                          </>
                        ) : (
                          t('outreach.still_waiting')
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {isAdmin && (
            <div className="flex items-center gap-4 pt-1">
              <button className="inline-flex items-center gap-1 text-xs font-medium text-on-surface-variant hover:text-on-surface" onClick={onEdit}>
                <Pencil className="w-3 h-3" /> {t('outreach.edit_this_one')}
              </button>
              {confirm ? (
                <span className="inline-flex items-center gap-2 text-xs text-on-surface-variant">
                  {t('outreach.remove_it_from_record')}
                  <button className={cn(BTN_SM, 'bg-error text-on-error')} onClick={onRemove}>
                    {t('outreach.remove')}
                  </button>
                  <button className={BTN_SM_GHOST} onClick={() => setConfirm(false)}>
                    {t('outreach.keep')}
                  </button>
                </span>
              ) : (
                <button className="inline-flex items-center gap-1 text-xs font-medium text-on-surface-variant hover:text-error" onClick={() => setConfirm(true)}>
                  <Trash2 className="w-3 h-3" /> {t('outreach.remove')}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

// ── log / edit modal ───────────────────────────────────────────────────────
function LogOutreachModal({
  item,
  me,
  userName,
  canCreateTasks,
  goers,
  onClose,
  onSaved,
}: {
  item: OutreachRecord | null;
  me: string;
  userName: string;
  /** The rules keep task creation operator+ — a community (viewer) logger's
   * names still become contacts, just without the auto-to-do. */
  canCreateTasks: boolean;
  goers: AppUser[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useLanguage();
  const editing = !!item;
  const [date, setDate] = useState(item ? item.date : new Date().toISOString().slice(0, 10));
  const [where, setWhere] = useState(item ? item.where : '');
  const [went, setWent] = useState<string[]>(item ? item.went.slice() : [me]);
  const [others, setOthers] = useState(item ? String(item.others || 0) : '');
  const [handed, setHanded] = useState<{ bibles: string; tracts: string; booklets: string }>(
    item
      ? { bibles: String(item.handed?.bibles ?? 0), tracts: String(item.handed?.tracts ?? 0), booklets: String(item.handed?.booklets ?? 0) }
      : { bibles: '', tracts: '', booklets: '' },
  );
  const [how, setHow] = useState(item ? item.how : '');
  const [rows, setRows] = useState(
    editing
      ? []
      : [{ key: 1, name: '', contact: '', spokeWith: me, note: '' } as { key: number; name: string; contact: string; spokeWith: string; note: string }],
  );
  const [saving, setSaving] = useState(false);
  const nextKey = React.useRef(2);

  const filled = rows.filter((r) => r.name.trim());
  const setRow = (key: number, patch: Partial<{ name: string; contact: string; spokeWith: string; note: string }>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const num = (v: string) => Math.max(0, parseInt(v, 10) || 0);

  const submit = async () => {
    if (!where.trim() || saving) return;
    setSaving(true);
    try {
      const stage = await firstStageLabel();
      const names: OutreachName[] = [];
      for (const r of filled) {
        const trimmed = r.name.trim();
        const isEmail = r.contact.includes('@');
        const contactRef = await addDoc(collection(db, 'contacts'), {
          name: trimmed,
          role: '',
          location: where.trim(),
          email: isEmail ? r.contact.trim() : '',
          phone: isEmail ? '' : r.contact.trim(),
          stage,
          tags: ['outreach'],
          notes: r.note.trim(),
          spiritualBackground: '',
          initials: getUserInitials(trimmed),
          lastSeen: 'Just now',
          createdAt: date,
          serverCreatedAt: serverTimestamp(),
          createdBy: me,
          createdByName: userName,
          hasNewActivity: true,
          attendance: {},
        });
        if (canCreateTasks && r.spokeWith) {
          await addTodo(
            { title: `Ring ${otFirst(trimmed)} — met at ${where.trim()}`, assigneeId: r.spokeWith, dueDate: dueTomorrow(), contactId: contactRef.id, contactName: trimmed },
            { uid: me, name: userName },
          );
        }
        // Firestore's client-side id generator — unique across records and
        // devices (Date.now()+length wasn't), so PendingRow's keys never clash.
        names.push({ id: 'ON-' + doc(collection(db, 'outreach')).id, name: trimmed, contact: r.contact.trim(), spokeWith: r.spokeWith, note: r.note.trim(), contactId: contactRef.id, takenBy: null });
      }
      const payload = {
        date,
        where: where.trim(),
        went,
        others: num(others),
        handed: { bibles: num(handed.bibles), tracts: num(handed.tracts), booklets: num(handed.booklets) },
        how: how.trim(),
        photoCount: 0,
      };
      if (editing && item) {
        // Editing never touches the names — they're the record's whole point.
        await updateDoc(doc(db, 'outreach', item.id), payload);
        logActivity({ action: 'edited the outreach at', targetId: item.id, targetName: where.trim(), targetType: 'event', type: 'edit', description: where.trim() });
      } else {
        const ref = await addDoc(collection(db, 'outreach'), { ...payload, names, createdById: me, createdByName: userName, createdAt: serverTimestamp() });
        logActivity({
          action: 'logged an outreach',
          targetId: ref.id,
          targetName: where.trim(),
          targetType: 'event',
          type: 'create',
          description: names.length ? `${names.length} ${names.length === 1 ? 'person' : 'people'} left their number: ${otAnd(names.map((n) => n.name), t)}.` : 'No names written down.',
        });
      }
      onSaved();
    } catch (e) {
      handleFirestoreError(e, editing ? OperationType.UPDATE : OperationType.CREATE, 'outreach');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 md:p-10"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="relative w-full max-w-2xl bg-surface-container rounded-[28px] shadow-2xl border border-outline-variant overflow-hidden flex flex-col max-h-full">
        <div className="px-6 py-4 border-b border-outline-variant flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <span className="grid place-items-center h-9 w-9 rounded-xl bg-stage-accent-soft text-stage-accent">
              <BookOpen className="w-4 h-4" />
            </span>
            <div>
              <div className="text-lg font-semibold text-on-surface">{editing ? t('outreach.edit_gospel_outing') : t('outreach.log_gospel_outing')}</div>
              <div className="text-sm text-on-surface-variant">{editing ? t('outreach.edit_gospel_outing_sub') : t('outreach.log_gospel_outing_sub')}</div>
            </div>
          </div>
          <button className="p-2 hover:bg-surface-container-high rounded-full transition-colors text-on-surface-variant cursor-pointer" onClick={onClose}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto custom-scrollbar flex-1 p-6 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-xs font-semibold text-on-surface-variant   px-1">{t('outreach.when')}</span>
              <input type="date" className={cn(INPUT, 'mt-1.5')} value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-on-surface-variant   px-1">{t('outreach.where')}</span>
              <input className={cn(INPUT, 'mt-1.5')} value={where} placeholder={t('outreach.where_placeholder')} onChange={(e) => setWhere(e.target.value)} />
            </label>
          </div>

          <div>
            <span className="text-xs font-semibold text-on-surface-variant   px-1">{t('outreach.who_went')}</span>
            <div className="flex flex-wrap gap-2 mt-2">
              {goers.map((u) => (
                <button
                  key={u.uid}
                  className={cn(
                    'h-9 px-3.5 rounded-full text-xs font-semibold border border-outline-variant text-on-surface-variant cursor-pointer transition-all',
                    went.includes(u.uid) && 'bg-stage-accent-soft text-stage-accent border-stage-accent',
                  )}
                  onClick={() => setWent((w) => (w.includes(u.uid) ? w.filter((x) => x !== u.uid) : w.concat(u.uid)))}
                >
                  {u.displayName}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 mt-2 text-sm text-on-surface-variant">
              <span>{t('outreach.plus')}</span>
              <input className={cn(INPUT, 'w-16 text-center')} value={others} onChange={(e) => setOthers(e.target.value)} placeholder="0" />
              <span>{t('outreach.others_from_church')}</span>
            </div>
          </div>

          <div>
            <span className="text-xs font-semibold text-on-surface-variant   px-1">{t('outreach.what_we_handed_out')}</span>
            <div className="flex gap-4 flex-wrap mt-2">
              {(
                [
                  ['bibles', 'outreach.bibles'],
                  ['tracts', 'outreach.tracts'],
                  ['booklets', 'outreach.booklets'],
                ] as const
              ).map(([k, label]) => (
                <label key={k} className="flex items-center gap-2 text-sm text-on-surface-variant">
                  <input className={cn(INPUT, 'w-16 text-center')} value={handed[k]} onChange={(e) => setHanded((h) => ({ ...h, [k]: e.target.value }))} placeholder="0" />
                  {t(label)}
                </label>
              ))}
            </div>
          </div>

          <label className="block">
            <span className="text-xs font-semibold text-on-surface-variant   px-1">{t('outreach.how_it_went')}</span>
            <textarea
              className="mt-1.5 w-full min-h-[120px] p-4 rounded-xl bg-surface-container-high border border-outline focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-sm text-on-surface resize-none"
              rows={5}
              value={how}
              onChange={(e) => setHow(e.target.value)}
              placeholder={t('outreach.how_placeholder')}
            />
          </label>

          {!editing && (
            <div>
              <span className="text-xs font-semibold text-on-surface-variant   px-1">{t('outreach.who_left_us_their_number')}</span>
              <div className="flex flex-col gap-3 mt-2">
                {rows.map((r) => (
                  <div key={r.key} className="rounded-2xl border border-outline-variant bg-surface-container-high p-3 space-y-2">
                    <div className="flex gap-2 flex-wrap">
                      <input className={cn(INPUT, 'flex-1 min-w-[120px]')} value={r.name} placeholder={t('outreach.their_name')} onChange={(e) => setRow(r.key, { name: e.target.value })} />
                      <input className={cn(INPUT, 'flex-1 min-w-[120px]')} value={r.contact} placeholder={t('outreach.number_or_email')} onChange={(e) => setRow(r.key, { contact: e.target.value })} />
                      <select className={cn(INPUT, 'appearance-none cursor-pointer flex-1 min-w-[160px]')} value={r.spokeWith} onChange={(e) => setRow(r.key, { spokeWith: e.target.value })}>
                        {goers.map((u) => (
                          <option key={u.uid} value={u.uid}>
                            {u.displayName} {t('outreach.spoke_with_them')}
                          </option>
                        ))}
                      </select>
                      {rows.length > 1 && (
                        <button className="p-2 hover:bg-surface-variant rounded-full transition-colors text-on-surface-variant cursor-pointer" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                    <input className={INPUT} value={r.note} placeholder={t('outreach.what_they_said')} onChange={(e) => setRow(r.key, { note: e.target.value })} />
                  </div>
                ))}
              </div>
              <button className="inline-flex items-center gap-1 text-sm font-semibold text-accent mt-3 cursor-pointer hover:underline" onClick={() => setRows((rs) => rs.concat({ key: nextKey.current++, name: '', contact: '', spokeWith: me, note: '' }))}>
                <Plus className="w-3 h-3" /> {t('outreach.another_name')}
              </button>
              {filled.length > 0 && (
                <p className="text-xs text-on-surface-variant mt-2">
                  {t('outreach.person_joins_app').replace('{n}', String(filled.length))}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-outline-variant shrink-0 flex items-center gap-3 bg-surface-container-low/50">
          <span className="flex-1 text-sm text-on-surface-variant">{where.trim() ? t('outreach.names_become_contacts') : t('outreach.say_where_you_went')}</span>
          <button className={BTN_GHOST} onClick={onClose}>
            {t('outreach.cancel')}
          </button>
          <button className={BTN_PRIMARY} disabled={!where.trim() || saving} onClick={submit}>
            {saving ? t('outreach.saving') : editing ? t('outreach.save_changes') : t('outreach.log_the_outing')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── the page ───────────────────────────────────────────────────────────────
export default function Outreach() {
  const { user, role } = useAuth();
  const { t } = useLanguage();
  const me = user?.uid || '';
  const userName = user?.displayName || 'Someone';
  // Outreach is full-timer + community: both see and log (canLog); only the
  // full-timer takes, nudges, edits or removes (admin-only writes in the rules).
  const isAdmin = role === 'admin';
  const canLog = canLogOutreach(role);
  const { loading, error, users, touches, contactById, userById, pending, thisMonth, earlier, stats } = useOutreachData();
  const [logOpen, setLogOpen] = useState(false);
  const [editing, setEditing] = useState<OutreachRecord | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2600);
  };

  const take = async (o: OutreachRecord, n: OutreachName) => {
    try {
      const next = o.names.map((x) => (x.id === n.id ? { ...x, takenBy: me } : x));
      await updateDoc(doc(db, 'outreach', o.id), { names: next });
      await addTodo(
        { title: `Ring ${otFirst(n.name)} — met at ${o.where}`, assigneeId: me, dueDate: dueTomorrow(), contactId: n.contactId, contactName: n.name },
        { uid: me, name: userName },
      );
      showToast(t('outreach.yours_for_tomorrow').replace('{name}', otFirst(n.name)));
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `outreach/${o.id}`);
    }
  };

  const nudge = async (o: OutreachRecord, n: OutreachName) => {
    if (n.contactId && n.spokeWith) {
      await addThreadMessage(
        n.contactId,
        { from: me, fromName: userName, kind: 'nudge', body: `${otFirst(n.name)} gave you their number at ${o.where} ${outreachDaysSince(o.date)} days ago and nobody has rung yet. Could you get to it today?` },
        { to: n.spokeWith, contactName: n.name },
      );
    }
    showToast(t('outreach.sent_reminder').replace('{person}', otFirst(userById(n.spokeWith)?.displayName || n.spokeWith)).replace('{name}', otFirst(n.name)));
  };

  const remove = async (o: OutreachRecord) => {
    try {
      await deleteDoc(doc(db, 'outreach', o.id));
      logActivity({ action: 'removed the outreach at', targetId: o.id, targetName: o.where, targetType: 'event', type: 'edit', description: o.where });
      setOpenId(null);
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `outreach/${o.id}`);
    }
  };

  const last = thisMonth[0] || earlier[0] || null;

  const Group = ({ title, sub, list }: { title: string; sub?: string; list: OutreachRecord[] }) =>
    list.length === 0 ? null : (
      <section className="mt-8">
        <div className="flex items-baseline gap-3 mb-3">
          <h2 className="font-semibold text-lg text-on-surface">{title}</h2>
          {sub && <span className="text-sm text-on-surface-variant">{sub}</span>}
        </div>
        <div className="flex flex-col gap-3">
          {list.map((o) => (
            <OutreachCard
              key={o.id}
              item={o}
              open={openId === o.id}
              onToggle={() => setOpenId(openId === o.id ? null : o.id)}
              onOpenContact={setSelectedContact}
              onEdit={() => setEditing(o)}
              onRemove={() => remove(o)}
              isAdmin={isAdmin}
              touches={touches}
              contactById={contactById}
              userById={userById}
            />
          ))}
        </div>
      </section>
    );

  // People detail is a full page (the design's ContactDetail), not a popup.
  usePreserveScroll(!!selectedContact);
  if (selectedContact) {
    return (
      <ContactDetailsModal
        isOpen
        onClose={() => setSelectedContact(null)}
        contact={selectedContact}
      />
    );
  }

  if (error) return <DataLoadError label="the outreach page" />;

  return (
    <PageContainer variant="wide">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-xs font-medium   text-on-surface-variant">{t('outreach.once_a_month_out_in_the_open')}</div>
          <h1 className="font-serif text-3xl sm:text-4xl font-medium text-on-surface mt-1">{t('outreach.gospel')}</h1>
          <p className="text-on-surface-variant mt-2 max-w-2xl">
            {last ? (
              <>
                {t('outreach.last_time_out').replace('{when}', otWhen(last.date, t)).replace('{where}', last.where)}{' '}
                {pending.length > 0 ? (
                  <>
                    <b className="text-on-surface">
                      {(pending.length === 1 ? t('outreach.pending_people') : t('outreach.pending_people_plural')).replace('{n}', String(pending.length))}
                    </b>{' '}
                    {pending.length === 1 ? t('outreach.pending_left_singular') : t('outreach.pending_left_plural')}
                  </>
                ) : (
                  <>{t('outreach.everyone_heard_back')}</>
                )}
              </>
            ) : (
              <>{t('outreach.nothing_written_header')}</>
            )}
          </p>
        </div>
        {canLog && (
          <button className={BTN_PRIMARY} onClick={() => setLogOpen(true)}>
            <Plus className="w-4 h-4" /> {t('outreach.log_a_gospel_outing')}
          </button>
        )}
      </div>

      {pending.length > 0 && (
        <section className="mt-8">
          <div className="flex items-baseline gap-3 mb-3">
            <h2 className="font-semibold text-lg text-on-surface">{t('outreach.people_not_yet_reached')}</h2>
            <span className="text-sm text-on-surface-variant">{t('outreach.door_held_open')}</span>
          </div>
          <div className="flex flex-col gap-2.5">
            {pending.map((p) => (
              <PendingRow key={p.n.id} item={p} me={me} isAdmin={isAdmin} onOpenContact={setSelectedContact} onTake={take} onNudge={nudge} contactById={contactById} userById={userById} />
            ))}
          </div>
        </section>
      )}

      {loading ? (
        <div className="mt-8 space-y-3">
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-24 w-full rounded-2xl" />
        </div>
      ) : (
        <>
          <Group title={t('outreach.this_month')} sub={t('outreach.tap_to_read_it_back')} list={thisMonth} />
          <Group title={t('outreach.earlier_months')} list={earlier} />

          {thisMonth.length === 0 && earlier.length === 0 && (
            <div className="mt-8 rounded-2xl border border-outline-variant bg-surface-container p-6">
              <p className="text-on-surface-variant">
                {t('outreach.nothing_here_yet')}
              </p>
              {canLog && (
                <button className={cn(BTN_PRIMARY, 'mt-4')} onClick={() => setLogOpen(true)}>
                  <Plus className="w-4 h-4" /> {t('outreach.log_a_gospel_outing')}
                </button>
              )}
            </div>
          )}

          <div className="bg-surface rounded-3xl border border-outline-variant/60 px-6 py-5 flex flex-wrap items-end gap-x-8 gap-y-3 mt-8">
            {(
              [
                [stats.months, t('outreach.months_out')],
                [stats.names, t('outreach.names_came_back_with_us')],
                [stats.bibles, t('outreach.bibles_into_hands')],
              ] as const
            ).map(([n, l]) => (
              <div key={l} className="flex items-baseline gap-2">
                <span className="text-2xl font-medium text-on-surface">{n}</span>
                <span className="text-sm text-on-surface-variant">{l}</span>
              </div>
            ))}
            <span className="text-xs text-on-surface-variant max-w-[240px] ml-auto">{t('outreach.counted_so_nobody_waits')}</span>
          </div>
        </>
      )}

      {logOpen && (
        <LogOutreachModal
          item={null}
          me={me}
          userName={userName}
          canCreateTasks={isAdmin}
          goers={users}
          onClose={() => setLogOpen(false)}
          onSaved={() => {
            setLogOpen(false);
            showToast(t('outreach.logged_names_real_people'));
          }}
        />
      )}
      {editing && (
        <LogOutreachModal
          item={editing}
          me={me}
          userName={userName}
          canCreateTasks={isAdmin}
          goers={users}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            showToast(t('outreach.record_updated'));
          }}
        />
      )}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[110]">
          <div className="px-4 py-2.5 rounded-full bg-surface-container shadow-xl border border-outline-variant text-sm font-medium text-on-surface">{toast}</div>
        </div>
      )}
    </PageContainer>
  );
}
