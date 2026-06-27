import React from 'react';
import { NavLink } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { 
  LayoutDashboard,
  Sunrise,
  Kanban,
  Contact,
  CalendarCheck,
  Plus,
  ChevronLeft,
  ChevronRight,
  HeartHandshake,
  History as HistoryIcon,
  Settings as SettingsIcon,
  MessageSquare,
  FileText,
  LogOut,
  X
} from 'lucide-react';
import { cn, getUserAvatar } from '../../lib/utils';

import { useAuth } from '../AuthProvider';
import { useLayout } from '../../App';
import { NAV_ITEMS, canAccessRoute, roleLabel, AppRole } from '../../lib/permissions';

interface SidebarProps {
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  onLogInteraction?: () => void;
}

export default function Sidebar({ isCollapsed, onToggleCollapse, onLogInteraction }: SidebarProps) {
  const { logOut, isAdmin, role, user } = useAuth();
  const { isMobileMenuOpen, setIsMobileMenuOpen } = useLayout();
  const [viewportWidth, setViewportWidth] = React.useState(
    typeof window !== 'undefined' ? window.innerWidth : 1280,
  );
  const [isScrolling, setIsScrolling] = React.useState(false);
  const scrollTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleScroll = () => {
    setIsScrolling(true);
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }
    scrollTimeoutRef.current = setTimeout(() => {
      setIsScrolling(false);
    }, 1000);
  };

  React.useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  // Desktop (>=lg) honors the user's collapse preference. The tablet band
  // (md–lg) is always a collapsed icon rail. Below md the sidebar is an overlay
  // drawer shown at full width.
  const isDesktop = viewportWidth >= 1024;
  const isTabletRail = viewportWidth >= 768 && viewportWidth < 1024;
  const effectiveIsCollapsed = isDesktop ? !!isCollapsed : isTabletRail;

  const NAV_ICONS: Record<string, React.ElementType> = {
    '/': Sunrise,
    '/board': Kanban,
    '/directory': Contact,
    '/history': HistoryIcon,
    '/attendance': CalendarCheck,
    '/prayer': HeartHandshake,
    '/coordination': FileText,
    '/messages': MessageSquare,
    '/settings': SettingsIcon,
  };

  // The home route is role-aware: Full-timers see their "My Day" cockpit, while
  // everyone else gets a role-tailored "Home" landing.
  const navItems = NAV_ITEMS
    .filter(item => canAccessRoute(role as AppRole, item.href))
    .map(item => ({
      ...item,
      label: item.href === '/' ? (isAdmin ? 'My Day' : 'Home') : item.label,
      icon: NAV_ICONS[item.href] ?? LayoutDashboard,
    }));

  const getRoleLabel = (r: string | null) => roleLabel(r);

  return (
    <>
      {/* Mobile Overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsMobileMenuOpen(false)}
            className="fixed inset-0 bg-scrim/50 z-[60] md:hidden"
          />
        )}
      </AnimatePresence>

      <motion.nav 
        aria-label="Main Navigation"
        initial={false}
        animate={{ 
          width: effectiveIsCollapsed ? 80 : 288,
        }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className={cn(
          "bg-surface h-screen fixed md:sticky top-0 left-0 flex-col border-r border-outline-variant z-[70] pt-4 pb-4 px-3 overflow-hidden shrink-0",
          "md:transition-none transition-transform duration-300 ease-in-out",
          isMobileMenuOpen ? "translate-x-0 shadow-2xl flex" : "-translate-x-full md:translate-x-0 flex shadow-none"
        )}
      >
        {/* Brand Header */}
        <div className={cn(
          "mb-8 flex items-center px-3 transition-all h-10",
          effectiveIsCollapsed ? "justify-center md:px-0" : "justify-between"
        )}>
          <NavLink to="/" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center gap-3 overflow-hidden hover:opacity-80 transition-opacity">
            <div className="w-10 h-10 min-w-[40px] rounded-xl bg-primary flex items-center justify-center shadow-sm overflow-hidden shrink-0">
              <img
                src="/logo.svg"
                alt="CISA Campus Work Tracker"
                className="w-full h-full object-contain"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                  if (target.parentElement) {
                    target.parentElement.classList.add('font-serif', 'text-lg', 'font-semibold', 'text-on-primary');
                    target.parentElement.textContent = 'C';
                  }
                }}
              />
            </div>
            <motion.div
              initial={false}
              animate={{ opacity: effectiveIsCollapsed ? 0 : 1, width: effectiveIsCollapsed ? 0 : 'auto', marginLeft: effectiveIsCollapsed ? 0 : 12 }}
              transition={{ duration: 0.2 }}
              className="whitespace-nowrap overflow-hidden"
            >
              <h2 className="font-serif text-base font-semibold text-on-surface leading-tight">CISA Campus</h2>
              <p className="text-xs text-on-surface-variant mt-0.5">Work Tracker</p>
            </motion.div>
          </NavLink>
          
          {!effectiveIsCollapsed && (
            <button 
              onClick={() => setIsMobileMenuOpen(false)}
              className="md:hidden p-2 -mr-2 rounded-full hover:bg-surface-container-high transition-colors text-on-surface-variant"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Main Nav Items */}
        <div 
          onScroll={handleScroll}
          className={cn(
            "flex-1 min-h-0 space-y-0.5 overflow-y-auto",
            effectiveIsCollapsed ? "no-scrollbar" : (isScrolling ? "custom-scrollbar" : "no-scrollbar")
          )}
        >
          {navItems.map((item) => (
            <NavLink
              key={item.href}
              to={item.href}
              onClick={() => setIsMobileMenuOpen(false)}
              className={({ isActive }) => cn(
                "relative flex items-center rounded-xl transition-all duration-200 ease-in-out h-11",
                effectiveIsCollapsed ? "justify-center px-0 w-12 mx-auto" : "px-3",
                isActive
                  ? "bg-stage-accent-soft text-on-surface font-medium"
                  : "text-on-surface-variant font-normal hover:bg-surface-container-high hover:text-on-surface"
              )}
              title={effectiveIsCollapsed ? item.label : undefined}
            >
              {({ isActive }) => (
                <>
                  {/* Accent left-rail on the active item */}
                  {isActive && !effectiveIsCollapsed && (
                    <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-primary" />
                  )}
                  <item.icon className={cn("w-[18px] h-[18px] min-w-[18px] shrink-0", isActive ? "text-primary" : "")} />
                  <motion.span
                    initial={false}
                    animate={{ opacity: effectiveIsCollapsed ? 0 : 1, width: effectiveIsCollapsed ? 0 : 'auto', marginLeft: effectiveIsCollapsed ? 0 : 12 }}
                    transition={{ duration: 0.2 }}
                    className="whitespace-nowrap overflow-hidden"
                  >
                    {item.label}
                  </motion.span>
                </>
              )}
            </NavLink>
          ))}
        </div>

        {/* Footer Nav */}
        <div className="mt-auto shrink-0 border-t border-outline-variant pt-3 space-y-1 overflow-hidden">
          {/* Signed-in user — avatar + name + role */}
          <div className={cn(
            "flex items-center mb-1 pb-2",
            effectiveIsCollapsed ? "justify-center px-0" : "px-2"
          )}>
            <img
              src={getUserAvatar(user?.photoURL)}
              alt={user?.displayName || 'Signed-in user'}
              className="w-9 h-9 min-w-[36px] rounded-full object-cover border border-outline-variant shrink-0"
            />
            <motion.div
              initial={false}
              animate={{ opacity: effectiveIsCollapsed ? 0 : 1, width: effectiveIsCollapsed ? 0 : 'auto', marginLeft: effectiveIsCollapsed ? 0 : 10 }}
              transition={{ duration: 0.2 }}
              className="whitespace-nowrap overflow-hidden min-w-0"
            >
              <div className="text-sm font-medium text-on-surface leading-tight truncate">{user?.displayName || 'Signed in'}</div>
              <div className="text-xs text-on-surface-variant mt-0.5 truncate">{getRoleLabel(role)}</div>
            </motion.div>
          </div>

          {/* Log Out button */}
          <button
            onClick={logOut}
            className={cn(
              "flex items-center rounded-xl transition-all duration-200 ease-in-out font-medium w-full text-left h-11 text-error hover:bg-error/10 cursor-pointer gap-0",
              effectiveIsCollapsed ? "justify-center px-0 w-12 mx-auto" : "px-3"
            )}
            title={effectiveIsCollapsed ? "Log out" : undefined}
          >
            <LogOut className="w-[18px] h-[18px] min-w-[18px] shrink-0" />
            <motion.span
              initial={false}
              animate={{ opacity: effectiveIsCollapsed ? 0 : 1, width: effectiveIsCollapsed ? 0 : 'auto', marginLeft: effectiveIsCollapsed ? 0 : 12 }}
              transition={{ duration: 0.2 }}
              className="whitespace-nowrap overflow-hidden"
            >
              Log out
            </motion.span>
          </button>

          {/* Collapse Toggle Button - Desktop Only */}
          <button
            onClick={onToggleCollapse}
            className="hidden lg:flex items-center rounded-xl transition-all duration-200 ease-in-out font-normal w-full text-left h-11 text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface mt-0.5 px-3 cursor-pointer gap-0"
            style={{ paddingLeft: effectiveIsCollapsed ? '0' : undefined, paddingRight: effectiveIsCollapsed ? '0' : undefined, justifyContent: effectiveIsCollapsed ? 'center' : undefined }}
          >
            {effectiveIsCollapsed ? (
              <ChevronRight className="w-[18px] h-[18px] min-w-[18px] shrink-0" />
            ) : (
              <div className="flex items-center gap-3">
                <ChevronLeft className="w-[18px] h-[18px] min-w-[18px] shrink-0" />
                <motion.span 
                  initial={false}
                  animate={{ opacity: effectiveIsCollapsed ? 0 : 1, width: effectiveIsCollapsed ? 'auto' : 'auto' }}
                  className="whitespace-nowrap overflow-hidden"
                >
                  Collapse Menu
                </motion.span>
              </div>
            )}
          </button>
        </div>
      </motion.nav>
    </>
  );
}
