import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import { Link } from 'react-router-dom';
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
import { db, handleFirestoreError, OperationType, sendNotification } from '../lib/firebase';
import { AppUser, Invitation } from '../types';
import { FirstRunStore, firstRunKey } from '../lib/firstRun';
import { useAuth } from '../components/AuthProvider';
import BnpbSyncCard from '../components/settings/BnpbSyncCard';
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
  PanelLeft,
  LayoutPanelLeft,
  Rows3,
  Eye,
  EyeOff,
  RefreshCw,
  Video,
  BookOpen,
} from 'lucide-react';
import { cn, getUserInitials } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { Skeleton } from '../components/ui/Skeleton';
import { Switch } from '../components/ui/Switch';
import { useTheme } from '../components/ThemeProvider';
import { useNavShell, type NavShellPreference } from '../components/NavShellProvider';
import { useLanguage } from '../components/LanguageProvider';
import FeedbackList from './FeedbackList';
import UsageStatsPanel from '../components/settings/UsageStatsPanel';
import TestAccountPurgeModal from '../components/settings/TestAccountPurgeModal';
import WhatsNewModal from '../components/WhatsNewModal';
import { Select } from '../components/ui/Select';
import whatsNewManifest from '../generated/whats-new.json';
import type { WhatsNewManifest } from '../scripts/compile-whats-new';
import { useWhatsNewSettings } from '../lib/whatsNew';
import {
  subscribePartners,
  savePartners,
  partnersTermKey,
  pairingsByTerm,
  rePair,
  endPairing,
  dayKey,
  type PartnerPairing,
} from '../lib/partners';
import { TEAMS, teamLabelKey, isKnownTeam, saveUserTeam } from '../lib/teams';
import {
  subscribeReminderSchedule,
  saveReminderSchedule,
  saveWeeklyReminderOff,
  reminderTimeSummary,
  REMINDER_WEEKDAYS,
  REMINDER_HOURS,
  DEFAULT_REMINDER_SCHEDULE,
  type ReminderSchedule,
  type ReminderTime,
  type Weekday,
} from '../lib/weeklyReminders';
import { isRealPerson } from '../lib/permissions';
import { useDayGoal, GOAL_MIN, GOAL_MAX } from '../lib/goal';
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
  registerWebPush,
} from '../lib/webPush';
import { QRCodeSVG } from 'qrcode.react';
import {
  sendEmailVerification,
  reauthenticateWithPopup,
  reauthenticateWithCredential,
  EmailAuthProvider,
  GoogleAuthProvider,
} from 'firebase/auth';
import {
  listEnrolledFactors,
  hasTotpFactor,
  startTotpEnrollment,
  unenrollTotpFactor,
  type TotpEnrollment,
  TOTP_FACTOR_ID,
} from '../lib/mfa';

type AppRole = 'admin' | 'manager' | 'operator' | 'viewer';

const OWNER_EMAIL = 'yilongwang05@gmail.com';

// Role names are the one piece of vocabulary the whole page repeats (the
// account badge, the roster rows, the role cards), so they resolve through one
// map instead of four English literals.
const ROLE_LABEL_KEY: Record<AppRole, [key: string, fallback: string]> = {
  admin: ['settings.roles.full_timer', 'Full-timer'],
  manager: ['settings.roles.trainee', 'Trainee'],
  operator: ['settings.roles.student', 'Student'],
  viewer: ['settings.roles.community', 'Community'],
};

function roleLabel(t: (key: string, fallback?: string) => string, role: AppRole | string | null | undefined): string {
  const [key, fallback] = ROLE_LABEL_KEY[(role as AppRole)] ?? ROLE_LABEL_KEY.viewer;
  return t(key, fallback);
}

// Ordered low → high for the selects. The Full-timer (admin) option is only
// offered to admins (RBAC) — handled where the options are rendered. The
// labels are not stored here: both pickers resolve `roleLabel()` so a Spanish
// session never reads a literal English constant (#1818).
const ROLE_OPTIONS: { value: AppRole }[] = [
  { value: 'viewer' },
  { value: 'operator' },
  { value: 'manager' },
  { value: 'admin' },
];

// The access chips reuse the nav labels so a Spanish reader sees the same
// destination names the rail uses (plus "Today", which only this card calls
// the home surface).
const ROLE_SECTIONS: Record<string, [key: string, label: string]> = {
  today: ['settings.access_today', 'Today'],
  people: ['nav.directory', 'People'],
  journey: ['nav.the_journey', 'The Journey'],
  gatherings: ['nav.gatherings', 'Gatherings'],
  prayer: ['nav.prayer', 'Prayer'],
  history: ['nav.history', 'History'],
  settings: ['nav.settings', 'Settings'],
};

