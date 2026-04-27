import React from 'react';
import { Search, Bell, Menu } from 'lucide-react';
import { useAuth } from '../AuthProvider';
import { getUserAvatar } from '../../lib/utils';

export default function TopBar({ onMenuClick }: { onMenuClick?: () => void }) {
  const { user } = useAuth();

  return (
    <header className="bg-surface h-16 border-b border-outline-variant px-4 md:px-6 flex items-center justify-between sticky top-0 z-30">
      {/* Mobile Brand */}
      <div className="md:hidden flex items-center gap-3">
        <span className="text-lg font-bold text-primary truncate">Campus Hub</span>
      </div>

      {/* Desktop Search */}
      <div className="hidden md:flex flex-1 max-w-xl">
        <div className="relative flex items-center w-full h-10 rounded-full bg-surface-container-high focus-within:bg-secondary-container/30 focus-within:shadow-sm transition-all group">
          <div className="grid place-items-center h-full w-12 text-on-surface-variant group-focus-within:text-primary">
            <Search className="w-5 h-5" />
          </div>
          <input
            type="text"
            className="peer h-full w-full outline-none text-sm text-on-surface bg-transparent pr-4 font-medium"
            placeholder="Search contacts, companies, or tags..."
          />
        </div>
      </div>

      {/* Notifications & Profile */}
      <div className="flex items-center gap-2 md:gap-4">
        <button className="w-10 h-10 rounded-full hover:bg-surface-container-highest flex items-center justify-center text-on-surface-variant transition-colors relative">
          <Bell className="w-5 h-5" />
          <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-error rounded-full"></span>
        </button>
        <div className="w-8 h-8 rounded-full overflow-hidden border border-outline-variant">
          <img 
            src={getUserAvatar(user?.photoURL)} 
            alt="Profile"
            className="w-full h-full object-cover"
          />
        </div>
      </div>
    </header>
  );
}
