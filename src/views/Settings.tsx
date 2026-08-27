import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  onSnapshot,
  query,
  orderBy,
  setDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { AppUser, Invitation } from '../types';
import { useAuth } from '../components/AuthProvider';
import PageContainer from '../components/layout/PageContainer';
import {
  Shield,
  CheckCircle2,
  XCircle,
  Search,
  UserPlus,
  Mail,
  Trash2,
  Loader2,
  Moon,
  Sun,
  Monitor,
  Sparkles,
  Zap,
  Smartphone,
  Copy,
  Check,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  ChevronDown,
  KeyRound,
  Command,
  LogOut,
  Minus,
  Plus,
  X,
} from 'lucide-react';
import { cn, getUserInitials } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { Skeleton } from '../components/ui/Skeleton';
import { useTheme } from '../components/ThemeProvider';
import { useLanguage } from '../components/LanguageProvider';
import FeedbackList from './FeedbackList';
import UsageStatsPanel from '../components/settings/UsageStatsPanel';
import {
  subscribePartners,
  savePartners,
  groupsForTerm,
  partnersTermKey,
  addToGroup,
  removeFromGroups,
  dropGroup,
  carryOverPartners,
  clearTerm,
  type PartnersByTerm,
} from '../lib/partners';
import { isRealPerson } from '../lib/permissions';
import { useDayGoal, GOAL_MIN, GOAL_MAX } from '../lib/goal';
import { useGatheringTypes } from '../lib/gatheringTypes';
import {
  useCalendarSync,
  CAL_CATEGORIES,
  CAL_APP_URL,
  calStartOfDay,
  calAddDays,
} from '../lib/calendar/calendarSync';
import {
  getWebNotificationPermissionStatus,
  requestWebNotificationPermission,
  registerServiceWorker,
  showWebPushNotification,
} from '../lib/webPush';
import { sendPushNotification } from '../lib/push';

type AppRole = 'admin' | 'manager' | 'operator' | 'viewer';

const OWNER_EMAIL = 'yilongwang05@gmail.com';

const ROLE_LABEL: Record<AppRole, string> = {
  admin: 'Full-timer',
  manager: 'Trainee',
  operator: 'Student',
  viewer: 'Community',
};

// Ordered low → high for the selects. The Full-timer (admin) option is only
// offered to admins (RBAC) — handled where the options are rendered.
const ROLE_OPTIONS: { value: AppRole; label: string }[] = [
  { value: 'viewer', label: 'Community' },
  { value: 'operator', label: 'Student' },
  { value: 'manager', label: 'Trainee' },
  { value: 'admin', label: 'Full-timer' },
];

const ROLE_CARDS: {
  key: AppRole;
  label: string;
  initials: string;
  description: string;
  access: string[];
}[] = [
  {
    key: 'admin',
    label: 'Full-timer',
    initials: 'FT',
    description: 'Full-time staff. Sees the whole work — every person, the team board, and all admin tools.',
    access: ['Today', 'People', 'The Journey', 'Gatherings', 'Prayer', 'History', 'Settings'],
  },
  {
    key: 'manager',
    label: 'Trainee',
    initials: 'TR',
    description: 'Cares for the team. Manages users and accesses all data surfaces, minus dev-only admin.',
    access: ['Today', 'People', 'The Journey', 'Gatherings', 'Prayer', 'History'],
  },
  {
    key: 'operator',
    label: 'Student',
    initials: 'ST',
    description: 'Can add and update people, log interactions, and mark attendance.',
    access: ['Today', 'People', 'Gatherings', 'Prayer'],
  },
  {
    key: 'viewer',
    label: 'Community',
    initials: 'CM',
    description: 'A read-only window — can see gatherings and prayers, nothing else.',
    access: ['Gatherings', 'Prayer'],
  },
];

// ── small shared pieces ────────────────────────────────────────────────

function SectionHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-4">
      <h2 className="font-serif text-2xl text-on-surface">{title}</h2>
      {sub && <p className="text-sm text-on-surface-variant mt-1 max-w-2xl leading-relaxed">{sub}</p>}
    </div>
  );
}

function Avatar({
  name,
  photoURL,
  size = 'md',
}: {
  name?: string | null;
  photoURL?: string | null;
  size?: 'sm' | 'md' | 'lg';
}) {
  const dim =
    size === 'lg' ? 'w-14 h-14 text-lg' : size === 'sm' ? 'w-8 h-8 text-[11px]' : 'w-10 h-10 text-sm';
  return (
    <div
      className={cn(
        'rounded-full overflow-hidden shrink-0 flex items-center justify-center bg-stage-accent-soft text-stage-accent font-semibold border border-outline-variant/40',
        dim,
      )}
    >
      {photoURL ? (
        <img src={photoURL} alt={name || ''} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        getUserInitials(name)
      )}
    </div>
  );
}

// ── Roles & access (RBAC reference cards — reskin only, never removed) ──

