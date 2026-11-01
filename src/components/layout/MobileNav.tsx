import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Contact,
  HeartHandshake,
  MessageSquare,
  MessageCircleQuestion,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useAuth } from '../AuthProvider';
import { hasMinRole, canAccessRoute, AppRole } from '../../lib/permissions';
import { sectionHrefFor } from '../../lib/navTrail';
import { useI18n } from '../LanguageProvider';
import { useWaitingAsksCount } from '../../hooks/useWaitingAsksCount';
import { useMyAskRepliesCount } from '../../hooks/useMyAskRepliesCount';

/**
 * Re-tapping the lit destination returns the list under it to the top, the way
 * a native tab bar does (#1779). The phone shell's only scroller is the routed
 * `main` pane — the document itself no longer scrolls (#1795) — so that is the
 * single element to move.
 */
function scrollCurrentListToTop() {
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  document.querySelector('main')?.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
}

/**
 * One bottom-bar destination.
 *
 * Selection is the Ink inversion — a solid ink disc with the glyph turned
 * white — not a tint. The old `bg-secondary-container` pill was a 6% wash on a
 * bar of nearly the same tone (1.09:1), so the selected destination was
 * invisible outdoors and to low-vision users (#1775). `Link`, not `NavLink`:
 * the shell selects on `sectionHrefFor`, which also lights a destination for
 * the routes underneath it (/people/:id still belongs to People).
 *
 * `waiting` is the count of things owed to the reader here (#1806). It rides
 * the disc as a pill and is repeated for screen readers after the label, so a
 * tab bar announces "Questions, 3 waiting" the way a native one does.
 */
function Destination({
  to,
  label,
  icon: Icon,
  active,
  waiting = 0,
  waitingLabel,
}: {
  to: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  waiting?: number;
  waitingLabel?: string;
}) {
  return (
    <Link
      to={to}
      aria-current={active ? 'page' : undefined}
      onClick={active ? scrollCurrentListToTop : undefined}
      className={cn(
        'group flex min-h-11 min-w-[64px] flex-col items-center justify-center gap-1 rounded-[14px] px-1 py-1.5 transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40',
      )}
    >
      <span
        data-testid="mobile-nav-indicator"
        aria-hidden="true"
        className={cn(
          'relative grid h-8 w-12 place-items-center rounded-full transition-colors',
          active
            ? 'bg-primary text-on-primary'
            : 'text-on-surface-variant group-hover:bg-surface-container-high',
        )}
      >
        <Icon className="h-5 w-5" />
        {waiting > 0 && (
          <span
            data-testid="mobile-nav-waiting"
            className="absolute -top-1 right-0.5 min-w-4 rounded-full bg-primary px-1 text-center text-[9px] font-semibold leading-4 tabular-nums text-on-primary ring-2 ring-surface-container-low"
          >
            {waiting}
          </span>
        )}
      </span>
      <span
        className={cn(
          'text-[11px] leading-none',
          active ? 'font-semibold text-on-surface' : 'font-medium text-on-surface-variant',
        )}
      >
        {label}
      </span>
      {waiting > 0 && waitingLabel && (
        <span className="sr-only">, {waitingLabel}</span>
      )}
    </Link>
  );
}

export default function MobileNav() {
  const { user, role, effectiveUserId } = useAuth();
  const { t } = useI18n();
  const { pathname } = useLocation();
  const section = sectionHrefFor(pathname);
  const isOperator = hasMinRole(role as AppRole, 'operator');
  const isAdmin = role === 'admin';
  // The route allowlist, not a role rung: Questions opens to a trainee manager
  // and above, and a Student never sees it (#1806).
  const canSeeQuestions = canAccessRoute(role, '/questions');
  const uid = effectiveUserId || user?.uid || null;

  // Two counts, one slot. A full-timer carries the team's unanswered backlog,
  // which the rail and the top bar already show; a trainee carries the replies
  // owed on their own questions, the number the Messages header uses (#563).
  // Neither is a new query — both read the asks feed the shells already read.
  const waitingAsks = useWaitingAsksCount(uid, isAdmin);
  const myReplies = useMyAskRepliesCount(isAdmin || !canSeeQuestions ? null : uid);
  const questionsWaiting = isAdmin ? waitingAsks : myReplies;

  // Same names the drawer, rail and top bar use — the bar used to say
  // "Contacts" and "Prayer" for destinations called "People" and "On our
  // hearts" everywhere else (#1775).
  const homeLabel = role === 'admin' ? t('nav.my_day', 'My Day') : t('nav.home', 'Home');
  const waitingLabel =
    questionsWaiting > 0
      ? t('nav.questions_waiting', '{n} waiting').replace('{n}', String(questionsWaiting))
      : undefined;

  return (
    <nav
      aria-label={t('nav.mobile_navigation', 'Mobile Navigation')}
      className="app-mobile-nav md:hidden fixed bottom-0 left-0 right-0 min-h-16 pb-[env(safe-area-inset-bottom)] bg-surface-container-low border-t border-outline-variant flex items-center justify-around z-50 animate-in slide-in-from-bottom duration-300 px-4"
    >
      <Destination to="/" label={homeLabel} icon={LayoutDashboard} active={section === '/'} />

      {/* Messages and Questions are the two places a Trainee has live work in,
          so they are destinations rather than drawer rows (ADR 0049). The
          centred search FAB that used to hold this middle slot was a duplicate:
          the phone header already renders its own search button, and the bar
          could not grow past five controls at 375px. */}
      <Destination
        to="/messages"
        label={t('nav.messages', 'Messages')}
        icon={MessageSquare}
        active={section === '/messages'}
      />

      {canSeeQuestions && (
        <Destination
          to="/questions"
          label={t('nav.questions', 'Questions')}
          icon={MessageCircleQuestion}
          active={section === '/questions'}
          waiting={questionsWaiting}
          waitingLabel={waitingLabel}
        />
      )}

      {isOperator ? (
        <Destination
          to="/directory"
          label={t('nav.directory', 'People')}
          icon={Contact}
          active={section === '/directory'}
        />
      ) : (
        <Destination
          to="/prayer"
          label={t('nav.prayers', 'On our hearts')}
          icon={HeartHandshake}
          active={section === '/prayer'}
        />
      )}
    </nav>
  );
}
