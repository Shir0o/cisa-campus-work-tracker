import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Contact,
  Plus,
  UserPlus,
  MessageSquarePlus,
  X
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useAuth } from '../AuthProvider';
import { useLayout } from '../../App';
import { AnimatePresence, motion } from 'motion/react';

export default function MobileNav() {
  const { isAdmin } = useAuth();
  const { openNewContact, openLogInteraction } = useLayout();
  const [isActionsOpen, setIsActionsOpen] = useState(false);

  return (
    <>
      <AnimatePresence>
        {isActionsOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsActionsOpen(false)}
              className="fixed inset-0 bg-scrim/50 z-[80] lg:hidden"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 bg-surface-container-high rounded-t-3xl z-[90] lg:hidden p-6 shadow-2xl border-t border-outline-variant pb-safe"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-on-surface">Quick Actions</h3>
                <button 
                  onClick={() => setIsActionsOpen(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-surface-container hover:bg-surface-container-highest transition-colors"
                >
                  <X className="w-5 h-5 text-on-surface-variant" />
                </button>
              </div>
              <div className="flex flex-col gap-2 mb-4">
                <button
                  onClick={() => {
                    setIsActionsOpen(false);
                    openNewContact();
                  }}
                  className="w-full flex items-center bg-surface p-4 rounded-xl border border-outline-variant hover:border-primary/50 hover:shadow-md transition-all active:scale-95"
                >
                  <span className="font-semibold text-base text-on-surface">New Contact</span>
                </button>
                <button
                  onClick={() => {
                    setIsActionsOpen(false);
                    openLogInteraction();
                  }}
                  className="w-full flex items-center bg-surface p-4 rounded-xl border border-outline-variant hover:border-primary/50 hover:shadow-md transition-all active:scale-95"
                >
                  <span className="font-semibold text-base text-on-surface">Log Interaction</span>
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <nav aria-label="Mobile Navigation" className="lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-surface-container-low border-t border-outline-variant flex items-center justify-around z-50 animate-in slide-in-from-bottom duration-300 pb-safe px-4">
        <NavLink
          to="/"
          className={({ isActive }) => cn(
            "flex flex-col items-center gap-1 min-w-[64px] transition-all py-1",
            isActive && window.location.pathname === '/' ? "text-primary" : "text-on-surface-variant"
          )}
        >
          {({ isActive }) => (
            <>
              <div className={cn(
                "w-12 h-8 rounded-full flex items-center justify-center transition-all",
                isActive && window.location.pathname === '/' ? "bg-secondary-container text-on-secondary-container" : "hover:bg-surface-container-high"
              )}>
                <LayoutDashboard className="w-5 h-5" />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider">Dashboard</span>
            </>
          )}
        </NavLink>

        <button
          onClick={() => setIsActionsOpen(true)}
          className="relative -top-5 w-14 h-14 bg-primary text-on-primary rounded-2xl shadow-lg shadow-primary/25 flex items-center justify-center hover:bg-primary/90 active:scale-95 transition-all outline-none"
          aria-label="Quick Actions"
        >
          <motion.div
            animate={{ rotate: isActionsOpen ? 45 : 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
          >
            <Plus className="w-6 h-6" />
          </motion.div>
        </button>

        <NavLink
          to="/directory"
          className={({ isActive }) => cn(
            "flex flex-col items-center gap-1 min-w-[64px] transition-all py-1",
            isActive && window.location.pathname === '/directory' ? "text-primary" : "text-on-surface-variant"
          )}
        >
          {({ isActive }) => (
            <>
              <div className={cn(
                "w-12 h-8 rounded-full flex items-center justify-center transition-all",
                isActive && window.location.pathname === '/directory' ? "bg-secondary-container text-on-secondary-container" : "hover:bg-surface-container-high"
              )}>
                <Contact className="w-5 h-5" />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider">Contacts</span>
            </>
          )}
        </NavLink>
      </nav>
    </>
  );
}
