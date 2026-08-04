import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  Filter,
  Mail,
  Tag,
  Trash2,
  Check,
  Plus,
  Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  collection,
  collectionGroup,
  onSnapshot,
  query,
  orderBy,
  limit,
  doc,
  writeBatch
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, logActivity } from '../lib/firebase';
import { cn, getUserInitials } from '../lib/utils';
import { useLayout } from '../App';
import { useAuth } from '../components/AuthProvider';
import { Contact, Stage } from '../types';
import { Skeleton } from '../components/ui/Skeleton';
import { DataLoadError } from '../components/ui/DataLoadError';
import PageContainer from '../components/layout/PageContainer';

// ── Field Notes helpers (mirror Dashboard.tsx / OutreachBoard.tsx) ──────────
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

// The four warm stage tones. Stored stage colors (bg-board-*) map onto these.
type Tone = 'accent' | 'amber' | 'teal' | 'violet';
const TONES: Tone[] = ['accent', 'amber', 'teal', 'violet'];

const TONE_BY_COLOR: Record<string, Tone> = {
  'bg-board-indigo': 'accent',
  'bg-board-ocean': 'accent',
  'bg-primary': 'accent',
  'bg-primary-fixed-dim': 'accent',
  'bg-board-amber': 'amber',
  'bg-board-teal': 'teal',
  'bg-board-emerald': 'teal',
  'bg-secondary': 'teal',
  'bg-board-plum': 'violet',
  'bg-board-crimson': 'violet',
  'bg-board-rose': 'violet',
};

// Full static class strings so Tailwind's scanner keeps them.
const TONE_CLASSES: Record<
  Tone,
  { chipBg: string; chipText: string; dot: string; cardHoverBorder: string; tagBg: string; tagText: string }
> = {
  accent: {
    chipBg: 'bg-stage-accent-soft',
    chipText: 'text-stage-accent',
    dot: 'bg-stage-accent',
    cardHoverBorder: 'hover:border-stage-accent',
    tagBg: 'bg-stage-accent-soft',
    tagText: 'text-stage-accent',
  },
  amber: {
    chipBg: 'bg-stage-amber-soft',
    chipText: 'text-stage-amber',
    dot: 'bg-stage-amber',
    cardHoverBorder: 'hover:border-stage-amber',
    tagBg: 'bg-stage-amber-soft',
    tagText: 'text-stage-amber',
  },
  teal: {
    chipBg: 'bg-stage-teal-soft',
    chipText: 'text-stage-teal',
    dot: 'bg-stage-teal',
    cardHoverBorder: 'hover:border-stage-teal',
    tagBg: 'bg-stage-teal-soft',
    tagText: 'text-stage-teal',
  },
  violet: {
    chipBg: 'bg-stage-violet-soft',
    chipText: 'text-stage-violet',
    dot: 'bg-stage-violet',
    cardHoverBorder: 'hover:border-stage-violet',
    tagBg: 'bg-stage-violet-soft',
    tagText: 'text-stage-violet',
  },
};

const toneFor = (color: string | undefined, index: number): Tone =>
  (color && TONE_BY_COLOR[color]) || TONES[index % TONES.length];

const peopleCount = (n: number) =>
  n === 0 ? 'no one yet' : n === 1 ? '1 person' : `${n} people`;

