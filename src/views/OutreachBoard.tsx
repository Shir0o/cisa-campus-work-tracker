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

export default function OutreachBoard() {
  const stages = [
    { label: 'New', color: 'bg-error', stage: 'New' },
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
      <div className="px-6 py-6 lg:px-8 border-b border-surface-variant flex items-center justify-between shrink-0 bg-surface/50 backdrop-blur-md sticky top-0 z-20">
        <div>
          <h2 className="text-3xl font-normal text-on-surface">Outreach Board</h2>
          <p className="text-sm text-on-surface-variant mt-1">Manage contact progression and relationship stages.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative hidden sm:block">
            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
            <input 
              type="text" 
              className="pl-10 pr-4 py-2 rounded-full border border-outline-variant bg-surface-container-lowest text-on-surface focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-sm w-64"
              placeholder="Search board..."
            />
          </div>
          <button className="p-2 rounded-full hover:bg-surface-variant text-on-surface-variant">
            <Filter className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Kanban Board */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-6 lg:p-8 flex gap-6 items-start no-scrollbar">
        {stages.map((stageInfo) => {
          const boardContacts = getStageContacts(stageInfo.stage);
          return (
            <div key={stageInfo.stage} className="flex flex-col shrink-0 w-80 max-h-full bg-surface-container rounded-2xl border border-outline-variant/20">
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
              <div className="p-3 flex-1 overflow-y-auto space-y-3 no-scrollbar min-h-[200px]">
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
      
      <p className="text-xs text-on-surface-variant leading-relaxed line-clamp-2 italic">
        {contact.id === '1' ? "Referred by Sarah J. interested in upcoming community event." :
         contact.id === '5' ? "Signed up via website form. Asking about volunteer opportunities." :
         contact.id === '6' ? "Sent welcome email and intro packet. Awaiting response." :
         "Attended last 3 meetings. Good candidate for committee lead."}
      </p>

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
          {contact.stage === 'New' ? <AlertCircle className="w-3 h-3 text-error" /> : <History className="w-3 h-3" />}
          {contact.stage === 'New' ? 'Needs Contact' : contact.lastSeen}
        </div>
        <span>{contact.id === '3' || contact.id === '5' ? 'Added: Today' : 'Added: Yesterday'}</span>
      </div>
    </div>
  );
}
