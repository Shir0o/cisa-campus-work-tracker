import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search,
  Bell,
  Eye,
  Settings as SettingsIcon,
  LogOut,
  ExternalLink,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../AuthProvider';
import { useLayout } from '../../App';
import { roleLabel } from '../../lib/permissions';
import SeasonChip from './SeasonChip';
import GlobalSearch from './GlobalSearch';
import NotificationCenter from './NotificationCenter';
import { UserAvatar } from '../ui/UserAvatar';
import { LanguageToggle } from '../LanguageToggle';
import { Translate } from '../Translate';
import { useI18n } from '../LanguageProvider';
import { cn } from '../../lib/utils';

export interface NavChromeStripProps {
  /** Handler for the "See as their view" eye. The strip doesn't own the modal. */
  onOpenImpersonateModal?: () => void;
}

/**
 * The shared desktop chrome mounted by the shell in rail mode:
 *   Global Search · Notifications · Season indicator · Avatar/Profile menu.
 *
 * This is the same chrome the top bar used to mount, hoisted into the shell
 * so both shells use one implementation. The spec requires the keyboard
 * shortcut to keep working from any shell; mounting GlobalSearch here keeps
 * it working in rail mode.
 *
 * The strip sits above the content area (not inside the rail). The rail
 * mounts its own pinned account row at the bottom; this strip is for the
 * shared actions.
 */
export default function NavChromeStrip({ onOpenImpersonateModal }: NavChromeStripProps) {
  const { user, logOut, isOwner, role, impersonateTarget, ownerViewRole } = useAuth();
  const { t } = useI18n();
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!profileOpen) return;
    const onDown = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setProfileOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onEsc);
    };
  }, [profileOpen]);

  const profileName = user?.displayName || user?.email?.split('@')[0] || 'User';

  return (
    // In the floating shell there is no bar to be the edge of — a full-bleed
    // fill with a bottom rule would read as a leftover. The strip is just a
    // row on the page; its controls carry their own raised surface.
    <div className="hidden lg:flex items-center gap-1 sm:gap-2 h-14 shrink-0">
      {/* Push the strip actions to the right — the rail owns the left side. */}
      <div className="flex-1" />

      {/* Global Search — full-width trigger in rail mode, since there's no
          primary tabs to its left. */}
      <div className="hidden lg:block">
        <GlobalSearch />
      </div>

      {/* Notifications */}
      <NotificationCenter />

      {/* Season indicator (rail mounts it inline in the profile menu too,
          but the spec calls for it visible above the content). */}
      <div className="hidden lg:flex">
        <SeasonChip />
      </div>

      {/* "See as their view" — owner only */}
      {isOwner && (
        <button
          type="button"
          onClick={onOpenImpersonateModal}
          className={cn(
            'relative p-2 rounded-full bg-surface text-on-surface-variant hover:bg-surface-container-high transition-colors focus:outline-none shrink-0',
            (impersonateTarget || ownerViewRole) &&
              'text-amber-600 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 ring-1 ring-amber-500/40',
          )}
          title={
            impersonateTarget
              ? `Seeing CISA as ${impersonateTarget.name} (${impersonateTarget.sub})`
              : ownerViewRole
                ? 'Role view mode active'
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

      {/* Avatar menu — persona, role, Settings, Log out */}
      <div className="relative shrink-0" ref={profileRef}>
        <button
          type="button"
          onClick={() => setProfileOpen((o) => !o)}
          aria-label="Profile"
          className="w-9 h-9 lg:w-10 lg:h-10 rounded-full overflow-hidden bg-surface border border-outline-variant hover:ring-2 hover:ring-primary/20 transition-all focus:outline-none"
        >
          <UserAvatar
            name={impersonateTarget ? impersonateTarget.name : profileName}
            photoURL={impersonateTarget ? null : user?.photoURL ?? null}
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
                <span className="text-xs text-on-surface-variant font-medium">
                  {t('settings.language', 'Language')}
                </span>
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
  );
}