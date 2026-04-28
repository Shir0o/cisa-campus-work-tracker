import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Filter, 
  MoreHorizontal, 
  Mail, 
  History,
  AlertCircle,
  CalendarCheck,
  Plus,
  Settings2,
  X,
  Palette
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { CONTACTS } from '../constants';
import { cn } from '../lib/utils';
import { Contact, Stage } from '../types';
import { useLayout } from '../App';
import { useAuth } from '../components/AuthProvider';
import { 
  collection, 
  onSnapshot, 
  query, 
  orderBy, 
  addDoc, 
  doc, 
  deleteDoc,
  updateDoc 
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';

export default function OutreachBoard() {
  const { isSidebarCollapsed } = useLayout();
  const { isAdmin } = useAuth();
  const [stages, setStages] = useState<Stage[]>([]);
  const [showAddStage, setShowAddStage] = useState(false);
  const [newStageName, setNewStageName] = useState('');
  const [newStageColor, setNewStageColor] = useState('bg-primary');
  const [loading, setLoading] = useState(true);

  const colors = [
    { name: 'Primary', class: 'bg-primary' },
    { name: 'Secondary', class: 'bg-secondary' },
    { name: 'Error', class: 'bg-error' },
    { name: 'Success', class: 'bg-success' },
    { name: 'Info', class: 'bg-info' },
    { name: 'Warm', class: 'bg-tertiary' },
    { name: 'Dim', class: 'bg-primary-fixed-dim' },
  ];

  useEffect(() => {
    const q = query(collection(db, 'stages'), orderBy('order', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const stagesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Stage[];
      
      if (stagesData.length === 0 && isAdmin) {
        setLoading(true);
        const defaultStages = [
          { label: 'First Contact', color: 'bg-primary-fixed-dim', order: 0 },
          { label: 'Second Contact', color: 'bg-primary', order: 1 },
          { label: 'Regular', color: 'bg-secondary', order: 2 },
        ];
        
        Promise.all(defaultStages.map(s => addDoc(collection(db, 'stages'), s)))
          .catch(err => handleFirestoreError(err, OperationType.CREATE, 'stages'))
          .finally(() => setLoading(false));
      }
      
      setStages(stagesData);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'stages');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [isAdmin]);

  const handleAddStage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStageName.trim() || !isAdmin) return;

    try {
      await addDoc(collection(db, 'stages'), {
        label: newStageName,
        color: newStageColor,
        order: stages.length,
      });
      setNewStageName('');
      setShowAddStage(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'stages');
    }
  };

  const getStageContacts = (stageLabel: string) => CONTACTS.filter(c => c.stage === stageLabel);

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex flex-col h-full bg-background overflow-hidden"
    >
      {/* Header */}
      <div className="px-4 py-4 sm:px-6 sm:py-6 lg:px-8 border-b border-surface-variant flex flex-col sm:flex-row sm:items-center justify-between shrink-0 bg-surface/50 backdrop-blur-md sticky top-0 z-20 gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-normal text-on-surface">Stage</h2>
          <p className="text-xs sm:text-sm text-on-surface-variant mt-1">Manage contact progression and relationship stages.</p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          {isAdmin && (
            <button 
              onClick={() => setShowAddStage(true)}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-on-primary rounded-full text-sm font-bold hover:shadow-lg transition-all"
            >
              <Plus className="w-4 h-4" /> Add Stage
            </button>
          )}
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
          {stages.length > 0 ? stages.map((stageInfo) => {
            const boardContacts = getStageContacts(stageInfo.label);
            return (
              <div key={stageInfo.id} className="flex flex-col w-[280px] sm:w-[320px] shrink-0 bg-surface-container rounded-2xl border border-outline-variant/20 max-h-full">
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
          }) : !loading && (
            <div className="flex-1 flex flex-col items-center justify-center py-20 text-center">
              <Settings2 className="w-12 h-12 text-on-surface-variant opacity-20 mb-4" />
              <h3 className="text-lg font-bold text-on-surface">No stages configured</h3>
              <p className="text-sm text-on-surface-variant mt-1">
                {isAdmin ? 'Click "Add Stage" to start building your workflow.' : 'Workflow stages haven\'t been set up yet.'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Add Stage Modal */}
      <AnimatePresence>
        {showAddStage && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddStage(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-surface-container-high rounded-3xl shadow-2xl overflow-hidden border border-outline-variant"
            >
              <div className="p-6 border-b border-outline-variant flex items-center justify-between bg-surface/50 backdrop-blur-md">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-primary-container text-on-primary-container flex items-center justify-center">
                    <Plus className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-on-surface">New Stage</h2>
                    <p className="text-xs text-on-surface-variant">Add a column to your board</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowAddStage(false)}
                  className="p-2 rounded-full hover:bg-surface-variant text-on-surface-variant"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleAddStage} className="p-6 space-y-6">
                <div className="space-y-1.5">
                  <label className="text-sm font-bold text-on-surface-variant flex items-center gap-2 px-1">
                    <Palette className="w-4 h-4" /> STAGE NAME
                  </label>
                  <input
                    required
                    autoFocus
                    type="text"
                    value={newStageName}
                    onChange={e => setNewStageName(e.target.value)}
                    className="w-full h-12 px-4 rounded-xl bg-surface-container-highest border border-outline focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-on-surface"
                    placeholder="e.g. Regulars"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-bold text-on-surface-variant flex items-center gap-2 px-1">
                    <Palette className="w-4 h-4" /> COLOR THEME
                  </label>
                  <div className="grid grid-cols-4 gap-3">
                    {colors.map(color => (
                      <button
                        key={color.class}
                        type="button"
                        onClick={() => setNewStageColor(color.class)}
                        className={cn(
                          "h-10 rounded-xl transition-all border-2",
                          color.class,
                          newStageColor === color.class ? "border-on-surface ring-2 ring-primary ring-offset-2 ring-offset-surface" : "border-transparent opacity-60 hover:opacity-100"
                        )}
                        title={color.name}
                      />
                    ))}
                  </div>
                </div>

                <div className="pt-2 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setShowAddStage(false)}
                    className="flex-1 h-12 rounded-xl font-bold text-on-surface-variant hover:bg-surface-variant transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!newStageName.trim()}
                    className="flex-3 h-12 bg-primary text-on-primary rounded-xl font-bold shadow-lg shadow-primary/20 hover:shadow-xl hover:translate-y-[-1px] active:translate-y-[1px] disabled:opacity-50 disabled:translate-y-0 transition-all"
                  >
                    Create Stage
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
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
