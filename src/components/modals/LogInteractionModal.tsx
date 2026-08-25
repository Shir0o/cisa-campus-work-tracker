import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, 
  X, 
  Check, 
  MessageSquare, 
  Calendar, 
  Clock, 
  Loader2,
  Users,
  Send,
  Phone,
  Coffee,
  Info,
  CalendarDays,
  HeartHandshake,
  Sparkles,
  Trash2,
  Plus
} from 'lucide-react';
import { collection, query, orderBy, onSnapshot, writeBatch, doc, serverTimestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, logActivity, sendNotification } from '../../lib/firebase';
import { isTrainee, fullTimerIds } from '../../lib/walking';
import { applyContactActivityToBatch } from '../../lib/contactActivity';
import { Contact, Task } from '../../types';
import { cn } from '../../lib/utils';
import { useAuth } from '../AuthProvider';
import { useLanguage } from '../LanguageProvider';
import { UsageStats } from '../../lib/usageStats';
import { format } from 'date-fns';

interface LogInteractionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function LogInteractionModal({ isOpen, onClose }: LogInteractionModalProps) {
  const { user, role } = useAuth();
  const { t } = useLanguage();
  if (role === 'viewer') return null;
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Form State
  const [type, setType] = useState<'chat' | 'email' | 'call' | 'meeting'>('chat');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [notes, setNotes] = useState('');

  // Tasks State
  const [tasks, setTasks] = useState<Partial<Task>[]>([]);

  useEffect(() => {
    if (!isOpen) {
      setTasks([]);
      setNotes('');
      setType('chat');
      setSelectedContactIds(new Set());
      setSearchQuery('');
      return;
    }
    const q = query(collection(db, 'contacts'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Contact[];
      setContacts(data);
      setLoading(false);
    }, (error) => {
      setLoading(false);
      handleFirestoreError(error, OperationType.LIST, 'contacts');
    });
    return () => unsubscribe();
  }, [isOpen]);

  const filteredContacts = useMemo(() => {
    const lower = searchQuery.toLowerCase();
    return contacts.filter(c => 
      c.name.toLowerCase().includes(lower) || 
      c.email.toLowerCase().includes(lower) ||
      (c.role && c.role.toLowerCase().includes(lower))
    );
  }, [searchQuery, contacts]);

