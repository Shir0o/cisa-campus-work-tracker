import React from 'react';
import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Kanban, 
  Users, 
  UserCheck 
} from 'lucide-react';
import { cn } from '../../lib/utils';

export default function MobileNav() {
  const navItems = [
    { icon: LayoutDashboard, label: 'Home', href: '/' },
    { icon: Kanban, label: 'Board', href: '/board' },
    { icon: Users, label: 'People', href: '/directory' },
    { icon: UserCheck, label: 'Admin', href: '/attendance' },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-surface-container-low border-t border-outline-variant flex items-center justify-around px-2 z-50 animate-in slide-in-from-bottom duration-300">
      {navItems.map((item) => (
        <NavLink
          key={item.href}
          to={item.href}
          className={({ isActive }) => cn(
            "flex flex-col items-center gap-1 min-w-[64px] transition-all",
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
    </nav>
  );
}
