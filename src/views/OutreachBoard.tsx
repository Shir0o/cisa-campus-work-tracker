import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Search,
  Filter,
  GripVertical,
  MoreHorizontal,
  Plus,
  Settings2,
  X,
  Edit3,
  Trash2,
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
  useDraggable,
  defaultDropAnimationSideEffects,
  DropAnimation
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { cn, getUserInitials } from '../lib/utils';
import { Contact, Stage } from '../types';
import { useLayout } from '../App';
import { useAuth } from '../components/AuthProvider';
import { journeyContacts } from '../lib/permissions';
import {
  collection,
  collectionGroup,
  onSnapshot,
  query,
  orderBy,
  limit,
  addDoc,
  doc,
  deleteDoc,
  updateDoc,
  writeBatch
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, logActivity } from '../lib/firebase';
import { applyStageReorder, persistStageOrder } from '../lib/data/stages';
import { Skeleton } from '../components/ui/Skeleton';
import { DataLoadError } from '../components/ui/DataLoadError';
import { useMediaQuery } from '../lib/useMediaQuery';
import { subscribeAllThreads } from '../lib/threads';
import OutreachBoardMobile from './OutreachBoardMobile';

// ── Field Notes helpers (mirror Dashboard.tsx) ──────────────────────────
const DAY_MS = 86_400_000;
const parseMs = (s?: string | null): number | null => {
  if (!s) return null;
  const t = new Date(s).getTime();
  return Number.isNaN(t) ? null : t;
};
const daysSince = (ms: number) => Math.max(0, Math.floor((Date.now() - ms) / DAY_MS));
const connectedLabel = (d: number) =>
  d === 0 ? 'Connected today' : d === 1 ? 'Last connected yesterday' : `Last connected ${d} days ago`;
const truncate = (s: string | undefined, n: number) =>
  s && s.length > n ? s.slice(0, n).replace(/\s+\S*$/, '') + '…' : s || '';

type Touch = { ms: number; note: string };
type TouchMap = Map<string, Touch>;

// Warm one-line captions for the four default stages (display-only; no schema).
const STAGE_CAPTION: Record<string, string> = {
  'first contact': "We've only just met — a name, a face, a first hello.",
  'second contact': 'Following up — a coffee, a text, learning who they are.',
  regular: 'Part of the rhythm now, around most weeks.',
  church: 'Finding a church family to belong to.',
};
const captionFor = (label?: string) =>
  (label && STAGE_CAPTION[label.trim().toLowerCase()]) || '';

export type ToneKey = 'slate' | 'clay' | 'ochre' | 'sage' | 'teal' | 'indigo' | 'plum' | 'rose';

const TONE_KEY_MAP: Record<string, ToneKey> = {
  'bg-board-slate': 'slate',
  'slate': 'slate',
  'bg-board-clay': 'clay',
  'clay': 'clay',
  'bg-board-ochre': 'ochre',
  'ochre': 'ochre',
  'bg-board-sage': 'sage',
  'sage': 'sage',
  'bg-board-teal': 'teal',
  'teal': 'teal',
  'bg-board-indigo': 'indigo',
  'indigo': 'indigo',
  'bg-board-plum': 'plum',
  'plum': 'plum',
  'bg-board-rose': 'rose',
  'rose': 'rose',
  // legacy aliases
  'bg-board-amber': 'clay',
  'bg-board-orange': 'ochre',
  'bg-board-emerald': 'sage',
  'bg-board-crimson': 'rose',
  'bg-board-ocean': 'slate',
  'bg-primary': 'indigo',
  'bg-primary-fixed-dim': 'slate',
  'bg-secondary': 'teal',
  'bg-orange-500': 'ochre',
  'bg-orange': 'ochre',
  'orange': 'ochre',
  'accent': 'slate',
  'amber': 'clay',
  'violet': 'plum',
};

const ALL_TONES: ToneKey[] = ['slate', 'clay', 'ochre', 'sage', 'teal', 'indigo', 'plum', 'rose'];

export const toneKeyFor = (color: string | undefined, index: number = 0): ToneKey => {
  if (color && TONE_KEY_MAP[color]) return TONE_KEY_MAP[color];
  return ALL_TONES[index % ALL_TONES.length];
};

export const toneStyle = (color: string | undefined, index: number = 0): React.CSSProperties => {
  const k = toneKeyFor(color, index);
  return {
    '--tone': `var(--t-${k})`,
    '--tone-soft': `var(--t-${k}-soft)`,
  } as React.CSSProperties;
};

export type Tone = ToneKey;
const toneFor = (color: string | undefined, index: number = 0): ToneKey =>
  toneKeyFor(color, index);

const peopleCount = (n: number) =>
  n === 0 ? 'no one yet' : n === 1 ? '1 person' : `${n} people`;

