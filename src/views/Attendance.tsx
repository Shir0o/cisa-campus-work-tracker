import React from 'react';
import { 
  Users, 
  CheckCircle2, 
  AlertTriangle, 
  Filter, 
  Download,
  CalendarDays,
  X
} from 'lucide-react';
import { motion } from 'motion/react';
import { CONTACTS } from '../constants';
import { cn } from '../lib/utils';
import { useLayout } from '../App';

export default function Attendance() {
  const { isSidebarCollapsed } = useLayout();
  const dates = ['Oct 12', 'Oct 19', 'Oct 26', 'Nov 02', 'Nov 09'];
  const events = [
    'Kickoff Event',
    'Workshop A',
    'Workshop B',
    'Check-in',
    'Closing Gala'
  ];

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="p-6 md:p-8 space-y-6"
    >
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-normal text-on-surface mb-1">Attendance Tracker</h1>
          <p className="text-body-md text-on-surface-variant flex items-center gap-2">
            <CalendarDays className="w-4 h-4" />
            Fall 2023 Cohort • 24 Contacts
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 px-4 py-2 rounded-xl border border-outline text-on-surface font-semibold text-sm hover:bg-surface-container-highest transition-colors">
            <Filter className="w-4 h-4" />
            Filter
          </button>
          <button className="flex items-center gap-2 px-4 py-2 rounded-xl bg-secondary-container text-on-secondary-container font-semibold text-sm hover:bg-secondary-fixed-dim transition-colors">
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-surface-container rounded-2xl p-4 flex items-center gap-4 border border-outline-variant/30">
          <div className="w-12 h-12 rounded-full bg-primary-fixed flex items-center justify-center text-on-primary-fixed">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[10px] text-on-surface-variant uppercase tracking-widest font-bold">Total Reach</p>
            <p className="text-2xl font-medium text-on-surface">24</p>
          </div>
        </div>
        <div className="bg-surface-container rounded-2xl p-4 flex items-center gap-4 border border-outline-variant/30">
          <div className="w-12 h-12 rounded-full bg-tertiary-fixed flex items-center justify-center text-on-tertiary-fixed">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[10px] text-on-surface-variant uppercase tracking-widest font-bold">Avg Attendance</p>
            <p className="text-2xl font-medium text-on-surface">78%</p>
          </div>
        </div>
        <div className="bg-surface-container rounded-2xl p-4 flex items-center gap-4 border border-outline-variant/30">
          <div className="w-12 h-12 rounded-full bg-error-container flex items-center justify-center text-on-error-container">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[10px] text-on-surface-variant uppercase tracking-widest font-bold">At Risk (&lt; 50%)</p>
            <p className="text-2xl font-medium text-on-surface">3</p>
          </div>
        </div>
      </div>

      {/* Attendance Table */}
      <div className="bg-surface-container rounded-2xl border border-outline-variant/50 flex flex-col overflow-hidden shadow-sm">
        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-high border-b border-outline-variant">
                <th className="p-3 sm:p-4 sticky left-0 z-20 bg-surface-container-high border-r border-outline-variant min-w-[120px] sm:w-72">
                  <div className="text-xs sm:text-sm font-semibold text-on-surface-variant">Contact</div>
                </th>
                {dates.map((date, idx) => (
                  <th key={idx} className={cn(
                    "p-2 sm:p-4 text-center border-r border-outline-variant/50 group cursor-pointer hover:bg-surface-container-highest transition-colors",
                    idx < dates.length - 2 && (isSidebarCollapsed ? "table-cell" : "hidden sm:table-cell")
                  )}>
                    <div className="text-xs sm:text-sm font-bold text-on-surface">{date}</div>
                    <div className="text-[9px] sm:text-[11px] text-on-surface-variant mt-0.5 group-hover:text-primary transition-colors leading-tight">{events[idx]}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/50 bg-surface-container-lowest">
              {CONTACTS.filter(c => c.attendance).map((contact) => (
                <tr key={contact.id} className={cn(
                  "hover:bg-surface-variant/20 transition-colors group",
                  contact.name === 'Sarah Jenkins' && "bg-error-container/5"
                )}>
                  <td className="sticky left-0 z-10 bg-surface-container-lowest group-hover:bg-surface-container-low border-r border-outline-variant p-3 sm:p-4 transition-colors">
                    <div className="flex items-center gap-2 sm:gap-3">
                      {contact.avatar ? (
                        <img src={contact.avatar} alt={contact.name} className="w-8 h-8 sm:w-10 sm:h-10 rounded-full border border-outline-variant shrink-0 object-cover" />
                      ) : (
                        <div className={cn(
                          "w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center font-bold shrink-0 text-xs sm:text-base",
                          contact.id === '1' ? "bg-secondary-container text-on-secondary-container" : "bg-primary-fixed text-on-primary-fixed"
                        )}>{contact.initials}</div>
                      )}
                      <div className="min-w-0">
                        <p className="text-xs sm:text-sm font-semibold text-on-surface truncate flex items-center gap-1 sm:gap-2">
                          {contact.name}
                          {contact.name === 'Sarah Jenkins' && <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-error" />}
                        </p>
                        <p className="text-[10px] sm:text-xs text-on-surface-variant truncate">{contact.role}</p>
                      </div>
                    </div>
                  </td>
                  {dates.map((date, idx) => {
                    const status = contact.attendance?.[date];
                    return (
                      <td key={idx} className={cn(
                        "p-2 sm:p-4 text-center border-r border-outline-variant/50",
                        idx < dates.length - 2 && (isSidebarCollapsed ? "table-cell" : "hidden sm:table-cell")
                      )}>
                        <div className="flex justify-center">
                          {status === true ? (
                            <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-md bg-primary text-white flex items-center justify-center">
                              <CheckCircle2 className="w-3 h-3 sm:w-4 sm:h-4" />
                            </div>
                          ) : status === 'absent' ? (
                            <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-md bg-error-container text-on-error-container flex items-center justify-center">
                              <X className="w-3 h-3 sm:w-4 sm:h-4" />
                            </div>
                          ) : (
                            <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-md border border-outline transition-colors hover:border-primary cursor-pointer" />
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  );
}
