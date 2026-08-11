import React, { useState, useRef, useEffect } from 'react';
import { Settings, LogOut, Menu, Search, Eye } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../AuthProvider';
import { getUserAvatar, cn } from '../../lib/utils';
import { useLayout } from '../../App';
import GlobalSearch from './GlobalSearch';
import NotificationCenter from './NotificationCenter';

/**
 * Warm, human page titles shown in the topbar crumbs. Route hrefs are unchanged;
 * this only maps a path to its Field Notes label (epic #8 / #10).
 */
const PAGE_TITLES: Record<string, string> = {
  '/': 'Today',
  '/board': 'The Journey',
  '/directory': 'People',
  '/attendance': 'Gatherings',
  '/prayer': 'On our hearts',
  '/answered': 'Answered',
  '/history': 'Looking back',
  '/settings': 'Settings',
  '/coordination': 'Coordination Notes',
  '/feedback': 'Feedback',
  '/admin/feedback': 'Feedback',
};

function pageTitleFor(pathname: string): string {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  const match = Object.keys(PAGE_TITLES)
    .filter((k) => k !== '/' && pathname.startsWith(k))
    .sort((a, b) => b.length - a.length)[0];
  return match ? PAGE_TITLES[match] : 'Workspace';
}

interface TopBarProps {
  onOpenImpersonateModal?: () => void;
}

export default function TopBar({ onOpenImpersonateModal }: TopBarProps) {
  const { user, logOut, isOwner, impersonateTarget, ownerViewRole } = useAuth();
  const { setIsMobileMenuOpen, setSearchOpen, selectedContact } = useLayout();
  const { pathname } = useLocation();
  const pageTitle = pageTitleFor(pathname);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="bg-surface border-b border-outline-variant px-4 lg:px-6 flex items-center gap-3 sm:gap-4 sticky top-0 z-30 pt-[env(safe-area-inset-top,0px)] min-h-[calc(4rem+env(safe-area-inset-top,0px))]">
      {/* Mobile menu trigger */}
      <button
        onClick={() => setIsMobileMenuOpen(true)}
        className="md:hidden p-2 -ml-2 text-on-surface hover:bg-surface-container-high rounded-full focus:outline-none transition-colors shrink-0"
        aria-label="Open navigation"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Page title / breadcrumbs — serif, warm (desktop) */}
      <nav aria-label="Breadcrumb" className="hidden lg:flex items-center gap-2 min-w-0">
        <Link to="/" className="text-sm text-on-surface-variant hover:text-on-surface transition-colors shrink-0">
          Workspace
        </Link>
        <span className="text-on-surface-variant/50 select-none" aria-hidden="true">/</span>
        <h1 className="font-serif text-lg font-medium text-on-surface leading-none truncate">{pageTitle}</h1>
        {selectedContact && (
          <>
            <span className="text-on-surface-variant/50 select-none" aria-hidden="true">/</span>
            <span className="font-serif text-lg font-medium text-on-surface leading-none truncate shrink-0">
              {selectedContact.name}
            </span>
          </>
        )}
      </nav>

      {/* Mobile page title — serif */}
      <h1 className="lg:hidden font-serif text-lg font-medium text-on-surface leading-none truncate min-w-0">
        {selectedContact ? selectedContact.name : pageTitle}
      </h1>

      <div className="flex-1" />

      {/* Right cluster: Global Search (#11) · Notifications (#12) · See view Eye icon · profile. */}
      <div className="flex items-center gap-1 sm:gap-2 lg:gap-3 shrink-0">
        {/* Global Search (#19) — desktop pill lives here */}
        <div className="hidden lg:block w-full max-w-sm xl:max-w-md">
          <GlobalSearch />
        </div>

        {/* Tablet search trigger */}
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="hidden md:inline-flex lg:hidden p-2 rounded-full text-on-surface-variant hover:bg-surface-container-high transition-colors"
          aria-label="Search"
        >
          <Search className="w-5 h-5" />
        </button>

        <NotificationCenter />

        {/* See as their view Eye button next to Notification Bell */}
        {isOwner && (
          <button
            type="button"
            onClick={onOpenImpersonateModal}
            className={cn(
              'relative p-2 rounded-full text-on-surface-variant hover:bg-surface-container-high transition-colors focus:outline-none',
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
        
        <div className="relative" ref={dropdownRef}>
          <button 
            onClick={() => setIsProfileOpen(!isProfileOpen)}
            className="w-10 h-10 rounded-full overflow-hidden border border-outline-variant hover:ring-2 hover:ring-primary/20 transition-all focus:outline-none"
          >
            <img 
              src={getUserAvatar(user?.photoURL)} 
              alt="Profile"
              className="w-full h-full object-cover"
            />
          </button>

          <AnimatePresence>
            {isProfileOpen && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                className="absolute right-0 mt-2 w-56 bg-surface-container-high rounded-2xl shadow-xl border border-outline-variant py-2 z-50"
              >
                <div className="px-4 py-3 border-b border-outline-variant mb-1">
                  <p className="text-sm font-bold text-on-surface truncate">{user?.displayName || 'User'}</p>
                  <p className="text-xs text-on-surface-variant truncate">{user?.email}</p>
                </div>

                <Link 
                  to="/settings" 
                  onClick={() => setIsProfileOpen(false)}
                  className="flex items-center gap-3 px-4 py-2 text-sm text-on-surface-variant hover:bg-surface-container-highest transition-colors"
                >
                  <Settings className="w-4 h-4" />
                  Settings
                </Link>

                <button 
                  onClick={() => {
                    setIsProfileOpen(false);
                    logOut();
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2 text-sm text-error hover:bg-error/10 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Log out
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}