function Avatar({ contact, size = 'md' }: { contact: Contact; size?: 'sm' | 'md' }) {
  const dim = size === 'sm' ? 'w-8 h-8 text-xs' : 'w-11 h-11 text-sm';
  const initials = contact.initials || getUserInitials(contact.name);
  if (contact.avatar) {
    return (
      <img
        src={contact.avatar}
        alt={contact.name}
        className={cn(dim, 'rounded-full object-cover shrink-0')}
      />
    );
  }
  return (
    <div
      className={cn(
        dim,
        'rounded-full bg-primary-container text-on-primary-container font-semibold flex items-center justify-center shrink-0',
      )}
    >
      {initials}
    </div>
  );
}

// Cache the stage list across unmount/remount so closing the full-screen
// contact detail doesn't re-trigger the board skeleton (#258). Stages are
// shared/global and the onSnapshot listener refreshes them right after mount.
let cachedStages: Stage[] | null = null;

// Test-only hook to reset the cross-mount cache between tests.
export function __resetOutreachBoardStageCache() {
  cachedStages = null;
}

export default function OutreachBoard() {
  const { setSelectedContact, openNewContact } = useLayout();
  const isMobile = useMediaQuery("(max-width: 768px)");
  const { isAdmin, user, role } = useAuth();
  const [stages, setStages] = useState<Stage[]>(cachedStages ?? []);
  useEffect(() => { stagesRef.current = stages; }, [stages]);
  // Issue #211 — drag-to-reorder stages. activeStageId tracks an in-flight
  // stage drag; stagesBeforeDragRef remembers the pre-drag order so a failed
  // persist can roll the optimistic reorder back.
  const [activeStageId, setActiveStageId] = useState<string | null>(null);
  const stagesBeforeDragRef = useRef<Stage[]>([]);
  // Latest stages, kept in a ref so the drag-end handler (which may be invoked
  // with a stale closure) always decides against the current order.
  const stagesRef = useRef<Stage[]>([]);
  const [showAddStage, setShowAddStage] = useState(false);
  const [editingStage, setEditingStage] = useState<Stage | null>(null);

  const [newStageName, setNewStageName] = useState('');
  const [newStageColor, setNewStageColor] = useState('bg-board-indigo');
  const [loading, setLoading] = useState(cachedStages == null);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Clear state before handleFirestoreError (which throws), so the skeleton always
  // clears and the failure surfaces instead of a stuck/partial view.
  const onLoadError = (e: unknown, path: string) => {
    setError('the board');
    setLoading(false);
    handleFirestoreError(e, OperationType.LIST, path);
  };

  const [stageToDeleteModal, setStageToDeleteModal] = useState<{ stage: Stage; count: number; targetStage: string } | null>(null);

  // Eight honest tone swatches for the stage editor (stored as bg-board-* values).
  const colors = [
    { name: 'Slate', class: 'bg-board-slate' },
    { name: 'Clay', class: 'bg-board-clay' },
    { name: 'Ochre', class: 'bg-board-ochre' },
    { name: 'Sage', class: 'bg-board-sage' },
    { name: 'Teal', class: 'bg-board-teal' },
    { name: 'Indigo', class: 'bg-board-indigo' },
    { name: 'Plum', class: 'bg-board-plum' },
    { name: 'Rose', class: 'bg-board-rose' },
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
      cachedStages = stagesData;
      setTimeout(() => setLoading(false), 800);
    }, (e) => onLoadError(e, 'stages'));

    return () => unsubscribe();
  }, [isAdmin]);

  const handleAddStage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStageName.trim() || !isAdmin) return;

    try {
      if (editingStage) {
        const oldLabel = editingStage.label;
        const newLabel = newStageName.trim();

        await updateDoc(doc(db, 'stages', editingStage.id), {
          label: newLabel,
          color: newStageColor,
        });

        // Migrate contacts if label changed
        if (oldLabel !== newLabel) {
          const batch = writeBatch(db);
          const contactsToUpdate = boardContacts.filter(c => c.stage === oldLabel);
          contactsToUpdate.forEach(c => {
            batch.update(doc(db, 'contacts', c.id), { stage: newLabel });
          });
          await batch.commit();
        }
      } else {
        await addDoc(collection(db, 'stages'), {
          label: newStageName.trim(),
          color: newStageColor,
          order: stages.length,
        });
      }
      setNewStageName('');
      setEditingStage(null);
      setShowAddStage(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'stages');
    }
  };

  const handleEditStage = (stage: Stage) => {
    if (!isAdmin) return;
    setEditingStage(stage);
    setNewStageName(stage.label);
    setNewStageColor(stage.color);
    setShowAddStage(true);
  };

  useEffect(() => {
    const q = query(collection(db, 'contacts'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const contactData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Contact[];
      if (!activeId) {
        setBoardContacts(contactData);
      }
    }, (e) => onLoadError(e, 'contacts'));

    return () => unsubscribe();
  }, [activeId]);

  const [boardContacts, setBoardContacts] = useState<Contact[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // ── Last-connected signal: most recent interaction/comment per contact ──
  const [touches, setTouches] = useState<{ contactId: string; ms: number; note: string }[]>([]);
  useEffect(() => {
    const ingest = (
      snap: { docs: { data: () => unknown; ref: { path: string } }[] },
      noteKey: 'content' | 'text',
    ) =>
      snap.docs.map((d) => {
        const data = d.data() as Record<string, unknown>;
        return {
          contactId: d.ref.path.split('/')[1],
          ms: new Date((data.createdAt as string) ?? '').getTime(),
          note: ((data[noteKey] as string) ?? '').trim(),
        };
      });

    let interactionTouches: { contactId: string; ms: number; note: string }[] = [];
    let commentTouches: { contactId: string; ms: number; note: string }[] = [];
    const publish = () =>
      setTouches([...interactionTouches, ...commentTouches].filter((t) => !Number.isNaN(t.ms)));

    const unsubInteractions = onSnapshot(
      query(collectionGroup(db, 'interactions'), orderBy('createdAt', 'desc'), limit(500)),
      (snap) => {
        interactionTouches = ingest(snap as never, 'content');
        publish();
      },
      (e) => onLoadError(e, 'interactions (collectionGroup)'),
    );

    const unsubThreads = subscribeAllThreads((messages) => {
      // Threads are the single per-person conversation surface. Team-scope
      // Discussion messages are Full-timer-only, so don't surface them as a
      // public "last connected" touch.
      commentTouches = messages
        .filter((m) => m.scope !== 'team')
        .map((m) => ({
          contactId: m.contactId,
          ms: new Date(m.at).getTime(),
          note: m.body.trim(),
        }));
      publish();
    });

    return () => {
      unsubInteractions();
      unsubThreads();
    };
  }, []);

  const lastTouchByContact = useMemo(() => {
    const map: TouchMap = new Map();
    for (const t of touches) {
      const cur = map.get(t.contactId);
      if (!cur || t.ms > cur.ms) map.set(t.contactId, { ms: t.ms, note: t.note });
    }
    return map;
  }, [touches]);

  const handleUpdateContactStage = async (contactId: string, newStageLabel: string) => {
    try {
      const contact = boardContacts.find(c => c.id === contactId);
      const oldStage = contact?.stage;

      await updateDoc(doc(db, 'contacts', contactId), {
        stage: newStageLabel,
        updatedAt: new Date().toISOString(),
        updatedBy: user?.uid,
        updatedByName: user?.displayName || user?.email?.split('@')[0] || 'Unknown User'
      });

      if (oldStage && oldStage !== newStageLabel) {
        logActivity({
          action: `moved contact to stage "${newStageLabel}"`,
          targetId: contactId,
          targetName: contact?.name || 'Contact',
          targetType: 'contact',
          type: 'edit',
          description: `Changed stage from ${oldStage} to ${newStageLabel}`,
          userName: user?.displayName || user?.email?.split('@')[0] || 'Unknown User'
        } as any);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'contacts');
    }
  };

  const handleDeleteStage = async (stageId: string) => {
    if (!isAdmin) return;
    const stageInfo = stages.find((s) => s.id === stageId);
    if (!stageInfo) return;

    const contactsInStage = boardContacts.filter((c) => c.stage === stageInfo.label);
    const otherStages = stages.filter((s) => s.id !== stageId);

    if (contactsInStage.length > 0) {
      const defaultTarget = otherStages[0]?.label || '';
      setStageToDeleteModal({
        stage: stageInfo,
        count: contactsInStage.length,
        targetStage: defaultTarget,
      });
      return;
    }

    if (!window.confirm('Remove this step from the journey?')) return;
    try {
      await deleteDoc(doc(db, 'stages', stageId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'stages');
    }
  };

  const handleConfirmDeleteStageWithReassign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stageToDeleteModal) return;
    const { stage, targetStage } = stageToDeleteModal;

    try {
      const batch = writeBatch(db);
      const contactsToReassign = boardContacts.filter((c) => c.stage === stage.label);
      contactsToReassign.forEach((c) => {
        batch.update(doc(db, 'contacts', c.id), { stage: targetStage });
      });
      batch.delete(doc(db, 'stages', stage.id));
      await batch.commit();

      setStageToDeleteModal(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'stages');
    }
  };

  const handleDeleteContact = async (contactId: string) => {
    if (!window.confirm('Are you sure you want to delete this person?')) return;
    try {
      await deleteDoc(doc(db, 'contacts', contactId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'contacts');
    }
  };

  const [filterRole, setFilterRole] = useState<string>('All');
  const [showFilterMenu, setShowFilterMenu] = useState(false);

  const visibleJourneyContacts = journeyContacts(role, user?.uid, boardContacts, 'Fall 2026');

  const filteredContacts = visibleJourneyContacts.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.role.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.email.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesRole = filterRole === 'All' || c.role === filterRole;

    return matchesSearch && matchesRole;
  });

  const filterRoles = useMemo(() => ['All', ...new Set(boardContacts.map(c => c.role))], [boardContacts]);

  const getStageContactsArr = (stageLabel: string) => filteredContacts.filter(c => c.stage === stageLabel);

  const activeStageLabels = useMemo(() => new Set(stages.map((s) => s.label)), [stages]);
  const unmappedContacts = useMemo(() => {
    return filteredContacts.filter((c) => !c.stage || !activeStageLabels.has(c.stage));
  }, [filteredContacts, activeStageLabels]);

  // Header breakdown — sums to the bold total. Includes a "not yet placed" term
  // for the Unassigned column so the per-stage counts reconcile (see #29).
  const breakdownParts = useMemo(() => {
    const parts = stages.map((s) => ({
      key: s.id,
      count: getStageContactsArr(s.label).length,
      label: s.label.toLowerCase(),
    }));
    if (unmappedContacts.length > 0) {
      parts.push({ key: 'uncategorized', count: unmappedContacts.length, label: 'not yet placed' });
    }
    return parts;
  }, [stages, filteredContacts, unmappedContacts]);

  const activeContact = useMemo(() =>
    boardContacts.find(c => c.id === activeId),
    [activeId, boardContacts]
  );

  const handleDragStart = (event: DragStartEvent) => {
    const dragData = event.active.data?.current as { type?: string; stageId?: string } | undefined;
    if (dragData?.type === 'stage' && dragData.stageId) {
      stagesBeforeDragRef.current = stages;
      setActiveStageId(dragData.stageId);
      setActiveId(null);
      return;
    }
    setActiveId(event.active.id as string);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    // Stage reorder (issue #211): hovering another column moves the dragged
    // stage there, live, mirroring how contact drags preview their new column.
    if (activeStageId) {
      const overId = over.id as string;
      const overStage = stages.find((s) => s.id === overId);
      if (overStage && overStage.id !== activeStageId) {
        setStages((prev) => applyStageReorder(prev, activeStageId, overStage.id));
      }
      return;
    }

    const activeId = active.id as string;
    const overId = over.id as string;

    // Find active contact
    const activeContact = boardContacts.find((c) => c.id === activeId);
    if (!activeContact) return;

    // Identify target stage
    let overStageLabel = '';
    const overContact = boardContacts.find((c) => c.id === overId);

    if (overContact) {
      const isValidStage = stages.some(s => s.label === overContact.stage);
      overStageLabel = isValidStage ? overContact.stage : 'Unassigned';
    } else {
      // It might be the stage ID or label
      const maybeStage = stages.find(s => s.id === overId || s.label === overId);
      if (maybeStage) {
        overStageLabel = maybeStage.label;
      } else if (overId === 'uncategorized') {
        overStageLabel = 'Unassigned';
      }
    }

    if (overStageLabel && activeContact.stage !== overStageLabel) {
      setBoardContacts((prev) => {
        return prev.map((c) => {
          if (c.id === activeId) {
            return { ...c, stage: overStageLabel };
          }
          return c;
        });
      });
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    // Stage reorder (issue #211): handleDragOver already moved the stage
    // live, so the current `stages` state holds the final order — persist it.
    if (activeStageId) {
      const overId = over?.id as string | undefined;
      setActiveStageId(null);
      setActiveId(null);
      if (!overId || overId === activeStageId) return;
      const finalOrder = stagesRef.current;
      // applyStageReorder always returns a fresh array, so reference equality
      // can't tell "hovered and came back" from "actually moved" — compare the
      // logical order instead, or a no-op drag rewrites the whole batch.
      if (finalOrder.map((s) => s.id).join(',') === stagesBeforeDragRef.current.map((s) => s.id).join(',')) {
        return;
      }
      try {
        await persistStageOrder(finalOrder);
      } catch (error) {
        setStages(stagesBeforeDragRef.current);
        handleFirestoreError(error, OperationType.UPDATE, 'stages');
      }
      return;
    }

    const dragId = active.id as string;

    // We get the final stage from the contact in our local state
    // because handleDragOver has been updating it.
    const finalContact = boardContacts.find(c => c.id === dragId);

    setActiveId(null);
    if (!over || !finalContact) return;

    // Persist to database
    await handleUpdateContactStage(dragId, finalContact.stage);
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

  if (error) {
    return <DataLoadError label={error} />;
  }

  if (loading) {
    return (
      <div className="flex flex-col h-full bg-background overflow-hidden">
        <div className="px-6 py-6 lg:px-8 border-b border-outline-variant/40 space-y-3">
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-4 w-96 max-w-full opacity-70" />
        </div>
        <div className="flex-1 overflow-x-auto p-6 lg:p-8">
          <div className="flex gap-6 h-full">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="w-80 bg-surface-container rounded-3xl border-t-2 border border-outline-variant/20 flex flex-col">
                <div className="p-4 space-y-2">
                  <Skeleton className="h-5 w-28" />
                  <Skeleton className="h-3 w-40 opacity-70" />
                </div>
                <div className="p-3 space-y-3">
                  {[...Array(3)].map((_, j) => (
                    <div key={j} className="bg-surface-container-lowest p-4 rounded-xl space-y-3">
                      <div className="flex items-center gap-3">
                        <Skeleton className="h-11 w-11 rounded-full" />
                        <div className="space-y-1.5 flex-1">
                          <Skeleton className="h-4 w-24" />
                          <Skeleton className="h-3 w-32 opacity-70" />
                        </div>
                      </div>
                      <Skeleton className="h-3 w-2/3" />
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

  if (isMobile && !loading && !error) {
    return (
      <OutreachBoardMobile
        stages={stages}
        contacts={boardContacts}
        unmappedContacts={unmappedContacts}
        lastTouchByContact={lastTouchByContact}
        onOpenContact={setSelectedContact}
        onMove={handleUpdateContactStage}
        onShapeJourney={() => { setEditingStage(null); setNewStageName(''); setNewStageColor('bg-board-indigo'); setShowAddStage(true); }}
        isAdmin={isAdmin}
        onAddContact={openNewContact}
      />
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
        {/* Header — the journey, in prose */}
        <div className="px-4 py-5 sm:px-6 lg:px-8 border-b border-outline-variant/40 flex flex-col lg:flex-row lg:items-end justify-between shrink-0 bg-surface/60 backdrop-blur-md sticky top-0 z-20 gap-4">
          <div className="min-w-0">
            <h1 className="font-serif text-3xl sm:text-4xl text-on-surface">The Journey</h1>
            <p className="text-sm sm:text-base text-on-surface-variant leading-relaxed mt-2 max-w-2xl">
              <b className="text-on-surface font-semibold">
                {filteredContacts.length} {filteredContacts.length === 1 ? 'person' : 'people'}
              </b>{' '}
              in our care
              {stages.length > 0 && (
                <>
                  {' — '}
                  {breakdownParts.map((p, i) => (
                    <React.Fragment key={p.key}>
                      <span className="text-on-surface font-medium">{p.count}</span>{' '}
                      {p.label}
                      {i < breakdownParts.length - 1 ? ', ' : '.'}
                    </React.Fragment>
                  ))}
                </>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {isAdmin && (
              <button
                onClick={() => { setEditingStage(null); setNewStageName(''); setNewStageColor('bg-board-indigo'); setShowAddStage(true); }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-outline-variant text-sm font-medium text-on-surface hover:bg-surface-variant transition-colors shrink-0"
              >
                <Settings2 className="w-4 h-4" />
                Shape the journey
              </button>
            )}
            <div className="relative flex-1 sm:flex-initial">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-4 py-2 rounded-full border border-outline-variant bg-surface-container-lowest text-on-surface focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-sm w-full sm:w-56"
                placeholder="Find someone…"
              />
            </div>
            <div className="relative">
              <button
                onClick={() => setShowFilterMenu(!showFilterMenu)}
                className={cn(
                  "p-2.5 rounded-full hover:bg-surface-variant text-on-surface-variant shrink-0 transition-colors",
                  filterRole !== 'All' && "text-accent bg-primary/10"
                )}
              >
                <Filter className="w-5 h-5" />
              </button>

              <AnimatePresence>
                {showFilterMenu && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setShowFilterMenu(false)} />
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      className="absolute top-12 right-0 z-40 bg-surface-container-high border border-outline-variant rounded-2xl shadow-xl p-3 min-w-[180px] space-y-2"
                    >
                      <p className="text-[11px] font-medium   text-on-surface-variant px-2">Filter by role</p>
                      <div className="space-y-1">
                        {filterRoles.map(role => (
                          <button
                            key={role}
                            onClick={() => {
                              setFilterRole(role);
                              setShowFilterMenu(false);
                            }}
                            className={cn(
                              "w-full text-left px-3 py-2 rounded-xl text-sm font-medium transition-colors",
                              filterRole === role ? "bg-primary text-on-primary" : "text-on-surface-variant hover:bg-surface-variant"
                            )}
                          >
                            {role}
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* The board */}
        <div className="flex-1 overflow-x-auto overflow-y-hidden p-4 sm:p-6 lg:p-8 custom-scrollbar relative">
          <div className="flex gap-4 sm:gap-6 items-start h-full pr-8">
            {stages.length > 0 ? (
              <>
                {unmappedContacts.length > 0 && (
                  <KanbanColumn
                    key="uncategorized"
                    stageInfo={{
                      id: 'uncategorized',
                      label: 'Unassigned',
                      color: 'bg-surface-variant',
                      order: -1
                    }}
                    isAdmin={isAdmin}
                    contacts={unmappedContacts}
                    lastTouchByContact={lastTouchByContact}
                    onDeleteStage={handleDeleteStage}
                    onEditStage={handleEditStage}
                    onEditContact={setSelectedContact}
                    onDeleteContact={handleDeleteContact}
                    onAddContact={openNewContact}
                  />
                )}
                {stages.map((stageInfo, i) => (
                  <KanbanColumn
                    key={stageInfo.id}
                    stageInfo={stageInfo}
                    tone={toneFor(stageInfo.color, i)}
                    isFirst={i === 0}
                    isAdmin={isAdmin}
                    contacts={getStageContactsArr(stageInfo.label)}
                    lastTouchByContact={lastTouchByContact}
                    onDeleteStage={handleDeleteStage}
                    onEditStage={handleEditStage}
                    onEditContact={setSelectedContact}
                    onDeleteContact={handleDeleteContact}
                    onAddContact={openNewContact}
                  />
                ))}
              </>
            ) : !loading && (
              <div className="flex-1 flex flex-col items-center justify-center py-20 text-center">
                <Settings2 className="w-12 h-12 text-on-surface-variant opacity-20 mb-4" />
                <h3 className="font-serif text-xl text-on-surface">The journey hasn't been mapped yet</h3>
                <p className="text-sm text-on-surface-variant mt-1 max-w-sm">
                  {isAdmin ? 'Shape the steps of the journey — from a first hello toward a church home.' : 'The steps of the journey haven\'t been set up yet.'}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Shape the journey — add / edit a step */}
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
                <div className="p-6 border-b border-outline-variant flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-primary-container text-on-primary-container flex items-center justify-center">
                      <Settings2 className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="font-serif text-xl text-on-surface">{editingStage ? 'Rename this step' : 'Shape the journey'}</h2>
                      <p className="text-xs text-on-surface-variant">{editingStage ? 'Give the step a new name or colour' : 'Add a step to the journey'}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowAddStage(false)}
                    className="p-2 rounded-full hover:bg-surface-variant text-on-surface-variant"
                    aria-label="Close"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handleAddStage} className="p-6 space-y-6">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-on-surface-variant px-1">
                      Step name
                    </label>
                    <input
                      required
                      autoFocus
                      type="text"
                      value={newStageName}
                      onChange={e => setNewStageName(e.target.value)}
                      className="w-full h-12 px-4 rounded-xl bg-surface-container-highest border border-outline focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-on-surface"
                      placeholder="e.g. Following up"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-on-surface-variant px-1">
                      Colour
                    </label>
                    <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                      {colors.map(color => (
                        <button
                          key={color.class}
                          type="button"
                          style={toneStyle(color.class)}
                          onClick={() => setNewStageColor(color.class)}
                          className={cn(
                            "h-10 rounded-xl transition-all border-2 bg-[var(--tone)]",
                            newStageColor === color.class ? "border-on-surface ring-2 ring-primary ring-offset-2 ring-offset-surface" : "border-transparent opacity-70 hover:opacity-100"
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
                      className="flex-1 h-12 rounded-xl font-medium text-on-surface-variant hover:bg-surface-variant transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={!newStageName.trim()}
                      className="flex-[2] h-12 bg-primary text-on-primary rounded-xl font-medium    hover:translate-y-[-1px] active:translate-y-[1px] disabled:opacity-50 disabled:translate-y-0 transition-all"
                    >
                      {editingStage ? 'Save changes' : 'Add this step'}
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Delete stage reassign modal */}
        <AnimatePresence>
          {stageToDeleteModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setStageToDeleteModal(null)}
                className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="relative w-full max-w-md bg-surface-container-high rounded-3xl shadow-2xl overflow-hidden border border-outline-variant p-6 space-y-6"
              >
                <div className="flex items-center justify-between border-b border-outline-variant pb-4">
                  <h2 className="font-serif text-xl text-on-surface">Remove step: {stageToDeleteModal.stage.label}</h2>
                  <button
                    onClick={() => setStageToDeleteModal(null)}
                    className="p-2 rounded-full hover:bg-surface-variant text-on-surface-variant"
                    aria-label="Close"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handleConfirmDeleteStageWithReassign} className="space-y-5">
                  <p className="text-sm text-on-surface leading-relaxed">
                    <b className="font-semibold">{stageToDeleteModal.count} {stageToDeleteModal.count === 1 ? 'person is' : 'people are'}</b> at this step — where do they go?
                  </p>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-on-surface-variant px-1  ">
                      Destination step
                    </label>
                    <select
                      value={stageToDeleteModal.targetStage}
                      onChange={(e) =>
                        setStageToDeleteModal((prev) => prev ? { ...prev, targetStage: e.target.value } : null)
                      }
                      className="w-full h-12 px-4 rounded-xl bg-surface-container-highest border border-outline text-on-surface font-medium outline-none focus:ring-2 focus:ring-primary"
                    >
                      {stages
                        .filter((s) => s.id !== stageToDeleteModal.stage.id)
                        .map((s) => (
                          <option key={s.id} value={s.label}>
                            {s.label}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div className="pt-2 flex gap-3">
                    <button
                      type="button"
                      onClick={() => setStageToDeleteModal(null)}
                      className="flex-1 h-12 rounded-xl font-medium text-on-surface-variant hover:bg-surface-variant transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={!stageToDeleteModal.targetStage}
                      className="flex-[2] h-12 bg-error text-on-error rounded-xl font-medium   disabled:opacity-50 transition-all"
                    >
                      Reassign & remove step
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        <DragOverlay dropAnimation={dropAnimation}>
          {activeStageId ? (
            <div className="w-[220px] rounded-3xl bg-surface-container-high border border-outline-variant/40 shadow-lg px-4 py-3 pointer-events-none">
              <p className="font-serif text-[17px] text-on-surface truncate">
                {stages.find((s) => s.id === activeStageId)?.label}
              </p>
            </div>
          ) : activeId && activeContact ? (
            <div className="w-[88vw] max-w-[320px] sm:w-[320px] sm:max-w-none xl:w-[360px] rotate-3 scale-105 pointer-events-none">
              <InternalKanbanCard
                contact={activeContact}
                tone={toneFor(stages.find((s) => s.label === activeContact.stage)?.color, 0)}
                lastTouchByContact={lastTouchByContact}
                onEditContact={() => {}}
                onDeleteContact={async () => {}}
                isOverlay
              />
            </div>
          ) : null}
        </DragOverlay>
      </motion.div>
    </DndContext>
  );
}

interface KanbanColumnProps {
  stageInfo: Stage;
  tone?: Tone;
  isFirst?: boolean;
  contacts: Contact[];
  isAdmin: boolean;
  lastTouchByContact: TouchMap;
  onDeleteStage: (id: string) => Promise<void>;
  onEditStage: (stage: Stage) => void;
  onEditContact: (contact: Contact) => void;
  onDeleteContact: (id: string) => Promise<void>;
  onAddContact: (stage: string) => void;
  key?: string | number;
}

function KanbanColumn({
  stageInfo,
  tone,
  isFirst,
  contacts,
  isAdmin,
  lastTouchByContact,
  onDeleteStage,
  onEditStage,
  onEditContact,
  onDeleteContact,
  onAddContact,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: stageInfo.id,
  });

  // Issue #211 — the column header grip reorders the journey. Uses the outer
  // DndContext (same one that moves contact cards between columns), tagged so
  // the drag handlers can tell a stage drag from a contact drag.
  const { attributes, listeners } = useDraggable({
    id: `stage:${stageInfo.id}`,
    data: { type: 'stage', stageId: stageInfo.id },
    disabled: !isAdmin || stageInfo.id === 'uncategorized',
  });

  const [showMenu, setShowMenu] = useState(false);
  const caption = captionFor(stageInfo.label);

  return (
    <div
      style={toneStyle(stageInfo.color)}
      className={cn(
        "flex flex-col w-[88vw] max-w-[320px] sm:w-[320px] sm:max-w-none xl:w-[360px] shrink-0 bg-surface-container rounded-3xl border border-t-2 border-t-[var(--tone)] max-h-full transition-all",
        isOver ? "border-outline ring-2 ring-primary/30" : "border-outline-variant/30",
      )}
    >
      {/* Column header */}
      <div className="p-4 flex items-start justify-between relative">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <h3 className="font-serif text-[17px] text-on-surface truncate">{stageInfo.label}</h3>
          </div>
          <span className="text-xs font-medium text-[var(--tone)]">
            {peopleCount(contacts.length)}
          </span>
          {caption && (
            <p className="text-xs text-on-surface-variant leading-relaxed mt-1.5 max-w-[24ch]">{caption}</p>
          )}
        </div>

        {isAdmin && stageInfo.id !== 'uncategorized' && (
          <div className="relative shrink-0 flex items-center gap-1">
            <button
              {...attributes}
              {...listeners}
              aria-label={`Reorder ${stageInfo.label}`}
              title="Drag to reorder"
              className="p-1 rounded-full hover:bg-surface-variant text-on-surface-variant cursor-grab active:cursor-grabbing touch-none transition-colors"
            >
              <GripVertical className="w-4 h-4" />
            </button>
            <button
              onClick={() => setShowMenu(!showMenu)}
              aria-label="Stage options"
              className="p-1 rounded-full hover:bg-surface-variant text-on-surface-variant transition-colors"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>

            <AnimatePresence>
              {showMenu && (
                <>
                  <div
                    className="fixed inset-0 z-[60]"
                    onClick={() => setShowMenu(false)}
                  />
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: -10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -10 }}
                    className="absolute top-8 right-0 z-[70] bg-surface-container-high border border-outline-variant rounded-xl shadow-xl p-1 min-w-[150px]"
                  >
                    <button
                      onClick={() => {
                        onEditStage(stageInfo);
                        setShowMenu(false);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-surface-variant text-on-surface transition-colors"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-accent" />
                      Rename step
                    </button>
                    <button
                      onClick={() => {
                        onDeleteStage(stageInfo.id);
                        setShowMenu(false);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-error/10 text-error transition-colors font-medium border-t border-outline-variant/30 mt-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Remove step
                    </button>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Column body */}
      <SortableContext
        id={stageInfo.id}
        items={contacts.map(c => c.id)}
        strategy={verticalListSortingStrategy}
      >
        <div
          ref={setNodeRef}
          className="px-3 overflow-y-auto space-y-2.5 custom-scrollbar min-h-[120px] flex-1"
        >
          {contacts.length > 0 ? contacts.map((contact) => (
            <KanbanCard
              key={contact.id}
              contact={contact}
              tone={tone}
              stageColor={stageInfo.color}
              lastTouchByContact={lastTouchByContact}
              onEditContact={onEditContact}
              onDeleteContact={onDeleteContact}
            />
          )) : (
            <div className="flex items-center justify-center py-10 border-2 border-dashed border-outline-variant/40 rounded-xl m-1">
              <p className="text-on-surface-variant text-sm italic opacity-70 text-center px-4">No one here just now.</p>
            </div>
          )}
        </div>
      </SortableContext>

      {/* Column footer */}
      <div className="p-3">
        <button
          onClick={() => onAddContact(stageInfo.label)}
          className="w-full py-2.5 rounded-xl border border-dashed border-outline-variant text-sm font-medium text-on-surface-variant hover:bg-surface-variant hover:text-on-surface transition-colors"
        >
          {isFirst ? 'Welcome someone new' : `Add to ${stageInfo.label}`}
        </button>
      </div>
    </div>
  );
}

interface KanbanCardProps {
  contact: Contact;
  tone?: Tone;
  stageColor?: string;
  lastTouchByContact: TouchMap;
  onEditContact: (contact: Contact) => void;
  onDeleteContact: (id: string) => Promise<void>;
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
        className="opacity-20 bg-surface-container p-4 rounded-xl border border-dashed border-outline-variant h-28"
      />
    );
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <InternalKanbanCard {...props} dragListeners={listeners} />
    </div>
  );
}

function InternalKanbanCard({
  contact,
  stageColor,
  lastTouchByContact,
  onEditContact,
  onDeleteContact,
  isOverlay,
  dragListeners
}: KanbanCardProps & { isOverlay?: boolean, dragListeners?: any }) {
  const touch = lastTouchByContact.get(contact.id);
  const contactLastMs = parseMs(contact.lastContactedDate) ?? parseMs(contact.lastSeen);
  const touchMs = touch?.ms;
  const bestMs = Math.max(touchMs ?? -Infinity, contactLastMs ?? -Infinity);
  const ms = Number.isFinite(bestMs) && bestMs > 0 ? bestMs : parseMs(contact.createdAt);
  const days = ms != null ? daysSince(ms) : null;
  const overdue = days != null && days >= 7;
  const note = (touch?.note || contact.notes || '').trim();
  const sub = [contact.role, contact.location].filter(Boolean).join(' · ');
  const tags = (contact.tags || []).filter(Boolean);

  return (
    <div
      onClick={() => !isOverlay && onEditContact(contact)}
      style={toneStyle(stageColor)}
      className={cn(
        "bg-surface-container-lowest p-3.5 rounded-xl  cursor-grab  transition-all border border-outline-variant/40 hover:border-[var(--tone)] flex flex-col gap-2.5 group active:cursor-grabbing",
        isOverlay && "shadow-2xl",
      )}
      {...dragListeners}
    >
      {/* Person */}
      <div className="flex items-center gap-3">
        <Avatar contact={contact} />
        <div className="min-w-0">
          <h4 className="font-serif text-base text-on-surface leading-tight truncate">{contact.name}</h4>
          {sub && <p className="text-xs text-on-surface-variant truncate mt-0.5">{sub}</p>}
        </div>
      </div>

      {/* Last connected */}
      {days != null ? (
        <div className={cn("flex items-center gap-1.5 text-[12.5px]", overdue ? "text-stage-amber font-medium" : "text-on-surface-variant")}>
          {overdue && <span className="w-1.5 h-1.5 rounded-full bg-stage-amber shrink-0" aria-hidden />}
          {connectedLabel(days)}
        </div>
      ) : (
        <div className="text-[12.5px] text-on-surface-variant italic">No contact logged yet.</div>
      )}

      {/* Last note */}
      {note && (
        <p className="text-[12.5px] text-on-surface-variant leading-relaxed">
          <span className="text-on-surface-variant/70">Last:</span> {truncate(note, 100)}
        </p>
      )}

      {/* Tags */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {tags.map((t) => (
            <span
              key={t}
              className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-[var(--tone-soft)] text-[var(--tone)]"
            >
              {t === 'leader-track' ? 'leader track' : t}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
