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
import { cn } from '../../lib/utils';

import { useAuth } from '../AuthProvider';

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const { logOut } = useAuth();
  
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
        "bg-surface-container-low h-screen flex-col border-r border-outline-variant fixed left-0 top-0 bottom-0 z-50 pt-4 pb-6 transition-all duration-300 md:translate-x-0 flex w-72 px-3",
        isOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        {/* Brand Header */}
        <div className="mb-8 flex items-center justify-between px-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 min-w-[40px] rounded-xl bg-[#4A00E0] flex items-center justify-center shadow-md overflow-hidden border border-[#FFF59D]/20">
              <img 
                src="/logo.svg" 
                alt="CampusHub" 
                className="w-full h-full object-contain"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                  if (target.parentElement) {
                    target.parentElement.classList.add('bg-primary-container');
                    target.parentElement.innerHTML = '<span class="text-[10px] text-primary font-bold">OP</span>';
                  }
                }}
              />
            </div>
            <div className="whitespace-nowrap">
              <h2 className="text-lg font-black text-primary leading-tight">CampusHub</h2>
              <p className="text-xs text-on-surface-variant opacity-80">Community Manager</p>
            </div>
          </div>
        </div>

        {/* New Contact Button */}
        <div className="mb-6 px-1">
          <button className="bg-primary text-on-primary rounded-full font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition-all active:scale-95 shadow-sm w-full py-3 px-6">
            <PlusCircle className="w-5 h-5" />
            <span className="whitespace-nowrap">New Contact</span>
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
                "flex items-center rounded-full transition-all duration-200 ease-in-out font-medium gap-3 px-4 py-3",
                isActive 
                  ? "bg-secondary-container text-on-secondary-container" 
                  : "text-on-surface-variant hover:bg-surface-container-high"
              )}
            >
              <item.icon className={cn("w-5 h-5 min-w-[20px]", item.href === window.location.pathname ? "fill-current" : "")} />
              <span className="whitespace-nowrap">{item.label}</span>
            </NavLink>
          ))}
        </div>

        {/* Footer Nav */}
        <div className="mt-auto border-t border-outline-variant pt-4">
          <NavLink
            to="/settings"
            onClick={onClose}
            className={({ isActive }) => cn(
              "flex items-center rounded-full transition-all duration-200 ease-in-out font-medium gap-3 px-4 py-3",
              isActive 
                ? "bg-secondary-container text-on-secondary-container" 
                : "text-on-surface-variant hover:bg-surface-container-high"
            )}
          >
            <Settings className="w-5 h-5 min-w-[20px]" />
            <span className="whitespace-nowrap">Settings</span>
          </NavLink>

          <button
            onClick={logOut}
            className="flex items-center rounded-full transition-all duration-200 ease-in-out font-medium mt-1 w-full text-left gap-3 px-4 py-3 text-on-surface-variant hover:bg-error/10 hover:text-error"
          >
            <LogOut className="w-5 h-5 min-w-[20px]" />
            <span className="whitespace-nowrap">Log out</span>
          </button>
        </div>
      </nav>
    </>
  );
}
