import React from 'react';
import { NavLink } from 'react-router-dom';
import { motion } from 'motion/react';
import { 
  LayoutDashboard, 
  Kanban, 
  Users, 
  UserCheck, 
  Settings, 
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
              <div className="w-10 h-10 min-w-[40px] rounded-xl bg-[#4A00E0] flex items-center justify-center shadow-md overflow-hidden border border-[#FFF59D]/20">
                <svg viewBox="0 0 100 100" className="w-8 h-8" fill="none" xmlns="http://www.w3.org/2000/svg">
                  {/* Stylized Wavy Ram Head */}
                  <path d="M50 30C40 30 30 35 25 45C22 55 25 65 35 75C40 80 50 85 60 85C70 85 80 80 85 75C95 65 98 55 95 45C90 35 80 30 70 30" stroke="#FFF59D" strokeWidth="4" strokeLinecap="round" />
                  <path d="M35 45C30 45 25 50 25 60C25 70 30 75 35 75" stroke="#FFF59D" strokeWidth="3" strokeLinecap="round" />
                  <path d="M65 45C70 45 75 50 75 60C75 70 70 75 65 75" stroke="#FFF59D" strokeWidth="3" strokeLinecap="round" />
                  <path d="M40 35C45 32 55 32 60 35" stroke="#FFF59D" strokeWidth="2" strokeLinecap="round" />
                  <path d="M30 40C40 38 60 38 70 40" stroke="#FFF59D" strokeWidth="2" strokeLinecap="round" />
                  <path d="M25 45C35 43 65 43 75 45" stroke="#FFF59D" strokeWidth="2" strokeLinecap="round" />
                  <path d="M45 80L50 90L55 80" stroke="#FFF59D" strokeWidth="2" strokeLinejoin="round" />
                </svg>
              </div>
              <motion.div 
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="whitespace-nowrap"
              >
                <h2 className="text-lg font-black text-primary leading-tight">OutreachPro</h2>
                <p className="text-xs text-on-surface-variant opacity-80">Campaign Manager</p>
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
