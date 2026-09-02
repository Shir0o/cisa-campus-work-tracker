import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Search,
  Filter,
  Mail,
  Tag,
  Kanban,
  Trash2,
  Check,
  Plus,
  Sparkles,
  Combine
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
import { useLanguage } from '../components/LanguageProvider';
import { prefetchTranslations } from '../lib/translator';
import { visibleContacts, seesAllPeople } from '../lib/permissions';
import { Contact, Stage } from '../types';
import { Skeleton } from '../components/ui/Skeleton';
import { DataLoadError } from '../components/ui/DataLoadError';
import PageContainer from '../components/layout/PageContainer';
import CombineTagsModal from '../components/modals/CombineTagsModal';
import { RowActions } from '../components/ui/RowActions';
import { buildContactRowActions } from '../lib/rowActions';
import { UserEntityState } from '../lib/userEntityState';
import { normalizeTag, normalizeTagList, tagStyle, getEffectiveContactTags } from '../lib/tags';
import { subscribeAllThreads } from '../lib/threads';
import { Translate } from '../components/Translate';

// ── Field Notes helpers (mirror Dashboard.tsx / OutreachBoard.tsx) ──────────
const DAY_MS = 86_400_000;
const parseMs = (s?: any): number | null => {
  if (!s) return null;
  if (typeof s?.toMillis === 'function') return s.toMillis();
  if (typeof s?.toDate === 'function') return s.toDate().getTime();
  if (typeof s?.seconds === 'number') return s.seconds * 1000;
  if (typeof s === 'number') return Number.isNaN(s) ? null : s;
  const t = new Date(s).getTime();
  return Number.isNaN(t) ? null : t;
};
const daysSince = (ms: number) => Math.max(0, Math.floor((Date.now() - ms) / DAY_MS));

const connectedLabel = (d: number) =>
  d === 0 ? 'Connected today' : d === 1 ? 'Last connected yesterday' : `Last connected ${d} days ago`;

const truncate = (str: string, len: number) =>
  str.length > len ? str.slice(0, len) + '…' : str;

type Touch = { ms: number; note: string };
type TouchMap = Map<string, Touch>;

