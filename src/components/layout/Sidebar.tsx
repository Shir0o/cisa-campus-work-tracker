import React from 'react';
import { NavLink } from 'react-router-dom';
import { motion } from 'motion/react';
import { 
  LayoutDashboard, 
  Kanban, 
  Users, 
  UserCheck, 
  Settings, 
  Megaphone,
  PlusCircle,
  LogOut
} from 'lucide-react';
import { cn, getUserAvatar } from '../../lib/utils';

import { useAuth } from '../AuthProvider';

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export default function Sidebar({ isOpen, onClose, isCollapsed, onToggleCollapse }: SidebarProps) {
  const { user, logOut } = useAuth();
  const displayName = user?.displayName || 'User';
  const email = user?.email || '';
  
  const navItems = [
    { icon: LayoutDashboard, label: 'Dashboard', href: '/' },
    { icon: Kanban, label: 'Outreach Board', href: '/board' },
    { icon: Users, label: 'Directory', href: '/directory' },
    { icon: UserCheck, label: 'Attendance', href: '/attendance' },
  ];

  return (
    <>
      {/* Mobile Overlay */}
      <div 
        className={cn(
          "fixed inset-0 bg-black/40 z-40 transition-opacity md:hidden",
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />

      <nav className={cn(
        "bg-surface-container-low h-screen flex-col border-r border-outline-variant fixed left-0 top-0 bottom-0 z-50 pt-4 pb-6 transition-all duration-300 md:translate-x-0 flex",
        isOpen ? "translate-x-0" : "-translate-x-full",
        isCollapsed ? "w-20 px-2" : "w-72 px-3"
      )}>
        {/* Brand Header */}
        <div className={cn("mb-8 flex items-center", isCollapsed ? "justify-center" : "justify-between px-3")}>
          {!isCollapsed && (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 min-w-[40px] rounded-xl bg-primary-container text-on-primary-container flex items-center justify-center shadow-sm">
                <Megaphone className="w-6 h-6" />
              </div>
              <motion.div 
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="whitespace-nowrap"
              >
                <h2 className="text-lg font-black text-primary leading-tight">Contact Manager</h2>
                <p className="text-xs text-on-surface-variant opacity-80">Active Session</p>
              </motion.div>
            </div>
          )}
          
          <div className="flex flex-col gap-2 items-center">
            <button 
              onClick={onToggleCollapse}
              className={cn(
                "p-2 rounded-full hover:bg-surface-container-high transition-colors text-on-surface-variant flex items-center justify-center",
                isCollapsed && "mt-2"
              )}
              title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <div className={cn("transition-transform duration-300", isCollapsed ? "rotate-180" : "")}>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                </svg>
              </div>
            </button>
          </div>
        </div>

        {/* New Contact Button */}
        <div className={cn("mb-6", isCollapsed ? "px-0 flex justify-center" : "px-1")}>
          <button className={cn(
            "bg-primary text-on-primary rounded-full font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition-all active:scale-95 shadow-sm",
            isCollapsed ? "w-12 h-12 p-0" : "w-full py-3 px-6"
          )}>
            <PlusCircle className="w-5 h-5" />
            {!isCollapsed && <span className="whitespace-nowrap">New Contact</span>}
          </button>
        </div>

        {/* Main Nav Items */}
        <div className="flex-1 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.href}
              to={item.href}
              onClick={onClose}
              className={({ isActive }) => cn(
                "flex items-center rounded-full transition-all duration-200 ease-in-out font-medium",
                isCollapsed ? "justify-center p-3" : "gap-3 px-4 py-3",
                isActive 
                  ? "bg-secondary-container text-on-secondary-container" 
                  : "text-on-surface-variant hover:bg-surface-container-high"
              )}
            >
              <item.icon className={cn("w-5 h-5 min-w-[20px]", item.href === window.location.pathname ? "fill-current" : "")} />
              {!isCollapsed && <span className="whitespace-nowrap">{item.label}</span>}
            </NavLink>
          ))}
        </div>

        {/* Footer Nav */}
        <div className="mt-auto border-t border-outline-variant pt-4">
          <NavLink
            to="/settings"
            onClick={onClose}
            className={({ isActive }) => cn(
              "flex items-center rounded-full transition-all duration-200 ease-in-out font-medium",
              isCollapsed ? "justify-center p-3" : "gap-3 px-4 py-3",
              isActive 
                ? "bg-secondary-container text-on-secondary-container" 
                : "text-on-surface-variant hover:bg-surface-container-high"
            )}
          >
            <Settings className="w-5 h-5 min-w-[20px]" />
            {!isCollapsed && <span className="whitespace-nowrap">Settings</span>}
          </NavLink>

          <button
            onClick={logOut}
            className={cn(
              "flex items-center rounded-full transition-all duration-200 ease-in-out font-medium mt-1 w-full text-left",
              isCollapsed ? "justify-center p-3" : "gap-3 px-4 py-3",
              "text-on-surface-variant hover:bg-error/10 hover:text-error"
            )}
          >
            <LogOut className="w-5 h-5 min-w-[20px]" />
            {!isCollapsed && <span className="whitespace-nowrap">Log out</span>}
          </button>

          <div 
            className={cn(
              "w-full mt-2 flex items-center rounded-2xl transition-all",
              isCollapsed ? "justify-center p-2" : "gap-3 p-4"
            )}
          >
            <img 
              src={getUserAvatar(user?.photoURL)} 
              alt={displayName}
              className="w-10 h-10 min-w-[40px] rounded-full object-cover border border-outline-variant"
            />
            {!isCollapsed && (
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-on-surface truncate leading-none mb-0.5">{displayName}</p>
                <p className="text-xs text-on-surface-variant truncate opacity-70">{email}</p>
              </div>
            )}
          </div>
        </div>
      </nav>
    </>
  );
}