const ROLE_CARDS: {
  key: AppRole;
  labelKey: string;
  label: string;
  descKey: string;
  initials: string;
  description: string;
  access: string[];
}[] = [
  {
    key: 'admin',
    labelKey: 'settings.roles.full_timer',
    label: 'Full-timer',
    descKey: 'settings.roles.full_timer_desc',
    initials: 'FT',
    description: 'Full-time staff. Sees the whole work — every person, the team board, and all admin tools.',
    access: ['today', 'people', 'journey', 'gatherings', 'prayer', 'history', 'settings'],
  },
  {
    key: 'manager',
    labelKey: 'settings.roles.trainee',
    label: 'Trainee',
    descKey: 'settings.roles.trainee_desc',
    initials: 'TR',
    description: 'Cares for the people they are tied to, joins The Journey board, and keeps their own preferences.',
    access: ['today', 'people', 'journey', 'settings'],
  },
  {
    key: 'operator',
    labelKey: 'settings.roles.student',
    label: 'Student',
    descKey: 'settings.roles.student_desc',
    initials: 'ST',
    description: 'Can add and update people, log interactions, and mark attendance.',
    access: ['today', 'people', 'gatherings', 'prayer'],
  },
  {
    key: 'viewer',
    labelKey: 'settings.roles.community',
    label: 'Community',
    descKey: 'settings.roles.community_desc',
    initials: 'CM',
    description: 'A read-only window — can see gatherings and prayers, nothing else.',
    access: ['gatherings', 'prayer'],
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
  const { t } = useLanguage();
  return (
    <div className="flex flex-col gap-2.5 max-w-2xl">
      {ROLE_CARDS.map((card) => {
        const isActive = card.key === currentRole;
        return (
          <div
            key={card.key}
            className={cn(
              'flex gap-4 items-start p-4 rounded-xl border transition-colors',
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
                <span className="font-serif text-[17px] text-on-surface leading-tight">{t(card.labelKey, card.label)}</span>
                {isActive && (
                  <span className="text-[11px] font-medium text-accent border border-accent-line bg-surface rounded-full px-2 py-0.5 leading-none">
                    {t('settings.your_role', 'your role')}
                  </span>
                )}
              </div>
              <p className="text-[13px] text-on-surface-variant mt-0.5 leading-none">
                {t('settings.sections_accessible', '{n} sections accessible').replace('{n}', String(card.access.length))}
              </p>
              <p className="text-[13.5px] text-on-surface/75 leading-relaxed mt-2 max-w-prose">{t(card.descKey, card.description)}</p>
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {card.access.map((section) => {
                  const [key, label] = ROLE_SECTIONS[section];
                  return (
                    <span
                      key={section}
                      className="text-[12px] text-on-surface-variant bg-surface-container-high border border-outline-variant/40 rounded-full px-2.5 py-0.5"
                    >
                      {t(key, label)}
                    </span>
                  );
                })}
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
  const [showEditName, setShowEditName] = useState(false);
  const myRole = (role as AppRole) ?? null;

  const handleSaveSelfName = async (newName: string) => {
    if (!user?.uid) return;
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        displayName: newName,
        updatedAt: serverTimestamp(),
      });
      setShowEditName(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  return (
    <section className="mt-10">
      <SectionHeader
        title={t('settings.account_session', 'Account & Session')}
        sub={t('settings.account_session_sub', 'Manage your signed-in account and session state.')}
      />
      <div className="rounded-xl border border-outline-variant/40 bg-surface-container p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        <div className="flex items-center gap-4 min-w-0">
          <Avatar name={user?.displayName || user?.email} photoURL={user?.photoURL} size="lg" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-serif text-xl text-on-surface truncate">{user?.displayName || t('settings.campus_user', 'Campus user')}</h3>
              <button
                type="button"
                onClick={() => setShowEditName(true)}
                className="p-1.5 rounded-full pointer-coarse:inline-flex pointer-coarse:items-center pointer-coarse:justify-center pointer-coarse:w-11 pointer-coarse:h-11 hover:bg-surface-container-high text-on-surface-variant transition-colors"
                aria-label={t('settings.edit_name', 'Edit name')}
                title={t('settings.edit_name', 'Edit name')}
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            </div>
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
                  {roleLabel(t, myRole)}
                </span>
              )}
            </div>
          </div>
        </div>
        <button
          onClick={logOut}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-[14px] bg-error/10 text-error hover:bg-error/20 font-medium text-sm transition-colors cursor-pointer shrink-0 min-h-[44px] w-full sm:w-auto"
        >
          <LogOut className="w-4 h-4" />
          {t('actions.log_out', 'Log out')}
        </button>
      </div>

      <AnimatePresence>
        {showEditName && (
          <EditSelfNameModal
            currentName={user?.displayName || ''}
            onClose={() => setShowEditName(false)}
            onSave={handleSaveSelfName}
          />
        )}
      </AnimatePresence>
    </section>
  );
}

// ── Security (second factor) ──────────────────────────────────────────

const REQUIRES_RECENT_LOGIN = 'auth/requires-recent-login';

function SecuritySection() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const factors = user ? listEnrolledFactors(user) : [];
  const [status, setStatus] = useState<'idle' | 'reauth' | 'enrolling'>('idle');
  const [pendingAction, setPendingAction] = useState<'enroll' | 'unenroll' | null>(null);
  const [unenrollUid, setUnenrollUid] = useState<string | null>(null);
  const [reauthPassword, setReauthPassword] = useState('');
  const [showReauthPassword, setShowReauthPassword] = useState(false);
  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null);
  const [otp, setOtp] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const clearFeedback = () => {
    setMessage(null);
    setError(null);
  };
  const email = user?.email ?? null;
  const emailVerified = !!user?.emailVerified;
  const isGoogle = !!user?.providerData?.some((p) => p.providerId === 'google.com');
  const secondFactorOn = hasTotpFactor(user as never);

  const requireRecentSignIn = async <T,>(action: () => Promise<T>, next: 'enroll' | 'unenroll') => {
    clearFeedback();
    setBusy(true);
    try {
      await action();
      setBusy(false);
      return true;
    } catch (err: any) {
      setBusy(false);
      if (err?.code === REQUIRES_RECENT_LOGIN) {
        setPendingAction(next);
        setStatus('reauth');
        return false;
      }
      setError(t('settings.security.reauth_required_failed', 'That could not be done. Please try again.'));
      return false;
    }
  };

  const handleVerifyEmail = async () => {
    if (!user) return;
    clearFeedback();
    setBusy(true);
    try {
      await sendEmailVerification(user);
      setMessage(t('settings.security.verification_sent', 'Verification email sent. Open the link to verify your address.'));
    } catch {
      setError(t('settings.security.verification_failed', 'Could not send the verification email. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  const runPendingAction = async () => {
    if (pendingAction === 'enroll') {
      setStatus('idle');
      await handleStartEnroll();
    } else if (pendingAction === 'unenroll' && unenrollUid) {
      setStatus('idle');
      await handleUnenroll(unenrollUid);
    }
  };

  const handleReauth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    clearFeedback();
    setBusy(true);
    try {
      if (isGoogle) {
        await reauthenticateWithPopup(user, new (GoogleAuthProvider)());
      } else {
        if (!email || !reauthPassword) return;
        await reauthenticateWithCredential(user, EmailAuthProvider.credential(email, reauthPassword));
      }
      setBusy(false);
      setReauthPassword('');
      await runPendingAction();
    } catch {
      setBusy(false);
      setError(t('settings.security.reauth_failed', 'Could not confirm your identity. Check your password and try again.'));
    }
  };

  const handleStartEnroll = async () => {
    if (!user) return;
    clearFeedback();
    await requireRecentSignIn(async () => {
      const enr = await startTotpEnrollment(user, 'Authenticator');
      setEnrollment(enr);
      setStatus('enrolling');
      setShowSecret(false);
      setOtp('');
    }, 'enroll');
  };

  const handleConfirmEnroll = async () => {
    if (!enrollment) return;
    clearFeedback();
    setBusy(true);
    try {
      await enrollment.enroll(otp.trim());
      setEnrollment(null);
      setOtp('');
      setStatus('idle');
      setPendingAction(null);
      setMessage(t('settings.security.added', 'Second factor added. Keep your authenticator app handy when signing in.'));
    } catch {
      setError(t('settings.security.code_invalid', 'That code did not work. Check your authenticator app and try again.'));
    } finally {
      setBusy(false);
    }
  };

  const handleUnenroll = async (uid: string) => {
    if (!user) return;
    clearFeedback();
    setUnenrollUid(uid);
    const ok = await requireRecentSignIn(async () => {
      await unenrollTotpFactor(user, uid);
      setMessage(t('settings.security.removed', 'Second factor removed.'));
    }, 'unenroll');
    setUnenrollUid(null);
    if (ok) setPendingAction(null);
  };

  const renderFactors = () => {
    if (factors.length === 0) {
      return (
        <p className="text-sm text-on-surface-variant">
          {t('settings.security.none', 'No second factor yet. Adding one keeps your account safer if your password leaks.')}
        </p>
      );
    }
    return (
      <ul className="space-y-2">
        {factors.map((f) => (
          <li
            key={f.uid}
            className="flex items-center justify-between gap-3 rounded-lg border border-outline-variant/40 bg-surface px-4 py-3"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-on-surface">
                {f.factorId === TOTP_FACTOR_ID
                  ? t('settings.security.authenticator_app', 'Authenticator app')
                  : f.displayName || f.factorId}
              </p>
              {f.displayName && (
                <p className="text-xs text-on-surface-variant">{f.displayName}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => handleUnenroll(f.uid)}
              disabled={busy}
              className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-[14px] text-xs font-medium bg-error/10 text-error hover:bg-error/20 transition-colors disabled:opacity-50 min-h-11"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {t('settings.security.remove', 'Remove')}
            </button>
          </li>
        ))}
      </ul>
    );
  };

  return (
    <section className="mt-10">
      <SectionHeader
        title={t('settings.security_title', 'Security')}
        sub={t('settings.security_sub', 'A second factor protects your account even if your password is compromised.')}
      />
      <div className="rounded-xl border border-outline-variant/40 bg-surface-container p-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-medium text-on-surface">
              {t('settings.security.two_step_label', 'Two-step verification')}
            </p>
            <p className="text-sm text-on-surface-variant">
              {secondFactorOn
                ? t('settings.security.on', 'On — you verify with your authenticator app on sign-in.')
                : t('settings.security.off', 'Off')}
            </p>
          </div>
          <span
            className={cn(
              'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border shrink-0',
              // `text-warning` (#BA5900) on a 10% warning wash measured 3.87:1
              // — below AA for a 12px badge. The tint carries the signal; the
              // words stay in ink so the state can actually be read.
              secondFactorOn ? 'bg-success/10 text-success border-success/20' : 'bg-warning/10 text-on-surface border-warning/30',
            )}
          >
            {secondFactorOn
              ? t('settings.security.status_on', 'On')
              : t('settings.security.status_off', 'Off')}
          </span>
        </div>

        {!emailVerified && (
          <div className="rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm text-on-surface space-y-2">
            <p>
              {t('settings.security.email_not_verified', 'Your email address is not verified. Verify it before adding a second factor.')}
            </p>
            <button
              type="button"
              onClick={handleVerifyEmail}
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-[14px] text-xs font-medium bg-warning/15 text-on-surface border border-warning/40 hover:bg-warning/25 transition-colors disabled:opacity-50 min-h-11"
            >
              <Mail className="w-3.5 h-3.5" />
              {t('settings.security.verify_email', 'Verify email')}
            </button>
          </div>
        )}

        {status === 'reauth' ? (
          <form onSubmit={handleReauth} className="space-y-3 rounded-lg border border-outline-variant/40 bg-surface p-4">
            <p className="text-sm text-on-surface">
              {t('settings.security.reauth_prompt', 'Re-confirm your identity to manage your second factor.')}
            </p>
            {!isGoogle ? (
              <div className="relative">
                <input
                  type={showReauthPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder={t('settings.security.password_placeholder', 'Password')}
                  value={reauthPassword}
                  onChange={(e) => setReauthPassword(e.target.value)}
                  className="w-full px-4 py-2.5 pr-12 rounded-sm pointer-coarse:min-h-11 bg-surface border border-outline-variant focus:border-primary outline-none text-on-surface"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowReauthPassword((v) => !v)}
                  aria-label={
                    showReauthPassword
                      ? t('settings.security.hide_password', 'Hide password')
                      : t('settings.security.show_password', 'Show password')
                  }
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-on-surface-variant hover:text-accent transition-colors pointer-coarse:after:absolute pointer-coarse:after:inset-x-0 pointer-coarse:after:-inset-y-1.5 pointer-coarse:after:content-['']"
                >
                  {showReauthPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            ) : (
              <p className="text-xs text-on-surface-variant">
                {t('settings.security.google_reauth_note', 'You will confirm through Google.')}
              </p>
            )}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={busy || (!isGoogle && !reauthPassword)}
                className="flex-1 py-2.5 bg-primary text-on-primary rounded-[14px] font-medium hover:opacity-90 transition-all disabled:opacity-60 min-h-[44px]"
              >
                {busy ? t('settings.security.confirming', 'Confirming…') : t('settings.security.confirm', 'Confirm')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setStatus('idle');
                  setPendingAction(null);
                  setReauthPassword('');
                }}
                className="px-4 py-2.5 border border-outline text-on-surface rounded-[14px] font-medium hover:bg-surface-variant transition-all min-h-[44px]"
              >
                {t('actions.cancel', 'Cancel')}
              </button>
            </div>
          </form>
        ) : status === 'enrolling' && enrollment ? (
          <div className="space-y-4 rounded-lg border border-outline-variant/40 bg-surface p-4">
            <p className="text-sm text-on-surface">
              {t('settings.security.scan_prompt', 'Scan this code with your authenticator app (Google Authenticator or similar), then enter the 6-digit code.')}
            </p>
            <div className="flex justify-center">
              <div
                data-testid="totp-qr-container"
                className="flex items-center justify-center rounded-[14px] border border-outline-variant/60 bg-white p-3"
              >
                <QRCodeSVG
                  value={enrollment.qrCodeUrl}
                  size={160}
                  level="M"
                  marginSize={2}
                  bgColor="#FFFFFF"
                  fgColor="#0A0A0B"
                  aria-label={t('settings.security.qr_label', 'Authenticator setup QR code')}
                />
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowSecret((v) => !v)}
              className="text-xs text-accent underline underline-offset-2 hover:opacity-80 pointer-coarse:inline-flex pointer-coarse:items-center pointer-coarse:min-h-11"
            >
              {showSecret
                ? t('settings.security.hide_secret', 'Hide manual secret')
                : t('settings.security.show_secret', 'Can’t scan? Enter the secret manually')}
            </button>
            {showSecret && (
              <p className="text-sm font-mono text-on-surface-variant break-all select-all">
                {enrollment.secretKey}
              </p>
            )}
            <div className="flex gap-2">
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                placeholder={t('settings.security.code_placeholder', '6-digit code')}
                className="w-32 px-3 py-2.5 rounded-sm pointer-coarse:min-h-11 bg-surface border border-outline-variant focus:border-primary outline-none text-on-surface text-center tracking-[0.3em]"
              />
              <button
                type="button"
                onClick={handleConfirmEnroll}
                disabled={busy || otp.length !== 6}
                className="flex-1 py-2.5 bg-primary text-on-primary rounded-[14px] font-medium hover:opacity-90 transition-all disabled:opacity-60 min-h-[44px]"
              >
                {busy ? t('settings.security.adding', 'Adding…') : t('settings.security.add_factor', 'Add second factor')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setStatus('idle');
                  setEnrollment(null);
                  setOtp('');
                }}
                disabled={busy}
                className="px-4 py-2.5 border border-outline text-on-surface rounded-[14px] font-medium hover:bg-surface-variant transition-all disabled:opacity-50 min-h-[44px]"
              >
                {t('actions.cancel', 'Cancel')}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {renderFactors()}
            {factors.length === 0 && (
              <button
                type="button"
                onClick={handleStartEnroll}
                disabled={busy || !emailVerified}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-[14px] bg-primary text-on-primary font-medium text-sm hover:opacity-90 transition-all disabled:opacity-50 min-h-[44px]"
              >
                <Plus className="w-4 h-4" />
                {t('settings.security.set_up', 'Set up second factor')}
              </button>
            )}
          </div>
        )}

        {message && <p className="text-sm text-success px-1">{message}</p>}
        {error && <p className="text-sm text-error px-1">{error}</p>}
      </div>
    </section>
  );
}

// ── Appearance ─────────────────────────────────────────────────────────

const APPEARANCE: {
  key: 'light' | 'dark' | 'system';
  labelKey: string;
  label: string;
  noteKey: string;
  note: string;
  Icon: typeof Sun;
}[] = [
  { key: 'light', labelKey: 'settings.appearance_light', label: 'Light', noteKey: 'settings.appearance_light_note', note: 'Warm paper', Icon: Sun },
  { key: 'dark', labelKey: 'settings.appearance_dark', label: 'Dark', noteKey: 'settings.appearance_dark_note', note: 'Quiet dusk', Icon: Moon },
  { key: 'system', labelKey: 'settings.appearance_system', label: 'System', noteKey: 'settings.appearance_system_note', note: 'Match my device', Icon: Monitor },
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
        {APPEARANCE.map(({ key, labelKey, label, noteKey, note, Icon }) => {
          const active = theme === key;
          return (
            <button
              key={key}
              onClick={() => setTheme(key)}
              aria-pressed={active}
              className={cn(
                'flex flex-col items-start gap-2 p-4 rounded-xl border text-left transition-colors',
                // The Inversion Rule: the active choice turns inside out. A 5%
                // tint left the chosen card lighter than its neighbours.
                active
                  ? 'border-transparent bg-primary text-on-primary'
                  : 'bg-surface-container border-outline-variant/40 hover:bg-surface-container-high',
              )}
            >
              <Icon className={cn('w-5 h-5', active ? 'text-on-primary' : 'text-on-surface-variant')} />
              <span className={cn('font-serif text-base leading-none', active ? 'text-on-primary' : 'text-on-surface')}>
                {t(labelKey, label)}
              </span>
              <span className={cn('text-xs', active ? 'text-on-primary/80' : 'text-on-surface-variant')}>
                {t(noteKey, note)}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

// ── Navigation ───────────────────────────────────────────────────────────

const NAV_SHELLS: Array<{
  key: NavShellPreference;
  labelKey: string;
  label: string;
  noteKey: string;
  note: string;
  Icon: typeof Sun;
}> = [
  { key: 'rail', labelKey: 'settings.nav_rail', label: 'Rail', noteKey: 'settings.nav_rail_note', note: 'Wide, all destinations visible', Icon: PanelLeft },
  { key: 'rail-collapsed', labelKey: 'settings.nav_compact', label: 'Compact', noteKey: 'settings.nav_compact_note', note: 'Icons only, labels on hover', Icon: LayoutPanelLeft },
  { key: 'topbar', labelKey: 'settings.nav_topbar', label: 'Top bar', noteKey: 'settings.nav_topbar_note', note: 'The original horizontal bar', Icon: Rows3 },
];

function NavigationSection() {
  const { t } = useLanguage();
  const { preference, setPreference } = useNavShell();
  return (
    <section className="mt-10">
      <SectionHeader
        title={t('settings.navigation', 'Navigation')}
        sub={t(
          'settings.navigation_sub',
          'Desktop-only. The rail shows every destination grouped; the compact rail keeps the same destinations on icons; the top bar keeps the existing horizontal shell.',
        )}
      />
      {/* Below `lg` there is no rail and no top bar, so these three cards
          accepted a tap and changed nothing the reader could see. The phone
          gets one sentence instead of a control it cannot use. */}
      <div className="hidden lg:grid grid-cols-3 gap-3 max-w-2xl" data-testid="nav-shell-cards">
        {NAV_SHELLS.map(({ key, labelKey, label, noteKey, note, Icon }) => {
          const active = preference === key;
          return (
            <button
              key={key}
              onClick={() => setPreference(key)}
              aria-pressed={active}
              className={cn(
                'flex flex-col items-start gap-2 p-4 rounded-xl border text-left transition-colors',
                active
                  ? 'border-transparent bg-primary text-on-primary'
                  : 'bg-surface-container border-outline-variant/40 hover:bg-surface-container-high',
              )}
            >
              <Icon className={cn('w-5 h-5', active ? 'text-on-primary' : 'text-on-surface-variant')} />
              <span className={cn('font-serif text-base leading-none', active ? 'text-on-primary' : 'text-on-surface')}>
                {t(labelKey, label)}
              </span>
              <span className={cn('text-xs', active ? 'text-on-primary/80' : 'text-on-surface-variant')}>
                {t(noteKey, note)}
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-sm text-on-surface-variant lg:hidden max-w-2xl" data-testid="nav-phone-note">
        {t(
          'settings.navigation_phone',
          'On a phone the bottom bar is always the navigation. The rail and the top bar are chosen on a computer.',
        )}
      </p>
      <p className="mt-3 hidden text-xs text-on-surface-variant lg:block max-w-2xl">
        {t(
          'settings.navigation_help',
          'On narrower windows the top bar is used instead, and on phones the bottom bar — neither changes this choice. A narrow window may also collapse the rail temporarily.',
        )}
      </p>
      <Link
        to="/help"
        className="mt-6 flex max-w-2xl items-center gap-3 rounded-xl border border-outline-variant/40 bg-surface-container px-4 py-3 text-sm text-on-surface transition-colors hover:bg-surface-container-high"
      >
        <BookOpen className="h-5 w-5 text-accent" />
        <span className="flex-1">{t('settings.help_link', 'Browse Help')}</span>
      </Link>
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
      if (user?.uid) await registerWebPush(user.uid);
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
      // 'unsupported' (e.g. iOS Safari in a tab) still sends the test to your
      // other devices; registerWebPush below reports this browser can't join.
      if (status !== 'granted' && status !== 'unsupported') {
        const granted = await requestWebNotificationPermission();
        status = getWebNotificationPermissionStatus();
        setPermStatus(status);
        if (!granted) {
          setFeedbackMsg(t('settings.notifications_disabled', 'Browser notifications are blocked in your browser settings'));
          return;
        }
      }

      if (!user?.uid) return;
      // The test takes the same path as every real alert: a bell entry, which
      // the push function delivers to each device you have turned alerts on for.
      const reachable = await registerWebPush(user.uid);
      await sendNotification({
        userId: user.uid,
        title: 'Test Notification',
        message: 'Notifications are working.',
        type: 'info',
        link: '/settings',
      });
      setFeedbackMsg(
        reachable
          ? t('settings.push_test_sent', 'Test sent — it should arrive on every device where notifications are on.')
          : t(
              'settings.push_unsupported_here',
              "This browser can't receive push alerts (on iPhone, add the app to your Home Screen first). The test was sent to your other devices.",
            ),
      );
    } catch (err) {
      console.error('Failed to send test notification:', err);
      setFeedbackMsg(t('settings.push_test_failed', 'Failed to send test notification.'));
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
      <div className="rounded-xl border border-outline-variant/40 bg-surface-container p-6 flex flex-col gap-4 max-w-2xl">
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
                  : t('settings.notifications_not_yet', 'Notification permission not yet granted')}
          </span>
        </div>

        {feedbackMsg && (
          <p className="text-xs text-on-surface-variant bg-surface-container-high px-3 py-2 rounded-lg border border-outline-variant/30">
            {feedbackMsg}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3 pt-2">
          {permStatus !== 'granted' && permStatus !== 'unsupported' && (
            <button
              onClick={enableNotifications}
              className="px-4 py-2 rounded-[14px] pointer-coarse:inline-flex pointer-coarse:items-center pointer-coarse:min-h-11 bg-primary text-on-primary font-medium text-sm hover:opacity-90 transition-opacity cursor-pointer"
            >
              {t('settings.turn_on_web_notifications', 'Enable browser notifications')}
            </button>
          )}

          <button
            onClick={handleSendTest}
            disabled={testing || permStatus === 'unsupported'}
            className="px-4 py-2 rounded-[14px] pointer-coarse:inline-flex pointer-coarse:items-center pointer-coarse:min-h-11 bg-surface-container-high border border-outline-variant/50 text-on-surface font-medium text-sm hover:bg-surface-container-highest transition-colors cursor-pointer disabled:opacity-50"
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

// ── Weekly reminders (#1301) ────────────────────────────────────────────
// Each staff member's own switch, plus the team-wide schedule only a
// Full-timer edits. The schedule defaults to Tue/Wed 5 pm for Full-timers and
// a per-team Trainee slot at 6 pm; every reminder goes out only when something
// is waiting and only to the people whose schedule names them.

function WeeklyReminderSection({ uid, off }: { uid: string; off: boolean }) {
  const { t } = useLanguage();
  const [pending, setPending] = useState<boolean | null>(null);
  const on = pending ?? !off;

  const toggle = (next: boolean) => {
    setPending(next);
    void saveWeeklyReminderOff(uid, !next);
  };

  return (
    <section className="mt-10">
      <SectionHeader
        title={t('reminders.yours_title', 'Your weekly reminders')}
        sub={t('reminders.yours_sub', 'The rhythm reminders that reach your phone, on the campus clock.')}
      />
      <div className="rounded-xl border border-outline-variant/40 bg-surface-container p-6 flex items-center justify-between gap-4 max-w-2xl">
        <div className="min-w-0">
          <div className="text-sm font-medium text-on-surface">
            {t('reminders.yours_toggle', 'Weekly reminders')}
          </div>
          <p className="text-[13px] text-on-surface-variant mt-1 leading-relaxed">
            {t(
              'reminders.yours_help',
              "Turn your own reminder on or off. Only when something is waiting, so a quiet week stays quiet.",
            )}
          </p>
        </div>
        <Switch
          checked={on}
          onChange={toggle}
          aria-label={t('reminders.yours_toggle', 'Weekly reminders')}
        />
      </div>
    </section>
  );
}

function ReminderScheduleSection() {
  const { t, language } = useLanguage();
  const [schedule, setSchedule] = useState<ReminderSchedule>(DEFAULT_REMINDER_SCHEDULE);
  useEffect(() => subscribeReminderSchedule(setSchedule), []);

  const write = (next: ReminderSchedule) => {
    setSchedule(next);
    void saveReminderSchedule(next);
  };

  const setTime = (id: string, time: ReminderTime) =>
    id === 'fullTimers'
      ? write({ ...schedule, fullTimers: time })
      : write({ ...schedule, teams: { ...schedule.teams, [id]: time } });

  const toggleDay = (time: ReminderTime, day: Weekday): ReminderTime => ({
    ...time,
    days: time.days.includes(day)
      ? time.days.filter((d) => d !== day)
      : ([...time.days, day].sort((a, b) => a - b) as Weekday[]),
  });

  const rows: { id: string; label: string; time: ReminderTime }[] = [
    { id: 'fullTimers', label: t('reminders.full_timers', 'Full-timers'), time: schedule.fullTimers },
    ...TEAMS.map((tm) => ({
      id: tm.id,
      label: t(teamLabelKey(tm.id), tm.label),
      time: schedule.teams[tm.id] ?? { days: [], hour: 18 },
    })),
  ];

  return (
    <section className="mt-10">
      <SectionHeader
        title={t('reminders.schedule_title', 'Weekly reminder schedule')}
        sub={t(
          'reminders.schedule_sub',
          'When each reminder goes out, on the campus clock. Each fires only if something is waiting.',
        )}
      />
      <div className="flex flex-col gap-3 max-w-2xl">
        {rows.map((row) => (
          <div
            key={row.id}
            className="rounded-xl border border-outline-variant/40 bg-surface-container p-5 flex flex-col gap-3"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-on-surface">{row.label}</span>
              <span className="text-[12px] text-on-surface-variant">
                {reminderTimeSummary(row.time, language)}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div role="group" aria-label={t('reminders.days_for', 'Days for {name}').replace('{name}', row.label)} className="inline-flex gap-1 rounded-full border border-outline-variant/40 bg-surface-container-low p-1">
                {REMINDER_WEEKDAYS.map((day) => {
                  const active = row.time.days.includes(day.value);
                  return (
                    <button
                      key={day.value}
                      type="button"
                      aria-pressed={active}
                      aria-label={t(day.key, day.label)}
                      onClick={() => setTime(row.id, toggleDay(row.time, day.value))}
                      className={cn(
                        'rounded-full px-2.5 py-1 text-[12px] transition-colors cursor-pointer pointer-coarse:inline-flex pointer-coarse:items-center pointer-coarse:min-h-11',
                        active
                          ? 'bg-background text-on-surface font-medium'
                          : 'text-on-surface-variant hover:text-on-surface',
                      )}
                    >
                      {t(day.key, day.label)}
                    </button>
                  );
                })}
              </div>
              <label className="text-[12px] text-on-surface-variant flex items-center gap-2">
                {t('reminders.hour', 'Time')}
                <select
                  value={row.time.hour}
                  aria-label={t('reminders.hour_for', 'Time for {name}').replace('{name}', row.label)}
                  onChange={(e) => setTime(row.id, { ...row.time, hour: Number(e.target.value) })}
                  className="rounded-sm pointer-coarse:min-h-11 border border-outline-variant/50 bg-surface px-2.5 py-1.5 text-[13px] text-on-surface cursor-pointer"
                >
                  {REMINDER_HOURS.map((hour) => (
                    <option key={hour} value={hour}>
                      {`${String(hour).padStart(2, '0')}:00`}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Language ───────────────────────────────────────────────────────────

const LANGUAGES: { key: 'en' | 'es'; label: string; noteKey: string; note: string; flag: string }[] = [
  { key: 'en', label: 'English', noteKey: 'settings.language_en_note', note: 'Default language', flag: '🇺🇸' },
  { key: 'es', label: 'Español', noteKey: 'settings.language_es_note', note: 'Traducción inteligente en vivo', flag: '🇪🇸' },
];

function LanguageSection() {
  const { language, setLanguage, t } = useLanguage();

  return (
    <section className="mt-10">
      <SectionHeader title={t('settings.language', 'Language')} sub={t('settings.language_sub', 'Choose your preferred interface and live translation language.')} />
      <div className="grid grid-cols-2 gap-3 max-w-xl">
        {LANGUAGES.map(({ key, label, noteKey, note, flag }) => {
          const active = language === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setLanguage(key)}
              aria-pressed={active}
              className={cn(
                'flex flex-col items-start gap-2 p-4 rounded-xl border text-left transition-colors cursor-pointer',
                active
                  ? 'border-transparent bg-primary text-on-primary'
                  : 'bg-surface-container border-outline-variant/40 hover:bg-surface-container-high',
              )}
            >
              <div className="flex items-center gap-2">
                {/* Decorative: the language's own name is the next span, so an
                    aria-label here made a screen reader say "English English". */}
                <span className="text-xl leading-none" aria-hidden="true">{flag}</span>
                <span className={cn('font-serif text-base leading-none', active ? 'text-on-primary' : 'text-on-surface')}>
                  {label}
                </span>
              </div>
              <span className={cn('text-xs', active ? 'text-on-primary/80' : 'text-on-surface-variant')}>
                {t(noteKey, note)}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

// ── What's New ─────────────────────────────────────────────────────────

function WhatsNewSection({
  onOpen,
  isAdmin,
  userEmail,
}: {
  onOpen: () => void;
  isAdmin?: boolean;
  userEmail?: string | null;
}) {
  const { t } = useLanguage();
  const { videoUrl: savedVideoUrl, videoRoles: savedVideoRoles, setVideoSettings } = useWhatsNewSettings();

  const [inputUrl, setInputUrl] = useState<string | null>(null);
  const [targetAudience, setTargetAudience] = useState<'everyone' | 'admin' | 'staff' | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveInputUrl = inputUrl ?? (savedVideoUrl || '');
  const effectiveTargetAudience: 'everyone' | 'admin' | 'staff' =
    targetAudience ??
    (!savedVideoRoles || savedVideoRoles.length === 0
      ? 'everyone'
      : savedVideoRoles.length === 2 &&
          savedVideoRoles.includes('admin') &&
          savedVideoRoles.includes('manager')
        ? 'staff'
        : savedVideoRoles.length === 1 && savedVideoRoles.includes('admin')
          ? 'admin'
          : 'everyone');

  const handleSaveVideo = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaveSuccess(false);

    let rolesToSave: string[] | null = null;
    if (effectiveTargetAudience === 'admin') {
      rolesToSave = ['admin'];
    } else if (effectiveTargetAudience === 'staff') {
      rolesToSave = ['admin', 'manager'];
    }

    try {
      await setVideoSettings(
        {
          videoUrl: effectiveInputUrl.trim() || null,
          videoRoles: rolesToSave,
        },
        userEmail || null,
      );
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err: any) {
      setError(err?.message || t('settings.whats_new_save_failed', 'Failed to save What’s New video settings'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mt-10">
      <SectionHeader
        title={t('settings.whats_new', "What's New")}
        sub={t('settings.whats_new_sub', 'See the latest updates, features, and improvements added to CISA.')}
      />
      <div className="rounded-xl border border-outline-variant/40 bg-surface-container p-6 flex flex-col gap-6 max-w-2xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-lg bg-primary/10 flex items-center justify-center text-accent shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-serif text-base text-on-surface leading-tight">
                {whatsNewManifest.latestReleaseId ? `v${(whatsNewManifest as WhatsNewManifest).releases[0]?.version ?? 'Latest'}` : t('settings.whats_new', "What's New")}
              </h3>
              <p className="text-[13px] text-on-surface-variant mt-0.5">
                {(whatsNewManifest as WhatsNewManifest).releases[0]?.title ?? t('settings.whats_new_sub', 'Latest release notes')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onOpen}
            className="px-5 py-2.5 rounded-[14px] pointer-coarse:inline-flex pointer-coarse:items-center pointer-coarse:min-h-11 bg-surface-container-high border border-outline-variant/50 text-on-surface font-medium text-sm hover:bg-surface-container-highest transition-colors cursor-pointer shrink-0"
          >
            {t('settings.whats_new_button', 'View latest release notes')}
          </button>
        </div>

        {isAdmin && (
          <form
            onSubmit={handleSaveVideo}
            className="pt-5 border-t border-outline-variant/30 flex flex-col gap-3"
          >
            <div className="flex items-center gap-2 text-sm font-medium text-on-surface">
              <Video className="w-4 h-4 text-primary" />
              <span>{t('settings.whats_new_video_title', 'Video Walkthrough Companion')}</span>
            </div>
            <p className="text-xs text-on-surface-variant">
              {t(
                'settings.whats_new_video_help',
                'Paste a shared Google Drive video link to accompany the latest release notes, and restrict visibility if the video covers restricted workflows.',
              )}
            </p>

            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="url"
                placeholder="https://drive.google.com/file/d/.../view"
                aria-label={t('settings.whats_new_video_url', 'Video link')}
                value={effectiveInputUrl}
                onChange={(e) => setInputUrl(e.target.value)}
                className="flex-1 px-3.5 py-2 text-sm bg-surface rounded-sm pointer-coarse:min-h-11 border border-outline-variant focus:border-primary outline-none text-on-surface"
              />
              <div className="w-full sm:w-56">
                <Select
                  value={effectiveTargetAudience}
                  onChange={(e) =>
                    setTargetAudience(e.target.value as 'everyone' | 'admin' | 'staff')
                  }
                  aria-label={t('settings.whats_new_audience', 'Video audience')}
                  className="rounded-sm pointer-coarse:min-h-11"
                >
                  <option value="everyone">{t('settings.audience_everyone', 'Everyone')}</option>
                  <option value="staff">{t('settings.audience_staff', 'Full-timers & Trainees')}</option>
                  <option value="admin">{t('settings.audience_admin', 'Full-timers only')}</option>
                </Select>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 mt-1">
              <div className="text-xs">
                {saveSuccess && (
                  <span className="text-success font-medium inline-flex items-center gap-1">
                    <Check className="w-3.5 h-3.5" />
                    {t('settings.whats_new_saved', 'Video settings saved')}
                  </span>
                )}
                {error && <span className="text-error">{error}</span>}
              </div>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-xs font-medium rounded-[14px] pointer-coarse:inline-flex pointer-coarse:items-center pointer-coarse:min-h-11 bg-primary text-on-primary hover:bg-primary/90 transition-colors disabled:opacity-50 cursor-pointer shrink-0"
              >
                {saving ? t('settings.saving', 'Saving...') : t('settings.save_video', 'Save video settings')}
              </button>
            </div>
          </form>
        )}
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
      <div className="rounded-xl border border-outline-variant/40 bg-surface-container p-6 flex flex-col gap-6 max-w-2xl">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h3 className="font-serif text-base text-on-surface leading-tight">
              {t('settings.day_goal_toggle', 'Give the day a goal')}
            </h3>
            <p className="text-[13px] text-on-surface-variant mt-1 leading-relaxed">
              {t('settings.day_goal_toggle_sub', 'Each trainee aims to meet the same number of new people on an on-campus day.')}
            </p>
          </div>
          <Switch
            checked={goal.on}
            onChange={(next) => setOn(next)}
            aria-label={t('settings.day_goal_toggle', 'Give the day a goal')}
          />
        </div>

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
              className="inline-flex items-center justify-center w-11 h-11 rounded-[14px] border border-outline-variant/40 bg-surface-container-high text-on-surface hover:bg-surface hover:border-outline transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-default"
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
              className="inline-flex items-center justify-center w-11 h-11 rounded-[14px] border border-outline-variant/40 bg-surface-container-high text-on-surface hover:bg-surface hover:border-outline transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-default"
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
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };
  return (
    <div className="rounded-lg border border-outline-variant/50 bg-surface-container-low overflow-hidden">
      {label && <div className="px-3 pt-2.5 text-[11px]   text-on-surface-variant">{label}</div>}
      <div className="relative">
        <pre className="font-code text-[11.5px] leading-relaxed text-on-surface-variant whitespace-pre-wrap break-words px-3 py-2.5 pr-14 select-all">
          {code}
        </pre>
        <button
          onClick={copy}
          className="absolute top-2 right-2 inline-flex items-center gap-1 px-2 py-1 rounded-[14px] pointer-coarse:min-h-11 text-xs text-on-surface-variant hover:bg-surface-container-high transition-colors"
          aria-label={t('actions.copy', 'Copy')}
        >
          {copied ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copied ? t('actions.copied', 'Copied') : t('actions.copy', 'Copy')}</span>
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
    <div className="rounded-xl border border-outline-variant/40 bg-surface-container overflow-hidden">
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
  const { t } = useLanguage();
  const [text, setText] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [result, setResult] = useState<QuickAddResult | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [geminiStatus, setGeminiStatus] = useState<'checking' | 'ready' | 'missing'>('checking');

  type QuickAddResult = {
    name?: string;
    role?: string;
    location?: string;
    stage?: string;
    notes?: string;
  };
  // Live backend diagnostic: `/api/quick-add/status` reports whether the Gemini
  // API key is configured on the Cloud Run side. Surfaced in the UI so admins
  // can self-verify without curling — and so a missing key is visible the
  useEffect(() => {
    let cancelled = false;
    fetch('/api/quick-add/status')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: unknown) => {
        if (cancelled) return;
        const configured =
          typeof data === 'object' && data !== null && 'geminiConfigured' in data &&
          (data as { geminiConfigured: unknown }).geminiConfigured === true;
        setGeminiStatus(configured ? 'ready' : 'missing');
      })
      .catch(() => {
        if (!cancelled) setGeminiStatus('missing');
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const appUrl = typeof window !== 'undefined' ? window.location.origin : 'https://cisa-campus-work-tracker.pages.dev';
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
        setErrorMsg(data.error || t('settings.quick_add_error', 'Failed to process description.'));
      }
    } catch (err: any) {
      setStatus('error');
      setErrorMsg(err.message || t('settings.quick_add_connection_error', 'An error occurred connecting to the server.'));
    }
  };

  return (
    <section className="mt-10">
      <SectionHeader
        title={t('settings.quick_add_title', 'Quick add by text')}
        sub={t(
          'settings.quick_add_sub',
          'Bring people in the way you actually meet them — a text, a voice note, a quick line in a group chat.',
        )}
      />
      <div className="space-y-3 max-w-2xl">
        {/* Natural-language playground */}
        <div className="rounded-xl border border-outline-variant/40 bg-surface-container p-5">
          <div className="flex items-start gap-3 mb-3">
            <span className="w-9 h-9 rounded-full bg-stage-violet-soft text-stage-violet flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4" />
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-serif text-base text-on-surface leading-tight">
                  {t('settings.playground_title', 'Natural-language playground')}
                </h3>
                {geminiStatus === 'ready' && (
                  <span
                    data-testid="gemini-status-badge"
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-success/10 text-success border border-success/20"
                    title={t(
                      'settings.gemini_ready_help',
                      'Gemini API key is configured on the backend (Cloud Run). Quick Add, Smart Import, AI Notes, GroupMe bot, and Siri hookups will all parse with AI.',
                    )}
                  >
                    <CheckCircle2 className="w-3 h-3" /> {t('settings.gemini_ready', 'Gemini AI ready')}
                  </span>
                )}
                {geminiStatus === 'missing' && (
                  <span
                    data-testid="gemini-status-badge"
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-warning/10 text-on-surface border border-warning/30"
                    title={t(
                      'settings.gemini_missing_help',
                      'The backend reports GEMINI_API_KEY is not configured. Set it on the campus-hub-backend Cloud Run service to re-enable Quick Add, Smart Import, AI Notes, GroupMe bot, and Siri hookups.',
                    )}
                  >
                    <XCircle className="w-3 h-3" /> {t('settings.gemini_missing', 'Gemini AI not configured')}
                  </span>
                )}
                {geminiStatus === 'checking' && (
                  <span
                    data-testid="gemini-status-badge"
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-surface-container-high text-on-surface-variant border border-outline-variant/40"
                  >
                    <Loader2 className="w-3 h-3 animate-spin" /> {t('settings.gemini_checking', 'Checking Gemini…')}
                  </span>
                )}
              </div>
              <p className="text-[13px] text-on-surface-variant mt-0.5 leading-relaxed">
                {t(
                  'settings.quick_add_intro',
                  "Type or paste a note about someone you met — the way you'd text it or say it out loud. It's parsed and turned into a contact, ready to keep.",
                )}
              </p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2.5">

            <input
              type="text"
              placeholder={t(
                'settings.quick_add_placeholder',
                'e.g. Met John Doe at Miller Hall. Sophomore philosophy student, phone 555-1234.',
              )}
              aria-label={t('settings.quick_add_label', 'A description to parse into a contact')}
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={status === 'loading'}
              className="flex-1 px-4 py-3 bg-surface rounded-sm border border-outline-variant focus:border-primary outline-none transition-colors text-sm text-on-surface placeholder:text-on-surface-variant/60"
            />
            <button
              onClick={handleQuickAdd}
              disabled={status === 'loading' || !text.trim()}
              className="px-5 py-3 bg-primary text-on-primary font-medium rounded-[14px] hover:bg-primary/90 transition-colors text-sm shrink-0 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {status === 'loading' ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{t('settings.quick_add_reading', 'Reading…')}</span>
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4" />
                  <span>{t('settings.quick_add_try', 'Try it')}</span>
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
                className="mt-4 p-4 bg-success/10 border border-success/30 rounded-lg text-sm"
              >
                <div className="flex items-center gap-2 text-success font-medium mb-3">
                  <CheckCircle2 className="w-4 h-4" /> {t('settings.quick_add_parsed', 'Parsed into a contact')}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <div>
                    <span className="text-on-surface-variant block text-[11px]">{t('settings.field_name', 'Name')}</span>
                    <span className="font-medium text-on-surface">{result.name}</span>
                  </div>
                  <div>
                    <span className="text-on-surface-variant block text-[11px]">
                      {t('settings.field_role_group', 'Role / Group')}
                    </span>
                    <span className="text-on-surface">{result.role}</span>
                  </div>
                  <div>
                    <span className="text-on-surface-variant block text-[11px]">
                      {t('settings.field_location', 'Location')}
                    </span>
                    <span className="text-on-surface">{result.location || '—'}</span>
                  </div>
                  <div>
                    <span className="text-on-surface-variant block text-[11px]">{t('settings.field_stage', 'Stage')}</span>
                    <span className="font-medium text-accent">{result.stage}</span>
                  </div>
                </div>
                {result.notes && (
                  <div className="mt-3 text-xs">
                    <span className="text-on-surface-variant block text-[11px]">{t('settings.field_notes', 'Notes')}</span>
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
                className="mt-4 p-4 bg-error/10 border border-error/30 rounded-lg text-sm flex items-start gap-2 text-error"
              >
                <XCircle className="w-5 h-5 shrink-0" />
                <div>
                  <span className="font-medium">{t('settings.quick_add_failed', 'Something went wrong')}</span>
                  <p className="mt-1 text-xs opacity-90">{errorMsg}</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Channels */}
        <ChannelCard
          Icon={Command}
          title={t('settings.channel_siri_title', 'Siri & iOS Shortcuts / Home Widget')}
          blurb={t(
            'settings.channel_siri_blurb',
            'Add contacts from iOS Shortcuts, Home Screen widgets, Siri voice, or your own automations.',
          )}
          defaultOpen
        >
          <p className="text-[13px] text-on-surface-variant leading-relaxed">
            {t(
              'settings.channel_siri_body',
              'Say “Hey Siri, Quick Add…” or tap an iOS Home Screen Quick-Add widget to pass a raw voice note or text description directly into the tracker.',
            )}
          </p>
          <Steps
            items={[
              t(
                'settings.channel_siri_step1',
                'In the Apple Shortcuts app, create a new Shortcut named "Quick Add".',
              ),
              t(
                'settings.channel_siri_step2',
                'Add "Dictate Text" (for Siri voice) or "Ask for Input" (for Home Screen widget).',
              ),
              t(
                'settings.channel_siri_step3',
                'Add "Get Contents of URL" pointing to this POST endpoint with JSON body {"text": "<Input/Dictated Text>"}.',
              ),
              t(
                'settings.channel_siri_step4',
                'Add the shortcut to your iPhone Home Screen as a widget or trigger it hands-free with Siri.',
              ),
            ]}
          />
          <CodeBlock
            label={t('settings.curl_label', 'POST · curl request template')}
            code={curlCommand}
          />
        </ChannelCard>

        <ChannelCard
          Icon={Smartphone}
          title={t('settings.channel_sms_title', 'SMS & WhatsApp')}
          blurb={t(
            'settings.channel_sms_blurb',
            'Text a new contact straight in from a single Twilio number.',
          )}
        >
          <p className="text-[13px] text-on-surface-variant leading-relaxed">
            {t(
              'settings.channel_sms_body',
              "Point your Twilio number's inbound webhook here. Standard SMS and official WhatsApp messages both arrive at the same place.",
            )}
          </p>
          <CodeBlock
            label={t('settings.sms_webhook_label', 'Twilio inbound webhook URL')}
            code={smsWebhookUrl}
          />
          <Steps
            items={[
              t('settings.channel_sms_step1', 'In Twilio, choose your phone or sandbox number.'),
              t('settings.channel_sms_step2', 'Under the messaging webhook settings, paste this URL.'),
              t('settings.channel_sms_step3', 'Set the method to HTTP POST and save.'),
            ]}
          />
        </ChannelCard>

        <ChannelCard
          Icon={MessageSquare}
          title={t('settings.channel_groupme_title', 'GroupMe bot')}
          blurb={t(
            'settings.channel_groupme_blurb',
            'Let the whole group chat add contacts with a quick !add line.',
          )}
        >
          <p className="text-[13px] text-on-surface-variant leading-relaxed">
            {t(
              'settings.channel_groupme_body',
              'Everyone in the group can text new contacts using a trigger prefix. The bot reads the message, parses it, and files it for the team.',
            )}
          </p>
          <CodeBlock
            label={t('settings.groupme_webhook_label', 'GroupMe bot callback URL')}
            code={groupMeWebhookUrl}
          />
          <Steps
            items={[
              t('settings.channel_groupme_step1', 'Go to dev.groupme.com and open the Bots menu.'),
              t('settings.channel_groupme_step2', 'Click Create Bot and link your group chat.'),
              t('settings.channel_groupme_step3', 'Paste this callback URL and submit.'),
            ]}
          />

          <div className="pt-1">
            <div className="text-sm font-medium text-on-surface mb-1">
              {t('settings.prefix_triggers', 'Prefix triggers')}
            </div>
            <p className="text-[13px] text-on-surface-variant leading-relaxed mb-2">
              {t(
                'settings.prefix_triggers_body',
                'Start a message with any of these so the bot knows to parse it:',
              )}
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
            <div className="text-sm font-medium text-on-surface mb-1">
              {t('settings.parsing_options', 'Parsing options')}
            </div>
            <p className="text-[13px] text-on-surface-variant leading-relaxed mb-2">
              {t(
                'settings.parsing_options_body',
                'Add an optional keyword right after the prefix to steer the parser:',
              )}
            </p>

            <div className="space-y-3">
              <div className="rounded-lg border border-outline-variant/40 bg-surface-container-low p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <code className="font-code text-[11px] px-1.5 py-0.5 rounded bg-stage-accent-soft text-stage-accent">
                    contact
                  </code>
                  <span className="text-[12px] text-on-surface-variant italic">
                    {t('settings.parsing_default', 'default')}
                  </span>
                </div>
                <p className="text-[13px] text-on-surface leading-relaxed">
                  {t(
                    'settings.parsing_contact_body',
                    'Parses name, role, details and contact info, then creates a card or merges with an existing one.',
                  )}
                </p>
                <CodeBlock code="!add contact Jerry Doe is a sophomore majoring in history, phone 555-0192, met at cafeteria." />
              </div>

              <div className="rounded-lg border border-outline-variant/40 bg-surface-container-low p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <code className="font-code text-[11px] px-1.5 py-0.5 rounded bg-stage-teal-soft text-stage-teal">
                    interaction
                  </code>
                </div>
                <p className="text-[13px] text-on-surface leading-relaxed">
                  {t(
                    'settings.parsing_interaction_body',
                    'Logs a follow-up conversation or prayer update in the history of an existing contact.',
                  )}
                </p>
                <CodeBlock code="!add interaction Jerry Doe and I studied Romans today, shared about exams and prayed together." />
              </div>
            </div>
          </div>
        </ChannelCard>

        <AttdIntegrationCard appUrl={appUrl} currentUser={currentUser} />
      </div>
    </section>
  );
}

function AttdIntegrationCard({
  appUrl,
  currentUser,
}: {
  appUrl: string;
  currentUser: User | null;
}) {
  const { t } = useLanguage();
  const [syncToken, setSyncToken] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  // Replacing the token revokes the one already pasted into ~/attd, so the
  // control arms on the first tap and only writes on the second. Same
  // two-tap shape as a Gospel outing's Remove (Outreach.tsx).
  const [confirmingToken, setConfirmingToken] = useState(false);
  const confirmTokenRef = useRef<HTMLButtonElement>(null);

  const intakeUrl = `${appUrl}/api/attendance-sync`;

  useEffect(() => {
    if (confirmingToken) confirmTokenRef.current?.focus();
  }, [confirmingToken]);

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'settings', 'integrations'),
      (snapshot) => {
        const exists = typeof snapshot?.exists === 'function' ? snapshot.exists() : false;
        if (exists && typeof snapshot?.data === 'function') {
          const data = snapshot.data();
          setSyncToken((data?.attdSyncToken as string) || '');
        } else {
          setSyncToken('');
        }
        setLoading(false);
      },
      (err) => {
        console.error('Error reading integrations settings:', err);
        setLoading(false);
      },
    );
    return () => unsub();
  }, []);

  const handleGenerateToken = async () => {
    setIsGenerating(true);
    setSaveStatus(null);
    try {
      const generated = Array.from(crypto.getRandomValues(new Uint8Array(24)))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      await setDoc(
        doc(db, 'settings', 'integrations'),
        {
          attdSyncToken: generated,
          attdSyncUrl: intakeUrl,
          updatedAt: serverTimestamp(),
          updatedBy: currentUser?.email || 'admin',
        },
        { merge: true },
      );
      setSyncToken(generated);
      setShowToken(true);
      setSaveStatus(t('attendanceSync.attd_token_saved', 'Sync token updated successfully'));
    } catch (e: any) {
      console.error('Error saving sync token:', e);
      setSaveStatus(t('attendanceSync.attd_token_save_failed', 'Could not save sync token.'));
    } finally {
      setIsGenerating(false);
      setConfirmingToken(false);
    }
  };

  return (
    <ChannelCard
      Icon={Zap}
      title={t('attendanceSync.attd_integration_title', 'Attendance Tracker app (~/attd)')}
      blurb={t('attendanceSync.attd_integration_blurb', "Configure your team's secret sync token and intake endpoint for the attendance app.")}
      defaultOpen
    >
      <p className="text-[13px] text-on-surface-variant leading-relaxed">
        {t(
          'attendanceSync.attd_integration_desc',
          'Staff taking attendance in the room can stage their records directly into CISA without requiring a personal Firebase login.',
        )}
      </p>

      <CodeBlock label={t('attendanceSync.attd_endpoint_label', 'Intake endpoint URL')} code={intakeUrl} />

      <div className="rounded-lg border border-outline-variant/50 bg-surface-container-low p-3 space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span id="attd-token-label" className="text-[11px] text-on-surface-variant font-medium">
            {t('attendanceSync.attd_token_label', 'Sync Token (x-sync-token)')}
          </span>
          {confirmingToken ? (
            <span className="inline-flex items-center gap-1.5">
              <button
                ref={confirmTokenRef}
                type="button"
                onClick={handleGenerateToken}
                disabled={isGenerating}
                aria-describedby="attd-token-label"
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[14px] pointer-coarse:inline-flex pointer-coarse:items-center pointer-coarse:min-h-11 text-xs font-medium bg-error text-on-error hover:bg-error/90 transition-colors disabled:opacity-50"
              >
                {isGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                <span>{t('settings.security.confirm', 'Confirm')}</span>
              </button>
              <button
                type="button"
                onClick={() => setConfirmingToken(false)}
                className="inline-flex items-center px-2.5 py-1 rounded-[14px] pointer-coarse:inline-flex pointer-coarse:items-center pointer-coarse:min-h-11 text-xs font-medium text-on-surface-variant hover:bg-surface-container-high transition-colors"
              >
                {t('actions.cancel', 'Cancel')}
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingToken(true)}
              disabled={isGenerating}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[14px] pointer-coarse:inline-flex pointer-coarse:items-center pointer-coarse:min-h-11 text-xs font-medium bg-primary text-on-primary hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {isGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              <span>{t('attendanceSync.attd_generate_token', 'Generate new token')}</span>
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-xs text-on-surface-variant py-1">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>{t('attendanceSync.attd_loading_token', 'Loading token…')}</span>
          </div>
        ) : syncToken ? (
          <div className="relative">
            <pre className="font-code text-[11.5px] leading-relaxed text-on-surface-variant whitespace-pre-wrap break-words px-3 py-2 pr-20 bg-surface border border-outline-variant/40 rounded-md select-all">
              {showToken ? syncToken : '•'.repeat(Math.min(syncToken.length, 32))}
            </pre>
            <div className="absolute top-1.5 right-2 flex items-center gap-1">
              <button
                type="button"
                onClick={() => setShowToken((prev) => !prev)}
                className="relative p-1 rounded-md text-on-surface-variant hover:bg-surface-container-high transition-colors pointer-coarse:after:absolute pointer-coarse:after:inset-x-0 pointer-coarse:after:-inset-y-3 pointer-coarse:after:content-['']"
                title={
                  showToken
                    ? t('attendanceSync.attd_hide_token', 'Hide token')
                    : t('attendanceSync.attd_show_token', 'Show token')
                }
                aria-label={
                  showToken
                    ? t('attendanceSync.attd_hide_token', 'Hide token')
                    : t('attendanceSync.attd_show_token', 'Show token')
                }
              >
                {showToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(syncToken);
                  setSaveStatus(t('attendanceSync.attd_token_copied', 'Sync token copied to clipboard'));
                  setTimeout(() => setSaveStatus(null), 2500);
                }}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-[14px] pointer-coarse:min-h-11 text-xs text-on-surface-variant hover:bg-surface-container-high transition-colors"
                title={t('attendanceSync.attd_copy_token', 'Copy token')}
                aria-label={t('attendanceSync.attd_copy_token', 'Copy token')}
              >
                <Copy className="w-3.5 h-3.5" />
                <span>{t('actions.copy', 'Copy')}</span>
              </button>
            </div>
          </div>
        ) : (
          <p className="text-xs text-on-surface bg-warning/10 border border-warning/30 p-2.5 rounded-md">
            {t('attendanceSync.attd_no_token', 'No sync token configured yet. Generate one to enable sync from ~/attd.')}
          </p>
        )}

        {saveStatus && (
          <p className="text-xs text-success font-medium pt-1">
            {saveStatus}
          </p>
        )}
      </div>

      <Steps
        items={[
          t('attendanceSync.attd_step_1', 'Open Settings in the Attendance Tracker (~/attd) app.'),
          t('attendanceSync.attd_step_2', 'Navigate to CISA Campus Tracker under Additional Settings.'),
          t('attendanceSync.attd_step_3', 'Paste this Intake URL and Sync Token, then sync any session.'),
        ]}
      />
    </ChannelCard>
  );
}

// ── API & webhook console (dev) ────────────────────────────────────────

function WebhookConsoleSection() {
  const { t } = useLanguage();
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
    if (!confirm(t('settings.webhook_clear_confirm', 'Clear all webhook debugging logs?'))) return;
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
          <h2 className="font-serif text-2xl text-on-surface">
            {t('settings.webhook_title', 'API & webhook console')}
          </h2>
          <p className="text-sm text-on-surface-variant mt-1 max-w-2xl leading-relaxed">
            {t(
              'settings.webhook_sub',
              "A developer's view of every contact arriving by API, SMS, WhatsApp, or GroupMe — with the raw payloads.",
            )}
          </p>
        </div>
        {logs.length > 0 && (
          <button
            onClick={handleClearLogs}
            disabled={isClearing}
            className="shrink-0 px-3 py-1.5 text-xs text-error hover:bg-error/10 font-medium rounded-[14px] pointer-coarse:min-h-11 transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" />
            {t('settings.webhook_clear', 'Clear')}
          </button>
        )}
      </div>

      <div className="rounded-xl border border-outline-variant/40 bg-surface-container p-5 space-y-3 max-w-2xl">
        {loadingLogs ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-on-surface-variant">
            <Loader2 className="w-7 h-7 animate-spin text-accent" />
            <p className="text-xs">{t('settings.webhook_listening', 'Listening for incoming requests…')}</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="py-12 text-center">
            <Sparkles className="w-7 h-7 text-on-surface-variant/40 mx-auto mb-2" />
            <p className="text-sm font-medium text-on-surface-variant">
              {t('settings.webhook_empty_title', 'No activity yet')}
            </p>
            <p className="text-xs text-on-surface-variant mt-1">
              {t(
                'settings.webhook_empty_body',
                'Send a message to your GroupMe bot or try Quick Add to see webhooks here.',
              )}
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
                    'rounded-lg border bg-surface-container-low transition-colors overflow-hidden',
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
                            <div className="p-3 bg-error/10 border border-error/20 rounded-md text-error text-xs">
                              <span className="font-medium block mb-1">
                                {t('settings.webhook_failure_detail', 'Failure detail')}
                              </span>
                              {log.error}
                            </div>
                          )}
                          <div>
                            <span className="text-[11px]   text-on-surface-variant block mb-1">
                              {t('settings.webhook_raw_payload', 'Raw payload (POST body)')}
                            </span>
                            <pre className="bg-surface border border-outline-variant/40 p-3 rounded-md overflow-x-auto font-code text-[11px] text-on-surface-variant whitespace-pre-wrap select-all">
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
                              {t('settings.webhook_headers', 'Request headers')}
                            </span>
                            <pre className="bg-surface border border-outline-variant/40 p-3 rounded-md overflow-x-auto font-code text-[11px] text-on-surface-variant whitespace-pre-wrap select-all">
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

function DangerZoneSection({ onOpenPurgeModal }: { onOpenPurgeModal: () => void }) {
  const { t } = useLanguage();
  return (
    <section className="mt-10">
      <SectionHeader
        title={t('settings.danger_zone', 'Data management & danger zone')}
        sub={t('settings.danger_zone_sub', 'Administrative tools for cleaning up database traces and test records.')}
      />
      <div className="rounded-xl border border-error/25 bg-surface-container p-5 max-w-2xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 className="font-serif text-base text-on-surface flex items-center gap-2">
              <Trash2 className="w-4 h-4 text-error" />
              {t('settings.test_account_purge', 'Test Account Purge')}
            </h3>
            <p className="text-[13px] text-on-surface-variant leading-relaxed">
              {t(
                'settings.test_account_purge_desc',
                'Scans and scrubs non-person test accounts (reviewer* and cisa* emails) and their interaction logs, invitations, and prayers across Firestore.',
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenPurgeModal}
            className="shrink-0 px-4 py-2.5 rounded-[14px] pointer-coarse:min-h-11 border border-error/40 text-error hover:bg-error/10 text-xs font-medium transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            {t('settings.scan_and_purge', 'Scan & Purge…')}
          </button>
        </div>
      </div>
    </section>
  );
}

// ── Team management pieces ─────────────────────────────────────────────

function MemberCard({
  user,
  isYou,
  canEdit,
  canRemove,
  onEdit,
  onRemove,
}: {
  user: AppUser;
  isYou: boolean;
  canEdit: boolean;
  canRemove: boolean;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const { t } = useLanguage();
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

  const hasMenu = canEdit || canRemove;

  return (
    <div
      className={cn(
        'flex items-center gap-3 p-3.5 rounded-xl border transition-colors',
        isYou ? 'border-primary/30 bg-primary/5' : 'bg-surface-container border-outline-variant/40',
      )}
    >
      <Avatar name={user.displayName || user.email} photoURL={user.photoURL} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-on-surface truncate">{user.displayName || t('settings.unnamed', 'Unnamed')}</span>
          {isYou && (
            <span className="text-[10px] text-accent border border-accent-line bg-surface rounded-full px-1.5 py-0.5 leading-none shrink-0">
              {t('common.you', 'You')}
            </span>
          )}
        </div>
        <div className="text-[13px] text-on-surface-variant truncate">
          {roleLabel(t, user.role)} · {user.email}
        </div>
      </div>

      {hasMenu && (
        <div className="relative shrink-0" ref={ref}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="p-2 rounded-full pointer-coarse:inline-flex pointer-coarse:items-center pointer-coarse:justify-center pointer-coarse:w-11 pointer-coarse:h-11 hover:bg-surface-container-high text-on-surface-variant transition-colors"
            aria-label={t('settings.member_options', 'Member options')}
            aria-expanded={menuOpen}
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 z-20 w-44 rounded-lg border border-outline-variant/60 bg-surface shadow-lg py-1">
              {canEdit && (
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onEdit();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-on-surface hover:bg-surface-container-high text-left pointer-coarse:min-h-11 pointer-coarse:flex pointer-coarse:items-center"
                >
                  <Pencil className="w-3.5 h-3.5" /> {t('settings.edit_member', 'Edit member')}
                </button>
              )}
              {canRemove && (
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onRemove();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-error hover:bg-error/10 text-left pointer-coarse:min-h-11 pointer-coarse:flex pointer-coarse:items-center"
                >
                  <Trash2 className="w-3.5 h-3.5" /> {t('settings.remove_access', 'Remove access')}
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
  const { t } = useLanguage();
  return (
    <div className="flex items-center gap-3 p-3.5 rounded-xl border border-outline-variant/60 bg-surface-container-low">
      <div className="w-10 h-10 rounded-full bg-stage-accent-soft text-stage-accent flex items-center justify-center shrink-0">
        <Mail className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-on-surface truncate">{invite.email}</span>
          <span className="text-[10px] text-on-surface-variant border border-outline-variant/50 rounded-full px-1.5 py-0.5 leading-none shrink-0">
            {t('settings.invite_sent', 'invite sent')}
          </span>
        </div>
        <div className="text-[13px] text-on-surface-variant">
          {roleLabel(t, invite.role)} · {t('settings.waiting_to_sign_up', 'waiting to sign up')}
        </div>
      </div>
      <button
        onClick={onCancel}
        className="p-2 rounded-full pointer-coarse:inline-flex pointer-coarse:items-center pointer-coarse:justify-center pointer-coarse:w-11 pointer-coarse:h-11 text-on-surface-variant hover:text-error hover:bg-error/10 transition-colors shrink-0"
        title={t('settings.cancel_invite', 'Cancel invite')}
        aria-label={t('settings.cancel_invite', 'Cancel invite')}
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}

function EditMemberModal({
  user,
  isAdmin,
  onClose,
  onSave,
}: {
  user: AppUser;
  isAdmin: boolean;
  onClose: () => void;
  onSave: (uid: string, updates: { displayName: string; role: AppRole }) => void;
}) {
  const [displayName, setDisplayName] = useState(user.displayName || '');
  const [role, setRole] = useState<AppRole>(user.role || 'viewer');
  const { t } = useLanguage();
  // RBAC: only an admin can grant the Full-timer (admin) role.
  const options = ROLE_OPTIONS.filter((o) => isAdmin || o.value !== 'admin');

  const trimmedName = displayName.trim();
  const canSave = trimmedName.length > 0 && trimmedName.length <= 128;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    onSave(user.uid, { displayName: trimmedName, role });
  };

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
        className="relative w-full max-w-sm bg-surface-container rounded-xl border border-outline-variant/50 p-6 shadow-2xl"
      >
        <h3 className="font-serif text-xl text-on-surface mb-4">{t('settings.edit_member', 'Edit member')}</h3>
        <div className="flex items-center gap-3 mb-5">
          <Avatar name={user.displayName || user.email} photoURL={user.photoURL} />
          <div className="min-w-0">
            <div className="font-medium text-on-surface truncate">{user.displayName || t('settings.unnamed', 'Unnamed')}</div>
            <div className="text-[13px] text-on-surface-variant truncate">{user.email}</div>
          </div>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="edit-member-name" className="text-sm text-on-surface-variant block mb-1.5">
              {t('settings.display_name', 'Display name')}
            </label>
            <input
              id="edit-member-name"
              type="text"
              value={displayName}
              maxLength={128}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={t('settings.display_name_example', 'e.g. Jane Doe')}
              className="w-full px-4 py-3 bg-surface rounded-sm border border-outline-variant focus:border-primary outline-none transition-colors text-sm text-on-surface"
              autoFocus
            />
          </div>
          <div className="mb-6">
            <label htmlFor="edit-member-role" className="text-sm text-on-surface-variant block mb-1.5">
              {t('settings.role', 'Role')}
            </label>
            <Select
              id="edit-member-role"
              value={role}
              onChange={(e) => setRole(e.target.value as AppRole)}
              className="w-full px-4 py-3 bg-surface rounded-sm border border-outline-variant focus:border-primary outline-none transition-colors text-sm text-on-surface cursor-pointer"
            >
              {options.map((o) => (
                <option key={o.value} value={o.value}>
                  {roleLabel(t, o.value)}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-[14px] bg-surface-container-high text-on-surface-variant font-medium hover:bg-surface-variant transition-colors"
            >
              {t('actions.cancel', 'Cancel')}
            </button>
            <button
              type="submit"
              disabled={!canSave}
              className="flex-1 py-3 rounded-[14px] bg-primary text-on-primary font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {t('actions.save', 'Save')}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

function EditSelfNameModal({
  currentName,
  onClose,
  onSave,
}: {
  currentName: string;
  onClose: () => void;
  onSave: (newName: string) => void;
}) {
  const [name, setName] = useState(currentName);
  const { t } = useLanguage();
  const trimmedName = name.trim();
  const canSave = trimmedName.length > 0 && trimmedName.length <= 128;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    onSave(trimmedName);
  };

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
        className="relative w-full max-w-sm bg-surface-container rounded-xl border border-outline-variant/50 p-6 shadow-2xl"
      >
        <h3 className="font-serif text-xl text-on-surface mb-4">{t('settings.edit_your_name', 'Edit your name')}</h3>
        <form onSubmit={handleSubmit}>
          <div className="mb-6">
            <label htmlFor="edit-self-name" className="text-sm text-on-surface-variant block mb-1.5">
              {t('settings.display_name', 'Display name')}
            </label>
            <input
              id="edit-self-name"
              type="text"
              value={name}
              maxLength={128}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('settings.your_name', 'Your name')}
              className="w-full px-4 py-3 bg-surface rounded-sm border border-outline-variant focus:border-primary outline-none transition-colors text-sm text-on-surface"
              autoFocus
            />
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-[14px] bg-surface-container-high text-on-surface-variant font-medium hover:bg-surface-variant transition-colors"
            >
              {t('actions.cancel', 'Cancel')}
            </button>
            <button
              type="submit"
              disabled={!canSave}
              className="flex-1 py-3 rounded-[14px] bg-primary text-on-primary font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {t('actions.save', 'Save')}
            </button>
          </div>
        </form>
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
  const { t } = useLanguage();
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
        className="relative w-full max-w-sm bg-surface-container rounded-xl border border-outline-variant/50 p-6 shadow-2xl"
      >
        <h3 className="font-serif text-xl text-on-surface mb-3">{t('settings.remove_access_title', 'Remove access?')}</h3>
        <div className="flex items-center gap-3 mb-4">
          <Avatar name={user.displayName || user.email} photoURL={user.photoURL} />
          <div className="min-w-0">
            <div className="font-medium text-on-surface truncate">{user.displayName || t('settings.unnamed', 'Unnamed')}</div>
            <div className="text-[13px] text-on-surface-variant truncate">{roleLabel(t, user.role)}</div>
          </div>
        </div>
        <p className="text-sm text-on-surface-variant leading-relaxed mb-6">
          {t(
            'settings.remove_access_body',
            '{name} will lose access to CISA. Their contacts, notes, and history stay with the work — you can approve them again anytime.',
          ).replace('{name}', firstName)}
        </p>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-[14px] bg-surface-container-high text-on-surface-variant font-medium hover:bg-surface-variant transition-colors"
          >
            {t('actions.cancel', 'Cancel')}
          </button>
          <button
            onClick={() => onConfirm(user.uid)}
            className="flex-1 py-3 rounded-[14px] bg-error text-on-error font-medium hover:bg-error/90 transition-colors"
          >
            {t('actions.remove', 'Remove')}
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
  const { t } = useLanguage();
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
        className="relative w-full max-w-sm bg-surface-container rounded-xl border border-outline-variant/50 p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between mb-5">
          <div>
            <h3 className="font-serif text-xl text-on-surface">{t('settings.add_by_email_title', 'Add someone by email')}</h3>
            <p className="text-[13px] text-on-surface-variant mt-0.5">
              {t('settings.add_by_email_body', "Pre-add an email and they're matched automatically when they sign up.")}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full pointer-coarse:inline-flex pointer-coarse:items-center pointer-coarse:justify-center pointer-coarse:w-11 pointer-coarse:h-11 hover:bg-surface-container-high text-on-surface-variant transition-colors shrink-0"
            aria-label={t('actions.close', 'Close')}
          >
            <XCircle className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="text-sm text-on-surface-variant block mb-1.5">{t('settings.email', 'Email')}</label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
              <input
                type="email"
                required
                placeholder={t('settings.email_placeholder', 'their@email.com')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
                className="w-full pl-10 pr-4 py-3 bg-surface rounded-sm border border-outline-variant focus:border-primary outline-none transition-colors text-sm text-on-surface"
              />
            </div>
          </div>

          <div>
            <label htmlFor="pre-add-role-select" className="text-sm text-on-surface-variant block mb-1.5">
              {t('settings.role', 'Role')}
            </label>
            <Select
              id="pre-add-role-select"
              value={role}
              onChange={(e) => setRole(e.target.value as AppRole)}
              className="w-full pl-4 pr-10 py-3 bg-surface rounded-sm border border-outline-variant focus:border-primary outline-none transition-colors text-sm text-on-surface cursor-pointer"
            >
              {options.map((o) => (
                <option key={o.value} value={o.value}>
                  {roleLabel(t, o.value)}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-[14px] bg-surface-container-high text-on-surface-variant font-medium hover:bg-surface-variant transition-colors"
            >
              {t('actions.cancel', 'Cancel')}
            </button>
            <button
              type="submit"
              disabled={isInviting || !email}
              className="flex-[1.4] py-3 rounded-[14px] bg-primary text-on-primary font-medium flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {isInviting ? (
                <span className="animate-pulse">{t('settings.adding', 'Adding…')}</span>
              ) : (
                <>
                  <UserPlus className="w-4 h-4" /> {t('settings.pre_add', 'Pre-add')}
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
  const { isEnabled, setEnabled, getItemsBetween } = useCalendarSync();

  const counts = useMemo(() => {
    const from = calStartOfDay(new Date());
    const to = calAddDays(from, 30);
    const { context } = getItemsBetween(from, to);
    const out: Record<string, number> = {};
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
      <div className="cals rounded-xl border border-outline-variant/40 bg-surface-container p-5">
        <label className="cals-toggle flex items-center gap-3 cursor-pointer select-none pointer-coarse:min-h-11">
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

        {/* The category→kind mapping (and any per-category selector) is gone with
            the kind taxonomy (ADR 0016 decision 4) — every non-travel category now
            reads as plain "context", never becomes a Gathering. */}
        {isEnabled && (
          <div className="cals-rows mt-4 divide-y divide-outline-variant/30">
            {CAL_CATEGORIES.map((cat) => (
              <div className="cals-row py-3 flex items-center justify-between gap-2" key={cat.id}>
                <div className="cals-cat-n font-medium text-sm text-on-surface flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: cat.dot }} />
                  {cat.label}
                </div>
                <div className="cals-cat-c text-xs text-on-surface-variant">
                  {counts[cat.id]
                    ? t('settings.calendar_upcoming_count', '{n} in the next month').replace(
                        '{n}',
                        String(counts[cat.id]),
                      )
                    : t('settings.calendar_nothing_coming_up', 'nothing coming up')}
                </div>
              </div>
            ))}
          </div>
        )}

        {isEnabled && (
          <p className="cals-note cals-foot text-xs text-on-surface-variant mt-3 italic">
            {t('settings.shared_calendar_footnote', 'Nothing on the shared calendar becomes a gathering — it shows up under "Also on the calendar" as a date worth knowing. Travel is read as who\'s away, and named on your day.')}
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

const pairNames = (
  ids: string[],
  byId: Record<string, AppUser>,
  t: (key: string, fallback?: string) => string,
): string => {
  const names = ids.map((id) => byId[id]?.displayName || t('settings.unnamed', 'Unnamed'));
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
  const { t } = useLanguage();
  return (
    <div className="mt-3 flex flex-col gap-1 rounded-lg border border-outline-variant/40 bg-surface-container-high p-2">
      {people.length ? (
        people.map((s) => (
          <button
            key={s.uid}
            type="button"
            onClick={() => onPick(s.uid)}
            className="flex items-center gap-2.5 rounded-[14px] px-2 py-1.5 text-left text-sm text-on-surface hover:bg-surface transition-colors cursor-pointer"
          >
            <Avatar name={s.displayName} photoURL={s.photoURL} size="sm" />
            <span className="truncate">{s.displayName || t('settings.unnamed', 'Unnamed')}</span>
          </button>
        ))
      ) : (
        <span className="text-[13px] text-on-surface-variant px-2 py-1.5">{empty}</span>
      )}
      <button
        type="button"
        onClick={onCancel}
        className="self-start rounded-[14px] pointer-coarse:inline-flex pointer-coarse:items-center pointer-coarse:min-h-11 px-2 py-1 text-[13px] font-medium text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
      >
        {cancelLabel}
      </button>
    </div>
  );
}

function PartnersSection({ users }: { users: AppUser[] }) {
  const { t } = useLanguage();
  const [pairings, setPairings] = useState<PartnerPairing[]>([]);
  const [picking, setPicking] = useState<'new' | null>(null);
  const [first, setFirst] = useState<string | null>(null);
  const [startDate, setStartDate] = useState(dayKey());
  const [endingId, setEndingId] = useState<string | null>(null);
  const [endDate, setEndDate] = useState(dayKey());

  useEffect(() => subscribePartners(setPairings), []);

  const term = partnersTermKey();
  const trainees = useMemo(() => users.filter((u) => u.role === 'manager' && isRealPerson(u)), [users]);
  const byId = useMemo(() => {
    const m: Record<string, AppUser> = {};
    for (const u of users) m[u.uid] = u;
    return m;
  }, [users]);
  const byTerm = useMemo(() => pairingsByTerm(pairings), [pairings]);
  const current = useMemo(() => byTerm[term] ?? [], [byTerm, term]);
  const history = useMemo(
    () => Object.entries(byTerm).filter(([k, arr]) => k !== term && arr.length > 0),
    [byTerm, term],
  );
  const openMembers = useMemo(() => new Set(current.filter((p) => !p.endDate).flatMap((p) => p.members)), [current]);
  const free = useMemo(() => trainees.filter((tr) => !openMembers.has(tr.uid)), [trainees, openMembers]);

  const commit = (next: PartnerPairing[]) => {
    setPairings(next);
    void savePartners(next);
  };

  const closePicking = () => {
    setPicking(null);
    setFirst(null);
  };

  const pickSecond = (uid: string) => {
    const members = [first!, uid];
    const already = current.some((p) => !p.endDate && members.every((m) => p.members.includes(m)));
    if (already) {
      closePicking();
      return;
    }
    const next = rePair(pairings, members, startDate);
    if (next.length === pairings.length) {
      alert(t('settings.pairs_overlap', "That overlaps a pairing that's already ended or already covers that date."));
    } else {
      commit(next);
    }
    closePicking();
  };

  const newPair = first ? (
    <div className="rounded-xl border border-outline-variant/40 bg-surface-container p-5">
      <div className="font-serif text-base text-on-surface mb-1">
        {t('settings.pairs_who_with', 'Who goes out with {name}?').replace('{name}', byId[first]?.displayName || t('settings.unnamed', 'Unnamed'))}
      </div>
      <CarePick
        people={trainees.filter((s) => s.uid !== first)}
        empty={t('settings.pairs_nobody_free', 'Every trainee is already partnered this term.')}
        cancelLabel={t('settings.pairs_never_mind', 'Never mind')}
        onPick={pickSecond}
        onCancel={closePicking}
      />
    </div>
  ) : (
    <div className="rounded-xl border border-outline-variant/40 bg-surface-container p-5">
      <label className="block mb-3">
        <span className="text-[13px] font-medium text-on-surface-variant">{t('settings.pairs_start_date', 'Started on')}</span>
        <input
          type="date"
          value={startDate}
          max={dayKey()}
          onChange={(e) => setStartDate(e.target.value || dayKey())}
          className="mt-1 w-full rounded-sm border border-outline-variant/40 bg-surface px-3 py-2 text-sm text-on-surface pointer-coarse:min-h-11"
        />
      </label>
      <div className="font-serif text-base text-on-surface mb-1">
        {t('settings.pairs_first_of_two', "Who's the first of the two?")}
      </div>
      <CarePick
        people={trainees}
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
          "The trainees who go out as one, kept as dated stretches of time. Set who's paired and when it began or ended — the earlier arrangements stay readable.",
        )}
      />
      <div className="flex flex-col gap-3 max-w-2xl">
        {current.map((p) => {
          const people = p.members.map((id) => byId[id]).filter(Boolean);
          const open = !p.endDate;
          return (
            <div key={p.id} className="rounded-xl border border-outline-variant/40 bg-surface-container p-5">
              <div className="flex items-start gap-3">
                <div className="flex -space-x-2">
                  {people.slice(0, 3).map((person) => (
                    <Avatar key={person.uid} name={person.displayName} photoURL={person.photoURL} size="md" />
                  ))}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-serif text-base text-on-surface leading-tight truncate">{pairNames(p.members, byId, t)}</div>
                  <div className="text-[13px] text-on-surface-variant mt-0.5">
                    {open
                      ? t('settings.pairs_since', 'Since {date}').replace('{date}', p.startDate)
                      : t('settings.pairs_range', '{start} to {end}')
                          .replace('{start}', p.startDate)
                          .replace('{end}', p.endDate || '')}
                  </div>
                </div>
                {open && (
                  <button
                    type="button"
                    onClick={() => {
                      setEndingId(p.id);
                      setEndDate(dayKey());
                    }}
                    className="shrink-0 rounded-full pointer-coarse:inline-flex pointer-coarse:items-center pointer-coarse:min-h-11 px-3 py-1.5 text-[12px] font-medium text-on-surface-variant hover:text-on-surface hover:bg-surface transition-colors cursor-pointer"
                  >
                    {t('settings.pairs_end', 'End')}
                  </button>
                )}
              </div>

              {p.id === endingId && (
                <div className="mt-3 flex items-end gap-2">
                  <label className="flex-1">
                    <span className="text-[12px] text-on-surface-variant">{t('settings.pairs_ended_on', 'Ended on')}</span>
                    <input
                      type="date"
                      value={endDate}
                      min={p.startDate}
                      onChange={(e) => setEndDate(e.target.value || dayKey())}
                      className="mt-1 w-full rounded-sm border border-outline-variant/40 bg-surface px-3 py-2 text-sm text-on-surface pointer-coarse:min-h-11"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      commit(endPairing(pairings, p.id, endDate));
                      setEndingId(null);
                    }}
                    className="shrink-0 rounded-[14px] pointer-coarse:inline-flex pointer-coarse:items-center pointer-coarse:min-h-11 px-3 py-2 text-[13px] font-medium text-on-surface hover:bg-surface transition-colors cursor-pointer"
                  >
                    {t('settings.pairs_confirm_end', 'End pairing')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEndingId(null)}
                    className="shrink-0 rounded-[14px] pointer-coarse:inline-flex pointer-coarse:items-center pointer-coarse:min-h-11 px-3 py-2 text-[13px] font-medium text-on-surface-variant hover:bg-surface transition-colors cursor-pointer"
                  >
                    {t('settings.pairs_never_mind', 'Never mind')}
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {picking === 'new' ? (
          newPair
        ) : (
          <button
            type="button"
            onClick={() => {
              setPicking('new');
              setStartDate(dayKey());
            }}
            className="inline-flex items-center gap-2 self-start rounded-[14px] border border-outline-variant/40 bg-surface-container px-4 py-3 text-sm font-medium text-on-surface hover:bg-surface transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" /> {t('settings.pairs_two_together', 'Two trainees going out together')}
          </button>
        )}

        {!!free.length && (
          <p className="text-[13px] text-on-surface-variant leading-relaxed">
            {t(
              'settings.pairs_loose',
              'Going out on their own this term: {names}. Anyone they bring in stays theirs alone.',
            ).replace('{names}', pairNames(free.map((f) => f.uid), byId, t))}
          </p>
        )}

        {history.length > 0 && (
          <div className="rounded-xl border border-outline-variant/40 bg-surface-container-low p-5">
            <div className="font-serif text-base text-on-surface mb-3">{t('settings.pairs_history', 'Earlier arrangements')}</div>
            {history.map(([k, arr]) => (
              <div key={k} className="mb-3 last:mb-0">
                <div className="text-[13px] font-medium text-on-surface-variant">{k}</div>
                <ul className="mt-1 flex flex-col gap-1">
                  {arr.map((p) => (
                    <li key={p.id} className="text-[13px] text-on-surface-variant">
                      {pairNames(p.members, byId, t)}{' '}
                      {p.endDate
                        ? t('settings.pairs_range_short', '{start}–{end}').replace('{start}', p.startDate).replace('{end}', p.endDate)
                        : t('settings.pairs_from', 'from {start}').replace('{start}', p.startDate)}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

// ── Which team they're on (#727) ───────────────────────────────────────────
// The division above the pairs: six trainees on YP, six on Campus, numbers
// vary by term. A second reading of the same roster the pairs above arrange —
// who goes out with whom, and which team they're on — with neither derived
// from the other. The feed's filter reads the PERSON's team, never the pair's,
// so a pair that straddles two teams simply shows up under both chips.

function TeamsSection({ users }: { users: AppUser[] }) {
  const { t } = useLanguage();
  const trainees = useMemo(
    () => users.filter((u) => u.role === 'manager' && isRealPerson(u)),
    [users],
  );
  const onTeam = (id: string) => trainees.filter((u) => u.team === id);
  const unassigned = trainees.filter((u) => !isKnownTeam(u.team));

  const row = (u: AppUser) => (
    <div key={u.uid} className="flex items-center gap-2.5">
      <Avatar name={u.displayName} photoURL={u.photoURL} size="sm" />
      <span className="text-sm text-on-surface truncate">{u.displayName || t('settings.unnamed', 'Unnamed')}</span>
      <div
        role="group"
        aria-label={t('teams.set_team', 'Put {name} on a team').replace('{name}', u.displayName || '')}
        className="ml-auto inline-flex shrink-0 gap-1 rounded-full border border-outline-variant/40 bg-surface-container-low p-1"
      >
        {TEAMS.map((tm) => {
          const on = u.team === tm.id;
          return (
            <button
              key={tm.id}
              type="button"
              aria-pressed={on}
              onClick={() => void saveUserTeam(u.uid, on ? null : tm.id)}
              className={cn(
                'rounded-full px-2.5 py-1 text-[12px] transition-colors cursor-pointer pointer-coarse:inline-flex pointer-coarse:items-center pointer-coarse:min-h-11',
                on ? 'bg-background text-on-surface font-medium' : 'text-on-surface-variant hover:text-on-surface',
              )}
            >
              {t(teamLabelKey(tm.id), tm.label)}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <section className="mt-10">
      <SectionHeader
        title={t('teams.title', "Which team they're on")}
        sub={t('teams.sub', 'One team each, for the whole roster. This is what the filters on the news read.')}
      />
      <div className="flex flex-col gap-3 max-w-2xl">
        <div className="flex flex-wrap gap-2">
          {TEAMS.map((tm) => (
            <span
              key={tm.id}
              className="rounded-full border border-outline-variant/40 px-3 py-1.5 text-[12px] text-on-surface-variant"
            >
              {t('teams.on_team', '{n} on {team}')
                .replace('{n}', String(onTeam(tm.id).length))
                .replace('{team}', t(teamLabelKey(tm.id), tm.label))}
            </span>
          ))}
          <span className="rounded-full border border-outline-variant/40 px-3 py-1.5 text-[12px] text-on-surface-variant">
            {t('teams.numbers_vary', 'Numbers vary by term')}
          </span>
        </div>

        {TEAMS.map((tm) => (
          <div key={tm.id} className="rounded-xl border border-outline-variant/40 bg-surface-container p-5">
            <div className="font-serif text-base text-on-surface mb-3">{t(teamLabelKey(tm.id), tm.label)}</div>
            <div className="flex flex-col gap-1.5">
              {onTeam(tm.id).length ? (
                onTeam(tm.id).map(row)
              ) : (
                <span className="text-[13px] text-on-surface-variant">
                  {t('teams.nobody_yet', 'Nobody on this team yet.')}
                </span>
              )}
            </div>
          </div>
        ))}

        {!!unassigned.length && (
          <div className="rounded-xl border border-outline-variant/40 bg-surface-container-low p-5">
            <div className="font-serif text-base text-on-surface">{t('teams.unassigned', 'Not on a team yet')}</div>
            <p className="text-[13px] text-on-surface-variant mt-0.5 mb-3 leading-relaxed">
              {t(
                'teams.unassigned_sub',
                "They get no weekly reminder, and the team chips just don't reach them.",
              )}
            </p>
            <div className="flex flex-col gap-1.5">{unassigned.map(row)}</div>
          </div>
        )}
      </div>
    </section>
  );
}

// ── Main ───────────────────────────────────────────────────────────────
function GettingStartedSection() {
  const { t } = useLanguage();
  const { user: currentUser, role, effectiveUserId } = useAuth();
  const [restored, setRestored] = useState(false);
 
  const handleRestore = () => {
    FirstRunStore.bringBack(firstRunKey(role, effectiveUserId || currentUser?.uid));
    setRestored(true);
  };

  return (
    <section className="mt-10">
      <SectionHeader
        title={t('settings.getting_started', 'Getting started')}
        sub={t('settings.getting_started_sub', 'Bring back the first-week checklist if you put it away.')}
      />
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleRestore}
          className="px-4 py-2 text-sm font-medium text-accent border border-outline-variant hover:bg-accent-soft/60 rounded-full pointer-coarse:inline-flex pointer-coarse:items-center pointer-coarse:min-h-11 transition-colors"
        >
          {t('settings.show_checklist', 'Show getting started checklist')}
        </button>
        {restored && (
          <p role="status" className="text-sm text-on-surface-variant">
            {t('settings.checklist_restored', 'The getting-started checklist is back on your home screen.')}
          </p>
        )}
      </div>
    </section>
  );
}


/**
 * The phone's sticky section rail (#1816). Settings for a Full-timer is 14
 * screens of one column, so a chip row that sticks under the top bar is the
 * cheapest way to reach any section. It is navigation — a row of buttons, not
 * a tab set — and it only exists below `lg`, where the page is a single scroller.
 *
 * The jump is instant (`scrollIntoView` with no `behavior`) and lands the
 * section on its `scroll-mt` so the heading clears the rail. Focus follows to
 * the heading, so a keyboard or screen-reader reader arrives with the new
 * section announced rather than dropped somewhere unlabelled.
 */
function SettingsSectionRail({
  sections,
}: {
  sections: { id: string; label: string }[];
}) {
  const { t } = useLanguage();
  const railRef = useRef<HTMLElement | null>(null);
  const chipRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [activeId, setActiveId] = useState(sections[0]?.id ?? '');
  const sectionIds = sections.map((section) => section.id).join('|');

  // The page's own scroller is <main>; walking up finds it in the shell and
  // falls back to the window where a route is rendered on its own.
  const scrollHost = (from: HTMLElement | null): HTMLElement | Window => {
    let node = from?.parentElement ?? null;
    while (node) {
      if (/(auto|scroll|overlay)/.test(window.getComputedStyle(node).overflowY)) return node;
      node = node.parentElement;
    }
    return window;
  };

  const currentId = sections.some((section) => section.id === activeId)
    ? activeId
    : (sections[0]?.id ?? '');

  // Keep the current chip on the section whose top has passed under the rail.
  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const ids = sectionIds ? sectionIds.split('|') : [];

    const sync = () => {
      const threshold = rail.getBoundingClientRect().bottom + 12;
      let current = ids[0] ?? '';
      for (const id of ids) {
        const target = document.getElementById(id);
        if (target && target.getBoundingClientRect().top <= threshold) current = id;
      }
      setActiveId(current);
    };

    const host = scrollHost(rail);
    sync();
    host.addEventListener('scroll', sync, { passive: true });
    return () => host.removeEventListener('scroll', sync);
  }, [sectionIds]);

  const jumpTo = (id: string) => {
    const target = document.getElementById(id);
    if (!target) return;
    const heading = target.querySelector('h2') as HTMLElement | null;
    if (heading) {
      // A programmatic focus target only — never a stop in the tab order.
      heading.setAttribute('tabindex', '-1');
      heading.focus({ preventScroll: true });
    }
    target.scrollIntoView({ block: 'start' });
    setActiveId(id);
    // Bring the current chip into the rail's visible width, horizontally only.
    chipRefs.current[id]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };

  return (
    <nav
      ref={railRef}
      aria-label={t('reader.index', 'Section index')}
      data-testid="settings-section-rail"
      className="sticky top-0 z-20 -mx-4 sm:-mx-6 flex gap-2 overflow-x-auto max-w-full px-4 sm:px-6 py-2 bg-background border-b border-outline-variant/40 no-scrollbar lg:hidden"
    >
      {sections.map((section) => {
        const current = section.id === currentId;
        return (
          <button
            key={section.id}
            type="button"
            ref={(el) => {
              chipRefs.current[section.id] = el;
            }}
            aria-current={current ? 'location' : undefined}
            onClick={() => jumpTo(section.id)}
            className={cn(
              'inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-full border px-4 text-[14px] font-semibold transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-surface focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              current
                ? 'border-on-surface bg-on-surface text-background'
                : 'border-outline-variant/50 bg-surface text-on-surface-variant hover:bg-surface-variant/55',
            )}
          >
            {section.label}
          </button>
        );
      })}
    </nav>
  );
}

export default function Settings() {
  const { user: currentUser, isAdmin, isManager, role, isApproved } = useAuth();
  const isDev = currentUser?.email?.toLowerCase() === OWNER_EMAIL || isAdmin;
  const isOwner = currentUser?.email?.toLowerCase() === OWNER_EMAIL;
  const { theme, setTheme } = useTheme();
  const { t } = useLanguage();

  const [users, setUsers] = useState<AppUser[]>([]);
  const myWeeklyOff = !!users.find((u) => u.uid === currentUser?.uid)?.weeklyRemindersOff;
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [teamError, setTeamError] = useState(false);
  const [teamReloadKey, setTeamReloadKey] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<AppRole>('operator');
  const [isInviting, setIsInviting] = useState(false);

  const [editTarget, setEditTarget] = useState<AppUser | null>(null);
  const [removeTarget, setRemoveTarget] = useState<AppUser | null>(null);
  const [showPurgeModal, setShowPurgeModal] = useState(false);
  const [whatsNewOpen, setWhatsNewOpen] = useState(false);
  const { videoUrl: currentVideoUrl, videoRoles: currentVideoRoles } = useWhatsNewSettings();

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
        setTeamError(false);
        timer = setTimeout(() => setLoading(false), 600);
      },
      (error) => {
        console.error('Error fetching users:', error);
        setTeamError(true);
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
  }, [isManager, teamReloadKey]);

  const sendInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail || isInviting || !currentUser) return;

    setIsInviting(true);
    try {
      const emailLower = inviteEmail.trim().toLowerCase();
      if (users.some((u) => u.email.toLowerCase() === emailLower)) {
        alert(t('settings.invite_exists', 'A user with this email already exists.'));
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
      alert(t('settings.invite_failed', 'Failed to add member. Please try again.'));
    } finally {
      setIsInviting(false);
    }
  };

  const revokeInvitation = async (email: string) => {
    if (!confirm(t('settings.cancel_invite_confirm', 'Cancel this invitation?'))) return;
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


  const updateMember = async (uid: string, updates: { displayName: string; role: AppRole }) => {
    setUpdatingId(uid);
    const userPath = `users/${uid}`;
    try {
      await updateDoc(doc(db, 'users', uid), {
        displayName: updates.displayName,
        role: updates.role,
        updatedAt: serverTimestamp(),
      });
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

  // "Your team" carries enough local state that it stays here rather than in a
  // component; the descriptor below still owns its place in both lists.
  const teamSection = (
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
            aria-label={t('settings.find_teammate_label', 'Find a teammate')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-3 bg-surface rounded-sm border border-outline-variant focus:border-primary outline-none transition-colors text-sm text-on-surface placeholder:text-on-surface-variant/60"
          />
        </div>
        <button
          onClick={() => setShowInviteDialog(true)}
          className="px-4 py-3 rounded-[14px] bg-primary text-on-primary font-medium flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors shrink-0"
        >
          <UserPlus className="w-4 h-4" /> {t('settings.add_someone', 'Add someone')}
        </button>
      </div>

      {/* Asking to join */}
      {!loading && pendingUsers.length > 0 && (
        <div className="mb-5 rounded-xl border border-primary/25 bg-primary/5 p-4">
          <div className="flex items-center gap-2 mb-3 text-accent">
            <KeyRound className="w-4 h-4" />
            <span className="text-sm font-medium">
              {t(
                pendingUsers.length === 1 ? 'settings.asking_to_join_one' : 'settings.asking_to_join_many',
                pendingUsers.length === 1
                  ? '{n} person is asking to join'
                  : '{n} people are asking to join',
              ).replace('{n}', String(pendingUsers.length))}
            </span>
          </div>
          <div className="space-y-2.5">
            {pendingUsers.map((u) => (
              <div key={u.uid} className="flex items-center gap-3">
                <Avatar name={u.displayName || u.email} photoURL={u.photoURL} />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-on-surface truncate">
                    {u.displayName || t('settings.unnamed', 'Unnamed')}
                  </div>
                  <div className="text-[13px] text-on-surface-variant truncate">
                    {t('settings.wants_role', 'wants {role}').replace('{role}', roleLabel(t, u.role))} · {u.email}
                  </div>
                </div>
                <button
                  onClick={() => toggleApproval(u.uid, u.approved)}
                  disabled={updatingId === u.uid}
                  className="shrink-0 px-3.5 py-2 rounded-full pointer-coarse:min-h-11 bg-primary text-on-primary text-[13px] font-medium flex items-center gap-1.5 hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {updatingId === u.uid ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  {t('actions.approve', 'Approve')}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Member list. A denied or failed users query used to fall through to
          the same sentence as an empty search ("No teammates or invites match
          your search."), so a network blip looked like a roster of nobody.
          It says what happened and offers a way back. */}
      {teamError ? (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-xl border border-error/30 bg-error/5 p-4 sm:flex-row sm:items-center"
        >
          <p className="flex-1 text-sm text-on-surface">
            {t('settings.team_load_failed', "Couldn't load your team.")}
          </p>
          <button
            type="button"
            onClick={() => {
              setTeamError(false);
              setLoading(true);
              setTeamReloadKey((k) => k + 1);
            }}
            className="shrink-0 rounded-[14px] border border-outline-variant/50 bg-surface px-3 py-2 text-[13px] font-medium text-on-surface hover:bg-surface-container-high transition-colors min-h-11"
          >
            {t('settings.try_again', 'Try again')}
          </button>
        </div>
      ) : loading ? (
        <div className="space-y-2.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 p-3.5 rounded-xl border border-outline-variant/40 bg-surface-container"
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
        <div className="py-12 text-center rounded-xl border border-outline-variant/50 bg-surface-container-low">
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
                canEdit={isAdmin && !isYou}
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
  );

  // One ordered list drives both the manager page and its phone rail. A section
  // that is not rendered must not be in the rail, and a rendered top-level
  // section must not be missing — so the rail and the page read the same array.
  const managerSections = [
    {
      id: 'settings-account',
      label: t('settings.account_session', 'Account & Session'),
      visible: true,
      node: <AccountSection />,
    },
    {
      id: 'settings-phone-sync',
      label: t('bnpb.settings_title', 'BNPB'),
      visible: isOwner,
      node: <BnpbSyncCard />,
    },
    {
      id: 'settings-security',
      label: t('settings.security_title', 'Security'),
      visible: true,
      node: <SecuritySection />,
    },
    {
      id: 'settings-appearance',
      label: t('settings.appearance', 'Appearance'),
      visible: true,
      node: <AppearanceSection theme={theme} setTheme={setTheme} />,
    },
    {
      id: 'settings-navigation',
      label: t('settings.navigation', 'Navigation'),
      visible: true,
      node: <NavigationSection />,
    },
    {
      id: 'settings-notifications',
      label: t('settings.notifications', 'Notifications & Alerts'),
      visible: true,
      node: <NotificationsSection />,
    },
    {
      id: 'settings-weekly-reminders',
      label: t('reminders.yours_title', 'Your weekly reminders'),
      visible: isManager,
      node: <WeeklyReminderSection uid={currentUser?.uid ?? ''} off={myWeeklyOff} />,
    },
    {
      id: 'settings-language',
      label: t('settings.language', 'Language'),
      visible: true,
      node: <LanguageSection />,
    },
    {
      id: 'settings-whats-new',
      label: t('settings.whats_new', "What's New"),
      visible: true,
      node: (
        <WhatsNewSection
          onOpen={() => setWhatsNewOpen(true)}
          isAdmin={isAdmin}
          userEmail={currentUser?.email}
        />
      ),
    },
    {
      id: 'settings-getting-started',
      label: t('settings.getting_started', 'Getting started'),
      visible: true,
      node: <GettingStartedSection />,
    },
    {
      id: 'settings-roles',
      label: t('settings.roles_access', 'Roles & access'),
      visible: true,
      node: (
        <section className="mt-10">
          <SectionHeader
            title={t('settings.roles_access', 'Roles & access')}
            sub={t('settings.roles_access_sub', 'Roles are labels — a way to know who carries what, and what each person sees.')}
          />
          <RolesReference currentRole={myRole} />
        </section>
      ),
    },
    {
      id: 'settings-team',
      label: t('settings.your_team', 'Your team'),
      visible: true,
      node: teamSection,
    },
    {
      id: 'settings-partners',
      label: t('settings.pairs_title', 'Going out together'),
      visible: isAdmin,
      node: <PartnersSection users={users} />,
    },
    {
      id: 'settings-teams',
      label: t('teams.title', "Which team they're on"),
      visible: isAdmin,
      node: <TeamsSection users={users} />,
    },
    {
      id: 'settings-reminder-schedule',
      label: t('reminders.schedule_title', 'Weekly reminder schedule'),
      visible: isAdmin,
      node: <ReminderScheduleSection />,
    },
    {
      id: 'settings-day-goal',
      label: t('settings.day_goal_title', "The day's goal"),
      visible: isAdmin,
      node: <DayGoalSection />,
    },
    {
      id: 'settings-calendar',
      label: t('settings.shared_calendar', 'The shared calendar'),
      visible: isAdmin || isManager,
      node: <CalendarSyncPanel />,
    },
    {
      id: 'settings-danger-zone',
      label: t('settings.danger_zone', 'Data management & danger zone'),
      visible: isAdmin,
      node: <DangerZoneSection onOpenPurgeModal={() => setShowPurgeModal(true)} />,
    },
    {
      id: 'settings-quick-add',
      label: t('settings.quick_add_title', 'Quick add by text'),
      visible: isDev,
      node: <IntegrationsSection currentUser={currentUser} />,
    },
    {
      id: 'settings-webhooks',
      label: t('settings.webhook_title', 'API & webhook console'),
      visible: isDev,
      node: <WebhookConsoleSection />,
    },
    {
      id: 'settings-cost',
      label: 'What the app is costing',
      visible: isOwner,
      node: <UsageStatsPanel uid={currentUser?.uid || ''} />,
    },
    {
      id: 'settings-feedback',
      label: t('settings.what_people_telling_us', 'What people are telling us'),
      visible: isOwner,
      node: (
        <section className="mt-10">
          <SectionHeader
            title={t('settings.what_people_telling_us', 'What people are telling us')}
            sub={t('settings.what_people_telling_us_sub', 'Feedback from the team and the community. Read it like notes from friends.')}
          />
          <FeedbackList />
        </section>
      ),
    },
  ];
  const visibleManagerSections = managerSections.filter((section) => section.visible);

  // ── Non-admin: a warm "My profile" page ──
  if (!isAdmin) {
    return (
      <div className="p-6 md:p-8 max-w-3xl pb-24 lg:pb-8">
        <header className="mb-8">
          <h1 className="font-serif text-3xl sm:text-4xl text-on-surface">{t('settings.title', 'Settings')}</h1>
          <p className="text-base text-on-surface-variant mt-2">{t('settings.subtitle', 'Your account and preferences.')}</p>
        </header>
        <AccountSection />
        <SecuritySection />

        <section className="mt-10">
          <SectionHeader
            title={t('settings.roles_access', 'Roles & access')}
            sub={t('settings.roles_access_sub', 'Roles are labels — a way to know who each person carries what, and what sees.')}
          />
          <RolesReference currentRole={myRole} />
        </section>

        <AppearanceSection theme={theme} setTheme={setTheme} />
        <NavigationSection />
        <NotificationsSection />
        {/* Only staff and Trainees get a weekly reminder, so the Student and
            Community profile pages leave the switch out. */}
        {isManager && <WeeklyReminderSection uid={currentUser?.uid ?? ''} off={myWeeklyOff} />}
        <LanguageSection />
        <WhatsNewSection
          onOpen={() => setWhatsNewOpen(true)}
          isAdmin={isAdmin}
          userEmail={currentUser?.email}
        />
        <GettingStartedSection />

        <WhatsNewModal
          isOpen={whatsNewOpen}
          onClose={() => setWhatsNewOpen(false)}
          manifest={whatsNewManifest as WhatsNewManifest}
          platform="web"
          currentRole={role}
          videoUrlOverride={currentVideoUrl}
          videoRolesOverride={currentVideoRoles}
        />
      </div>
    );
  }

  // ── Full-timer: full settings ──
  return (
    <PageContainer variant="reading">
      <header className="mb-8">
        <h1 className="font-serif text-3xl sm:text-4xl text-on-surface">{t('settings.title', 'Settings')}</h1>
        <p className="text-base text-on-surface-variant mt-2">
          {currentUser?.displayName
            ? `${t('settings.signed_in_as', 'Signed in as')} ${currentUser.displayName}${myRole ? ` · ${roleLabel(t, myRole)}` : ''}`
            : t('settings.manager_subtitle', 'Your workspace and preferences.')}
        </p>
      </header>
      <SettingsSectionRail
        sections={visibleManagerSections.map(({ id, label }) => ({ id, label }))}
      />

      {visibleManagerSections.map((section) => (
        <div
          key={section.id}
          id={section.id}
          data-settings-section
          className="scroll-mt-[72px]"
        >
          {section.node}
        </div>
      ))}

      {/* Admin note */}
      <div className="mt-10 rounded-xl border border-outline-variant/40 bg-surface-container-low p-5 flex items-start gap-3">
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
          <EditMemberModal
            user={editTarget}
            isAdmin={isAdmin}
            onClose={() => setEditTarget(null)}
            onSave={(uid, updates) => {
              updateMember(uid, updates);
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
        {showPurgeModal && (
          <TestAccountPurgeModal
            isOpen={showPurgeModal}
            onClose={() => setShowPurgeModal(false)}
          />
        )}
        <WhatsNewModal
          isOpen={whatsNewOpen}
          onClose={() => setWhatsNewOpen(false)}
          manifest={whatsNewManifest as WhatsNewManifest}
          platform="web"
          currentRole={role}
          videoUrlOverride={currentVideoUrl}
          videoRolesOverride={currentVideoRoles}
        />
      </AnimatePresence>
    </PageContainer>
  );
}
