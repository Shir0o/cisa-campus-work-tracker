import React from 'react';
import { 
  Search, 
  Filter, 
  MoreHorizontal, 
  Mail, 
  History,
  AlertCircle,
  CalendarCheck
} from 'lucide-react';
import { motion } from 'motion/react';
import { CONTACTS } from '../constants';
import { cn } from '../lib/utils';
import { Contact } from '../types';
import { useLayout } from '../App';

export default function OutreachBoard() {
  const { isSidebarCollapsed } = useLayout();
  const stages = [
    { label: 'First Contact', color: 'bg-primary-fixed-dim', stage: 'First Contact' },
    { label: 'Second Contact', color: 'bg-primary', stage: 'Second Contact' },
    { label: 'Regular', color: 'bg-secondary', stage: 'Regular' },
  ];

  const getStageContacts = (stage: string) => CONTACTS.filter(c => c.stage === stage);

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex flex-col h-full bg-background overflow-hidden"
    >
      {/* Header */}
      <div className="px-4 py-4 sm:px-6 sm:py-6 lg:px-8 border-b border-surface-variant flex flex-col sm:flex-row sm:items-center justify-between shrink-0 bg-surface/50 backdrop-blur-md sticky top-0 z-20 gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-normal text-on-surface">Status</h2>
          <p className="text-xs sm:text-sm text-on-surface-variant mt-1">Manage contact progression and relationship stages.</p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="relative flex-1 sm:flex-initial">
            <Search className="w-4 h-4 sm:w-5 sm:h-5 absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
            <input 
              type="text" 
              className="pl-9 pr-4 py-2 rounded-full border border-outline-variant bg-surface-container-lowest text-on-surface focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-xs sm:text-sm w-full sm:w-64"
              placeholder="Search board..."
            />
          </div>
          <button className="p-2 rounded-full hover:bg-surface-variant text-on-surface-variant shrink-0">
            <Filter className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Kanban Board */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-4 sm:p-6 lg:p-8 custom-scrollbar">
        <div className="flex gap-4 sm:gap-6 items-start h-full pr-8">
          {stages.map((stageInfo) => {
            const boardContacts = getStageContacts(stageInfo.stage);
            return (
              <div key={stageInfo.stage} className="flex flex-col w-[280px] sm:w-[320px] shrink-0 bg-surface-container rounded-2xl border border-outline-variant/20 max-h-full">
                {/* Column Header */}
                <div className="p-4 flex items-center justify-between border-b border-surface-variant">
                  <div className="flex items-center gap-2">
                    <span className={cn("w-3 h-3 rounded-full", stageInfo.color)}></span>
                    <h3 className="text-sm font-bold text-on-surface">{stageInfo.label}</h3>
                    <span className="bg-surface-container-highest text-on-surface-variant px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-tight">
                      {boardContacts.length}
                    </span>
                  </div>
                  <button className="text-on-surface-variant hover:bg-surface-variant p-1 rounded-full">
                    <MoreHorizontal className="w-5 h-5" />
                  </button>
                </div>
 
                {/* Column Content */}
                <div className="p-3 overflow-y-auto space-y-3 custom-scrollbar min-h-[100px]">
                  {boardContacts.length > 0 ? boardContacts.map((contact) => (
                    <KanbanCard key={contact.id} contact={contact} />
                  )) : (
                    <div className="flex-1 flex items-center justify-center py-10">
                      <p className="text-on-surface-variant text-sm italic opacity-60">No contacts in this stage</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}

interface KanbanCardProps {
  contact: Contact;
  key?: string | number;
}

function KanbanCard({ contact }: KanbanCardProps) {
  return (
    <div className={cn(
      "bg-surface-container-lowest p-4 rounded-xl shadow-sm cursor-grab hover:shadow-md transition-all border border-outline-variant/30 flex flex-col gap-3 group active:cursor-grabbing",
      contact.stage === 'Regular' && "border-l-4 border-l-secondary"
    )}>
      <div className="flex justify-between items-start">
        <h4 className="text-sm font-bold text-on-surface leading-tight">{contact.name}</h4>
        {contact.avatar ? (
          <img src={contact.avatar} alt={contact.name} className="w-8 h-8 rounded-full object-cover shadow-sm" />
        ) : (
          <div className="w-8 h-8 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center text-[10px] font-bold">
            {contact.initials}
          </div>
        )}
      </div>
      
      {contact.notes && (
        <p className="text-xs text-on-surface-variant leading-relaxed line-clamp-2 italic">
          {contact.notes}
        </p>
      )}

      {contact.status && (
        <div className="flex">
          <span className={cn(
            "px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1",
            contact.status === 'Email Sent' ? "bg-secondary-container text-on-secondary-container" : "bg-error-container text-on-error-container"
          )}>
            {contact.status === 'Email Sent' ? <Mail className="w-3 h-3" /> : <CalendarCheck className="w-3 h-3" />}
            {contact.status}
          </span>
        </div>
      )}

      <div className="flex items-center justify-between pt-2 border-t border-outline-variant/20 text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">
        <div className="flex items-center gap-1">
          <History className="w-3 h-3" />
          {contact.lastSeen}
        </div>
        <span>{contact.createdAt ? `Added: ${contact.createdAt}` : 'Lead'}</span>
      </div>
    </div>
  );
}