  const toggleContact = (id: string) => {
    const newSet = new Set(selectedContactIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedContactIds(newSet);
  };

  const selectedContacts = contacts.filter(c => selectedContactIds.has(c.id));

  const removeTask = (index: number) => {
    setTasks(prev => prev.filter((_, i) => i !== index));
  };

  const handleTaskChange = (index: number, field: keyof Task, value: any) => {
    setTasks(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const addTask = () => {
    setTasks(prev => [...prev, { title: '', dueDate: date, priority: 'medium' }]);
  };

  const handleLogInteraction = async () => {
    if (selectedContactIds.size === 0 || !notes.trim() || isSubmitting) return;
    
    setIsSubmitting(true);
    try {
      const batch = writeBatch(db);
      
      for (const contactId of selectedContactIds) {
        const contact = contacts.find(c => c.id === contactId);
        const interactionRef = doc(collection(db, `contacts/${contactId}/interactions`));
        
        batch.set(interactionRef, {
          type,
          dateTime: date,
          content: notes,
          createdAt: serverTimestamp(),
          userId: user?.uid,
          userName: user?.displayName || user?.email?.split('@')[0] || 'Anonymous',
          contactId,
          contactName: contact?.name || 'Unknown'
        });

        // Update contact's derived activity fields (#329)
        const contactRef = doc(db, 'contacts', contactId);
        applyContactActivityToBatch(batch, contactRef, {
          date,
          by: {
            uid: user?.uid || null,
            name: user?.displayName || user?.email?.split('@')[0] || 'Anonymous',
          },
          type: 'interaction',
        });

        // Create tasks
        if (tasks.length > 0) {
          tasks.forEach(task => {
            if (task.title?.trim()) {
              const taskRef = doc(collection(db, 'tasks'));
              batch.set(taskRef, {
                title: task.title,
                dueDate: task.dueDate || date,
                priority: task.priority || 'medium',
                contactId: contactId,
                contactName: contact?.name || 'Unknown',
                assigneeId: user?.uid || null,
                status: 'pending',
                sourceInteractionId: interactionRef.id,
                createdAt: serverTimestamp()
              });
            }
          });
        }
      }

      await batch.commit();

      if (user?.uid) {
        UsageStats.record(user.uid, {
          type: 'create',
          path: typeof window !== 'undefined' ? window.location.pathname : '/',
          role: role || undefined,
          meta: 'interaction',
        });
      }

      // No pairing (#549): when a trainee logs time, the whole full-timer team
      // is pinged, so nothing the team does goes unseen.
      if (isTrainee(user?.uid)) {
        const who = (user?.displayName || 'A trainee').split(' ')[0];
        const snippet = notes.length > 140 ? notes.slice(0, 140).trimEnd() + '…' : notes;
        for (const ftId of fullTimerIds()) {
          for (const contactId of selectedContactIds) {
            const contact = contacts.find(c => c.id === contactId);
            await sendNotification({
              userId: ftId,
              title: `${who} logged time with ${contact?.name || 'someone'}`,
              message: snippet,
              type: 'info',
              targetId: contactId,
            });
          }
        }
      }

      // Log system activity outside batch (helper adds its own doc)
      if (selectedContactIds.size === 1) {
        const contact = contacts.find(c => c.id === Array.from(selectedContactIds)[0]);
        if (contact) {
          logActivity({
            action: 'logged an interaction for',
            targetId: contact.id,
            targetName: contact.name,
            targetType: 'contact',
            type: type === 'meeting' ? 'event' : type === 'chat' ? 'comment' : type,
            description: notes
          });
        }
      } else {
        logActivity({
          action: 'logged a batch interaction for',
          targetId: 'multiple',
          targetName: `${selectedContactIds.size} contacts`,
          targetType: 'interaction',
          type: type === 'meeting' ? 'event' : type === 'chat' ? 'comment' : type,
          description: notes
        });
      }

      onClose();
    } catch (error) {
      console.error('Error logging batch interaction:', error);
      handleFirestoreError(error, OperationType.WRITE, 'batch/interactions');
    } finally {
      setIsSubmitting(false);
    }
  };

  const interactionTypes = [
    { id: 'chat', label: t('modals.message'), icon: MessageSquare, color: 'text-accent bg-primary/10' },
    { id: 'email', label: t('directory.email'), icon: Send, color: 'text-secondary bg-secondary/10' },
    { id: 'call', label: t('modals.call'), icon: Phone, color: 'text-tertiary bg-tertiary/10' },
    { id: 'meeting', label: t('modals.meeting'), icon: Coffee, color: 'text-success bg-success/10' },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-4xl max-h-[90vh] bg-surface-container rounded-[2rem] shadow-2xl overflow-hidden border border-outline-variant flex flex-col"
          >
            {/* Header */}
            <div className="p-6 border-b border-outline-variant flex items-center justify-between bg-surface-container-high/50 backdrop-blur-md">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-primary/10 text-accent rounded-2xl flex items-center justify-center">
                  <HeartHandshake className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-2xl font-semibold text-on-surface">{t('modals.log_interaction')}</h2>
                  <p className="text-xs text-on-surface-variant font-medium">{t('modals.record_activities_multiple')}</p>
                </div>
              </div>
              <button 
                onClick={onClose}
                className="p-2 rounded-full hover:bg-surface-variant transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden flex flex-col lg:flex-row">
              {/* Left Side: Contact Picker */}
              <div className="w-full lg:w-1/2 border-r border-outline-variant/30 flex flex-col min-h-0 bg-surface-container-low/30">
                <div className="p-4 space-y-4">
                   <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
                    <input 
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search to add contacts..."
                      className="w-full h-12 bg-surface-container-low border border-outline/20 rounded-2xl pl-11 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 text-on-surface transition-all"
                    />
                  </div>

                  <AnimatePresence mode="popLayout">
                    {selectedContactIds.size > 0 && (
                      <motion.div 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto no-scrollbar p-1"
                      >
                        {selectedContacts.map(c => (
                          <motion.div 
                            layout
                            key={c.id}
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.8, opacity: 0 }}
                            className="flex items-center gap-1 px-3 py-1 bg-primary/10 text-accent rounded-full text-[10px] font-semibold   border border-accent-line "
                          >
                            {c.name}
                            <button onClick={() => toggleContact(c.id)} className="hover:text-accent-variant ml-1">
                              <X className="w-3 h-3" />
                            </button>
                          </motion.div>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <div className="flex-1 overflow-y-auto p-2 no-scrollbar font-sans">
                  {loading ? (
                    <div className="flex flex-col items-center justify-center h-full p-8 opacity-40">
                      <Loader2 className="w-8 h-8 animate-spin mb-2" />
                      <p className="text-xs font-semibold  ">{t('modals.loading_contacts')}</p>
                    </div>
                  ) : filteredContacts.length === 0 ? (
                    <div className="p-8 text-center opacity-50">
                      <p className="text-sm">{t('modals.no_contacts_matching').replace('{q}', searchQuery)}</p>
                    </div>
                  ) : (
                    <div className="space-y-0.5">
                      {filteredContacts.map(contact => {
                        const isSelected = selectedContactIds.has(contact.id);
                        return (
                          <button
                            key={contact.id}
                            onClick={() => toggleContact(contact.id)}
                            className={cn(
                              "w-full flex items-center gap-3 p-3 rounded-2xl transition-all text-left",
                              isSelected 
                                ? "bg-primary/5 ring-1 ring-primary/20" 
                                : "hover:bg-surface-container-highest"
                            )}
                          >
                            <div className="relative shrink-0">
                              <div className="w-10 h-10 rounded-full bg-surface-container-highest flex items-center justify-center font-semibold text-sm text-on-surface-variant overflow-hidden border border-outline-variant/30">
                                {contact.avatar ? (
                                  <img src={contact.avatar} alt={contact.name} className="w-full h-full object-cover" />
                                ) : (
                                  <span className="text-[10px]">{contact.initials}</span>
                                )}
                              </div>
                              <div className={cn(
                                "absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-surface-container flex items-center justify-center transition-all",
                                isSelected ? "bg-primary scale-110" : "bg-surface-container-highest scale-0"
                              )}>
                                <Check className="w-2.5 h-2.5 text-white" />
                              </div>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={cn(
                                "text-sm font-semibold transition-colors",
                                isSelected ? "text-accent" : "text-on-surface"
                              )}>{contact.name}</p>
                              <p className="text-[9px] text-on-surface-variant font-semibold   opacity-60 truncate">
                                {contact.role} • {contact.stage}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Right Side: Form */}
              <div className="w-full lg:w-1/2 flex flex-col min-h-0 bg-surface-container p-6 space-y-6 overflow-y-auto no-scrollbar">
                <div className="space-y-6">
                  <div>
                    <label className="text-[10px] font-semibold   text-on-surface-variant px-1 mb-3 block">{t('modals.interaction_type')}</label>
                    <div className="grid grid-cols-2 gap-2">
                      {interactionTypes.map(t => {
                        const Icon = t.icon;
                        const isActive = type === t.id;
                        return (
                          <button
                            key={t.id}
                            onClick={() => setType(t.id as any)}
                            className={cn(
                              "flex items-center gap-2.5 p-3 rounded-2xl border transition-all text-xs font-semibold",
                              isActive 
                                ? "bg-primary/10 border-primary text-accent" 
                                : "bg-surface-container-low border-outline/10 text-on-surface-variant hover:border-outline/40"
                            )}
                          >
                            <div className={cn("p-1.5 rounded-xl", t.color)}>
                              <Icon className="w-3.5 h-3.5" />
                            </div>
                            {t.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-semibold   text-on-surface-variant px-1 block">{t('modals.date')}</label>
                    <div className="relative">
                      <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
                      <input 
                        type="date"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        className="w-full h-11 bg-surface-container-low border border-outline/20 rounded-xl pl-10 pr-4 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20 "
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-semibold   text-on-surface-variant px-1 block">{t('modals.notes_content')}</label>
                    <textarea 
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder={t('modals.what_discussed')}
                      className="w-full h-32 bg-surface-container-low border border-outline/20 rounded-2xl p-4 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none leading-relaxed placeholder:text-on-surface-variant/30 "
                    />
                  </div>

                  {tasks.length === 0 ? (
                    <button
                      type="button"
                      onClick={addTask}
                      className="w-full py-3 border border-dashed border-outline/30 rounded-2xl text-xs font-semibold text-on-surface-variant hover:bg-surface-container-low transition-all flex items-center justify-center gap-2"
                    >
                      <Plus className="w-4 h-4" /> {t('modals.add_follow_up_task')}
                    </button>
                  ) : (
                    <div className="space-y-3 bg-surface-container-low p-4 rounded-3xl border border-primary/20">
                      <div className="flex items-center justify-between px-1">
                        <label className="text-[10px] font-semibold   text-accent flex items-center gap-1.5">
                          {t('modals.follow_up_tasks')}
                        </label>
                        <button
                          type="button"
                          onClick={addTask}
                          className="text-[10px] font-semibold text-on-surface-variant flex items-center gap-1 hover:text-on-surface transition-colors"
                        >
                          <Plus className="w-3 h-3"/> {t('modals.add_manual')}
                        </button>
                      </div>
                      <div className="space-y-2">
                        {tasks.map((task, i) => (
                          <div key={i} className="flex gap-2 items-start bg-surface-container rounded-xl p-2 border border-outline-variant/30">
                           <input
                              type="text"
                              value={task.title || ''}
                              onChange={(e) => handleTaskChange(i, 'title', e.target.value)}
                              placeholder={t('modals.task_description')}
                              className="flex-1 bg-transparent border-none focus:ring-0 text-sm text-on-surface px-2 py-1"
                            />
                            <input
                              type="date"
                              value={task.dueDate || ''}
                              onChange={(e) => handleTaskChange(i, 'dueDate', e.target.value)}
                              className="w-32 bg-transparent border-none focus:ring-0 text-xs text-on-surface-variant px-2 py-1.5"
                            />
                            <button
                              type="button"
                              onClick={() => removeTask(i)}
                              className="p-1.5 text-on-surface-variant/50 hover:text-error hover:bg-error/10 rounded-lg transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedContactIds.size > 0 && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-primary/5 rounded-2xl p-4 border border-primary/10 flex gap-3"
                    >
                      <Info className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                      <div>
                        <p className="text-[10px] font-semibold text-accent   mb-1">{t('modals.batch_recognition')}</p>
                        <p className="text-[11px] text-on-surface-variant leading-relaxed">
                          {t('modals.this_interaction_will_be_logged').replace('{n}', String(selectedContactIds.size))}
                        </p>
                      </div>
                    </motion.div>
                  )}
                </div>

                <div className="mt-auto pt-6 border-t border-outline-variant/30 flex items-center justify-end gap-3">
                  <button 
                    onClick={onClose}
                    className="px-6 h-12 rounded-2xl font-semibold text-on-surface-variant hover:bg-surface-variant transition-colors text-sm"
                  >
                    {t('modals.cancel')}
                  </button>
                  <button 
                    disabled={selectedContactIds.size === 0 || !notes.trim() || isSubmitting}
                    onClick={handleLogInteraction}
                    className="px-8 h-12 bg-primary text-on-primary rounded-2xl font-semibold    hover:translate-y-[-2px] disabled:opacity-50 disabled:translate-y-0 disabled:shadow-none transition-all flex items-center gap-2 text-sm"
                  >
                    {isSubmitting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        {t('modals.log_interaction')}
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