function Avatar({ contact, size = 'md' }: { contact: Contact; size?: 'sm' | 'md' }) {
  const dim = size === 'sm' ? 'w-9 h-9 text-xs' : 'w-12 h-12 text-sm';
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

export default function Directory() {
  const { openNewContact, setSelectedContact, openSmartImport } = useLayout();
  const { user } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [stagesData, setStagesData] = useState<Stage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // ── Last-connected signal: most recent interaction/comment per contact ──
  const [touches, setTouches] = useState<{ contactId: string; ms: number; note: string }[]>([]);

  // Clear state before handleFirestoreError (which throws), so the skeleton always
  // clears and the failure surfaces instead of a stuck/partial view.
  const onLoadError = (e: unknown, path: string) => {
    setError('contacts');
    setLoading(false);
    handleFirestoreError(e, OperationType.LIST, path);
  };

  useEffect(() => {
    const qContacts = query(collection(db, 'contacts'), orderBy('name', 'asc'));
    const unsubscribeContacts = onSnapshot(qContacts, (snapshot) => {
      const contactData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Contact[];
      setContacts(contactData);
    }, (e) => onLoadError(e, 'contacts'));

    const qStages = query(collection(db, 'stages'), orderBy('order', 'asc'));
    const unsubscribeStages = onSnapshot(qStages, (snapshot) => {
      const stages = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Stage[];
      setStagesData(stages);

      // Delay first loading=false after both are loaded or after contacts if stages are empty
      setTimeout(() => setLoading(false), 800);
    }, (e) => onLoadError(e, 'stages'));

    return () => {
      unsubscribeContacts();
      unsubscribeStages();
    };
  }, []);

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

    const unsubComments = onSnapshot(
      query(collectionGroup(db, 'comments'), orderBy('createdAt', 'desc'), limit(500)),
      (snap) => {
        commentTouches = ingest(snap as never, 'text');
        publish();
      },
      (e) => onLoadError(e, 'comments (collectionGroup)'),
    );

    return () => {
      unsubInteractions();
      unsubComments();
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

  const [filterStage, setFilterStage] = useState<string>('All');
  const [filterRole, setFilterRole] = useState<string>('All');
  const [filterSpiritualBackground, setFilterSpiritualBackground] = useState<string>('All');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [isTagModalOpen, setIsTagModalOpen] = useState(false);
  const [newTag, setNewTag] = useState('');
  const [showFilterMenu, setShowFilterMenu] = useState(false);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsTagModalOpen(false);
        setShowFilterMenu(false);
      }
    };
    if (isTagModalOpen || showFilterMenu) {
      window.addEventListener('keydown', handleEsc);
    }
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isTagModalOpen, showFilterMenu]);

  // Days since last connected (interaction/comment, else createdAt) for a contact.
  const daysFor = (c: Contact): number | null => {
    const ms = lastTouchByContact.get(c.id)?.ms ?? parseMs(c.createdAt);
    return ms != null ? daysSince(ms) : null;
  };

  const filteredContacts = useMemo(() => {
    let result = [...contacts];

    // Search
    if (searchQuery) {
      const lowerQuery = searchQuery.toLowerCase();
      result = result.filter(c =>
        c.name.toLowerCase().includes(lowerQuery) ||
        c.email.toLowerCase().includes(lowerQuery) ||
        c.role.toLowerCase().includes(lowerQuery) ||
        (c.location && c.location.toLowerCase().includes(lowerQuery)) ||
        (c.spiritualBackground && c.spiritualBackground.toLowerCase().includes(lowerQuery)) ||
        (c.tags && c.tags.some(t => t.toLowerCase().includes(lowerQuery)))
      );
    }

    // Filter by Stage
    if (filterStage !== 'All') {
      result = result.filter(c => c.stage === filterStage);
    }

    // Filter by Role
    if (filterRole !== 'All') {
      result = result.filter(c => c.role === filterRole);
    }

    // Filter by Spiritual Background
    if (filterSpiritualBackground !== 'All') {
      result = result.filter(c => c.spiritualBackground === filterSpiritualBackground);
    }

    // Filter by Tags
    if (selectedTags.length > 0) {
      result = result.filter(c =>
        c.tags && selectedTags.every(tag => c.tags?.includes(tag))
      );
    }

    return result;
  }, [contacts, searchQuery, filterStage, filterRole, filterSpiritualBackground, selectedTags]);

  // Tone per stage label, keyed off the stage's stored colour (or its order).
  const toneByStage = useMemo(() => {
    const map = new Map<string, Tone>();
    stagesData.forEach((s, i) => map.set(s.label, toneFor(s.color, i)));
    return map;
  }, [stagesData]);

  const handleBulkTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedIds.size === 0 || !newTag.trim()) return;

    try {
      const batch = writeBatch(db);
      const selectedContacts = contacts.filter(c => selectedIds.has(c.id));

      selectedContacts.forEach(contact => {
        const currentTags = contact.tags || [];
        if (!currentTags.includes(newTag)) {
          const updatedTags = [...currentTags, newTag];
          batch.update(doc(db, 'contacts', contact.id), {
            tags: updatedTags,
            updatedAt: new Date().toISOString(),
            updatedBy: user?.uid,
            updatedByName: user?.displayName || user?.email?.split('@')[0] || 'Unknown User'
          });

          logActivity({
            action: `added tag #${newTag} to`,
            targetId: contact.id,
            targetName: contact.name,
            targetType: 'contact',
            type: 'edit',
            description: `Tags: [${currentTags.join(', ')}] → [${updatedTags.join(', ')}]`
          });
        }
      });
      await batch.commit();
      setNewTag('');
      setIsTagModalOpen(false);
      setSelectedIds(new Set());
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'contacts');
    }
  };

  const filterStages = useMemo(() => ['All', ...new Set(stagesData.map(s => s.label))], [stagesData]);
  const filterRoles = useMemo(() => ['All', ...new Set(contacts.map(c => c.role))], [contacts]);
  const filterSpiritualBackgrounds = useMemo(() => ['All', ...new Set(contacts.map(c => c.spiritualBackground).filter(Boolean))], [contacts]);
  const allTags = useMemo(() => [...new Set(contacts.flatMap(c => c.tags || []))], [contacts]);

  const newCount = useMemo(
    () => contacts.filter(c => {
      const ms = parseMs(c.createdAt);
      return ms != null && daysSince(ms) <= 14;
    }).length,
    [contacts],
  );
  const overdueCount = useMemo(
    () => contacts.filter(c => {
      const d = daysFor(c);
      return d != null && d >= 7;
    }).length,
    [contacts, lastTouchByContact],
  );

  const toggleTagFilter = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const clearFilters = () => {
    setSearchQuery('');
    setFilterStage('All');
    setFilterRole('All');
    setFilterSpiritualBackground('All');
    setSelectedTags([]);
  };

  const hasActiveFilters = searchQuery !== '' || filterStage !== 'All' || filterRole !== 'All' || filterSpiritualBackground !== 'All' || selectedTags.length > 0;

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredContacts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredContacts.map(c => c.id)));
    }
  };

  const toggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleBulkEmail = () => {
    if (selectedIds.size === 0) return;
    const selectedContacts = contacts.filter(c => selectedIds.has(c.id));
    const emails = selectedContacts.map(c => c.email).filter(Boolean).join(',');
    if (emails) {
      window.location.href = `mailto:${emails}`;
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Are you sure you want to remove ${selectedIds.size} ${selectedIds.size === 1 ? 'person' : 'people'}?`)) return;

    try {
      const batch = writeBatch(db);
      const selectedContacts = contacts.filter(c => selectedIds.has(c.id));

      selectedContacts.forEach(contact => {
        batch.delete(doc(db, 'contacts', contact.id));

        logActivity({
          action: 'deleted contact',
          targetId: contact.id,
          targetName: contact.name,
          targetType: 'contact',
          type: 'alert'
        });
      });
      await batch.commit();
      setSelectedIds(new Set());
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'contacts');
    }
  };

  const allSelected = selectedIds.size > 0 && selectedIds.size === filteredContacts.length;

  if (error) {
    return <DataLoadError label={error} />;
  }

  if (loading) {
    return (
      <PageContainer variant="wide" className="flex flex-col gap-8">
        <div className="space-y-3">
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-5 w-full max-w-xl opacity-70" />
        </div>
        <div className="flex gap-3">
          <Skeleton className="h-10 w-full max-w-xs rounded-full" />
          <Skeleton className="h-10 w-10 rounded-full" />
        </div>
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-2xl" />
          ))}
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer variant="wide">
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      {/* ── Header: serif title + prose summary ── */}
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h1 className="font-serif page-title text-on-surface">People</h1>
          <p className="text-base text-on-surface-variant leading-relaxed mt-2 max-w-2xl">
            <b className="text-on-surface font-semibold">
              {contacts.length} {contacts.length === 1 ? 'person' : 'people'}
            </b>{' '}
            in your care
            {newCount > 0 && (
              <>
                {' '}— <span className="text-on-surface font-medium">{newCount}</span> new in the
                last two weeks
              </>
            )}
            {overdueCount > 0 && (
              <>
                , and <span className="text-on-surface font-medium">{overdueCount}</span> you
                haven't connected with in over a week
              </>
            )}
            .
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => openSmartImport()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-primary/30 bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20 transition-colors shrink-0"
          >
            <Sparkles className="w-4 h-4 text-primary" /> Smart Import
          </button>
          <button
            onClick={() => openNewContact()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary text-on-primary text-sm font-medium hover:opacity-90 transition-opacity shrink-0"
          >
            <Plus className="w-4 h-4" /> Add someone
          </button>
        </div>
      </header>

      {/* ── Search + filters ── */}
      <div className="flex flex-wrap items-center gap-3 mt-8">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
          <input
            type="text"
            placeholder="Find someone by name…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-11 pl-10 pr-4 rounded-full border border-outline-variant bg-surface focus:border-primary outline-none text-sm transition-colors"
          />
        </div>
        <div className="relative">
          <button
            onClick={() => setShowFilterMenu(!showFilterMenu)}
            className={cn(
              "h-11 px-4 rounded-full border text-sm font-medium transition-colors inline-flex items-center gap-2",
              hasActiveFilters
                ? "border-primary text-primary bg-primary/5"
                : "border-outline-variant text-on-surface-variant hover:bg-surface-variant"
            )}
          >
            <Filter className="w-4 h-4" />
            Filters
            {hasActiveFilters && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
          </button>

          <AnimatePresence>
            {showFilterMenu && (
              <>
                <div
                  className="fixed inset-0 z-30"
                  onClick={() => setShowFilterMenu(false)}
                />
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute top-13 right-0 mt-2 z-40 bg-surface-container-high border border-outline-variant rounded-2xl shadow-xl p-4 min-w-[240px] max-w-[calc(100vw-2rem)] space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-on-surface">Narrow it down</span>
                    {hasActiveFilters && (
                      <button
                        onClick={clearFilters}
                        className="text-xs font-medium text-primary hover:underline"
                      >
                        Clear all
                      </button>
                    )}
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-on-surface-variant px-1">Stage</label>
                      <select
                        value={filterStage}
                        onChange={(e) => setFilterStage(e.target.value)}
                        className="w-full h-10 px-3 rounded-xl border border-outline-variant bg-surface text-sm text-on-surface outline-none focus:border-primary cursor-pointer"
                      >
                        {filterStages.map(s => <option key={s} value={s}>{s === 'All' ? 'All stages' : s}</option>)}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-on-surface-variant px-1">Group</label>
                      <select
                        value={filterRole}
                        onChange={(e) => setFilterRole(e.target.value)}
                        className="w-full h-10 px-3 rounded-xl border border-outline-variant bg-surface text-sm text-on-surface outline-none focus:border-primary cursor-pointer"
                      >
                        {filterRoles.map(r => <option key={r} value={r}>{r === 'All' ? 'All groups' : r}</option>)}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-on-surface-variant px-1">Spiritual background</label>
                      <select
                        value={filterSpiritualBackground}
                        onChange={(e) => setFilterSpiritualBackground(e.target.value)}
                        className="w-full h-10 px-3 rounded-xl border border-outline-variant bg-surface text-sm text-on-surface outline-none focus:border-primary cursor-pointer"
                      >
                        {filterSpiritualBackgrounds.map(sb => <option key={sb} value={sb}>{sb === 'All' ? 'All backgrounds' : sb}</option>)}
                      </select>
                    </div>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ── Tag chips filter ── */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-4">
          {allTags.map(tag => (
            <button
              key={tag}
              onClick={() => toggleTagFilter(tag)}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-medium border transition-colors shrink-0",
                selectedTags.includes(tag)
                  ? "bg-primary text-on-primary border-primary"
                  : "bg-surface text-on-surface-variant border-outline-variant hover:border-outline"
              )}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      {/* ── Select bar / count ── */}
      <div className="flex items-center justify-between gap-3 mt-8 mb-4">
        <label className="flex items-center gap-2.5 cursor-pointer group select-none" onClick={toggleSelectAll}>
          <span className={cn(
            "w-5 h-5 rounded-md border-2 transition-colors flex items-center justify-center",
            allSelected ? "bg-primary border-primary" :
              selectedIds.size > 0 ? "border-primary" : "border-outline group-hover:border-primary"
          )}>
            {allSelected && <Check className="w-3 h-3 text-on-primary" strokeWidth={3} />}
            {selectedIds.size > 0 && !allSelected && <span className="w-2 h-0.5 bg-primary rounded" />}
          </span>
          <span className="text-sm text-on-surface-variant">
            {selectedIds.size > 0
              ? `${selectedIds.size} selected`
              : `${peopleCount(filteredContacts.length)}${filteredContacts.length === contacts.length ? '' : ` of ${contacts.length}`}`}
          </span>
        </label>

        <AnimatePresence>
          {selectedIds.size > 0 && (
            <motion.div
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              className="flex items-center gap-1"
            >
              <button
                onClick={() => setIsTagModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm text-on-surface-variant hover:bg-surface-variant transition-colors"
                title="Tag selected"
              >
                <Tag className="w-4 h-4" /> Tag
              </button>
              <button
                onClick={handleBulkEmail}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm text-on-surface-variant hover:bg-surface-variant transition-colors"
                title="Email selected"
              >
                <Mail className="w-4 h-4" /> Email
              </button>
              <button
                onClick={handleBulkDelete}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm text-error hover:bg-error/10 transition-colors"
                title="Remove selected"
              >
                <Trash2 className="w-4 h-4" /> Remove
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── People cards ── */}
      {filteredContacts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-14 h-14 rounded-full bg-surface-variant flex items-center justify-center mb-4">
            <Search className="w-7 h-7 text-on-surface-variant opacity-40" />
          </div>
          <h3 className="font-serif text-xl text-on-surface mb-1">No one matches that just yet</h3>
          <p className="text-sm text-on-surface-variant">Try a different search or clear your filters.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          {filteredContacts.map((contact) => {
            const tone = toneByStage.get(contact.stage);
            const toneCx = tone ? TONE_CLASSES[tone] : null;
            const isStage = stagesData.some(s => s.label === contact.stage);
            const touch = lastTouchByContact.get(contact.id);
            const ms = touch?.ms ?? parseMs(contact.createdAt);
            const days = ms != null ? daysSince(ms) : null;
            const overdue = days != null && days >= 7;
            const note = (touch?.note || contact.notes || '').trim();
            const sub = [contact.role, contact.location].filter(Boolean).join(' · ');
            const tags = (contact.tags || []).filter(Boolean);
            const selected = selectedIds.has(contact.id);

            return (
              <div
                key={contact.id}
                onClick={() => setSelectedContact(contact)}
                className={cn(
                  "group relative bg-surface rounded-2xl border border-outline-variant/60 p-5 transition-colors cursor-pointer",
                  toneCx ? toneCx.cardHoverBorder : "hover:border-primary/40",
                  selected && "border-primary bg-primary/5"
                )}
              >
                <div className="flex gap-4 min-w-0">
                  {/* Select checkbox */}
                  <button
                    onClick={(e) => toggleSelect(contact.id, e)}
                    className={cn(
                      "mt-0.5 w-5 h-5 rounded-md border-2 shrink-0 flex items-center justify-center transition-all",
                      selected
                        ? "bg-primary border-primary opacity-100"
                        : "border-outline opacity-40 group-hover:opacity-100 hover:border-primary"
                    )}
                    title={selected ? 'Deselect' : 'Select'}
                  >
                    {selected && <Check className="w-3 h-3 text-on-primary" strokeWidth={3} />}
                  </button>

                  <Avatar contact={contact} />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-serif text-lg text-on-surface leading-tight">{contact.name}</span>
                      <span
                        className={cn(
                          "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap",
                          toneCx && isStage ? cn(toneCx.chipBg, toneCx.chipText) : "bg-surface-variant text-on-surface-variant"
                        )}
                      >
                        {isStage ? contact.stage : 'Unassigned'}
                      </span>
                    </div>
                    {sub && (
                      <div className="text-sm text-on-surface-variant mt-0.5 truncate">{sub}</div>
                    )}
                    {days != null ? (
                      <div className={cn(
                        "flex items-center gap-1.5 text-sm mt-1",
                        overdue ? "text-stage-amber font-medium" : "text-on-surface-variant"
                      )}>
                        {overdue && <span className="w-1.5 h-1.5 rounded-full bg-stage-amber shrink-0" aria-hidden />}
                        {connectedLabel(days)}
                      </div>
                    ) : (
                      <div className="text-sm text-on-surface-variant/70 italic mt-1">No contact logged yet.</div>
                    )}
                    {note && (
                      <p className="text-sm text-on-surface-variant leading-relaxed mt-2">
                        <span className="text-on-surface-variant/70">Lately:</span> {truncate(note, 120)}
                      </p>
                    )}
                    {tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2.5">
                        {tags.map((t) => (
                          <span
                            key={t}
                            className={cn(
                              "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium",
                              toneCx ? cn(toneCx.tagBg, toneCx.tagText) : "bg-surface-variant text-on-surface-variant"
                            )}
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Quick email */}
                  {contact.email && (
                    <a
                      href={`mailto:${contact.email}`}
                      onClick={(e) => e.stopPropagation()}
                      className="self-start hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-outline-variant text-xs font-medium text-on-surface hover:bg-surface-variant transition-colors shrink-0"
                    >
                      <Mail className="w-3.5 h-3.5" /> Email
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Tag Modal ── */}
      <AnimatePresence>
        {isTagModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsTagModalOpen(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-sm bg-surface-container-high rounded-3xl shadow-2xl overflow-hidden border border-outline-variant"
            >
              <div className="p-6 border-b border-outline-variant">
                <h2 className="font-serif text-2xl text-on-surface">Add a tag</h2>
                <p className="text-sm text-on-surface-variant mt-1">
                  For {selectedIds.size} selected {selectedIds.size === 1 ? 'person' : 'people'}
                </p>
              </div>

              <form onSubmit={handleBulkTag} className="p-6 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-on-surface-variant px-1">Tag</label>
                  <input
                    required
                    autoFocus
                    type="text"
                    value={newTag}
                    onChange={e => setNewTag(e.target.value)}
                    className="w-full h-12 px-4 rounded-xl bg-surface border border-outline-variant focus:border-primary outline-none transition-colors text-on-surface"
                    placeholder="e.g. leader-track"
                  />
                </div>

                <div className="pt-2 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setIsTagModalOpen(false)}
                    className="flex-1 h-12 rounded-full font-medium text-on-surface-variant hover:bg-surface-variant transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 h-12 bg-primary text-on-primary rounded-full font-medium hover:opacity-90 transition-opacity"
                  >
                    Add tag
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
    </PageContainer>
  );
}
