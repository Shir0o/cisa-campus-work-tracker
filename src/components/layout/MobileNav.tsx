import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Contact,
  CalendarCheck,
  HeartHandshake,
  Search,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useAuth } from '../AuthProvider';
import { useLayout } from '../../App';
import { hasMinRole, AppRole } from '../../lib/permissions';

export default function MobileNav() {
  const { role } = useAuth();
  const { setSearchOpen } = useLayout();
  const isOperator = hasMinRole(role as AppRole, 'operator');

  return (
    <nav
      aria-label="Mobile Navigation"
      className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-surface-container-low border-t border-outline-variant flex items-center justify-around z-50 animate-in slide-in-from-bottom duration-300 pb-safe px-4"
    >
      {isOperator ? (
        <NavLink
          to="/"
          className={({ isActive }) => cn(
            "flex flex-col items-center gap-1 min-w-[64px] transition-all py-1",
            isActive && window.location.pathname === '/' ? "text-primary" : "text-on-surface-variant"
          )}
        >
          {({ isActive }) => (
            <>
              <div className={cn(
                "w-12 h-8 rounded-full flex items-center justify-center transition-all",
                isActive && window.location.pathname === '/' ? "bg-secondary-container text-on-secondary-container" : "hover:bg-surface-container-high"
              )}>
                <LayoutDashboard className="w-5 h-5" />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider">Dashboard</span>
            </>
          )}
        </NavLink>
      ) : (
        <NavLink
          to="/attendance"
          className={({ isActive }) => cn(
            "flex flex-col items-center gap-1 min-w-[64px] transition-all py-1",
            isActive ? "text-primary" : "text-on-surface-variant"
          )}
        >
          {({ isActive }) => (
            <>
              <div className={cn(
                "w-12 h-8 rounded-full flex items-center justify-center transition-all",
                isActive ? "bg-secondary-container text-on-secondary-container" : "hover:bg-surface-container-high"
              )}>
                <CalendarCheck className="w-5 h-5" />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider">Gatherings</span>
            </>
          )}
        </NavLink>
      )}

      {/* Center button — Global Search (#19), staff only. Replaces the old
          Quick-Actions FAB; quick-add now lives in the search overlay's empty
          state. */}
      {isOperator && (
        <button
          onClick={() => setSearchOpen(true)}
          className="relative -top-5 w-14 h-14 bg-primary text-on-primary rounded-2xl shadow-lg shadow-primary/25 flex items-center justify-center hover:bg-primary/90 active:scale-95 transition-all outline-none"
          aria-label="Search"
        >
          <Search className="w-6 h-6" />
        </button>
      )}

      {isOperator ? (
        <NavLink
          to="/directory"
          className={({ isActive }) => cn(
            "flex flex-col items-center gap-1 min-w-[64px] transition-all py-1",
            isActive && window.location.pathname === '/directory' ? "text-primary" : "text-on-surface-variant"
          )}
        >
          {({ isActive }) => (
            <>
              <div className={cn(
                "w-12 h-8 rounded-full flex items-center justify-center transition-all",
                isActive && window.location.pathname === '/directory' ? "bg-secondary-container text-on-secondary-container" : "hover:bg-surface-container-high"
              )}>
                <Contact className="w-5 h-5" />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider">Contacts</span>
            </>
          )}
        </NavLink>
      ) : (
        <NavLink
          to="/prayer"
          className={({ isActive }) => cn(
            "flex flex-col items-center gap-1 min-w-[64px] transition-all py-1",
            isActive ? "text-primary" : "text-on-surface-variant"
          )}
        >
          {({ isActive }) => (
            <>
              <div className={cn(
                "w-12 h-8 rounded-full flex items-center justify-center transition-all",
                isActive ? "bg-secondary-container text-on-secondary-container" : "hover:bg-surface-container-high"
              )}>
                <HeartHandshake className="w-5 h-5" />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider">Prayer</span>
            </>
          )}
        </NavLink>
      )}
    </nav>
  );
}
