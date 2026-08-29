import React, { useState, useEffect, useRef } from 'react';
import { NavLink, Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  Sunrise,
  Kanban,
  Contact,
  CalendarCheck,
  CalendarDays,
  History as HistoryIcon,
  HeartHandshake,
  Sun,
  FileText,
  MessageSquare,
  MessageCircleQuestion,
  LayoutDashboard,
  Settings as SettingsIcon,
  LogOut,
  Search,
  X,
  Eye,
  ChevronDown,
  ExternalLink,
  BookOpen,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { UserAvatar } from '../ui/UserAvatar';
import { useAuth } from '../AuthProvider';
import { useLayout } from '../../App';
import {
  NAV_ITEMS,
  navExternalFor,
  primaryNavFor,
  moreNavFor,
  canAccessRoute,
  roleLabel,
  AppRole,
} from '../../lib/permissions';
import SeasonChip from './SeasonChip';
import GlobalSearch from './GlobalSearch';
import NotificationCenter from './NotificationCenter';
import { LanguageToggle } from '../LanguageToggle';
import { useI18n } from '../LanguageProvider';
import { Translate } from '../Translate';
import { SIGNUP_TITLE } from './SignupInvite';
import { subscribeAsks, askQuestions, askAnswered } from '../../lib/asks';

// Route → icon (the same mapping the old rail used, so the top bar reads the
// same way). Fallback to LayoutDashboard for anything unmapped.
const NAV_ICONS: Record<string, LucideIcon> = {
  '/': Sunrise,
  '/board': Kanban,
  '/directory': Contact,
  '/history': HistoryIcon,
  '/attendance': CalendarCheck,
  '/outreach': BookOpen,
  '/visits': CalendarDays,
  '/prayer': HeartHandshake,
  '/answered': Sun,
  '/coordination': FileText,
  '/messages': MessageSquare,
  '/questions': MessageCircleQuestion,
  '/settings': SettingsIcon,
};

function NavGlyph({ href, size = 20, className }: { href: string; size?: number; className?: string }) {
  const Icon = NAV_ICONS[href] ?? LayoutDashboard;
  return <Icon className={cn('shrink-0', className)} style={{ width: size, height: size }} />;
}

export default function TopNav({ onOpenImpersonateModal }: { onOpenImpersonateModal?: () => void }) {
  const { user, logOut, isAdmin, isOwner, role, impersonateTarget, ownerViewRole } = useAuth();
  const { isMobileMenuOpen, setIsMobileMenuOpen, setSearchOpen } = useLayout();
  const { t } = useI18n();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const [moreOpen, setMoreOpen] = useState(false);
  // Questions lives in the More menu now (#646). Folding a destination away costs
  // discoverability, so the fold leaks: a dot on More, the count on the row.
  const [waitingAsks, setWaitingAsks] = useState(0);
  const [profileOpen, setProfileOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  const primary = primaryNavFor(role);
  const moreItems = moreNavFor(role);
  const externalLinks = navExternalFor(role);

  useEffect(() => {
    if (!isAdmin || !user?.uid) return;
    return subscribeAsks(
      (msgs) => setWaitingAsks(askQuestions(msgs).filter((m) => m.from !== user.uid && !askAnswered(msgs, m)).length),
      undefined,
      { uid: user.uid, isAdmin: true },
    );
  }, [isAdmin, user?.uid]);

  // Close "More" / avatar menus on outside click or Escape.
  useEffect(() => {
    if (!moreOpen && !profileOpen) return;
    const onDown = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMoreOpen(false);
        setProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onEsc);
    };
  }, [moreOpen, profileOpen]);

  const homeLabel = isAdmin ? 'My Day' : 'Home';
  const profileName = user?.displayName || user?.email?.split('@')[0] || 'User';

  const go = (href: string) => {
    setMoreOpen(false);
    setIsMobileMenuOpen(false);
    navigate(href);
  };

  return (
    <>
      <header
        aria-label="Main Navigation"
        className="sticky top-0 z-40 bg-surface border-b border-outline-variant pt-[env(safe-area-inset-top,0px)]"
      >
        <div className="flex items-center gap-1 sm:gap-2 px-3 lg:px-5 h-14 lg:h-16">
          {/* Mobile menu trigger */}
          <button
            onClick={() => setIsMobileMenuOpen(true)}
            className="lg:hidden p-2 -ml-1 text-on-surface hover:bg-surface-container-high rounded-full transition-colors shrink-0"
            aria-label={t('nav.open_navigation', 'Open navigation')}
          >
            <MenuIcon />
          </button>

          {/* Brand */}
          <NavLink
            to="/"
            onClick={() => setIsMobileMenuOpen(false)}
            className="flex items-center gap-2 shrink-0 hover:opacity-80 transition-opacity mr-1"
          >
            <div className="w-8 h-8 lg:w-9 lg:h-9 rounded-xl bg-primary flex items-center justify-center overflow-hidden shrink-0">
              <img
                src="/logo.svg"
                alt="CISA Campus Work Tracker"
                className="w-full h-full object-contain"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                  if (target.parentElement) {
                    target.parentElement.classList.add('font-serif', 'text-base', 'font-semibold', 'text-on-primary');
                    target.parentElement.textContent = 'C';
                  }
                }}
              />
            </div>
            <div className="hidden sm:block leading-tight">
              <div className="font-serif text-sm font-semibold text-on-surface">CISA Campus</div>
              <div className="text-[10px] text-on-surface-variant -mt-0.5">Work Tracker</div>
            </div>
          </NavLink>

          <span className="hidden lg:block w-px h-6 bg-outline-variant mx-1" aria-hidden="true" />

          {/* Primary tabs (design B: the three that carry the week) */}
          <nav aria-label="Destinations" className="hidden lg:flex items-center gap-0.5">
            {primary.map((item) => {
              const href = item.href;
              const label = href === '/' ? homeLabel : item.label;
              return (
                <NavLink
                  key={href}
                  to={href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      'relative flex items-center gap-2 h-10 px-3 rounded-xl transition-colors',
                      isActive
                        ? 'text-on-surface font-medium bg-accent-soft/60'
                        : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <NavGlyph href={href} size={18} className={isActive ? 'text-accent' : ''} />
                      <Translate as="span" className="text-sm whitespace-nowrap" text={label} />
                      {/* 16×4 active bar (design B) */}
                      <span
                        className={cn(
                          'absolute left-1/2 -bottom-[13px] -translate-x-1/2 w-4 h-1 rounded-full transition-opacity',
                          isActive ? 'opacity-100 bg-primary' : 'opacity-0',
                        )}
                      />
                    </>
                  )}
                </NavLink>
              );
            })}

            {/* More menu */}
            <div ref={moreRef} className="relative">
              <button
                type="button"
                onClick={() => {
                  setMoreOpen((o) => !o);
                  setProfileOpen(false);
                }}
                className={cn(
                  'relative flex items-center gap-2 h-10 px-3 rounded-xl transition-colors text-sm',
                  moreOpen || (pathname !== '/' && !primary.some((p) => p.href === pathname))
                    ? 'text-on-surface bg-surface-container-high'
                    : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface',
                )}
                aria-haspopup="menu"
                aria-expanded={moreOpen}
              >
                <NavGlyph href={pathname} size={18} className={moreOpen ? 'text-accent' : ''} />
                <span className="whitespace-nowrap">{t('actions.more', 'More')}</span>
                <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', moreOpen && 'rotate-180')} />
                {waitingAsks > 0 && !moreOpen && (
                  <span
                    aria-label={`${waitingAsks} questions waiting on an answer`}
                    className="absolute top-1.5 right-1.5 w-[7px] h-[7px] rounded-full bg-primary ring-2 ring-surface"
                  />
                )}
              </button>

              <AnimatePresence>
                {moreOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 4, scale: 0.99 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 4, scale: 0.99 }}
                    transition={{ duration: 0.12 }}
                    role="menu"
                    className="absolute right-0 top-[calc(100%+10px)] w-56 bg-surface-container-high rounded-2xl shadow-2xl border border-outline-variant overflow-hidden z-50"
                  >
                    <div className="max-h-[min(70vh,520px)] overflow-y-auto custom-scrollbar p-1.5 space-y-0.5">
                      {moreItems.map((item) => {
                        const href = item.href;
                        const label = href === '/' ? homeLabel : item.label;
                        return (
                          <button
                            key={href}
                            type="button"
                            onClick={() => go(href)}
                            className={cn(
                              'w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left text-[13.5px] transition-colors',
                              pathname === href || (href !== '/' && pathname.startsWith(href))
                                ? 'bg-accent-soft text-on-surface font-medium'
                                : 'text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface',
                            )}
                          >
                            <NavGlyph href={href} size={18} />
                            <Translate as="span" className="min-w-0 flex-1" text={label} />
                            {href === '/questions' && waitingAsks > 0 && (
                              <span className="shrink-0 text-[11px] font-semibold tabular-nums text-warning bg-warning-container rounded-full px-1.5 py-0.5">
                                {waitingAsks}
                              </span>
                            )}
                          </button>
                        );
                      })}

                      {externalLinks.length > 0 && (
                        <div className="pt-1 mt-1 border-t border-outline-variant/60">
                          {externalLinks.map((item) => (
                            <a
                              key={item.id}
                              href={item.href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-3 px-3 py-2 rounded-xl text-[13.5px] text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface transition-colors"
                            >
                              <CalendarDays className="w-[18px] h-[18px] shrink-0" />
                              <Translate as="span" className="min-w-0 flex-1" text={item.label} />
                              <ExternalLink className="w-3.5 h-3.5 opacity-60 shrink-0" />
                            </a>
                          ))}
                        </div>
                      )}

                      <div className={externalLinks.length > 0 ? "" : "pt-1 mt-1 border-t border-outline-variant/60"}>
                        <button
                          type="button"
                          onClick={() => go('/signup')}
                          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left text-[13.5px] text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface transition-colors"
                        >
                          <FileText className="w-[18px] h-[18px] shrink-0" />
                          <Translate as="span" className="min-w-0 flex-1" text={SIGNUP_TITLE} />
                          <ExternalLink className="w-3.5 h-3.5 opacity-60 shrink-0" />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </nav>

          <div className="flex-1" />

          {/* Search — ⌘K / Ctrl+K palette lives in GlobalSearch */}
          <div className="hidden lg:block w-full max-w-[220px] xl:max-w-sm">
            <GlobalSearch />
          </div>
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="lg:hidden p-2 rounded-full text-on-surface-variant hover:bg-surface-container-high transition-colors shrink-0"
            aria-label="Search"
          >
            <Search className="w-5 h-5" />
          </button>

          {/* Notifications */}
          <NotificationCenter />

          {/* See as their view (owner only) */}
          {isOwner && (
            <button
              type="button"
              onClick={onOpenImpersonateModal}
              className={cn(
                'relative p-2 rounded-full text-on-surface-variant hover:bg-surface-container-high transition-colors focus:outline-none shrink-0',
                (impersonateTarget || ownerViewRole) &&
                  'text-amber-600 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 ring-1 ring-amber-500/40',
              )}
              title={
                impersonateTarget
                  ? `Seeing CISA as ${impersonateTarget.name} (${impersonateTarget.sub})`
                  : ownerViewRole
                  ? `Role view mode active`
                  : 'See as their view…'
              }
              aria-label="See as their view"
            >
              <Eye className="w-5 h-5" />
              {(impersonateTarget || ownerViewRole) && (
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              )}
            </button>
          )}

          {/* Avatar menu — persona, role, Settings, Log out (design B) */}
          <div className="relative shrink-0" ref={profileRef}>
            <button
              type="button"
              onClick={() => {
                setProfileOpen((o) => !o);
                setMoreOpen(false);
              }}
              aria-label="Profile"
              className="w-9 h-9 lg:w-10 lg:h-10 rounded-full overflow-hidden border border-outline-variant hover:ring-2 hover:ring-primary/20 transition-all focus:outline-none"
            >
              <UserAvatar
                name={impersonateTarget ? impersonateTarget.name : profileName}
                photoURL={impersonateTarget ? null : user?.photoURL}
                className="w-full h-full"
              />
            </button>

            <AnimatePresence>
              {profileOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  transition={{ duration: 0.15, ease: 'easeOut' }}
                  className="absolute right-0 mt-2 w-60 bg-surface-container-high rounded-2xl shadow-xl border border-outline-variant py-2 z-50"
                >
                  <div className="px-4 py-3 border-b border-outline-variant mb-1">
                    <p className="text-sm font-semibold text-on-surface truncate">
                      {impersonateTarget ? impersonateTarget.name : profileName}
                    </p>
                    <p className="text-xs text-on-surface-variant truncate">
                      {impersonateTarget ? impersonateTarget.sub : user?.email}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      <span className="inline-block text-[11px] font-medium text-on-surface-variant bg-surface-container px-2 py-0.5 rounded-full">
                        {impersonateTarget ? impersonateTarget.sub : roleLabel(role)}
                      </span>
                      <SeasonChip />
                    </div>
                  </div>

                  <Link
                    to="/settings"
                    onClick={() => setProfileOpen(false)}
                    className="flex items-center gap-3 px-4 py-2 text-sm text-on-surface-variant hover:bg-surface-container-highest transition-colors"
                  >
                    <SettingsIcon className="w-4 h-4" />
                    <span>{t('nav.settings', 'Settings')}</span>
                  </Link>

                  <div className="px-4 py-2 flex items-center justify-between border-t border-outline-variant/50">
                    <span className="text-xs text-on-surface-variant font-medium">{t('settings.language', 'Language')}</span>
                    <LanguageToggle />
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setProfileOpen(false);
                      logOut();
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2 text-sm text-error hover:bg-error/10 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>{t('actions.log_out', 'Log out')}</span>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </header>

      {/* Mobile nav drawer — all destinations + signup (replaces the old rail drawer) */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsMobileMenuOpen(false)}
            className="fixed inset-0 bg-scrim/50 z-[60] lg:hidden"
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.nav
            aria-label="Mobile menu"
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="lg:hidden fixed inset-y-0 left-0 z-[70] w-[85%] max-w-xs bg-surface border-r border-outline-variant flex flex-col pt-[calc(1rem+env(safe-area-inset-top,0px))] px-3 pb-4 shadow-2xl overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-4 px-2">
              <span className="font-serif text-base font-semibold text-on-surface">CISA Campus</span>
              <button
                type="button"
                onClick={() => setIsMobileMenuOpen(false)}
                className="p-2 -mr-2 rounded-full hover:bg-surface-container-high transition-colors text-on-surface-variant"
                aria-label="Close menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {NAV_ITEMS.filter((item) => canAccessRoute(role as AppRole, item.href)).map((item) => {
              const href = item.href;
              const label = href === '/' ? homeLabel : item.label;
              return (
                <NavLink
                  key={href}
                  to={href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-xl h-11 px-3 transition-all text-sm',
                      isActive
                        ? 'bg-accent-soft text-accent font-medium'
                        : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface',
                    )
                  }
                >
                  <NavGlyph href={href} size={18} />
                  <Translate as="span" text={label} />
                </NavLink>
              );
            })}

            {externalLinks.length > 0 && (
              <div className="mt-4">
                <div className="text-xs font-medium text-on-surface-variant/70 px-3 mb-1.5">{t('nav.elsewhere', 'Elsewhere')}</div>
                {externalLinks.map((item) => (
                  <a
                    key={item.id}
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="flex items-center gap-3 rounded-xl h-11 px-3 text-sm text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
                  >
                    <CalendarDays className="w-[18px] h-[18px] shrink-0" />
                    <Translate as="span" text={item.label} />
                    <ExternalLink className="w-3.5 h-3.5 opacity-60 shrink-0 ml-auto" />
                  </a>
                ))}
              </div>
            )}

            <div className="mt-2">
              <NavLink
                to="/signup"
                onClick={() => setIsMobileMenuOpen(false)}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-xl h-11 px-3 transition-all text-sm',
                    isActive
                      ? 'bg-accent-soft text-accent font-medium'
                      : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface',
                  )
                }
              >
                <FileText className="w-[18px] h-[18px] shrink-0" />
                <span>{t('nav.sign_up_form', 'Sign-up form')}</span>
              </NavLink>
            </div>

            <div className="mt-auto pt-4 border-t border-outline-variant space-y-3">
              <div className="flex items-center justify-between px-3">
                <span className="text-xs font-medium text-on-surface-variant">{t('settings.language', 'Language')}</span>
                <LanguageToggle />
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  logOut();
                }}
                className="w-full flex items-center gap-3 rounded-xl h-11 px-3 text-sm text-error hover:bg-error/10 font-medium cursor-pointer"
              >
                <LogOut className="w-[18px] h-[18px] shrink-0" />
                <span>{t('actions.log_out', 'Log out')}</span>
              </button>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </>
  );
}

function MenuIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="18" x2="20" y2="18" />
    </svg>
  );
}
