import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, Command, User } from 'lucide-react';
import {
  collection,
  onSnapshot,
  query,
} from 'firebase/firestore';
import { db, auth } from '../../lib/firebase';
import { Contact } from '../../types';
import { cn } from '../../lib/utils';
import { useCommand } from '../../lib/commands';
import { useFrecency, rankByFrecency, Frecency } from '../../lib/frecency';
import { useLayout } from '../../App';
import { useAuth } from '../AuthProvider';
import { contactVisibilityConstraints } from '../../lib/contactQueries';
import { useLanguage } from '../LanguageProvider';
import { UsageStats } from '../../lib/usageStats';
import { matchContact, type ContactMatch } from '../../lib/contactMatch';
import { motion, AnimatePresence } from 'motion/react';

// Cap so the panel stays scannable.
const GS_MAX = 4;

interface NavItem {
  key: string;
  run: () => void;
}

export default function GlobalSearch() {
  const { setSelectedContact, searchOpen, setSearchOpen } = useLayout();
  const { role } = useAuth();
  const { t } = useLanguage();

  const currentUid = auth.currentUser?.uid || '';
  useFrecency(currentUid);

  const [q, setQ] = useState('');
  const [cursor, setCursor] = useState(-1);
  const resolvedRef = useRef(false);

  const [contacts, setContacts] = useState<Contact[]>([]);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const desktopInputRef = useRef<HTMLInputElement>(null);
  const mobileInputRef = useRef<HTMLInputElement>(null);

  const ql = q.trim().toLowerCase();
  const hasQ = ql.length > 0;

  const close = () => {
    const uid = auth.currentUser?.uid;
    if (uid && hasQ) {
      UsageStats.record(uid, {
        type: 'search',
        path: typeof window !== 'undefined' ? window.location.pathname : '/',
        role: role || undefined,
        meta: resolvedRef.current ? 'resolved' : 'abandoned',
      });
    }
    resolvedRef.current = false;
    setSearchOpen(false);
    setQ('');
    setCursor(-1);
  };

  // ── the one data listener: the people this role may see ────────────────────
  useEffect(() => {
    if (!searchOpen || !auth.currentUser) return;
    const unsub = onSnapshot(
      query(collection(db, 'contacts'), ...contactVisibilityConstraints(role, currentUid)),
      (snap) => setContacts(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Contact[]),
      (err) => console.error('GlobalSearch contacts listener:', err),
    );
    return () => unsub();
  }, [searchOpen, role, currentUid]);

  // ── results: recent people, or the people a query matches ─────────────────
  const recentPeople = useMemo(() => {
    // serverTimestamp() stamps arrive as Timestamp objects even though the
    // Contact type types them as strings — normalize before localeCompare,
    // which throws "x.localeCompare is not a function" on a non-string (#354).
    const stampKey = (v: unknown): string => {
      if (typeof v === 'string' && v) return v;
      if (
        v &&
        typeof v === 'object' &&
        typeof (v as { toDate?: unknown }).toDate === 'function'
      ) {
        return (v as { toDate: () => Date }).toDate().toISOString();
      }
      return '';
    };
    const tieBreaker = (a: Contact, b: Contact) => {
      const keyA = stampKey(a.updatedAt || a.createdAt || a.lastSeen);
      const keyB = stampKey(b.updatedAt || b.createdAt || b.lastSeen);
      return keyB.localeCompare(keyA);
    };
    return rankByFrecency(currentUid, contacts, (c) => c.id, tieBreaker).slice(0, GS_MAX);
  }, [contacts, currentUid]);

  const peopleResults = useMemo(() => {
    if (!hasQ) return [];
    // Word-boundary, name-first (#1192): a query matches a whole word, so
    // "ian" finds a person named Ian rather than every "Christian". Frecency
    // ranks *within* each tier — name matches always come before field-only
    // matches and fill the cap first, while still being frecency-ordered.
    const needle = q.trim();
    const scored: { c: Contact; match: ContactMatch }[] = [];
    for (const c of contacts) {
      const m = matchContact(c, needle, [
        c.notes,
        c.spiritualBackground,
        (c.interests || []).join(' '),
        (c.tags || []).join(' '),
      ]);
      if (m) scored.push({ c, match: m });
    }
    const name = rankByFrecency(currentUid, scored.filter((s) => s.match.quality === 'name').map((s) => s.c), (c) => c.id);
    const field = rankByFrecency(currentUid, scored.filter((s) => s.match.quality === 'field').map((s) => s.c), (c) => c.id);
    return [...name, ...field].slice(0, GS_MAX);
  }, [hasQ, q, contacts, currentUid]);

  // ── actions ─────────────────────────────────────────────────────────────
  const openContactById = (id?: string) => {
    if (id) {
      const c = contacts.find((x) => x.id === id);
      if (c) {
        if (currentUid) Frecency.recordOpen(currentUid, c.id);
        setSelectedContact(c);
      }
      resolvedRef.current = true;
    }
    close();
  };

  // ── flat list for keyboard nav ────────────────────────────────────────────
  const navItems: NavItem[] = [];
  if (!hasQ) {
    recentPeople.forEach((c) => navItems.push({ key: `c:${c.id}`, run: () => openContactById(c.id) }));
  } else {
    peopleResults.forEach((c) => navItems.push({ key: `c:${c.id}`, run: () => openContactById(c.id) }));
  }
  const indexByKey: Record<string, number> = {};
  navItems.forEach((it, idx) => (indexByKey[it.key] = idx));

  const hasResults = !hasQ || peopleResults.length > 0;

  // Keep latest nav state in a ref so the keydown handler stays stable.
  const navRef = useRef<{ items: NavItem[]; cursor: number }>({ items: navItems, cursor });
  navRef.current = { items: navItems, cursor };

  // ── keyboard: ⌘K opens (always on) — via the central shortcut registry ──
  useCommand({
    id: 'search.open',
    scope: 'global',
    description: t('search.open_search'),
    shortcut: { key: 'k', mod: true },
    hidden: true,
    handler: () => setSearchOpen(true),
  });

  // ── keyboard: ↑↓ navigate · ↵ open · Esc close (only while open) ──────────
  useEffect(() => {
    if (!searchOpen) return;
    const onKey = (e: KeyboardEvent) => {
      const { items, cursor: cur } = navRef.current;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setCursor((c) => Math.min(c + 1, items.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setCursor((c) => Math.max(c - 1, -1));
      } else if (e.key === 'Enter' && cur >= 0 && items[cur]) {
        e.preventDefault();
        items[cur].run();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchOpen]);

  // Reset cursor whenever the query changes.
  useEffect(() => {
    setCursor(-1);
  }, [q]);

  // Hand focus back to the trigger when the palette closes, so Tab order picks
  // up where the palette interrupted it. `wasOpen` keeps a first render (with
  // nothing ever opened) from stealing focus onto the trigger.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (searchOpen) {
      wasOpen.current = true;
    } else if (wasOpen.current) {
      wasOpen.current = false;
      triggerRef.current?.focus();
    }
  }, [searchOpen]);

  // Focus the visible input + lock body scroll while open.
  useEffect(() => {
    if (!searchOpen) return;
    const t = setTimeout(() => {
      const isDesktop =
        typeof window.matchMedia === 'function'
          ? window.matchMedia('(min-width: 1024px)').matches
          : true;
      if (isDesktop) desktopInputRef.current?.focus();
      else mobileInputRef.current?.focus();
    }, 50);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      clearTimeout(t);
      document.body.style.overflow = prevOverflow;
    };
  }, [searchOpen]);

  // ── row primitives ────────────────────────────────────────────────────────
  const Row = ({
    navKey,
    title,
    sub,
    onClick,
  }: {
    navKey: string;
    title: string;
    sub?: string;
    onClick: () => void;
  }) => {
    const idx = indexByKey[navKey];
    const active = idx !== undefined && idx === cursor;
    return (
      <button
        type="button"
        onMouseEnter={() => idx !== undefined && setCursor(idx)}
        onClick={onClick}
        className={cn(
          'w-full flex items-center gap-3 px-2.5 py-2 rounded-xl text-left transition-colors',
          active ? 'bg-surface-container-highest' : 'hover:bg-[rgba(203,212,225,0.2)]',
        )}
      >
        <span className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 bg-stage-accent-soft text-stage-accent">
          <User className="w-3.5 h-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] font-semibold truncate text-on-surface">
            {title}
          </span>
          {sub && <span className="block text-[12px] text-on-surface-variant truncate">{sub}</span>}
        </span>
      </button>
    );
  };

  const GroupLabel = ({ children }: { children: React.ReactNode }) => (
    <div className="px-2.5 pt-3 pb-1 text-xs font-medium text-on-surface-variant/70">
      {children}
    </div>
  );

  const personRow = (c: Contact) => (
    <Row
      key={c.id}
      navKey={`c:${c.id}`}
      title={c.name}
      sub={[c.year, c.major].filter(Boolean).join(' · ') || undefined}
      onClick={() => openContactById(c.id)}
    />
  );

  // ── panel body (shared by desktop dropdown + mobile overlay) ───────────────
  const panelBody = (
    <div className="px-2 pb-2">
      {!hasQ ? (
        recentPeople.length > 0 ? (
          <div>
            <GroupLabel>{t('search.recent_people')}</GroupLabel>
            {recentPeople.map(personRow)}
          </div>
        ) : null
      ) : !hasResults ? (
        <div className="px-3 py-10 text-center text-[13.5px] text-on-surface-variant italic">
          {t('search.nothing_came_up').replace('{q}', q)}
        </div>
      ) : (
        <div>
          <GroupLabel>{t('search.people')}</GroupLabel>
          {peopleResults.map(personRow)}
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* ── Desktop: the topbar trigger. It opens the palette; it holds no
             field of its own, so the caret and the results it drives stay
             together inside the popup (#689). ── */}
      <div className="relative w-[300px] hidden lg:block">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setSearchOpen(true)}
          aria-label={t('search.open_search')}
          aria-haspopup="dialog"
          aria-expanded={searchOpen}
          className={cn(
            'relative flex items-center w-full h-10 rounded-2xl transition-shadow text-left cursor-pointer bg-surface',
            // The hover ring was a literal #525E6F — a Bento blue-grey, off
            // Ink's neutral axis and identical in both themes. `--accent-line`
            // is already a theme-dependent low-alpha ink, which is what a
            // hover ring wants. See docs/design/DRIFT.md #7.
            'shadow-[inset_0_0_0_1px_var(--gs-outline)] hover:shadow-[inset_0_0_0_1px_var(--accent-line)] focus:outline-none focus:shadow-[inset_0_0_0_2px_var(--color-accent)]',
          )}
        >
          <span className="grid place-items-center h-full w-11 text-on-surface-variant shrink-0">
            <Search className="w-4 h-4" />
          </span>
          <span className="flex-1 min-w-0 pr-12 text-sm font-medium text-on-surface-variant/70 truncate">
            {t('search.search_people')}
          </span>
          {/* The ⌘K hint is permanent now — nothing swaps into its slot. */}
          <span className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex items-center gap-0.5 h-5 px-1.5 rounded-sm bg-background border border-outline-variant text-[12px] font-medium text-on-surface-variant pointer-events-none">
            <Command className="w-3 h-3" />
            <span>K</span>
          </span>
        </button>
      </div>

      {/* ── Desktop: centred popup (portal) ──────────────────────────────────
             Portalled to the body so the panel lands in the same place in both
             shells — anchored to the trigger it inherited the bar's stacking
             and clipping context, and moved with whichever shell mounted it. */}
      {createPortal(
        <AnimatePresence>
          {searchOpen && (
            <motion.div
              key="gs-popup"
              className="hidden lg:flex fixed inset-0 z-[100] items-start justify-center pt-24 px-4"
            >
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                onClick={close}
                data-testid="gs-scrim"
                className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.97, y: -8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97, y: -8 }}
                transition={{ duration: 0.12 }}
                role="dialog"
                aria-modal="true"
                aria-label={t('nav.search')}
                className="relative w-[640px] max-w-[calc(100vw-2rem)] bg-surface rounded-3xl shadow-[var(--shadow-pop)] border border-outline-variant overflow-hidden"
              >
                <div className="flex items-center gap-3 h-14 px-[18px] border-b border-outline-variant">
                  <Search className="w-[18px] h-[18px] text-on-surface-variant shrink-0" />
                  <input
                    ref={desktopInputRef}
                    type="text"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    className="flex-1 min-w-0 h-full bg-transparent outline-none text-[15px] text-on-surface font-medium placeholder:text-on-surface-variant/70 border-0 ring-0 focus:outline-none focus:ring-0"
                    placeholder={t('search.search_people')}
                    aria-label={t('nav.search')}
                  />
                  {q ? (
                    <button
                      type="button"
                      onClick={() => {
                        setQ('');
                        desktopInputRef.current?.focus();
                      }}
                      className="grid place-items-center w-[26px] h-[26px] rounded-full bg-surface-container-highest hover:bg-surface-variant text-on-surface-variant shrink-0"
                      aria-label={t('search.clear_search')}
                    >
                      <X className="w-[15px] h-[15px]" />
                    </button>
                  ) : (
                    <span className="inline-flex items-center h-[22px] px-2 rounded-sm bg-background border border-outline-variant text-[11.5px] font-medium text-on-surface-variant shrink-0">
                      esc
                    </span>
                  )}
                </div>
                <div className="max-h-[min(62vh,520px)] overflow-y-auto custom-scrollbar">
                  {panelBody}
                </div>
                <div className="px-4 py-2 border-t border-outline-variant/60 bg-surface-container-highest/40 text-center">
                  <p className="text-[11px] text-on-surface-variant">
                    <kbd className="font-sans">⌘K</kbd> {t('search.anywhere_navigate_open')}
                  </p>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}

      {/* ── Mobile: full-screen overlay (portal) ── */}
      {createPortal(
        <AnimatePresence>
          {searchOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="lg:hidden fixed inset-0 z-[100] bg-background flex flex-col"
            >
              <div className="flex items-center gap-2 h-14 px-3 border-b border-outline-variant shrink-0">
                <Search className="w-4 h-4 text-on-surface-variant shrink-0" />
                <input
                  ref={mobileInputRef}
                  type="text"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  className="flex-1 h-full bg-transparent outline-none text-base text-on-surface placeholder:text-on-surface-variant/70"
                  placeholder={t('search.search_people_mobile')}
                  aria-label={t('nav.search')}
                />
                {q && (
                  <button
                    type="button"
                    onClick={() => setQ('')}
                    className="p-1 rounded-full hover:bg-surface-container-high text-on-surface-variant"
                    aria-label={t('search.clear_search')}
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={close}
                  className="text-sm font-medium text-accent px-1 shrink-0"
                >
                  Cancel
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">{panelBody}</div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
