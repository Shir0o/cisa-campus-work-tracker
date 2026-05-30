import React, { useState, useRef, useEffect } from 'react';
import { Search, Bell, Settings, LogOut, Menu } from 'lucide-react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../AuthProvider';
import { getUserAvatar, cn } from '../../lib/utils';
import { useLayout } from '../../App';
import GlobalSearch from './GlobalSearch';
import NotificationCenter from './NotificationCenter';

export default function TopBar() {
  const { user, logOut } = useAuth();
  const { isSidebarCollapsed, setIsMobileMenuOpen } = useLayout();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="bg-surface h-16 border-b border-outline-variant px-4 lg:px-6 flex items-center gap-4 sticky top-0 z-30">
      {/* Mobile Logo/Title */}
      <div className="flex lg:hidden items-center gap-2 ml-1">
        <button 
          onClick={() => setIsMobileMenuOpen(true)}
          className="p-2 -ml-2 text-on-surface hover:bg-surface-container-high rounded-full focus:outline-none transition-colors"
        >
          <Menu className="w-5 h-5" />
        </button>
        <Link to="/" className="hidden items-center gap-2 hover:opacity-80 transition-opacity">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center overflow-hidden">
            <img 
              src="/logo.svg" 
              alt="CCWT" 
              className="w-full h-full object-contain"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
                if (target.parentElement) {
                  target.parentElement.innerHTML = '<span class="text-[8px] text-primary font-bold">CCWT</span>';
                }
              }}
            />
          </div>
          <span className="font-black text-primary text-sm tracking-tight sm:inline">CISA Campus Work Tracker</span>
        </Link>
      </div>

      {/* Search Bar - Now responsive instead of hidden */}
      <GlobalSearch />

      <div className="flex-1" />

      {/* Notifications & Profile */}
      <div className="flex items-center gap-1 sm:gap-2 lg:gap-4">
        <NotificationCenter />
        
        <div className="relative" ref={dropdownRef}>
          <button 
            onClick={() => setIsProfileOpen(!isProfileOpen)}
            className="w-10 h-10 rounded-full overflow-hidden border border-outline-variant hover:ring-2 hover:ring-primary/20 transition-all focus:outline-none"
          >
            <img 
              src={getUserAvatar(user?.photoURL)} 
              alt="Profile"
              className="w-full h-full object-cover"
            />
          </button>

          <AnimatePresence>
            {isProfileOpen && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                className="absolute right-0 mt-2 w-56 bg-surface-container-high rounded-2xl shadow-xl border border-outline-variant py-2 z-50"
              >
                <div className="px-4 py-3 border-b border-outline-variant mb-1">
                  <p className="text-sm font-bold text-on-surface truncate">{user?.displayName || 'User'}</p>
                  <p className="text-xs text-on-surface-variant truncate">{user?.email}</p>
                </div>

                <Link 
                  to="/settings" 
                  onClick={() => setIsProfileOpen(false)}
                  className="flex items-center gap-3 px-4 py-2 text-sm text-on-surface-variant hover:bg-surface-container-highest transition-colors"
                >
                  <Settings className="w-4 h-4" />
                  Settings
                </Link>

                <button 
                  onClick={() => {
                    setIsProfileOpen(false);
                    logOut();
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2 text-sm text-error hover:bg-error/10 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Log out
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}
