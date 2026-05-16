import React from 'react';
import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Kanban, 
  Contact, 
  CalendarCheck,
  HeartHandshake,
  History as HistoryIcon,
  Settings as SettingsIcon
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useAuth } from '../AuthProvider';

export default function MobileNav() {
  const { isAdmin } = useAuth();
  const navItems = [
    { icon: LayoutDashboard, label: 'Dashboard', href: '/' },
    { icon: Kanban, label: 'Stage', href: '/board' },
    { icon: Contact, label: 'Contacts', href: '/directory' },
    { icon: HistoryIcon, label: 'History', href: '/history' },
    { icon: HeartHandshake, label: 'Prayer', href: '/prayer' },
    { icon: CalendarCheck, label: 'Attendance', href: '/attendance' },
    { icon: SettingsIcon, label: 'Settings', href: '/settings' },
  ];

  return (
    <nav aria-label="Mobile Navigation" className="lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-surface-container-low border-t border-outline-variant flex items-center z-50 animate-in slide-in-from-bottom duration-300 overflow-x-auto no-scrollbar">
      <div className="flex w-max min-w-full justify-around space-x-2 px-2">
      {navItems.map((item) => (
        <NavLink
          key={item.href}
          to={item.href}
          className={({ isActive }) => cn(
            "flex flex-col items-center gap-1 min-w-[64px] transition-all py-1",
            isActive ? "text-primary" : "text-on-surface-variant"
          )}
        >
          {({ isActive }) => (
            <>
              <div className={cn(
                "w-12 h-8 rounded-full flex items-center justify-center transition-all",
                isActive ? "bg-secondary-container" : "hover:bg-surface-container-high"
              )}>
                <item.icon className="w-5 h-5" />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider">{item.label}</span>
            </>
          )}
        </NavLink>
      ))}
      </div>
    </nav>
  );
}
