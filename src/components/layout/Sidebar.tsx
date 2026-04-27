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
import { cn } from '../../lib/utils';

export default function Sidebar() {
  const navItems = [
    { icon: LayoutDashboard, label: 'Dashboard', href: '/' },
    { icon: Kanban, label: 'Outreach Board', href: '/board' },
    { icon: Users, label: 'Directory', href: '/directory' },
    { icon: UserCheck, label: 'Attendance', href: '/attendance' },
  ];

  return (
    <nav className="hidden md:flex bg-surface-container-low h-screen w-72 flex-col border-r border-outline-variant fixed left-0 top-0 bottom-0 z-40 pt-4 pb-6 px-3">
      {/* Brand Header */}
      <div className="px-3 mb-8 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary-container text-on-primary-container flex items-center justify-center shadow-sm">
          <Megaphone className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-lg font-black text-primary leading-tight">Campaign Manager</h2>
          <p className="text-xs text-on-surface-variant opacity-80">Active: Fall 2023</p>
        </div>
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

        <div className="mt-4 px-4 flex items-center gap-3">
          <img 
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuCz2w0t-GcizG3scFlODrLSObdLQAUFmHxrBJCY7WPDwztsCZisG3Dqo9b72pTlEhwxvYPO3QEecKQxzyj9TYWR3enToxrSU52XmOoEoKcg75hRXdWS6zWxcNyHzBAgIfZLvy0OTErYJX7QnpiJm_Gb7SVCyeOHJzqgUkijPUYQccywmHE-kLjfXrqg9iYDXn_FYoxXEvlMYVQMlw61-IICzWxDDOAZQAlPE_KOaWmyTaHHOzpiutwhCVG_F1kTrhz_OkqGevkwL7xO" 
            alt="Alex Mercer"
            className="w-10 h-10 rounded-full object-cover"
          />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-on-surface truncate">Alex Mercer</p>
            <p className="text-xs text-on-surface-variant truncate">alex@outreachpro.com</p>
          </div>
        </div>
      </div>
    </nav>
  );
}