// The eight matched stage tones (styles.css --t-*). Stored stage colors (bg-board-*) map onto these.
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
  const { user, role, effectiveUserId } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [stagesData, setStagesData] = useState<Stage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // ── Last-connected signal: most recent interaction/comment per contact ──
  const [touches, setTouches] = useState<{ contactId: string; ms: number; note: string }[]>([]);

  // Track whether both primary snapshots have arrived. Previously this effect
  // waited an artificial 800ms, which caused a skeleton flash every time the
  // people page remounted (e.g. after closing a contact detail).
  const contactsLoadedRef = useRef(false);
  const stagesLoadedRef = useRef(false);
  const { language, t } = useLanguage();
  const peopleCountLabel = (n: number) =>
    n === 0 ? t('directory.no_one_yet') : n === 1 ? t('directory.one_person') : t('directory.n_people').replace('{n}', String(n));

  // Warm translation cache for visible contact notes when Spanish is active.
  useEffect(() => {
    if (language !== 'es') return;
    void prefetchTranslations(
      contacts.flatMap((c) => [c.notes, c.name]),
      language,
    );
  }, [contacts, language]);

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
      contactsLoadedRef.current = true;
      if (stagesLoadedRef.current) setLoading(false);
    }, (e) => onLoadError(e, 'contacts'));

    const qStages = query(collection(db, 'stages'), orderBy('order', 'asc'));
    const unsubscribeStages = onSnapshot(qStages, (snapshot) => {
      const stages = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Stage[];
      setStagesData(stages);
      stagesLoadedRef.current = true;
      if (contactsLoadedRef.current) setLoading(false);
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
        const rawDate = data.dateTime || data.createdAt || data.date;
        return {
          contactId: d.ref.path.split('/')[1],
          ms: parseMs(rawDate) ?? NaN,
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
          ms: parseMs(m.at) ?? NaN,
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

  const [filterStage, setFilterStage] = useState<string>('All');
  const [filterRole, setFilterRole] = useState<string>('All');
  const [filterSpiritualBackground, setFilterSpiritualBackground] = useState<string>('All');
  const [filterAddedWhen, setFilterAddedWhen] = useState<'all' | 'today' | 'week' | 'month'>('all');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [isTagModalOpen, setIsTagModalOpen] = useState(false);
  const [isStageModalOpen, setIsStageModalOpen] = useState(false);
  const [bulkStage, setBulkStage] = useState('');
  const [isCombineTagsOpen, setIsCombineTagsOpen] = useState(false);
  const [newTag, setNewTag] = useState('');
  const [showFilterMenu, setShowFilterMenu] = useState(false);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsTagModalOpen(false);
        setIsStageModalOpen(false);
        setIsCombineTagsOpen(false);
        setShowFilterMenu(false);
      }
    };
    if (isTagModalOpen || isStageModalOpen || isCombineTagsOpen || showFilterMenu) {
      window.addEventListener('keydown', handleEsc);
    }
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isTagModalOpen, isStageModalOpen, isCombineTagsOpen, showFilterMenu]);

  // Days since last connected (interaction/comment, else createdAt) for a contact.
  const daysFor = (c: Contact): number | null => {
    const ms = lastTouchByContact.get(c.id)?.ms ?? parseMs(c.createdAt);
    return ms != null ? daysSince(ms) : null;
  };

  const staffId = effectiveUserId || user?.uid;
  const userContacts = useMemo(() => visibleContacts(role, staffId, contacts), [role, staffId, contacts]);

  const filteredContacts = useMemo(() => {
    let result = userContacts;

    // Search
    if (searchQuery) {
      const lowerQuery = searchQuery.toLowerCase();
      result = result.filter(c => {
        const effectiveTags = getEffectiveContactTags(c.tags, c.createdAt);
        return (
          c.name.toLowerCase().includes(lowerQuery) ||
          c.email.toLowerCase().includes(lowerQuery) ||
          c.role.toLowerCase().includes(lowerQuery) ||
          (c.spiritualBackground && c.spiritualBackground.toLowerCase().includes(lowerQuery)) ||
          effectiveTags.some(t => normalizeTag(t).toLowerCase().includes(lowerQuery))
        );
      });
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

    // Filter by Added When
    if (filterAddedWhen !== 'all') {
      result = result.filter(c => {
        const ms = parseMs(c.createdAt);
        if (ms == null) return false;
        const d = daysSince(ms);
        if (filterAddedWhen === 'today') return d === 0;
        if (filterAddedWhen === 'week') return d <= 7;
        if (filterAddedWhen === 'month') return d <= 30;
        return true;
      });
    }

    // Filter by Tags (compare normalized values so compact season variants like
    // "Fall2025" match the displayed "Fall 2025" chip, including dynamic '#new').
    if (selectedTags.length > 0) {
      result = result.filter(c => {
        const effectiveTags = getEffectiveContactTags(c.tags, c.createdAt);
        return selectedTags.every(tag => effectiveTags.some(t => normalizeTag(t).toLowerCase() === tag.toLowerCase()));
      });
    }

    return result;
  }, [userContacts, searchQuery, filterStage, filterRole, filterSpiritualBackground, filterAddedWhen, selectedTags]);

  // Stage color per stage label.
  const stageColorByLabel = useMemo(() => {
    const map = new Map<string, string>();
    stagesData.forEach((s) => map.set(s.label, s.color));
    return map;
  }, [stagesData]);

  const handleBulkTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedIds.size === 0 || !newTag.trim()) return;
    const normalizedTag = normalizeTag(newTag.trim());

    try {
      const batch = writeBatch(db);
      const selectedContacts = userContacts.filter(c => selectedIds.has(c.id));

      selectedContacts.forEach(contact => {
        const currentTags = contact.tags || [];
        if (!currentTags.some(t => normalizeTag(t).toLowerCase() === normalizedTag.toLowerCase())) {
          const updatedTags = [...currentTags, normalizedTag];
          batch.update(doc(db, 'contacts', contact.id), {
            tags: updatedTags,
            updatedAt: new Date().toISOString(),
            updatedBy: user?.uid,
            updatedByName: user?.displayName || user?.email?.split('@')[0] || 'Unknown User'
          });

          logActivity({
            action: `added tag #${normalizedTag} to`,
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

  const handleBulkStage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedIds.size === 0 || !bulkStage) return;

    try {
      const batch = writeBatch(db);
      const selectedContacts = userContacts.filter(c => selectedIds.has(c.id));

      selectedContacts.forEach(contact => {
        if (contact.stage !== bulkStage) {
          batch.update(doc(db, 'contacts', contact.id), {
            stage: bulkStage,
            updatedAt: new Date().toISOString(),
            updatedBy: user?.uid,
            updatedByName: user?.displayName || user?.email?.split('@')[0] || 'Unknown User'
          });

          logActivity({
            action: `updated stage to ${bulkStage} for`,
            targetId: contact.id,
            targetName: contact.name,
            targetType: 'contact',
            type: 'edit',
            description: `Stage: "${contact.stage || 'Unassigned'}" → "${bulkStage}"`
          });
        }
      });
      await batch.commit();
      setBulkStage('');
      setIsStageModalOpen(false);
      setSelectedIds(new Set());
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'contacts');
    }
  };

  const filterStages = useMemo(() => ['All', ...new Set(stagesData.map(s => s.label))], [stagesData]);
  // Contacts without a group (blank/missing role) would otherwise render a
  // blank option in the dropdown — drop them (#359).
  const filterRoles = useMemo(() => ['All', ...new Set(userContacts.map(c => c.role).filter(Boolean))], [userContacts]);
  const filterSpiritualBackgrounds = useMemo(() => ['All', ...new Set(userContacts.map(c => c.spiritualBackground).filter(Boolean))], [userContacts]);
  const allTags = useMemo(() => normalizeTagList(userContacts.flatMap(c => getEffectiveContactTags(c.tags, c.createdAt))), [userContacts]);

  const newCount = useMemo(
    () => userContacts.filter(c => {
      const ms = parseMs(c.createdAt);
      return ms != null && daysSince(ms) <= 14;
    }).length,
    [userContacts],
  );
  const overdueCount = useMemo(
    () => userContacts.filter(c => {
      const d = daysFor(c);
      return d != null && d >= 7;
    }).length,
    [userContacts, lastTouchByContact],
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
    setFilterAddedWhen('all');
    setSelectedTags([]);
  };

  const hasActiveFilters = searchQuery !== '' || filterStage !== 'All' || filterRole !== 'All' || filterSpiritualBackground !== 'All' || filterAddedWhen !== 'all' || selectedTags.length > 0;

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
    if (!confirm(t('directory.confirm_remove').replace('{n}', String(selectedIds.size)).replace('{count}', selectedIds.size === 1 ? t('directory.person') : t('directory.people')))) return;

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
          <h1 className="font-serif page-title text-on-surface">{t('directory.title')}</h1>
          <p className="text-base text-on-surface-variant leading-relaxed mt-2 max-w-2xl">
            <b className="text-on-surface font-semibold">
              {userContacts.length} {userContacts.length === 1 ? t('directory.person') : t('directory.people')}
            </b>{' '}
            {t('directory.in_your_care')}
            {newCount > 0 && (
              <>
                {' '}— <span className="text-on-surface font-medium">{newCount}</span> {t('directory.new_in_last_two_weeks')}
              </>
            )}
            {overdueCount > 0 && (
              <>
                , and <span className="text-on-surface font-medium">{overdueCount}</span> {t('directory.you_havent_connected')}
              </>
            )}
            .
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
          <button
            onClick={() => setIsCombineTagsOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-outline-variant text-on-surface-variant text-sm font-medium hover:bg-surface-variant transition-colors shrink-0"
            title={t('directory.combine_tags')}
          >
            <Combine className="w-4 h-4" /> {t('directory.combine_tags')}
          </button>
          <button
            onClick={() => openSmartImport()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-accent-line bg-primary/10 text-accent text-sm font-medium hover:bg-primary/20 transition-colors shrink-0"
          >
            <Sparkles className="w-4 h-4 text-accent" /> {t('directory.smart_import')}
          </button>
          <button
            onClick={() => openNewContact()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary text-on-primary text-sm font-medium hover:opacity-90 transition-opacity shrink-0"
          >
            <Plus className="w-4 h-4" /> {t('actions.add_someone')}
          </button>
        </div>
      </header>

      {/* ── Search + filters ── */}
      <div className="flex flex-wrap items-center gap-3 mt-8">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
          <input
            type="text"
            placeholder={t('directory.find_someone')}
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
                ? "border-primary text-accent bg-primary/5"
                : "border-outline-variant text-on-surface-variant hover:bg-surface-variant"
            )}
          >
            <Filter className="w-4 h-4" />
            {t('directory.filters')}
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
                  className="absolute top-13 right-0 mt-2 z-40 bg-surface-container-high border border-outline-variant rounded-3xl shadow-xl p-4 min-w-[240px] max-w-[calc(100vw-2rem)] space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-on-surface">{t('directory.narrow_it_down')}</span>
                    {hasActiveFilters && (
                      <button
                        onClick={clearFilters}
                        className="text-xs font-medium text-accent hover:underline"
                      >
                        {t('directory.clear_all')}
                      </button>
                    )}
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-on-surface-variant px-1">{t('directory.stage')}</label>
                      <select
                        value={filterStage}
                        onChange={(e) => setFilterStage(e.target.value)}
                        className="w-full h-10 px-3 rounded-xl border border-outline-variant bg-surface text-sm text-on-surface outline-none focus:border-primary cursor-pointer"
                      >
                        {filterStages.map(s => <option key={s} value={s}>{s === 'All' ? t('directory.all_stages') : s}</option>)}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-on-surface-variant px-1">{t('directory.group')}</label>
                      <select
                        value={filterRole}
                        onChange={(e) => setFilterRole(e.target.value)}
                        className="w-full h-10 px-3 rounded-xl border border-outline-variant bg-surface text-sm text-on-surface outline-none focus:border-primary cursor-pointer"
                      >
                        {filterRoles.map(r => <option key={r} value={r}>{r === 'All' ? t('directory.all_groups') : r}</option>)}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-on-surface-variant px-1">{t('directory.spiritual_background')}</label>
                      <select
                        value={filterSpiritualBackground}
                        onChange={(e) => setFilterSpiritualBackground(e.target.value)}
                        className="w-full h-10 px-3 rounded-xl border border-outline-variant bg-surface text-sm text-on-surface outline-none focus:border-primary cursor-pointer"
                      >
                        {filterSpiritualBackgrounds.map(sb => <option key={sb} value={sb}>{sb === 'All' ? t('directory.all_backgrounds') : sb}</option>)}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-on-surface-variant px-1">{t('directory.added_when')}</label>
                      <select
                        value={filterAddedWhen}
                        onChange={(e) => setFilterAddedWhen(e.target.value as 'all' | 'today' | 'week' | 'month')}
                        className="w-full h-10 px-3 rounded-xl border border-outline-variant bg-surface text-sm text-on-surface outline-none focus:border-primary cursor-pointer"
                      >
                        <option value="all">{t('directory.all_time')}</option>
                        <option value="today">{t('directory.added_today')}</option>
                        <option value="week">{t('directory.added_this_week')}</option>
                        <option value="month">{t('directory.added_this_month')}</option>
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
      <div className="flex flex-wrap items-center justify-between gap-3 mt-8 mb-4">
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
              ? t('directory.selected_count').replace('{n}', String(selectedIds.size))
              : !seesAllPeople(role)
                ? filteredContacts.length === userContacts.length
                  ? `${peopleCountLabel(filteredContacts.length)} — ${t('directory.everyone_you_added')}`
                  : t('directory.of_people_added').replace('{shown}', String(filteredContacts.length)).replace('{total}', String(userContacts.length))
                : filteredContacts.length === userContacts.length
                  ? peopleCountLabel(filteredContacts.length)
                  : t('directory.of_people').replace('{shown}', String(filteredContacts.length)).replace('{total}', String(userContacts.length))}
          </span>
        </label>

        <AnimatePresence>
          {selectedIds.size > 0 && (
            <motion.div
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              className="flex flex-wrap items-center gap-1"
            >
              <button
                onClick={() => {
                  setBulkStage(stagesData[0]?.label || '');
                  setIsStageModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm text-on-surface-variant hover:bg-surface-variant transition-colors"
                title={t('directory.change_stage_for_selected')}
              >
                <Kanban className="w-4 h-4" /> {t('directory.stage')}
              </button>
              <button
                onClick={() => setIsTagModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm text-on-surface-variant hover:bg-surface-variant transition-colors"
                title={t('directory.tag_selected')}
              >
                <Tag className="w-4 h-4" /> {t('directory.tag')}
              </button>
              <button
                onClick={handleBulkEmail}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm text-on-surface-variant hover:bg-surface-variant transition-colors"
                title={t('directory.email_selected')}
              >
                <Mail className="w-4 h-4" /> {t('directory.email')}
              </button>
              <button
                onClick={handleBulkDelete}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm text-error hover:bg-error/10 transition-colors"
                title={t('directory.remove_selected')}
              >
                <Trash2 className="w-4 h-4" /> {t('directory.remove')}
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
          <h3 className="font-serif text-xl text-on-surface mb-1">{t('directory.no_matches_title')}</h3>
          <p className="text-sm text-on-surface-variant">{t('directory.no_matches_body')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          {filteredContacts.map((contact) => {
            const stageColor = stageColorByLabel.get(contact.stage);
            const isStage = stagesData.some(s => s.label === contact.stage);
            const tStyle = isStage ? toneStyle(stageColor) : undefined;
            const touch = lastTouchByContact.get(contact.id);
            const contactLastMs = parseMs(contact.lastContactedDate) ?? parseMs(contact.lastSeen);
            const touchMs = touch?.ms;
            const bestMs = Math.max(touchMs ?? -Infinity, contactLastMs ?? -Infinity);
            const ms = Number.isFinite(bestMs) && bestMs > 0 ? bestMs : parseMs(contact.createdAt);
            const days = ms != null ? daysSince(ms) : null;
            const overdue = days != null && days >= 7;
            const note = (touch?.note || contact.notes || '').trim();
            const sub = [contact.role].filter(Boolean).join(' · ');
            const tags = getEffectiveContactTags(contact.tags, contact.createdAt);
            const selected = selectedIds.has(contact.id);

            return (
              <div
                key={contact.id}
                onClick={() => setSelectedContact(contact)}
                style={tStyle}
                className={cn(
                  "group relative bg-surface rounded-3xl border border-outline-variant/60 p-5 transition-colors cursor-pointer hover:border-[var(--tone)]",
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
                    title={selected ? t('directory.deselect') : t('directory.select')}
                  >
                    {selected && <Check className="w-3 h-3 text-on-primary" strokeWidth={3} />}
                  </button>

                  <Avatar contact={contact} />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-serif text-lg text-on-surface leading-tight">{contact.name}</span>
                      <span
                        style={tStyle}
                        className={cn(
                          "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap",
                          isStage ? "bg-[var(--tone-soft)] text-[var(--tone)]" : "bg-surface-variant text-on-surface-variant"
                        )}
                      >
                        {isStage ? contact.stage : t('directory.unassigned')}
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
                        <Translate text={connectedLabel(days)} />
                      </div>
                    ) : (
                      <div className="text-sm text-on-surface-variant/70 italic mt-1">{t('directory.no_contact_logged')}</div>
                    )}
                    {note && (
                      <p className="text-sm text-on-surface-variant leading-relaxed mt-2">
                        <span className="text-on-surface-variant/70">{t('directory.lately')}</span> <Translate text={truncate(note, 120)} />
                      </p>
                    )}
                    {tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2.5">
                        {tags.map((t) => (
                          <span
                            key={t}
                            style={tagStyle(t)}
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-[var(--tone-soft)] text-[var(--tone)]"
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
                      <Mail className="w-3.5 h-3.5" /> {t('directory.email')}
                    </a>
                  )}

                  <RowActions
                    className="self-start"
                    label={`${t('directory.more_for')} ${contact.name}`}
                    items={buildContactRowActions({
                      contact,
                      onOpen: () => setSelectedContact(contact),
                      onFollowUp: () => {
                        if (!user?.uid) return;
                        UserEntityState.markDone(user.uid, `contact:${contact.id}`);
                        UserEntityState.markDone(user.uid, contact.id);
                      },
                      hide: ['todo', 'share'],
                    })}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Combine Tags Modal (dry-run) ── */}
      {isCombineTagsOpen && (
        <CombineTagsModal
          contacts={userContacts}
          onClose={() => setIsCombineTagsOpen(false)}
        />
      )}

      {/* ── Bulk Stage Modal ── */}
      <AnimatePresence>
        {isStageModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsStageModalOpen(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-sm bg-surface-container-high rounded-3xl shadow-2xl overflow-hidden border border-outline-variant"
            >
              <div className="p-6 border-b border-outline-variant">
                <h2 className="font-serif text-2xl text-on-surface">{t('directory.change_stage')}</h2>
                <p className="text-sm text-on-surface-variant mt-1">
                  {t('directory.for_selected').replace('{n}', String(selectedIds.size)).replace('{count}', selectedIds.size === 1 ? t('directory.person') : t('directory.people'))}
                </p>
              </div>

              <form onSubmit={handleBulkStage} className="p-6 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-on-surface-variant px-1">{t('directory.stage')}</label>
                  <select
                    required
                    data-testid="bulk-stage-select"
                    value={bulkStage}
                    onChange={e => setBulkStage(e.target.value)}
                    className="w-full h-12 px-4 rounded-xl bg-surface border border-outline-variant focus:border-primary outline-none transition-colors text-on-surface"
                  >
                    {stagesData.map(s => (
                      <option key={s.id} value={s.label}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="pt-2 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setIsStageModalOpen(false)}
                    className="flex-1 h-12 rounded-full font-medium text-on-surface-variant hover:bg-surface-variant transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 h-12 bg-primary text-on-primary rounded-full font-medium hover:opacity-90 transition-opacity"
                  >
                    Update stage
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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
                <h2 className="font-serif text-2xl text-on-surface">{t('directory.add_a_tag')}</h2>
                <p className="text-sm text-on-surface-variant mt-1">
                  {t('directory.for_selected').replace('{n}', String(selectedIds.size)).replace('{count}', selectedIds.size === 1 ? t('directory.person') : t('directory.people'))}
                </p>
              </div>

              <form onSubmit={handleBulkTag} className="p-6 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-on-surface-variant px-1">{t('directory.tag')}</label>
                  <input
                    required
                    autoFocus
                    type="text"
                    value={newTag}
                    onChange={e => setNewTag(e.target.value)}
                    className="w-full h-12 px-4 rounded-xl bg-surface border border-outline-variant focus:border-primary outline-none transition-colors text-on-surface"
                    placeholder={t('directory.tag_placeholder')}
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