function RolesReference({ currentRole }: { currentRole: AppRole | null }) {
  return (
    <div className="flex flex-col gap-2.5 max-w-2xl">
      {ROLE_CARDS.map((card) => {
        const isActive = card.key === currentRole;
        return (
          <div
            key={card.key}
            className={cn(
              'flex gap-4 items-start p-4 rounded-3xl border transition-colors',
              isActive ? 'border-primary/40 bg-primary/5' : 'bg-surface-container border-outline-variant/40',
            )}
          >
            <div
              className={cn(
                'flex-none w-11 h-11 rounded-full flex items-center justify-center text-xs font-semibold shrink-0',
                isActive ? 'bg-primary/15 text-accent' : 'bg-accent-soft text-stage-accent',
              )}
            >
              {card.initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="font-serif text-[17px] text-on-surface leading-tight">{card.label}</span>
                {isActive && (
                  <span className="text-[11px] font-medium text-accent border border-accent-line bg-surface rounded-full px-2 py-0.5 leading-none">
                    your role
                  </span>
                )}
              </div>
              <p className="text-[13px] text-on-surface-variant mt-0.5 leading-none">
                {card.access.length} section{card.access.length !== 1 ? 's' : ''} accessible
              </p>
              <p className="text-[13.5px] text-on-surface/75 leading-relaxed mt-2 max-w-prose">{card.description}</p>
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {card.access.map((section) => (
                  <span
                    key={section}
                    className="text-[12px] text-on-surface-variant bg-surface-container-high border border-outline-variant/40 rounded-full px-2.5 py-0.5"
                  >
                    {section}
                  </span>
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Account & Session ───────────────────────────────────────────────────

function AccountSection() {
  const { user, logOut, role, isApproved } = useAuth();
  const { t } = useLanguage();
  const myRole = (role as AppRole) ?? null;

  return (
    <section className="mt-10">
      <SectionHeader
        title={t('settings.account_session', 'Account & Session')}
        sub={t('settings.account_session_sub', 'Manage your signed-in account and session state.')}
      />
      <div className="rounded-3xl border border-outline-variant/40 bg-surface-container p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        <div className="flex items-center gap-4 min-w-0">
          <Avatar name={user?.displayName || user?.email} photoURL={user?.photoURL} size="lg" />
          <div className="min-w-0">
            <h3 className="font-serif text-xl text-on-surface truncate">{user?.displayName || 'Campus user'}</h3>
            <p className="text-sm text-on-surface-variant truncate">{user?.email}</p>
            <div className="flex flex-wrap gap-2 mt-2">
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border',
                  isApproved
                    ? 'bg-success/10 text-success border-success/20'
                    : 'bg-warning/10 text-warning border-warning/20',
                )}
              >
                {isApproved ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                {isApproved ? t('settings.approved', 'Approved') : t('settings.pending_approval', 'Pending approval')}
              </span>
              {myRole && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-stage-accent-soft text-stage-accent border border-outline-variant/40">
                  {ROLE_LABEL[myRole]}
                </span>
              )}
            </div>
          </div>
        </div>
        <button
          onClick={logOut}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-2xl bg-error/10 text-error hover:bg-error/20 font-medium text-sm transition-colors cursor-pointer shrink-0 min-h-[44px] w-full sm:w-auto"
        >
          <LogOut className="w-4 h-4" />
          {t('actions.log_out', 'Log out')}
        </button>
      </div>
    </section>
  );
}

// ── Appearance ─────────────────────────────────────────────────────────

const APPEARANCE: { key: 'light' | 'dark' | 'system'; label: string; note: string; Icon: typeof Sun }[] = [
  { key: 'light', label: 'Light', note: 'Warm paper', Icon: Sun },
  { key: 'dark', label: 'Dark', note: 'Quiet dusk', Icon: Moon },
  { key: 'system', label: 'System', note: 'Match my device', Icon: Monitor },
];

function AppearanceSection({
  theme,
  setTheme,
}: {
  theme: string;
  setTheme: (t: 'light' | 'dark' | 'system') => void;
}) {
  const { t } = useLanguage();
  return (
    <section className="mt-10">
      <SectionHeader title={t('settings.appearance', 'Appearance')} sub={t('settings.appearance_sub', 'How CISA looks. Choose paper, dusk, or follow your device.')} />
      <div className="grid grid-cols-3 gap-3 max-w-2xl">
        {APPEARANCE.map(({ key, label, note, Icon }) => {
          const active = theme === key;
          return (
            <button
              key={key}
              onClick={() => setTheme(key)}
              aria-pressed={active}
              className={cn(
                'flex flex-col items-start gap-2 p-4 rounded-3xl border text-left transition-colors',
                active
                  ? 'border-primary/40 bg-primary/5'
                  : 'bg-surface-container border-outline-variant/40 hover:bg-surface-container-high',
              )}
            >
              <Icon className={cn('w-5 h-5', active ? 'text-accent' : 'text-on-surface-variant')} />
              <span className="font-serif text-base text-on-surface leading-none">{label}</span>
              <span className="text-xs text-on-surface-variant">{note}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

// ── Notifications ──────────────────────────────────────────────────────

function NotificationsSection() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [permStatus, setPermStatus] = useState<NotificationPermission | 'unsupported'>('unsupported');
  const [testing, setTesting] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  useEffect(() => {
    setPermStatus(getWebNotificationPermissionStatus());
  }, []);

  const enableNotifications = async () => {
    const granted = await requestWebNotificationPermission();
    setPermStatus(getWebNotificationPermissionStatus());
    if (granted) {
      setFeedbackMsg(t('settings.notifications_enabled', 'Browser notifications are enabled'));
      await registerServiceWorker();
    } else {
      setFeedbackMsg(t('settings.notifications_disabled', 'Browser notifications are blocked in your browser settings'));
    }
  };

  const handleSendTest = async () => {
    if (testing) return;
    setTesting(true);
    setFeedbackMsg(null);
    try {
      let status = getWebNotificationPermissionStatus();
      if (status === 'denied') {
        setFeedbackMsg(t('settings.notifications_disabled', 'Browser notifications are blocked in your browser settings'));
        return;
      }
      if (status !== 'granted') {
        const granted = await requestWebNotificationPermission();
        status = getWebNotificationPermissionStatus();
        setPermStatus(status);
        if (!granted) {
          setFeedbackMsg(t('settings.notifications_disabled', 'Browser notifications are blocked in your browser settings'));
          return;
        }
      }

      await registerServiceWorker();
      const shown = await showWebPushNotification('Test Notification', {
        body: 'Web notifications are working properly on your device.',
      });

      if (user?.uid) {
        await sendPushNotification({
          userId: user.uid,
          title: 'Test Notification',
          body: 'Web push dispatch verified.',
          data: { type: 'test' },
        });
      }

      if (shown) {
        setFeedbackMsg('Test notification sent! Check your notification area.');
      } else {
        setFeedbackMsg('Notification permission granted, test dispatched.');
      }
    } catch (err) {
      console.error('Failed to send test notification:', err);
      setFeedbackMsg('Failed to send test notification.');
    } finally {
      setTesting(false);
    }
  };

  return (
    <section className="mt-10">
      <SectionHeader
        title={t('settings.notifications', 'Notifications & Alerts')}
        sub={t('settings.notifications_sub', 'Configure browser alerts and diagnostic push notifications.')}
      />
      <div className="rounded-3xl border border-outline-variant/40 bg-surface-container p-6 flex flex-col gap-4 max-w-2xl">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'w-3 h-3 rounded-full shrink-0',
              permStatus === 'granted'
                ? 'bg-success'
                : permStatus === 'denied'
                  ? 'bg-error'
                  : 'bg-amber-500',
            )}
          />
          <span className="text-sm font-medium text-on-surface">
            {permStatus === 'granted'
              ? t('settings.notifications_enabled', 'Browser notifications are enabled')
              : permStatus === 'denied'
                ? t('settings.notifications_disabled', 'Browser notifications are blocked in your browser settings')
                : permStatus === 'unsupported'
                  ? t('settings.notifications_unsupported', 'Browser notifications are not supported in this browser')
                  : 'Notification permission not yet granted'}
          </span>
        </div>

        {feedbackMsg && (
          <p className="text-xs text-on-surface-variant bg-surface-container-high px-3 py-2 rounded-xl border border-outline-variant/30">
            {feedbackMsg}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3 pt-2">
          {permStatus !== 'granted' && permStatus !== 'unsupported' && (
            <button
              onClick={enableNotifications}
              className="px-4 py-2 rounded-2xl bg-primary text-on-primary font-medium text-sm hover:opacity-90 transition-opacity cursor-pointer"
            >
              {t('settings.turn_on_web_notifications', 'Enable browser notifications')}
            </button>
          )}

          <button
            onClick={handleSendTest}
            disabled={testing || permStatus === 'unsupported'}
            className="px-4 py-2 rounded-2xl bg-surface-container-high border border-outline-variant/50 text-on-surface font-medium text-sm hover:bg-surface-container-highest transition-colors cursor-pointer disabled:opacity-50"
          >
            {testing
              ? t('settings.sending_test_notification', 'Sending test notification…')
              : t('settings.send_test_web_notification', 'Send test notification')}
          </button>
        </div>
      </div>
    </section>
  );
}

// ── Language ───────────────────────────────────────────────────────────

const LANGUAGES: { key: 'en' | 'es'; label: string; note: string; flag: string }[] = [
  { key: 'en', label: 'English', note: 'Default language', flag: '🇺🇸' },
  { key: 'es', label: 'Español', note: 'Traducción inteligente en vivo', flag: '🇪🇸' },
];

function LanguageSection() {
  const { language, setLanguage, t } = useLanguage();

  return (
    <section className="mt-10">
      <SectionHeader title={t('settings.language', 'Language')} sub={t('settings.language_sub', 'Choose your preferred interface and live translation language.')} />
      <div className="grid grid-cols-2 gap-3 max-w-xl">
        {LANGUAGES.map(({ key, label, note, flag }) => {
          const active = language === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setLanguage(key)}
              aria-pressed={active}
              className={cn(
                'flex flex-col items-start gap-2 p-4 rounded-3xl border text-left transition-colors cursor-pointer',
                active
                  ? 'border-primary/40 bg-primary/5'
                  : 'bg-surface-container border-outline-variant/40 hover:bg-surface-container-high',
              )}
            >
              <div className="flex items-center gap-2">
                <span className="text-xl leading-none" role="img" aria-label={label}>{flag}</span>
                <span className="font-serif text-base text-on-surface leading-none">{label}</span>
              </div>
              <span className="text-xs text-on-surface-variant">{note}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}



// ── The day's goal (#544) ──────────────────────────────────────────────

function DayGoalSection() {
  const { t } = useLanguage();
  const { goal, setOn, setCount } = useDayGoal();
  return (
    <section className="mt-10">
      <SectionHeader
        title={t('settings.day_goal_title', "The day's goal")}
        sub={t('settings.day_goal_sub', 'A shared aim for an on-campus day — the same number for everyone.')}
      />
      <div className="rounded-3xl border border-outline-variant/40 bg-surface-container p-6 flex flex-col gap-6 max-w-2xl">
        <button
          type="button"
          onClick={() => setOn(!goal.on)}
          aria-pressed={goal.on}
          className="flex items-center justify-between gap-4 text-left cursor-pointer group"
        >
          <div className="min-w-0">
            <h3 className="font-serif text-base text-on-surface leading-tight">
              {t('settings.day_goal_toggle', 'Give the day a goal')}
            </h3>
            <p className="text-[13px] text-on-surface-variant mt-1 leading-relaxed">
              {t('settings.day_goal_toggle_sub', 'Each trainee aims to meet the same number of new people on an on-campus day.')}
            </p>
          </div>
          <span
            className={cn(
              'relative inline-flex h-7 w-12 shrink-0 rounded-full transition-colors',
              goal.on ? 'bg-accent' : 'bg-outline-variant',
            )}
            role="switch"
            aria-checked={goal.on}
          >
            <span
              className={cn(
                'absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform',
                goal.on ? 'translate-x-[22px]' : 'translate-x-0.5',
              )}
            />
          </span>
        </button>

        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h3 className="font-serif text-base text-on-surface leading-tight">
              {t('settings.day_goal_number', 'How many people')}
            </h3>
            <p className="text-[13px] text-on-surface-variant mt-1 leading-relaxed">
              {t('settings.day_goal_number_sub', "Nobody sees anyone else's count, and if a day ends short the app says nothing.")}
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
onClick={() => setCount(goal.count - 1)}
              disabled={goal.count <= GOAL_MIN}
              aria-label={t('settings.day_goal_lower', "Lower the day's goal")}
              className="inline-flex items-center justify-center w-11 h-11 rounded-2xl border border-outline-variant/40 bg-surface-container-high text-on-surface hover:bg-surface hover:border-outline transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-default"
            >
              <Minus className="w-4 h-4" />
            </button>
            <span
              className="font-serif text-2xl text-on-surface tabular-nums w-9 text-center"
              aria-live="polite"
              aria-label={t('settings.day_goal_value', "The day's goal is {n}").replace('{n}', String(goal.count))}
            >
              {goal.count}
            </span>
            <button
              type="button"
              onClick={() => setCount(goal.count + 1)}
              disabled={goal.count >= GOAL_MAX}
              aria-label={t('settings.day_goal_raise', "Raise the day's goal")}
              className="inline-flex items-center justify-center w-11 h-11 rounded-2xl border border-outline-variant/40 bg-surface-container-high text-on-surface hover:bg-surface hover:border-outline transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-default"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Integrations: "Quick add by text" (dev) ────────────────────────────

function CodeBlock({ code, label }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };
  return (
    <div className="rounded-xl border border-outline-variant/50 bg-surface-container-low overflow-hidden">
      {label && <div className="px-3 pt-2.5 text-[11px]   text-on-surface-variant">{label}</div>}
      <div className="relative">
        <pre className="font-code text-[11.5px] leading-relaxed text-on-surface-variant whitespace-pre-wrap break-words px-3 py-2.5 pr-14 select-all">
          {code}
        </pre>
        <button
          onClick={copy}
          className="absolute top-2 right-2 inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-on-surface-variant hover:bg-surface-container-high transition-colors"
          aria-label="Copy"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
    </div>
  );
}

function ChannelCard({
  Icon,
  title,
  blurb,
  defaultOpen,
  children,
}: {
  Icon: typeof Command;
  title: string;
  blurb: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div className="rounded-2xl border border-outline-variant/40 bg-surface-container overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-surface-container-high transition-colors"
      >
        <span className="w-9 h-9 rounded-full bg-stage-accent-soft text-stage-accent flex items-center justify-center shrink-0">
          <Icon className="w-4 h-4" />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block font-serif text-base text-on-surface leading-tight">{title}</span>
          <span className="block text-[13px] text-on-surface-variant mt-0.5">{blurb}</span>
        </span>
        <ChevronDown className={cn('w-4 h-4 text-on-surface-variant transition-transform shrink-0', open && 'rotate-180')} />
      </button>
      {open && <div className="px-4 pb-4 space-y-3">{children}</div>}
    </div>
  );
}

function Steps({ items }: { items: string[] }) {
  return (
    <ol className="space-y-2">
      {items.map((s, i) => (
        <li key={i} className="flex gap-2.5 items-start text-[13px] text-on-surface-variant">
          <span className="w-5 h-5 rounded-full bg-surface-container-high text-on-surface-variant text-[11px] font-semibold flex items-center justify-center shrink-0 mt-0.5">
            {i + 1}
          </span>
          <span className="leading-relaxed">{s}</span>
        </li>
      ))}
    </ol>
  );
}

function IntegrationsSection({
  currentUser,
}: {
  currentUser: User | null;
}) {
  const [text, setText] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [result, setResult] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const appUrl = typeof window !== 'undefined' ? window.location.origin : 'https://cisa-campus-work-traker.pages.dev';
  const curlCommand = `curl -X POST "${appUrl}/api/quick-add" \\
  -H "Content-Type: application/json" \\
  -d '{"text": "Met Sarah Doe yesterday at Campus Coffee. She is a freshman majoring in biology and can be reached at sarah12@campus.edu or (555) 789-0123. Interested in study group."}'`;
  const smsWebhookUrl = `${appUrl}/api/webhook/sms`;
  const groupMeWebhookUrl = `${appUrl}/api/webhook/groupme`;

  const handleQuickAdd = async () => {
    if (!text.trim()) return;
    setStatus('loading');
    setResult(null);
    setErrorMsg('');

    try {
      let token: string | null = null;
      try {
        if (currentUser && typeof currentUser.getIdToken === 'function') {
          token = await currentUser.getIdToken();
        }
      } catch (tokenErr) {
        console.error('Failed to get Firebase ID token:', tokenErr);
      }

      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch('/api/quick-add', {
        method: 'POST',
        headers,
        body: JSON.stringify({ text }),
      });

      const data = await response.json();
      if (data.success) {
        setStatus('success');
        setResult(data.contact);
        setText('');
      } else {
        setStatus('error');
        setErrorMsg(data.error || 'Failed to process description.');
      }
    } catch (err: any) {
      setStatus('error');
      setErrorMsg(err.message || 'An error occurred connecting to the server.');
    }
  };

  return (
    <section className="mt-10">
      <SectionHeader
        title="Quick add by text"
        sub="Bring people in the way you actually meet them — a text, a voice note, a quick line in a group chat."
      />
      <div className="space-y-3 max-w-2xl">
        {/* Natural-language playground */}
        <div className="rounded-2xl border border-outline-variant/40 bg-surface-container p-5">
          <div className="flex items-start gap-3 mb-3">
            <span className="w-9 h-9 rounded-full bg-stage-violet-soft text-stage-violet flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4" />
            </span>
            <div>
              <h3 className="font-serif text-base text-on-surface leading-tight">Natural-language playground</h3>
              <p className="text-[13px] text-on-surface-variant mt-0.5 leading-relaxed">
                Type or paste a note about someone you met — the way you'd text it or say it out loud. It's parsed and
                turned into a contact, ready to keep.
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2.5">
            <input
              type="text"
              placeholder="e.g. Met John Doe at Miller Hall. Sophomore philosophy student, phone 555-1234."
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={status === 'loading'}
              className="flex-1 px-4 py-3 bg-surface rounded-xl border border-outline-variant focus:border-primary outline-none transition-colors text-sm text-on-surface placeholder:text-on-surface-variant/60"
            />
            <button
              onClick={handleQuickAdd}
              disabled={status === 'loading' || !text.trim()}
              className="px-5 py-3 bg-primary text-on-primary font-medium rounded-xl hover:bg-primary/90 transition-colors text-sm shrink-0 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {status === 'loading' ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Reading…</span>
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4" />
                  <span>Try it</span>
                </>
              )}
            </button>
          </div>

          <AnimatePresence>
            {status === 'success' && result && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                className="mt-4 p-4 bg-success/10 border border-success/30 rounded-xl text-sm"
              >
                <div className="flex items-center gap-2 text-success font-medium mb-3">
                  <CheckCircle2 className="w-4 h-4" /> Parsed into a contact
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <div>
                    <span className="text-on-surface-variant block text-[11px]">Name</span>
                    <span className="font-medium text-on-surface">{result.name}</span>
                  </div>
                  <div>
                    <span className="text-on-surface-variant block text-[11px]">Role / Group</span>
                    <span className="text-on-surface">{result.role}</span>
                  </div>
                  <div>
                    <span className="text-on-surface-variant block text-[11px]">Location</span>
                    <span className="text-on-surface">{result.location || '—'}</span>
                  </div>
                  <div>
                    <span className="text-on-surface-variant block text-[11px]">Stage</span>
                    <span className="font-medium text-accent">{result.stage}</span>
                  </div>
                </div>
                {result.notes && (
                  <div className="mt-3 text-xs">
                    <span className="text-on-surface-variant block text-[11px]">Notes</span>
                    <p className="text-on-surface mt-0.5">{result.notes}</p>
                  </div>
                )}
              </motion.div>
            )}

            {status === 'error' && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                className="mt-4 p-4 bg-error/10 border border-error/30 rounded-xl text-sm flex items-start gap-2 text-error"
              >
                <XCircle className="w-5 h-5 shrink-0" />
                <div>
                  <span className="font-medium">Something went wrong</span>
                  <p className="mt-1 text-xs opacity-90">{errorMsg}</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Channels */}
        <ChannelCard
          Icon={Command}
          title="Siri & the developer API"
          blurb="Add contacts from iOS Shortcuts, Siri, or your own automations."
          defaultOpen
        >
          <p className="text-[13px] text-on-surface-variant leading-relaxed">
            Say “Hey Siri, Quick Add…” and pass a raw description, or POST to the endpoint directly from any pipeline —
            same parser, same result.
          </p>
          <CodeBlock label="POST · curl request template" code={curlCommand} />
        </ChannelCard>

        <ChannelCard
          Icon={Smartphone}
          title="SMS & WhatsApp"
          blurb="Text a new contact straight in from a single Twilio number."
        >
          <p className="text-[13px] text-on-surface-variant leading-relaxed">
            Point your Twilio number's inbound webhook here. Standard SMS and official WhatsApp messages both arrive at
            the same place.
          </p>
          <CodeBlock label="Twilio inbound webhook URL" code={smsWebhookUrl} />
          <Steps
            items={[
              'In Twilio, choose your phone or sandbox number.',
              'Under the messaging webhook settings, paste this URL.',
              'Set the method to HTTP POST and save.',
            ]}
          />
        </ChannelCard>

        <ChannelCard
          Icon={MessageSquare}
          title="GroupMe bot"
          blurb="Let the whole group chat add contacts with a quick !add line."
        >
          <p className="text-[13px] text-on-surface-variant leading-relaxed">
            Everyone in the group can text new contacts using a trigger prefix. The bot reads the message, parses it, and
            files it for the team.
          </p>
          <CodeBlock label="GroupMe bot callback URL" code={groupMeWebhookUrl} />
          <Steps
            items={[
              'Go to dev.groupme.com and open the Bots menu.',
              'Click Create Bot and link your group chat.',
              'Paste this callback URL and submit.',
            ]}
          />

          <div className="pt-1">
            <div className="text-sm font-medium text-on-surface mb-1">Prefix triggers</div>
            <p className="text-[13px] text-on-surface-variant leading-relaxed mb-2">
              Start a message with any of these so the bot knows to parse it:
            </p>
            <div className="flex flex-wrap gap-1.5">
              {['!add', '/add', 'add:'].map((p) => (
                <code
                  key={p}
                  className="font-code text-[12px] px-2 py-0.5 rounded-md bg-surface-container-high border border-outline-variant/40 text-on-surface"
                >
                  {p}
                </code>
              ))}
            </div>
          </div>

          <div className="pt-1">
            <div className="text-sm font-medium text-on-surface mb-1">Parsing options</div>
            <p className="text-[13px] text-on-surface-variant leading-relaxed mb-2">
              Add an optional keyword right after the prefix to steer the parser:
            </p>

            <div className="space-y-3">
              <div className="rounded-xl border border-outline-variant/40 bg-surface-container-low p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <code className="font-code text-[11px] px-1.5 py-0.5 rounded bg-stage-accent-soft text-stage-accent">
                    contact
                  </code>
                  <span className="text-[12px] text-on-surface-variant italic">default</span>
                </div>
                <p className="text-[13px] text-on-surface leading-relaxed">
                  Parses name, role, details and contact info, then creates a card or merges with an existing one.
                </p>
                <CodeBlock code="!add contact Jerry Doe is a sophomore majoring in history, phone 555-0192, met at cafeteria." />
              </div>

              <div className="rounded-xl border border-outline-variant/40 bg-surface-container-low p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <code className="font-code text-[11px] px-1.5 py-0.5 rounded bg-stage-teal-soft text-stage-teal">
                    interaction
                  </code>
                </div>
                <p className="text-[13px] text-on-surface leading-relaxed">
                  Logs a follow-up conversation or prayer update in the history of an existing contact.
                </p>
                <CodeBlock code="!add interaction Jerry Doe and I studied Romans today, shared about exams and prayed together." />
              </div>
            </div>
          </div>
        </ChannelCard>
      </div>
    </section>
  );
}

// ── API & webhook console (dev) ────────────────────────────────────────

function WebhookConsoleSection() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [isClearing, setIsClearing] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'webhook_logs'), orderBy('timestamp', 'desc'));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setLogs(snapshot.docs.map((d) => ({ dbId: d.id, ...d.data() })));
        setLoadingLogs(false);
      },
      (error) => {
        console.error('Error setting up webhook_logs listener:', error);
        setLoadingLogs(false);
        handleFirestoreError(error, OperationType.LIST, 'webhook_logs');
      },
    );
    return () => unsubscribe();
  }, []);

  const handleClearLogs = async () => {
    if (!confirm('Clear all webhook debugging logs?')) return;
    setIsClearing(true);
    try {
      const snapshot = await getDocs(collection(db, 'webhook_logs'));
      await Promise.all(snapshot.docs.map((d) => deleteDoc(d.ref)));
    } catch (err) {
      console.error('Failed to clear webhook logs:', err);
      handleFirestoreError(err, OperationType.DELETE, 'webhook_logs');
    } finally {
      setIsClearing(false);
    }
  };

  const toggleExpand = (id: string) => setExpandedLogId(expandedLogId === id ? null : id);

  return (
    <section className="mt-10">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="font-serif text-2xl text-on-surface">API &amp; webhook console</h2>
          <p className="text-sm text-on-surface-variant mt-1 max-w-2xl leading-relaxed">
            A developer's view of every contact arriving by API, SMS, WhatsApp, or GroupMe — with the raw payloads.
          </p>
        </div>
        {logs.length > 0 && (
          <button
            onClick={handleClearLogs}
            disabled={isClearing}
            className="shrink-0 px-3 py-1.5 text-xs text-error hover:bg-error/10 font-medium rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear
          </button>
        )}
      </div>

      <div className="rounded-3xl border border-outline-variant/40 bg-surface-container p-5 space-y-3 max-w-2xl">
        {loadingLogs ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-on-surface-variant">
            <Loader2 className="w-7 h-7 animate-spin text-accent" />
            <p className="text-xs">Listening for incoming requests…</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="py-12 text-center">
            <Sparkles className="w-7 h-7 text-on-surface-variant/40 mx-auto mb-2" />
            <p className="text-sm font-medium text-on-surface-variant">No activity yet</p>
            <p className="text-xs text-on-surface-variant/70 mt-1">
              Send a message to your GroupMe bot or try Quick Add to see webhooks here.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5 max-h-[600px] overflow-y-auto pr-1">
            {logs.map((log) => {
              const isSelected = expandedLogId === log.dbId;
              const ok = log.status === 'success';
              const nodeTone = ok
                ? 'bg-stage-teal-soft text-stage-teal'
                : log.status === 'error'
                  ? 'bg-error/10 text-error'
                  : 'bg-stage-amber-soft text-stage-amber';
              return (
                <div
                  key={log.dbId}
                  className={cn(
                    'rounded-xl border bg-surface-container-low transition-colors overflow-hidden',
                    isSelected ? 'border-primary/40' : 'border-outline-variant/40 hover:bg-surface-container-high',
                  )}
                >
                  <div
                    onClick={() => toggleExpand(log.dbId)}
                    className="p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-2 cursor-pointer select-none"
                  >
                    <div className="flex items-center gap-2.5 flex-wrap min-w-0">
                      <span className={cn('px-2 py-0.5 text-[11px] font-medium rounded-full shrink-0', nodeTone)}>
                        {log.source || 'Callback'}
                      </span>
                      <span className="text-sm text-on-surface truncate">{log.result}</span>
                    </div>
                    <div className="flex items-center gap-2 text-on-surface-variant text-[12px] shrink-0">
                      <span>
                        {new Date(log.timestamp).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      <ChevronDown className={cn('w-4 h-4 transition-transform', isSelected && 'rotate-180')} />
                    </div>
                  </div>

                  <AnimatePresence>
                    {isSelected && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="border-t border-outline-variant/30"
                      >
                        <div className="p-3.5 space-y-3">
                          {log.error && (
                            <div className="p-3 bg-error/10 border border-error/20 rounded-lg text-error text-xs">
                              <span className="font-medium block mb-1">Failure detail</span>
                              {log.error}
                            </div>
                          )}
                          <div>
                            <span className="text-[11px]   text-on-surface-variant block mb-1">
                              Raw payload (POST body)
                            </span>
                            <pre className="bg-surface border border-outline-variant/40 p-3 rounded-lg overflow-x-auto font-code text-[11px] text-on-surface-variant whitespace-pre-wrap select-all">
                              {(() => {
                                try {
                                  return JSON.stringify(JSON.parse(log.payload), null, 2);
                                } catch {
                                  return log.payload;
                                }
                              })()}
                            </pre>
                          </div>
                          <div>
                            <span className="text-[11px]   text-on-surface-variant block mb-1">
                              Request headers
                            </span>
                            <pre className="bg-surface border border-outline-variant/40 p-3 rounded-lg overflow-x-auto font-code text-[11px] text-on-surface-variant whitespace-pre-wrap select-all">
                              {(() => {
                                try {
                                  return JSON.stringify(JSON.parse(log.headers), null, 2);
                                } catch {
                                  return log.headers || '{}';
                                }
                              })()}
                            </pre>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

// ── Team management pieces ─────────────────────────────────────────────

function MemberCard({
  user,
  isYou,
  canEditRole,
  canRemove,
  onEdit,
  onRemove,
}: {
  user: AppUser;
  isYou: boolean;
  canEditRole: boolean;
  canRemove: boolean;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const hasMenu = canEditRole || canRemove;

  return (
    <div
      className={cn(
        'flex items-center gap-3 p-3.5 rounded-3xl border transition-colors',
        isYou ? 'border-primary/30 bg-primary/5' : 'bg-surface-container border-outline-variant/40',
      )}
    >
      <Avatar name={user.displayName || user.email} photoURL={user.photoURL} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-on-surface truncate">{user.displayName || 'Unnamed'}</span>
          {isYou && (
            <span className="text-[10px] text-accent border border-accent-line bg-surface rounded-full px-1.5 py-0.5 leading-none shrink-0">
              you
            </span>
          )}
        </div>
        <div className="text-[13px] text-on-surface-variant truncate">
          {ROLE_LABEL[user.role || 'viewer']} · {user.email}
        </div>
      </div>

      {hasMenu && (
        <div className="relative shrink-0" ref={ref}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="p-2 rounded-full hover:bg-surface-container-high text-on-surface-variant transition-colors"
            aria-label="Member options"
            aria-expanded={menuOpen}
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 z-20 w-44 rounded-xl border border-outline-variant/60 bg-surface shadow-lg py-1">
              {canEditRole && (
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onEdit();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-on-surface hover:bg-surface-container-high text-left"
                >
                  <Pencil className="w-3.5 h-3.5" /> Edit role
                </button>
              )}
              {canRemove && (
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onRemove();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-error hover:bg-error/10 text-left"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Remove access
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function InviteRow({ invite, onCancel }: { invite: Invitation; onCancel: () => void }) {
  return (
    <div className="flex items-center gap-3 p-3.5 rounded-2xl border border-dashed border-outline-variant/60 bg-surface-container-low">
      <div className="w-10 h-10 rounded-full bg-stage-accent-soft text-stage-accent flex items-center justify-center shrink-0">
        <Mail className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-on-surface truncate">{invite.email}</span>
          <span className="text-[10px] text-on-surface-variant border border-outline-variant/50 rounded-full px-1.5 py-0.5 leading-none shrink-0">
            invite sent
          </span>
        </div>
        <div className="text-[13px] text-on-surface-variant">{ROLE_LABEL[invite.role]} · waiting to sign up</div>
      </div>
      <button
        onClick={onCancel}
        className="p-2 rounded-full text-on-surface-variant hover:text-error hover:bg-error/10 transition-colors shrink-0"
        title="Cancel invite"
        aria-label="Cancel invite"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}

function EditRoleModal({
  user,
  isAdmin,
  onClose,
  onSave,
}: {
  user: AppUser;
  isAdmin: boolean;
  onClose: () => void;
  onSave: (uid: string, role: AppRole) => void;
}) {
  const [role, setRole] = useState<AppRole>(user.role || 'viewer');
  // RBAC: only an admin can grant the Full-timer (admin) role.
  const options = ROLE_OPTIONS.filter((o) => isAdmin || o.value !== 'admin');
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        className="relative w-full max-w-sm bg-surface-container rounded-3xl border border-outline-variant/50 p-6 shadow-2xl"
      >
        <h3 className="font-serif text-xl text-on-surface mb-4">Edit role</h3>
        <div className="flex items-center gap-3 mb-5">
          <Avatar name={user.displayName || user.email} photoURL={user.photoURL} />
          <div className="min-w-0">
            <div className="font-medium text-on-surface truncate">{user.displayName || 'Unnamed'}</div>
            <div className="text-[13px] text-on-surface-variant truncate">{user.email}</div>
          </div>
        </div>
        <label className="text-sm text-on-surface-variant block mb-1.5">Role</label>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as AppRole)}
          className="w-full px-4 py-3 bg-surface rounded-xl border border-outline-variant focus:border-primary outline-none transition-colors text-sm text-on-surface mb-6 cursor-pointer"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl bg-surface-container-high text-on-surface-variant font-medium hover:bg-surface-variant transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(user.uid, role)}
            className="flex-1 py-3 rounded-xl bg-primary text-on-primary font-medium hover:bg-primary/90 transition-colors"
          >
            Save
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function RemoveConfirmModal({
  user,
  onClose,
  onConfirm,
}: {
  user: AppUser;
  onClose: () => void;
  onConfirm: (uid: string) => void;
}) {
  const firstName = (user.displayName || user.email).split(' ')[0];
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        className="relative w-full max-w-sm bg-surface-container rounded-3xl border border-outline-variant/50 p-6 shadow-2xl"
      >
        <h3 className="font-serif text-xl text-on-surface mb-3">Remove access?</h3>
        <div className="flex items-center gap-3 mb-4">
          <Avatar name={user.displayName || user.email} photoURL={user.photoURL} />
          <div className="min-w-0">
            <div className="font-medium text-on-surface truncate">{user.displayName || 'Unnamed'}</div>
            <div className="text-[13px] text-on-surface-variant truncate">{ROLE_LABEL[user.role || 'viewer']}</div>
          </div>
        </div>
        <p className="text-sm text-on-surface-variant leading-relaxed mb-6">
          {firstName} will lose access to CISA. Their contacts, notes, and history stay with the work — you can approve
          them again anytime.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl bg-surface-container-high text-on-surface-variant font-medium hover:bg-surface-variant transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(user.uid)}
            className="flex-1 py-3 rounded-xl bg-error text-on-error font-medium hover:bg-error/90 transition-colors"
          >
            Remove
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function InviteModal({
  email,
  setEmail,
  role,
  setRole,
  isAdmin,
  isInviting,
  onSubmit,
  onClose,
}: {
  email: string;
  setEmail: (v: string) => void;
  role: AppRole;
  setRole: (v: AppRole) => void;
  isAdmin: boolean;
  isInviting: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
}) {
  // RBAC: only an admin can pre-add someone as a Full-timer (admin).
  const options = ROLE_OPTIONS.filter((o) => isAdmin || o.value !== 'admin');
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        className="relative w-full max-w-sm bg-surface-container rounded-3xl border border-outline-variant/50 p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between mb-5">
          <div>
            <h3 className="font-serif text-xl text-on-surface">Add someone by email</h3>
            <p className="text-[13px] text-on-surface-variant mt-0.5">
              Pre-add an email and they're matched automatically when they sign up.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-surface-container-high text-on-surface-variant transition-colors shrink-0"
            aria-label="Close"
          >
            <XCircle className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="text-sm text-on-surface-variant block mb-1.5">Email</label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
              <input
                type="email"
                required
                placeholder="their@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
                className="w-full pl-10 pr-4 py-3 bg-surface rounded-xl border border-outline-variant focus:border-primary outline-none transition-colors text-sm text-on-surface"
              />
            </div>
          </div>

          <div>
            <label className="text-sm text-on-surface-variant block mb-1.5">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as AppRole)}
              className="w-full px-4 py-3 bg-surface rounded-xl border border-outline-variant focus:border-primary outline-none transition-colors text-sm text-on-surface cursor-pointer"
            >
              {options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-xl bg-surface-container-high text-on-surface-variant font-medium hover:bg-surface-variant transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isInviting || !email}
              className="flex-[1.4] py-3 rounded-xl bg-primary text-on-primary font-medium flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {isInviting ? (
                <span className="animate-pulse">Adding…</span>
              ) : (
                <>
                  <UserPlus className="w-4 h-4" /> Pre-add
                </>
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

function CalendarSyncPanel() {
  const { t } = useLanguage();
  const gatheringTypes = useGatheringTypes();
  const { isEnabled, setEnabled, calMap, setMapCategory, getItemsBetween } = useCalendarSync();

  const counts = useMemo(() => {
    const from = calStartOfDay(new Date());
    const to = calAddDays(from, 30);
    const { gatherings, context } = getItemsBetween(from, to);
    const out: Record<string, number> = {};
    for (const g of gatherings) {
      if (g.cat) out[g.cat] = (out[g.cat] || 0) + 1;
    }
    for (const c of context) {
      if (c.cat) out[c.cat] = (out[c.cat] || 0) + 1;
    }
    return out;
  }, [getItemsBetween]);

  return (
    <section className="mt-10">
      <SectionHeader
        title={t('settings.shared_calendar', 'The shared calendar')}
        sub={t('settings.shared_calendar_sub', 'Bring events from the shared calendar across as gatherings or context.')}
      />
      <div className="cals rounded-3xl border border-outline-variant/40 bg-surface-container p-5">
        <label className="cals-toggle flex items-center gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={isEnabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="w-4 h-4 rounded text-primary focus:ring-primary accent-primary"
          />
          <span className="font-medium text-on-surface">{t('settings.read_shared_calendar', 'Read the shared calendar')}</span>
        </label>
        <p className="cals-note text-xs text-on-surface-variant mt-2 leading-relaxed">
          {t('settings.shared_calendar_desc', 'Nothing here is ever written back — the calendar has no place to keep a roster. Only full-timers and trainees see anything that comes across.')}
          {CAL_APP_URL && (
            <>
              {' '}
              <a
                href={CAL_APP_URL}
                target="_blank"
                rel="noreferrer"
                className="text-primary hover:underline font-medium inline-flex items-center gap-1"
              >
                {t('calendar.open_calendar', 'Open the calendar')}
              </a>
            </>
          )}
        </p>

        {isEnabled && (
          <div className="cals-rows mt-4 divide-y divide-outline-variant/30">
            {CAL_CATEGORIES.map((cat) => (
              <div className="cals-row py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2" key={cat.id}>
                <div className="cals-cat">
                  <div className="cals-cat-n font-medium text-sm text-on-surface flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: cat.dot }} />
                    {cat.label}
                  </div>
                  <div className="cals-cat-c text-xs text-on-surface-variant">
                    {counts[cat.id] ? `${counts[cat.id]} in the next month` : 'nothing coming up'}
                  </div>
                </div>
                <select
                  className="hist-sel cals-sel text-xs rounded-xl border border-outline-variant/60 bg-surface px-3 py-1.5 text-on-surface"
                  value={calMap[cat.id] || ''}
                  onChange={(e) => setMapCategory(cat.id, e.target.value)}
                >
                  <option value="">{t('settings.just_a_date', 'Just a date we should know')}</option>
                  {gatheringTypes.map((k) => (
                    <option key={k.id} value={k.name}>
                      {t('settings.becomes_gathering', 'Becomes a {name} gathering').replace('{name}', k.name.toLowerCase())}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        )}

        {isEnabled && (
          <p className="cals-note cals-foot text-xs text-on-surface-variant mt-3 italic">
            {t('settings.shared_calendar_footnote', "A category left as a date still shows up under “Also on the calendar” — it just never opens a roster. Travel is read as who's away, and named on your day.")}
          </p>
        )}
      </div>
    </section>
  );
}

// ── Going out together (gospel partners) ───────────────────────────────
// Two trainees who go out as one, this term. A full-timer arranges the pairs;
// a person either partner brings in is shared with the other from the moment
// it's added (`coCreators`). Per term, because partners change each semester.

const pairNames = (ids: string[], byId: Record<string, AppUser>): string => {
  const names = ids.map((id) => byId[id]?.displayName || 'Unnamed');
  if (names.length <= 1) return names[0] || '';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
};

function CarePick({
  people,
  empty,
  cancelLabel,
  onPick,
  onCancel,
}: {
  people: AppUser[];
  empty: string;
  cancelLabel: string;
  onPick: (uid: string) => void;
  onCancel: () => void;
}) {
  return (
    <div className="mt-3 flex flex-col gap-1 rounded-2xl border border-outline-variant/40 bg-surface-container-high p-2">
      {people.length ? (
        people.map((s) => (
          <button
            key={s.uid}
            type="button"
            onClick={() => onPick(s.uid)}
            className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 text-left text-sm text-on-surface hover:bg-surface transition-colors cursor-pointer"
          >
            <Avatar name={s.displayName} photoURL={s.photoURL} size="sm" />
            <span className="truncate">{s.displayName || 'Unnamed'}</span>
          </button>
        ))
      ) : (
        <span className="text-[13px] text-on-surface-variant px-2 py-1.5">{empty}</span>
      )}
      <button
        type="button"
        onClick={onCancel}
        className="self-start rounded-lg px-2 py-1 text-[13px] font-medium text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
      >
        {cancelLabel}
      </button>
    </div>
  );
}

function PartnersSection({ users }: { users: AppUser[] }) {
  const { t } = useLanguage();
  const [byTerm, setByTerm] = useState<PartnersByTerm>({});
  const [picking, setPicking] = useState<number | 'new' | null>(null);
  const [first, setFirst] = useState<string | null>(null);

  useEffect(() => subscribePartners(setByTerm), []);

  const term = partnersTermKey();
  const trainees = useMemo(() => users.filter((u) => u.role === 'manager' && isRealPerson(u)), [users]);
  const byId = useMemo(() => {
    const m: Record<string, AppUser> = {};
    for (const u of users) m[u.uid] = u;
    return m;
  }, [users]);
  const groups = groupsForTerm(byTerm, term);
  const partnered = useMemo(() => new Set(groups.flat()), [groups]);
  const free = useMemo(() => trainees.filter((tr) => !partnered.has(tr.uid)), [trainees, partnered]);
  const older = useMemo(
    () => Object.keys(byTerm).filter((k) => k !== term && groupsForTerm(byTerm, k).length > 0),
    [byTerm, term],
  );

  const commit = (next: PartnersByTerm) => {
    setByTerm(next);
    void savePartners(next);
  };

  const closePicking = () => {
    setPicking(null);
    setFirst(null);
  };

  const newPair = first ? (
    <div className="rounded-3xl border border-outline-variant/40 bg-surface-container p-5">
      <div className="font-serif text-base text-on-surface mb-1">
        {t('settings.pairs_who_with', 'Who goes out with {name}?').replace('{name}', byId[first]?.displayName || 'Unnamed')}
      </div>
      <CarePick
        people={free.filter((s) => s.uid !== first)}
        empty={t('settings.pairs_nobody_free', 'Every trainee is already partnered this term.')}
        cancelLabel={t('settings.pairs_never_mind', 'Never mind')}
        onPick={(uid) => {
          commit(addToGroup(byTerm, term, uid, first));
          closePicking();
        }}
        onCancel={closePicking}
      />
    </div>
  ) : (
    <div className="rounded-3xl border border-outline-variant/40 bg-surface-container p-5">
      <div className="font-serif text-base text-on-surface mb-1">
        {t('settings.pairs_first_of_two', "Who's the first of the two?")}
      </div>
      <CarePick
        people={free}
        empty={t('settings.pairs_nobody_free', 'Every trainee is already partnered this term.')}
        cancelLabel={t('settings.pairs_never_mind', 'Never mind')}
        onPick={(id) => setFirst(id)}
        onCancel={closePicking}
      />
    </div>
  );

  return (
    <section className="mt-10">
      <SectionHeader
        title={t('settings.pairs_title', 'Going out together')}
        sub={t(
          'settings.pairs_sub',
          'The two trainees who go out as one, this term. A person either of them brings in is shared with the other automatically.',
        )}
      />
      <div className="flex flex-col gap-3 max-w-2xl">
        {groups.map((g, i) => {
          const people = g.map((id) => byId[id]).filter(Boolean);
          return (
            <div key={i} className="rounded-3xl border border-outline-variant/40 bg-surface-container p-5">
              <div className="flex items-start gap-3">
                <div className="flex -space-x-2">
                  {people.slice(0, 3).map((p) => (
                    <Avatar key={p.uid} name={p.displayName} photoURL={p.photoURL} size="md" />
                  ))}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-serif text-base text-on-surface leading-tight truncate">{pairNames(g, byId)}</div>
                  <div className="text-[13px] text-on-surface-variant mt-0.5">
                    {people.length > 2
                      ? t('settings.pairs_going_as_one', '{n} going out as one').replace('{n}', String(people.length))
                      : t('settings.pairs_partners_term', 'Partners this term')}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => commit(dropGroup(byTerm, term, i))}
                  className="shrink-0 rounded-full px-3 py-1.5 text-[12px] font-medium text-on-surface-variant hover:text-on-surface hover:bg-surface transition-colors cursor-pointer"
                >
                  {t('settings.pairs_not_partners', "They're not partners")}
                </button>
              </div>

              <div className="mt-4 flex flex-col gap-1.5">
                {people.map((p) => (
                  <div key={p.uid} className="flex items-center gap-2.5">
                    <Avatar name={p.displayName} photoURL={p.photoURL} size="sm" />
                    <span className="text-sm text-on-surface truncate">{p.displayName || 'Unnamed'}</span>
                    <span className="text-[12px] text-on-surface-variant">{t('settings.pairs_trainee', 'Trainee')}</span>
                    <button
                      type="button"
                      onClick={() => commit(removeFromGroups(byTerm, term, p.uid))}
                      aria-label={t('settings.pairs_remove_person', 'Take {name} out of this pair').replace('{name}', p.displayName || '')}
                      className="ml-auto shrink-0 w-7 h-7 inline-flex items-center justify-center rounded-full text-on-surface-variant hover:text-on-surface hover:bg-surface transition-colors cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              {picking === i ? (
                <CarePick
                  people={free}
                  empty={t('settings.pairs_nobody_free', 'Every trainee is already partnered this term.')}
                  cancelLabel={t('settings.pairs_never_mind', 'Never mind')}
                  onPick={(id) => {
                    commit(addToGroup(byTerm, term, id, g[0]));
                    setPicking(null);
                  }}
                  onCancel={() => setPicking(null)}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setPicking(i)}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-medium text-on-surface-variant hover:text-on-surface hover:bg-surface transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> {t('settings.pairs_someone_alongside', 'Someone alongside them')}
                </button>
              )}
            </div>
          );
        })}

        {picking === 'new' ? (
          newPair
        ) : (
          <button
            type="button"
            onClick={() => setPicking('new')}
            className="inline-flex items-center gap-2 self-start rounded-2xl border border-outline-variant/40 bg-surface-container px-4 py-3 text-sm font-medium text-on-surface hover:bg-surface transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" /> {t('settings.pairs_two_together', 'Two trainees going out together')}
          </button>
        )}

        {!!free.length && (
          <p className="text-[13px] text-on-surface-variant leading-relaxed">
            {t(
              'settings.pairs_loose',
              'Going out on their own this term: {names}. Anyone they bring in stays theirs alone.',
            ).replace('{names}', pairNames(free.map((f) => f.uid), byId))}
          </p>
        )}

        <div className="rounded-3xl border border-outline-variant/40 bg-surface-container-low p-5">
          <p className="text-[13px] text-on-surface-variant leading-relaxed">
            {t(
              'settings.pairs_note',
              "A person either partner brings in is shared with the other from the moment they're added — neither of them has to remember to. You set the pairs; they live inside them. It's per term, so it doesn't quietly follow anyone into next semester, and it only reaches people added from now on.",
            )}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {older.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => commit(carryOverPartners(byTerm, k, term))}
                className="rounded-full border border-outline-variant/40 px-3 py-1.5 text-[12px] font-medium text-on-surface-variant hover:text-on-surface hover:bg-surface transition-colors cursor-pointer"
              >
                {t('settings.pairs_bring_over', 'Bring over {term}').replace('{term}', k)}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                if (confirm(t('settings.pairs_clear_confirm', "Clear this term's pairs? This can't be undone."))) {
                  commit(clearTerm(byTerm, term));
                }
              }}
              className="rounded-full border border-outline-variant/40 px-3 py-1.5 text-[12px] font-medium text-on-surface-variant hover:text-on-surface hover:bg-surface transition-colors cursor-pointer"
            >
              {t('settings.pairs_clear', "Start this term's pairs over")}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Main ───────────────────────────────────────────────────────────────

export default function Settings() {
  const { user: currentUser, isAdmin, isManager, role, isApproved } = useAuth();
  const isDev = currentUser?.email?.toLowerCase() === OWNER_EMAIL || isAdmin || isManager;
  const isOwner = currentUser?.email?.toLowerCase() === OWNER_EMAIL;
  const { theme, setTheme } = useTheme();
  const { t } = useLanguage();

  const [users, setUsers] = useState<AppUser[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<AppRole>('operator');
  const [isInviting, setIsInviting] = useState(false);

  const [editTarget, setEditTarget] = useState<AppUser | null>(null);
  const [removeTarget, setRemoveTarget] = useState<AppUser | null>(null);

  useEffect(() => {
    if (!isManager) return;

    let timer: any = null;
    const usersQ = query(collection(db, 'users'), orderBy('email', 'asc'));
    const unsubscribeUsers = onSnapshot(
      usersQ,
      (snapshot) => {
        const userData = snapshot.docs.map((d) => ({ uid: d.id, ...d.data() })) as AppUser[];
        const filteredUsers = userData.filter((u) => {
          const email = (u.email || '').toLowerCase();
          const displayName = (u.displayName || '').toLowerCase();
          return !email.startsWith('cisa-') && !displayName.startsWith('cisa-');
        });
        setUsers(filteredUsers);
        timer = setTimeout(() => setLoading(false), 600);
      },
      (error) => {
        console.error('Error fetching users:', error);
        timer = setTimeout(() => setLoading(false), 600);
      },
    );

    const invitesQ = query(collection(db, 'invitations'), orderBy('createdAt', 'desc'));
    const unsubscribeInvites = onSnapshot(
      invitesQ,
      (snapshot) => setInvitations(snapshot.docs.map((d) => d.data() as Invitation)),
      (error) => console.error('Error fetching invitations:', error),
    );

    return () => {
      if (timer) clearTimeout(timer);
      unsubscribeUsers();
      unsubscribeInvites();
    };
  }, [isManager]);

  const sendInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail || isInviting || !currentUser) return;

    setIsInviting(true);
    try {
      const emailLower = inviteEmail.trim().toLowerCase();
      if (users.some((u) => u.email.toLowerCase() === emailLower)) {
        alert('A user with this email already exists.');
        return;
      }

      const invitationPath = `invitations/${emailLower}`;
      try {
        await setDoc(doc(db, 'invitations', emailLower), {
          email: emailLower,
          role: inviteRole,
          approved: true, // pre-approved
          invitedBy: currentUser.uid,
          createdAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, invitationPath);
      }

      setInviteEmail('');
      setInviteRole('operator');
    } catch (error) {
      console.error('Error adding member:', error);
      alert('Failed to add member. Please try again.');
    } finally {
      setIsInviting(false);
    }
  };

  const revokeInvitation = async (email: string) => {
    if (!confirm('Cancel this invitation?')) return;
    try {
      await deleteDoc(doc(db, 'invitations', email.toLowerCase()));
    } catch (error) {
      console.error('Error revoking invitation:', error);
    }
  };

  const toggleApproval = async (uid: string, currentStatus: boolean) => {
    setUpdatingId(uid);
    const userPath = `users/${uid}`;
    try {
      await updateDoc(doc(db, 'users', uid), { approved: !currentStatus, updatedAt: serverTimestamp() });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, userPath);
    } finally {
      setUpdatingId(null);
    }
  };

  const changeRole = async (uid: string, newRole: AppRole) => {
    setUpdatingId(uid);
    const userPath = `users/${uid}`;
    try {
      await updateDoc(doc(db, 'users', uid), { role: newRole, updatedAt: serverTimestamp() });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, userPath);
    } finally {
      setUpdatingId(null);
    }
  };

  const matchesSearch = (u: { email: string; displayName?: string }) =>
    u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (u.displayName?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false);

  const filteredUsers = users.filter(matchesSearch);
  const filteredInvites = invitations.filter(
    (invite) =>
      !users.some((u) => u.email.toLowerCase() === invite.email.toLowerCase()) &&
      invite.email.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const pendingUsers = filteredUsers.filter((u) => !u.approved);
  const approvedUsers = filteredUsers.filter((u) => u.approved);

  const myRole = (role as AppRole) ?? null;

  // Shared sections rendered in both the team view and the profile view.
  const sharedTail = (
    <>
      {isDev && <IntegrationsSection currentUser={currentUser} />}
      {isDev && <WebhookConsoleSection />}
      {isOwner && (
        <>
          <UsageStatsPanel uid={currentUser?.uid || ''} />
          <section className="mt-10">
            <SectionHeader
              title={t('settings.what_people_telling_us', 'What people are telling us')}
              sub={t('settings.what_people_telling_us_sub', 'Feedback from the team and the community. Read it like notes from friends.')}
            />
            <FeedbackList />
          </section>
        </>
      )}
    </>
  );

  // ── Non-manager: a warm "My profile" page ──
  if (!isManager) {
    return (
      <div className="p-6 md:p-8 max-w-3xl pb-24 lg:pb-8">
        <header className="mb-8">
          <h1 className="font-serif text-3xl sm:text-4xl text-on-surface">{t('settings.title', 'Settings')}</h1>
          <p className="text-base text-on-surface-variant mt-2">{t('settings.subtitle', 'Your account and preferences.')}</p>
        </header>

        <AccountSection />

        <section className="mt-10">
          <SectionHeader
            title={t('settings.roles_access', 'Roles & access')}
            sub={t('settings.roles_access_sub', 'Roles are labels — a way to know who carries what, and what each person sees.')}
          />
          <RolesReference currentRole={myRole} />
        </section>

        <AppearanceSection theme={theme} setTheme={setTheme} />
        <NotificationsSection />
        <LanguageSection />

        {sharedTail}

        <p className="mt-12 text-center text-[13px] text-on-surface-variant/70 italic">
          {t('settings.more_account_settings', 'More account settings will arrive in time.')}
        </p>
      </div>
    );
  }

  // ── Manager / admin: full settings ──
  return (
    <PageContainer variant="reading">
      <header className="mb-8">
        <h1 className="font-serif page-title text-on-surface">{t('settings.title', 'Settings')}</h1>
        <p className="text-base text-on-surface-variant mt-2">
          {currentUser?.displayName
            ? `${t('settings.signed_in_as', 'Signed in as')} ${currentUser.displayName}${myRole ? ` · ${ROLE_LABEL[myRole]}` : ''}`
            : t('settings.manager_subtitle', 'Your workspace and preferences.')}
        </p>
      </header>

      <AccountSection />
      <AppearanceSection theme={theme} setTheme={setTheme} />
      <NotificationsSection />
      <LanguageSection />

      <section className="mt-10">
        <SectionHeader
          title={t('settings.roles_access', 'Roles & access')}
          sub={t('settings.roles_access_sub', 'Roles are labels — a way to know who carries what, and what each person sees.')}
        />
        <RolesReference currentRole={myRole} />
      </section>

      {/* Your team */}
      <section className="mt-10">
        <SectionHeader
          title={t('settings.your_team', 'Your team')}
          sub={t('settings.your_team_sub', 'Everyone with access to CISA. Their contacts, notes, and history stay with the work.')}
        />

        <div className="flex flex-col sm:flex-row gap-2.5 mb-5">
          <div className="flex-1 relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
            <input
              type="text"
              placeholder={t('settings.find_teammate', 'Find a teammate…')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-surface rounded-xl border border-outline-variant focus:border-primary outline-none transition-colors text-sm text-on-surface placeholder:text-on-surface-variant/60"
            />
          </div>
          <button
            onClick={() => setShowInviteDialog(true)}
            className="px-4 py-3 rounded-xl bg-primary text-on-primary font-medium flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors shrink-0"
          >
            <UserPlus className="w-4 h-4" /> {t('settings.add_someone', 'Add someone')}
          </button>
        </div>

        {/* Asking to join */}
        {!loading && pendingUsers.length > 0 && (
          <div className="mb-5 rounded-2xl border border-primary/25 bg-primary/5 p-4">
            <div className="flex items-center gap-2 mb-3 text-accent">
              <KeyRound className="w-4 h-4" />
              <span className="text-sm font-medium">
                {pendingUsers.length} {pendingUsers.length === 1 ? 'person is' : 'people are'} asking to join
              </span>
            </div>
            <div className="space-y-2.5">
              {pendingUsers.map((u) => (
                <div key={u.uid} className="flex items-center gap-3">
                  <Avatar name={u.displayName || u.email} photoURL={u.photoURL} />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-on-surface truncate">{u.displayName || 'Unnamed'}</div>
                    <div className="text-[13px] text-on-surface-variant truncate">
                      wants {ROLE_LABEL[u.role || 'viewer']} · {u.email}
                    </div>
                  </div>
                  <button
                    onClick={() => toggleApproval(u.uid, u.approved)}
                    disabled={updatingId === u.uid}
                    className="shrink-0 px-3.5 py-2 rounded-full bg-primary text-on-primary text-[13px] font-medium flex items-center gap-1.5 hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    {updatingId === u.uid ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Check className="w-3.5 h-3.5" />
                    )}
                    Approve
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Member list */}
        {loading ? (
          <div className="space-y-2.5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-3 p-3.5 rounded-3xl border border-outline-variant/40 bg-surface-container"
              >
                <Skeleton className="w-10 h-10 rounded-full" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-48" />
                </div>
              </div>
            ))}
          </div>
        ) : approvedUsers.length === 0 && filteredInvites.length === 0 ? (
          <div className="py-12 text-center rounded-2xl border border-dashed border-outline-variant/50">
            <p className="text-sm text-on-surface-variant">{t('settings.no_matches', 'No teammates or invites match your search.')}</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {approvedUsers.map((u) => {
              const isYou = u.uid === currentUser?.uid;
              return (
                <MemberCard
                  key={u.uid}
                  user={u}
                  isYou={isYou}
                  canEditRole={isAdmin && !isYou}
                  canRemove={isManager && !isYou}
                  onEdit={() => setEditTarget(u)}
                  onRemove={() => setRemoveTarget(u)}
                />
              );
            })}
            {filteredInvites.map((inv) => (
              <InviteRow key={`inv-${inv.email}`} invite={inv} onCancel={() => revokeInvitation(inv.email)} />
            ))}
          </div>
        )}
      </section>

      {isAdmin && <PartnersSection users={users} />}

      {isAdmin && <DayGoalSection />}

      {(isAdmin || isManager) && <CalendarSyncPanel />}

      {sharedTail}

      {/* Admin note */}
      <div className="mt-10 rounded-3xl border border-outline-variant/40 bg-surface-container-low p-5 flex items-start gap-3">
        <span className="w-9 h-9 rounded-full bg-stage-accent-soft text-stage-accent flex items-center justify-center shrink-0">
          <Shield className="w-4 h-4" />
        </span>
        <div>
          <h3 className="font-serif text-base text-on-surface leading-tight">{t('settings.note_on_access', 'A note on access')}</h3>
          <p className="text-[13px] text-on-surface-variant mt-1 leading-relaxed">
            {t('settings.note_on_access_body', 'Approving or removing access takes effect right away. You can’t remove your own access or change your own role — that’s by design, so no one locks themselves out.')}
          </p>
        </div>
      </div>

      <AnimatePresence>
        {showInviteDialog && (
          <InviteModal
            email={inviteEmail}
            setEmail={setInviteEmail}
            role={inviteRole}
            setRole={setInviteRole}
            isAdmin={isAdmin}
            isInviting={isInviting}
            onClose={() => setShowInviteDialog(false)}
            onSubmit={async (e) => {
              await sendInvitation(e);
              if (!isInviting) setShowInviteDialog(false);
            }}
          />
        )}
        {editTarget && (
          <EditRoleModal
            user={editTarget}
            isAdmin={isAdmin}
            onClose={() => setEditTarget(null)}
            onSave={(uid, newRole) => {
              changeRole(uid, newRole);
              setEditTarget(null);
            }}
          />
        )}
        {removeTarget && (
          <RemoveConfirmModal
            user={removeTarget}
            onClose={() => setRemoveTarget(null)}
            onConfirm={(uid) => {
              toggleApproval(uid, true);
              setRemoveTarget(null);
            }}
          />
        )}
      </AnimatePresence>
    </PageContainer>
  );
}
