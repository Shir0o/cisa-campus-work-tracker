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
  LogOut,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { cn } from '../../lib/utils';

import { useAuth } from '../AuthProvider';

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export default function Sidebar({ isOpen, onClose, isCollapsed, onToggleCollapse }: SidebarProps) {
  const { logOut, isAdmin } = useAuth();
  
  const navItems = [
    { icon: LayoutDashboard, label: 'Dashboard', href: '/' },
    { icon: Kanban, label: 'Status', href: '/board' },
    { icon: Users, label: 'Contacts', href: '/directory' },
    { icon: UserCheck, label: 'Attendance', href: '/attendance' },
  ];

  return (
    <>
      {/* Mobile Overlay */}
      <div 
        className={cn(
          "fixed inset-0 bg-black/40 z-40 transition-opacity lg:hidden",
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />

      <motion.nav 
        initial={false}
        animate={{ width: isCollapsed ? 80 : 288 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className={cn(
          "bg-surface-container-low h-screen flex-col border-r border-outline-variant fixed left-0 top-0 bottom-0 z-50 pt-4 pb-6 transition-colors duration-300 flex px-3 hidden lg:flex overflow-hidden"
        )}
      >
        {/* Brand Header */}
        <div className={cn(
          "mb-8 flex items-center px-3 transition-all h-10",
          isCollapsed ? "justify-center md:px-0" : "justify-between"
        )}>
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-10 h-10 min-w-[40px] rounded-xl bg-[#4A00E0] flex items-center justify-center shadow-md overflow-hidden border border-[#FFF59D]/20 shrink-0">
              <img 
                src="/logo.svg" 
                alt="Campus Hub" 
                className="w-full h-full object-contain"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                  if (target.parentElement) {
                    target.parentElement.classList.add('bg-primary-container');
                    target.parentElement.innerHTML = '<span class="text-[10px] text-primary font-bold">CH</span>';
                  }
                }}
              />
            </div>
            <motion.div 
              initial={false}
              animate={{ opacity: isCollapsed ? 0 : 1, width: isCollapsed ? 0 : 'auto', marginLeft: isCollapsed ? 0 : 12 }}
              transition={{ duration: 0.2 }}
              className="whitespace-nowrap overflow-hidden"
            >
              <h2 className="text-lg font-black text-primary leading-tight">Campus Hub</h2>
              <p className="text-xs text-on-surface-variant opacity-80">{isAdmin ? 'Admin' : 'Community Manager'}</p>
            </motion.div>
          </div>
        </div>

        {/* New Contact Button */}
        <div className="mb-6 px-1">
          <button className={cn(
            "bg-primary text-on-primary rounded-full font-semibold flex items-center justify-center transition-all active:scale-95 shadow-sm px-0 h-12 overflow-hidden w-full",
            isCollapsed ? "px-0" : "px-6"
          )}>
            <PlusCircle className="w-5 h-5 shrink-0" />
            <motion.span 
              initial={false}
              animate={{ opacity: isCollapsed ? 0 : 1, width: isCollapsed ? 0 : 'auto', marginLeft: isCollapsed ? 0 : 8 }}
              transition={{ duration: 0.2 }}
              className="whitespace-nowrap overflow-hidden"
            >
              New Contact
            </motion.span>
          </button>
        </div>

        {/* Main Nav Items */}
        <div className="flex-1 space-y-1 overflow-hidden">
          {navItems.map((item) => (
            <NavLink
              key={item.href}
              to={item.href}
              onClick={onClose}
              className={({ isActive }) => cn(
                "flex items-center rounded-full transition-all duration-200 ease-in-out font-medium h-12",
                isCollapsed ? "justify-center px-0 w-12 mx-auto" : "gap-0 px-4",
                isActive 
                  ? "bg-secondary-container text-on-secondary-container" 
                  : "text-on-surface-variant hover:bg-surface-container-high"
              )}
              title={isCollapsed ? item.label : undefined}
            >
              <item.icon className={cn("w-5 h-5 min-w-[20px] shrink-0", item.href === window.location.pathname ? "fill-current" : "")} />
              <motion.span 
                initial={false}
                animate={{ opacity: isCollapsed ? 0 : 1, width: isCollapsed ? 0 : 'auto', marginLeft: isCollapsed ? 0 : 12 }}
                transition={{ duration: 0.2 }}
                className="whitespace-nowrap overflow-hidden"
              >
                {item.label}
              </motion.span>
            </NavLink>
          ))}
        </div>

        {/* Footer Nav */}
        <div className="mt-auto border-t border-outline-variant pt-4 space-y-1 overflow-hidden">
          <NavLink
            to="/settings"
            onClick={onClose}
            className={({ isActive }) => cn(
              "flex items-center rounded-full transition-all duration-200 ease-in-out font-medium h-12",
              isCollapsed ? "justify-center px-0 w-12 mx-auto" : "gap-0 px-4",
              isActive 
                ? "bg-secondary-container text-on-secondary-container" 
                : "text-on-surface-variant hover:bg-surface-container-high"
            )}
            title={isCollapsed ? "Settings" : undefined}
          >
            <Settings className="w-5 h-5 min-w-[20px] shrink-0" />
            <motion.span 
              initial={false}
              animate={{ opacity: isCollapsed ? 0 : 1, width: isCollapsed ? 0 : 'auto', marginLeft: isCollapsed ? 0 : 12 }}
              transition={{ duration: 0.2 }}
              className="whitespace-nowrap overflow-hidden"
            >
              Settings
            </motion.span>
          </NavLink>

          <button
            onClick={logOut}
            className={cn(
              "flex items-center rounded-full transition-all duration-200 ease-in-out font-medium w-full text-left h-12 text-on-surface-variant hover:bg-error/10 hover:text-error cursor-pointer",
              isCollapsed ? "justify-center px-0 w-12 mx-auto" : "gap-0 px-4"
            )}
            title={isCollapsed ? "Log out" : undefined}
          >
            <LogOut className="w-5 h-5 min-w-[20px] shrink-0" />
            <motion.span 
              initial={false}
              animate={{ opacity: isCollapsed ? 0 : 1, width: isCollapsed ? 0 : 'auto', marginLeft: isCollapsed ? 0 : 12 }}
              transition={{ duration: 0.2 }}
              className="whitespace-nowrap overflow-hidden"
            >
              Log out
            </motion.span>
          </button>

          {/* Collapse Toggle Button - Desktop Only */}
          <button
            onClick={onToggleCollapse}
            className="hidden lg:flex items-center rounded-full transition-all duration-200 ease-in-out font-medium w-full text-left h-12 text-on-surface-variant hover:bg-surface-container-highest mt-1 px-4 cursor-pointer gap-0"
            style={{ paddingLeft: isCollapsed ? '0' : undefined, paddingRight: isCollapsed ? '0' : undefined, justifyContent: isCollapsed ? 'center' : undefined }}
          >
            {isCollapsed ? (
              <ChevronRight className="w-5 h-5 min-w-[20px] shrink-0" />
            ) : (
              <div className="flex items-center gap-3">
                <ChevronLeft className="w-5 h-5 min-w-[20px] shrink-0" />
                <motion.span 
                  initial={false}
                  animate={{ opacity: isCollapsed ? 0 : 1, width: isCollapsed ? 'auto' : 'auto' }}
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
