import React from 'react';
import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Kanban, 
  Users, 
  UserCheck, 
  Settings, 
  Megaphone,
  PlusCircle
} from 'lucide-react';
import { cn, getUserAvatar } from '../../lib/utils';

import { useAuth } from '../AuthProvider';

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
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
        "bg-surface-container-low h-screen w-72 flex-col border-r border-outline-variant fixed left-0 top-0 bottom-0 z-50 pt-4 pb-6 px-3 transition-transform duration-300 md:translate-x-0 flex",
        isOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        {/* Brand Header */}
        <div className="px-3 mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary-container text-on-primary-container flex items-center justify-center shadow-sm">
              <Megaphone className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-black text-primary leading-tight">Contact Manager</h2>
              <p className="text-xs text-on-surface-variant opacity-80">Active Session</p>
            </div>
          </div>
          <button onClick={onClose} className="md:hidden p-2 rounded-full hover:bg-surface-container-high transition-colors text-on-surface-variant">
            <PlusCircle className="w-6 h-6 rotate-45" />
          </button>
        </div>

        {/* New Contact Button */}
        <div className="px-1 mb-6">
          <button className="w-full bg-primary text-on-primary rounded-full py-3 px-6 font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition-all active:scale-95 shadow-sm">
            <PlusCircle className="w-5 h-5" />
            New Contact
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
                "flex items-center gap-3 px-4 py-3 rounded-full transition-all duration-200 ease-in-out font-medium",
                isActive 
                  ? "bg-secondary-container text-on-secondary-container" 
                  : "text-on-surface-variant hover:bg-surface-container-high"
              )}
            >
              <item.icon className={cn("w-5 h-5", item.href === window.location.pathname ? "fill-current" : "")} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </div>

        {/* Footer Nav */}
        <div className="mt-auto border-t border-outline-variant pt-4">
          <NavLink
            to="/settings"
            onClick={onClose}
            className={({ isActive }) => cn(
              "flex items-center gap-3 px-4 py-3 rounded-full transition-all duration-200 ease-in-out font-medium",
              isActive 
                ? "bg-secondary-container text-on-secondary-container" 
                : "text-on-surface-variant hover:bg-surface-container-high"
            )}
          >
            <Settings className="w-5 h-5" />
            <span>Settings</span>
          </NavLink>

          <button 
            onClick={logOut}
            className="w-full mt-4 p-4 flex items-center gap-3 hover:bg-surface-container-high rounded-2xl transition-all cursor-pointer group text-left"
          >
            <img 
              src={getUserAvatar(user?.photoURL)} 
              alt={displayName}
              className="w-10 h-10 rounded-full object-cover border border-outline-variant group-hover:border-primary transition-colors"
            />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-on-surface truncate">{displayName}</p>
              <p className="text-xs text-on-surface-variant truncate">{email}</p>
            </div>
          </button>
        </div>
      </nav>
    </>
  );
}
