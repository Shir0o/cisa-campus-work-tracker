import React from 'react';
import { 
  Search, 
  Filter, 
  Download, 
  MoreVertical, 
  Mail, 
  Phone,
  Tag,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ArrowDown
} from 'lucide-react';
import { motion } from 'motion/react';
import { CONTACTS } from '../constants';
import { cn } from '../lib/utils';
import { useLayout } from '../App';

export default function Directory() {
  const { isSidebarCollapsed } = useLayout();

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="p-4 sm:p-6 md:p-8 flex flex-col gap-4 sm:gap-6 h-full min-w-0"
    >
      {/* Header Info */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-normal text-on-background mb-1">Contacts</h2>
          <p className="text-sm text-on-surface-variant">Manage your 1,248 active contacts across all campaigns.</p>
        </div>
        <div className="flex gap-3">
          <button className="flex-1 md:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl border border-outline text-primary hover:bg-surface-container-highest transition-all font-semibold text-sm">
            <Filter className="w-4 h-4" />
            Filter
          </button>
          <button className="flex-1 md:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-secondary-container text-on-secondary-container hover:bg-opacity-90 transition-all font-semibold text-sm shadow-sm">
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
      </div>

      {/* Table Surface */}
      <div className="bg-surface-container rounded-2xl overflow-hidden flex-1 flex flex-col border border-outline-variant/30 shadow-sm min-w-0">
        {/* Controls */}
        <div className="h-16 px-4 sm:px-6 flex items-center justify-between border-b border-surface-variant bg-surface-container-low/50">
          <div className="flex items-center gap-3 sm:gap-6">
            <label className="flex items-center gap-2 sm:gap-3 cursor-pointer group">
              <div className="w-4 h-4 sm:w-5 sm:h-5 rounded border-2 border-outline group-hover:border-primary transition-colors flex items-center justify-center">
                {/* Empty check */}
              </div>
              <span className="text-xs sm:text-sm font-bold text-on-surface-variant select-none">Select All</span>
            </label>
            <div className="h-6 w-px bg-outline-variant hidden xs:block"></div>
            <div className="hidden xs:flex items-center gap-2 sm:gap-4 text-on-surface-variant">
              <button className="hover:text-primary transition-colors p-1.5 rounded-full hover:bg-surface-container-highest" title="Tag Selected">
                <Tag className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
              <button className="hover:text-primary transition-colors p-1.5 rounded-full hover:bg-surface-container-highest" title="Email Selected">
                <Mail className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
              <button className="hover:text-error transition-colors p-1.5 rounded-full hover:bg-error-container" title="Delete Selected">
                <Trash2 className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 text-on-surface-variant">
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-widest">1-50</span>
            <div className="flex gap-0.5 sm:gap-1">
              <button className="p-1 rounded-full hover:bg-surface-container-highest disabled:opacity-30"><ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" /></button>
              <button className="p-1 rounded-full hover:bg-surface-container-highest"><ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" /></button>
            </div>
          </div>
        </div>

        {/* Scrollable Area */}
        <div className="flex-1 overflow-auto no-scrollbar">
          <table className="w-full text-left border-collapse table-fixed">
            <thead className="bg-surface-container-low sticky top-0 z-10 border-b border-surface-variant shadow-sm">
              <tr>
                <th className="py-4 px-4 sm:px-6 w-12 sm:w-16"></th>
                <th className="py-4 px-2 sm:px-4 text-xs font-black uppercase tracking-wider text-on-surface-variant cursor-pointer hover:text-on-surface group whitespace-nowrap w-auto">
                  Name <ArrowDown className="w-3 h-3 inline-block ml-1 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap" />
                </th>
                <th className={cn(
                  "py-4 px-4 text-xs font-black uppercase tracking-wider text-on-surface-variant w-1/4",
                  isSidebarCollapsed ? "table-cell" : "hidden md:table-cell"
                )}>Company</th>
                <th className={cn(
                  "py-4 px-4 text-xs font-black uppercase tracking-wider text-on-surface-variant w-1/4",
                  isSidebarCollapsed ? "hidden lg:table-cell" : "hidden lg:table-cell"
                )}>Contact Info</th>
                <th className="py-4 px-2 sm:px-4 text-xs font-black uppercase tracking-wider text-on-surface-variant w-20 sm:w-32">Stage</th>
                <th className={cn(
                  "py-4 px-4 text-xs font-black uppercase tracking-wider text-on-surface-variant text-right w-24 sm:w-28",
                  isSidebarCollapsed ? "table-cell" : "hidden sm:table-cell"
                )}>Last Seen</th>
                <th className="py-4 px-4 sm:px-6 w-12 sm:w-16"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/30 bg-surface-container-lowest">
              {CONTACTS.map((contact) => (
                <tr key={contact.id} className={cn(
                  "hover:bg-surface-container-low transition-colors group cursor-pointer",
                  contact.id === '3' && "bg-primary-container/[0.03]"
                )}>
                  <td className="py-4 px-4 sm:px-6">
                    <div className="w-4 h-4 sm:w-5 sm:h-5 rounded border-2 border-outline group-hover:border-primary transition-colors flex items-center justify-center opacity-40 group-hover:opacity-100"></div>
                  </td>
                  <td className="py-4 px-2 sm:px-4 overflow-hidden">
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                      {contact.avatar ? (
                        <img src={contact.avatar} alt={contact.name} className="w-8 h-8 sm:w-10 sm:h-10 rounded-full border border-outline-variant shrink-0 object-cover shadow-sm" />
                      ) : (
                        <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center font-bold shrink-0 text-xs sm:text-sm">
                          {contact.initials}
                        </div>
                      )}
                      <div className="min-w-0 overflow-hidden">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <p className="text-sm font-bold text-on-surface truncate">{contact.name}</p>
                          {contact.id === '3' && <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-primary shrink-0" title="New Activity" />}
                        </div>
                        <p className="text-[10px] sm:text-xs text-on-surface-variant opacity-80 truncate">{contact.role}</p>
                      </div>
                    </div>
                  </td>
                  <td className={cn(
                    "py-4 px-4 overflow-hidden",
                    isSidebarCollapsed ? "table-cell" : "hidden md:table-cell"
                  )}>
                    <p className="text-sm font-medium text-on-surface truncate">{contact.company}</p>
                    <p className="text-xs text-on-surface-variant opacity-80 truncate">{contact.location}</p>
                  </td>
                  <td className="py-4 px-4 hidden lg:table-cell overflow-hidden">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-on-surface-variant hover:text-primary transition-colors group/info cursor-default overflow-hidden">
                        <Mail className="w-3.5 h-3.5 opacity-60 group-hover/info:opacity-100 shrink-0" />
                        <span className="text-xs font-medium truncate">{contact.email}</span>
                      </div>
                      <div className="flex items-center gap-2 text-on-surface-variant cursor-default overflow-hidden">
                        <Phone className="w-3.5 h-3.5 opacity-60 shrink-0" />
                        <span className="text-xs font-medium truncate">{contact.phone}</span>
                      </div>
                    </div>
                  </td>
                  <td className="py-4 px-2 sm:px-4">
                    <span className={cn(
                      "inline-flex items-center px-2 sm:px-3 py-1 rounded-full text-[9px] sm:text-[10px] font-black uppercase tracking-tighter whitespace-nowrap overflow-hidden",
                      contact.status === 'Meeting Scheduled' ? "bg-secondary-container text-on-secondary-container" :
                      contact.status === 'Email Sent' ? "bg-tertiary-container text-on-tertiary-container" :
                      contact.status === 'Follow Up Required' ? "bg-error-container text-on-error-container" :
                      "bg-surface-variant text-on-surface-variant"
                    )}>
                      <span className="truncate">{contact.status || contact.stage}</span>
                    </span>
                  </td>
                  <td className={cn(
                    "py-4 px-4 text-right overflow-hidden",
                    isSidebarCollapsed ? "table-cell" : "hidden sm:table-cell"
                  )}>
                    <p className={cn(
                      "text-sm whitespace-nowrap truncate",
                      contact.id === '3' ? "text-primary font-bold" : "text-on-surface font-medium"
                    )}>{contact.lastSeen}</p>
                  </td>
                  <td className="py-4 px-4 sm:px-6 text-right">
                    <button className="p-2 rounded-full text-on-surface-variant hover:bg-surface-variant transition-opacity opacity-0 group-hover:opacity-100">
                      <MoreVertical className="w-5 h-5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  );
}
