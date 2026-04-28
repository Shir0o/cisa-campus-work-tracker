import React, { useState, useEffect, useMemo } from 'react';
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
  Palette,
  GripVertical
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  DndContext, 
  DragOverlay, 
  closestCorners, 
  KeyboardSensor, 
  PointerSensor, 
  useSensor, 
  useSensors,
  DragStartEvent,
  DragOverEvent,
  DragEndEvent,
  defaultDropAnimationSideEffects,
  DropAnimation
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
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
import { Skeleton } from '../components/ui/Skeleton';

export default function OutreachBoard() {
  const { isSidebarCollapsed } = useLayout();
  const { isAdmin } = useAuth();
  const [stages, setStages] = useState<Stage[]>([]);
  const [showAddStage, setShowAddStage] = useState(false);
  const [newStageName, setNewStageName] = useState('');
  const [newStageColor, setNewStageColor] = useState('bg-primary');
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);

  const colors = [
    { name: 'Primary', class: 'bg-primary' },
    { name: 'Secondary', class: 'bg-secondary' },
    { name: 'Error', class: 'bg-error' },
    { name: 'Success', class: 'bg-success' },
    { name: 'Info', class: 'bg-info' },
    { name: 'Warm', class: 'bg-tertiary' },
    { name: 'Dim', class: 'bg-primary-fixed-dim' },
  ];

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowAddStage(false);
    };
    if (showAddStage) {
      window.addEventListener('keydown', handleEsc);
    }
    return () => window.removeEventListener('keydown', handleEsc);
  }, [showAddStage]);

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
        
        const createStages = async () => {
          try {
            await Promise.all(defaultStages.map(s => addDoc(collection(db, 'stages'), s)));
          } catch (err) {
            handleFirestoreError(err, OperationType.CREATE, 'stages');
          } finally {
            setLoading(false);
          }
        };
        createStages();
      }
      
      setStages(stagesData);
      setTimeout(() => setLoading(false), 800);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'stages');
      setTimeout(() => setLoading(false), 800);
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

  useEffect(() => {
    const q = query(collection(db, 'contacts'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const contactData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Contact[];
      setBoardContacts(contactData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'contacts');
    });

    return () => unsubscribe();
  }, []);

  const [boardContacts, setBoardContacts] = useState<Contact[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  const handleUpdateContactStage = async (contactId: string, newStageLabel: string) => {
    try {
      await updateDoc(doc(db, 'contacts', contactId), {
        stage: newStageLabel,
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'contacts');
    }
  };

  const handleDeleteStage = async (stageId: string) => {
    if (!isAdmin || !window.confirm('Are you sure you want to delete this stage? Contacts in this stage will remain but won\'t be visible on the board until reassigned.')) return;
    try {
      await deleteDoc(doc(db, 'stages', stageId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'stages');
    }
  };

  const filteredContacts = boardContacts.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.role.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getStageContactsArr = (stageLabel: string) => filteredContacts.filter(c => c.stage === stageLabel);

  const activeContact = useMemo(() => 
    boardContacts.find(c => c.id === activeId),
    [activeId, boardContacts]
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    const activeContact = boardContacts.find((c) => c.id === activeId);
    if (!activeContact) return;

    // Is the user hovering over a stage column or another card?
    let overStage = overId;
    const overContact = boardContacts.find((c) => c.id === overId);
    
    if (overContact) {
      overStage = overContact.stage;
    } else {
      // It might be the stage label itself or a stage ID
      const maybeStage = stages.find(s => s.id === overId || s.label === overId);
      if (maybeStage) overStage = maybeStage.label;
    }

    if (activeContact.stage !== overStage) {
      setBoardContacts((prev) => {
        return prev.map((c) => {
          if (c.id === activeId) {
            return { ...c, stage: overStage };
          }
          return c;
        });
      });
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    const activeContact = boardContacts.find((c) => c.id === activeId);
    if (!activeContact) return;

    // Find the stage label
    let finalStage = activeContact.stage;
    const overContact = boardContacts.find((c) => c.id === overId);
    if (overContact) {
      finalStage = overContact.stage;
    } else {
      const maybeStage = stages.find(s => s.id === overId || s.label === overId);
      if (maybeStage) finalStage = maybeStage.label;
    }

    // Sync with Firestore
    await handleUpdateContactStage(activeId, finalStage);
  };

  const dropAnimation: DropAnimation = {
    sideEffects: defaultDropAnimationSideEffects({
      styles: {
        active: {
          opacity: '0.5',
        },
      },
    }),
  };

  if (loading) {
    return (
      <div className="flex flex-col h-full bg-background overflow-hidden">
        <div className="px-8 py-6 border-b border-surface-variant flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-10 w-64" />
            <Skeleton className="h-4 w-96" />
          </div>
          <div className="flex gap-4">
            <Skeleton className="h-10 w-64 rounded-full" />
            <Skeleton className="h-10 w-10 rounded-full" />
          </div>
        </div>
        <div className="flex-1 overflow-x-auto p-8">
          <div className="flex gap-6 h-full">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="w-80 bg-surface-container rounded-2xl border border-outline-variant/20 flex flex-col">
                <div className="p-4 border-b border-surface-variant flex justify-between">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-3 w-3 rounded-full" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                  <Skeleton className="h-5 w-5" />
                </div>
                <div className="p-3 space-y-3">
                  {[...Array(3)].map((_, j) => (
                    <div key={j} className="bg-surface-container-lowest p-4 rounded-xl space-y-3">
                      <div className="flex justify-between">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-8 w-8 rounded-full" />
                      </div>
                      <Skeleton className="h-3 w-full" />
                      <Skeleton className="h-3 w-2/3" />
                      <div className="pt-2 border-t border-outline-variant/20 flex justify-between">
                        <Skeleton className="h-3 w-12" />
                        <Skeleton className="h-3 w-16" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
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
            <div className="relative flex-1 sm:flex-initial">
              <Search className="w-4 h-4 sm:w-5 sm:h-5 absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
              <input 
                type="text" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
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
        <div className="flex-1 overflow-x-auto overflow-y-hidden p-4 sm:p-6 lg:p-8 custom-scrollbar relative">
          <div className="flex gap-4 sm:gap-6 items-start h-full pr-8">
            {stages.length > 0 ? stages.map((stageInfo) => {
              const columnContacts = getStageContactsArr(stageInfo.label);
              return (
                <div key={stageInfo.id} className="flex flex-col w-[280px] sm:w-[320px] shrink-0 bg-surface-container rounded-2xl border border-outline-variant/20 max-h-full">
                  {/* Column Header */}
                  <div className="p-4 flex items-center justify-between border-b border-surface-variant">
                    <div className="flex items-center gap-2">
                      <span className={cn("w-3 h-3 rounded-full", stageInfo.color)}></span>
                      <h3 className="text-sm font-bold text-on-surface">{stageInfo.label}</h3>
                      <span className="bg-surface-container-highest text-on-surface-variant px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-tight">
                        {columnContacts.length}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      {isAdmin && (
                        <button 
                          onClick={() => handleDeleteStage(stageInfo.id)}
                          className="text-on-surface-variant hover:text-error hover:bg-error-container/20 p-1 rounded-full transition-colors"
                          title="Delete Stage"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                      <button className="text-on-surface-variant hover:bg-surface-variant p-1 rounded-full">
                        <MoreHorizontal className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
  
                  {/* Column Content */}
                  <SortableContext 
                    id={stageInfo.label}
                    items={columnContacts.map(c => c.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="p-3 overflow-y-auto space-y-3 custom-scrollbar min-h-[100px] flex-1">
                      {columnContacts.length > 0 ? columnContacts.map((contact) => (
                        <KanbanCard 
                          key={contact.id} 
                          contact={contact} 
                          stages={stages}
                          onUpdateStage={handleUpdateContactStage}
                        />
                      )) : (
                        <div className="flex-1 flex items-center justify-center py-10 border-2 border-dashed border-outline-variant/30 rounded-xl m-2">
                          <p className="text-on-surface-variant text-sm italic opacity-60 text-center px-4">No contacts in this stage</p>
                        </div>
                      )}
                    </div>
                  </SortableContext>
                </div>
              );
            }) : !loading && (
              <div className="flex-1 flex flex-col items-center justify-center py-20 text-center">
                <Settings2 className="w-12 h-12 text-on-surface-variant opacity-20 mb-4" />
                <h3 className="text-lg font-bold text-on-surface">No stages configured</h3>
                <p className="text-sm text-on-surface-variant mt-1">
                  {isAdmin ? 'Click the button below to start building your workflow.' : 'Workflow stages haven\'t been set up yet.'}
                </p>
              </div>
            )}
          </div>

          {/* Add Stage FAB */}
          {isAdmin && (
            <div className="fixed bottom-44 sm:bottom-24 md:bottom-24 lg:bottom-8 right-6 lg:right-8 z-40 lg:z-50 transition-all">
              <button 
                onClick={() => setShowAddStage(true)}
                className="flex items-center gap-2 px-6 h-14 bg-primary text-on-primary rounded-2xl shadow-xl hover:shadow-primary/25 hover:translate-y-[-2px] active:translate-y-[2px] transition-all font-bold group"
                title="Add New Stage"
              >
                <Plus className="w-6 h-6 group-hover:rotate-90 transition-transform duration-300" />
                <span className="hidden sm:inline">Add Stage</span>
              </button>
            </div>
          )}
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

        <DragOverlay dropAnimation={dropAnimation}>
          {activeId && activeContact ? (
            <div className="w-[256px] sm:w-[296px] rotate-3 scale-105 pointer-events-none">
              <InternalKanbanCard contact={activeContact} stages={stages} onUpdateStage={() => {}} isOverlay />
            </div>
          ) : null}
        </DragOverlay>
      </motion.div>
    </DndContext>
  );
}

interface KanbanCardProps {
  contact: Contact;
  stages: Stage[];
  onUpdateStage: (cid: string, sid: string) => void;
  key?: string | number;
}

function KanbanCard(props: KanbanCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.contact.id });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
  };

  if (isDragging) {
    return (
      <div 
        ref={setNodeRef} 
        style={style}
        className="opacity-20 bg-surface-container p-4 rounded-xl border border-dashed border-outline-variant h-32"
      />
    );
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <InternalKanbanCard {...props} />
    </div>
  );
}

function InternalKanbanCard({ contact, stages, onUpdateStage, isOverlay }: KanbanCardProps & { isOverlay?: boolean }) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [showMoveMenu, setShowMoveMenu] = useState(false);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowMoveMenu(false);
    };
    if (showMoveMenu) {
      window.addEventListener('keydown', handleEsc);
    }
    return () => window.removeEventListener('keydown', handleEsc);
  }, [showMoveMenu]);

  const handleMove = async (newStageLabel: string) => {
    setIsUpdating(true);
    setShowMoveMenu(false);
    await onUpdateStage(contact.id, newStageLabel);
    setIsUpdating(false);
  };

  return (
    <div className={cn(
      "bg-surface-container-lowest p-4 rounded-xl shadow-sm cursor-grab hover:shadow-md transition-all border border-outline-variant/30 flex flex-col gap-3 group active:cursor-grabbing relative overflow-visible",
      contact.stage === 'Regular' && "border-l-4 border-l-secondary",
      isUpdating && "opacity-50 pointer-events-none",
      isOverlay && "shadow-2xl border-primary/50"
    )}>
      <div className="flex justify-between items-start">
        <div className="flex flex-col gap-1">
          <h4 className="text-sm font-bold text-on-surface leading-tight">{contact.name}</h4>
          <p className="text-[10px] text-on-surface-variant font-medium">{contact.role}</p>
        </div>
        <div className="flex items-center gap-2">
          {!isOverlay && (
            <button 
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShowMoveMenu(!showMoveMenu);
              }}
              onPointerDown={(e) => e.stopPropagation()} // Prevent drag when clicking settings
              className="p-1 rounded-full hover:bg-surface-variant text-on-surface-variant opacity-0 group-hover:opacity-100 transition-opacity"
              title="Move to stage"
            >
              <Settings2 className="w-3.5 h-3.5" />
            </button>
          )}
          {contact.avatar ? (
            <img src={contact.avatar} alt={contact.name} className="w-8 h-8 rounded-full object-cover shadow-sm" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center text-[10px] font-bold">
              {contact.initials}
            </div>
          )}
        </div>
      </div>

      {showMoveMenu && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute top-12 right-4 z-50 bg-surface-container-high border border-outline-variant rounded-xl shadow-xl p-2 min-w-[160px]"
        >
          <div className="text-[10px] font-bold text-on-surface-variant px-2 py-1 uppercase tracking-wider">Move to Stage</div>
          <div className="space-y-1 mt-1">
            {stages.map(s => (
              <button
                key={s.id}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleMove(s.label);
                }}
                disabled={s.label === contact.stage}
                className={cn(
                  "w-full text-left px-3 py-2 rounded-lg text-xs transition-all",
                  s.label === contact.stage 
                    ? "bg-primary/10 text-primary font-bold" 
                    : "hover:bg-surface-variant text-on-surface"
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        </motion.div>
      )}
      
      {contact.notes && (
        <p className="text-xs text-on-surface-variant leading-relaxed line-clamp-2 italic">
          {contact.notes}
        </p>
      )}

      <div className="flex items-center justify-between gap-2">
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
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-outline-variant/20 text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">
        <div className="flex items-center gap-1">
          <History className="w-3 h-3" />
          {contact.lastSeen}
        </div>
        <div className="flex items-center gap-1.5">
           <GripVertical className="w-3 h-3 text-on-surface-variant/40" />
           <span>{contact.createdAt ? `Added: ${contact.createdAt}` : 'Lead'}</span>
        </div>
      </div>
    </div>
  );
}
