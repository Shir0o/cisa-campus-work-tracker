import React, { useState, useEffect, useRef, useMemo, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import {
  Search,
  X,
  Command,
  UserPlus,
  Coffee,
  Globe,
  Compass,
  User,
  MessageSquare,
  FileText,
  Clock,
  Keyboard,
  ExternalLink as ExternalLinkIcon,
  type LucideIcon,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  collection,
  collectionGroup,
  onSnapshot,
  query,
  orderBy,
  limit,
} from 'firebase/firestore';
import { db, auth } from '../../lib/firebase';
import { Contact, Interaction, SystemActivity } from '../../types';
import { cn, relTime } from '../../lib/utils';
import { useCommand, subscribeCommands, getCommands, shortcutLabel } from '../../lib/commands';
import { useLayout } from '../../App';
import { useAuth } from '../AuthProvider';
import { hasMinRole, AppRole, navItemsForRole, navExternalFor } from '../../lib/permissions';
import { motion, AnimatePresence } from 'motion/react';

// Cap per group so the panel stays scannable.
const GS_MAX = 4;

// Tonal 28px icon nodes — slate-blue / terracotta / sage / plum, matching
// History ("Looking back"). Static strings so Tailwind keeps the classes.
type Tone = 'accent' | 'amber' | 'teal' | 'violet' | 'neutral';
const TONE_NODE: Record<Tone, string> = {
  accent: 'bg-stage-accent-soft text-stage-accent',
  amber: 'bg-stage-amber-soft text-stage-amber',
  teal: 'bg-stage-teal-soft text-stage-teal',
  violet: 'bg-stage-violet-soft text-stage-violet',
  neutral: 'bg-surface-container-highest text-on-surface-variant',
};

interface BoardNote {
  id: string;
  type?: 'record' | 'learning';
  title: string;
  body?: string;
  series?: string;
  tags?: string[];
  updatedByName?: string;
}

interface NavItem {
  key: string;
  run: () => void;
}

const snippet = (text: string, max = 64) => {
  const s = (text || '').replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max).trimEnd() + '…' : s;
};

export default function GlobalSearch() {
  const { setSelectedContact, openNewContact, openLogInteraction, searchOpen, setSearchOpen } =
    useLayout();
  const { isAdmin, isManager, role } = useAuth();
  const navigate = useNavigate();

  const isStaff = isManager; // Trainee+ (manager/admin)
  const isFullStaff = isAdmin; // Full-timer
  const isOperator = hasMinRole(role as AppRole, 'operator');

  const [q, setQ] = useState('');
  const [cursor, setCursor] = useState(-1);
  const [inclHistory, setInclHistory] = useState(false);

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [boardNotes, setBoardNotes] = useState<BoardNote[]>([]);
  const [activities, setActivities] = useState<(SystemActivity & { id: string })[]>([]);

  const containerRef = useRef<HTMLDivElement>(null);
  const desktopInputRef = useRef<HTMLInputElement>(null);
  const mobileInputRef = useRef<HTMLInputElement>(null);

  const ql = q.trim().toLowerCase();
  const hasQ = ql.length > 0;

  const close = () => {
    setSearchOpen(false);
    setQ('');
    setCursor(-1);
  };

  // ── data listeners (live only while the panel is open, gated by role) ──────
  useEffect(() => {
    if (!searchOpen || !auth.currentUser) return;
    const unsub = onSnapshot(
      collection(db, 'contacts'),
      (snap) => setContacts(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Contact[]),
      (err) => console.error('GlobalSearch contacts listener:', err),
    );
    return () => unsub();
  }, [searchOpen]);

  useEffect(() => {
    if (!searchOpen || !isStaff) return;
    const unsub = onSnapshot(
      collectionGroup(db, 'interactions'),
      (snap) =>
        setInteractions(
          snap.docs.map((d) => ({
            ...(d.data() as Interaction),
            id: d.id,
            contactId: d.ref.parent.parent?.id,
          })),
        ),
      (err) => console.error('GlobalSearch interactions listener:', err),
    );
    return () => unsub();
  }, [searchOpen, isStaff]);

  useEffect(() => {
    if (!searchOpen || !isFullStaff) return;
    const unsub = onSnapshot(
      collection(db, 'board_notes'),
      (snap) => setBoardNotes(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as BoardNote[]),
      (err) => console.error('GlobalSearch board listener:', err),
    );
    return () => unsub();
  }, [searchOpen, isFullStaff]);

  useEffect(() => {
    if (!searchOpen || !isStaff || !inclHistory) return;
    const unsub = onSnapshot(
      query(collection(db, 'activities'), orderBy('createdAt', 'desc'), limit(100)),
      (snap) =>
        setActivities(
          snap.docs.map((d) => ({ ...(d.data() as SystemActivity), id: d.id })),
        ),
      (err) => console.error('GlobalSearch activities listener:', err),
    );
    return () => unsub();
  }, [searchOpen, isStaff, inclHistory]);

  // ── results ───────────────────────────────────────────────────────────────
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
    const key = (c: Contact) => stampKey(c.updatedAt || c.createdAt || c.lastSeen);
    return contacts
      .slice()
      .sort((a, b) => key(b).localeCompare(key(a)))
      .slice(0, GS_MAX);
  }, [contacts]);

  const peopleResults = useMemo(() => {
    if (!hasQ) return [];
    return contacts
      .filter(
        (c) =>
          c.name?.toLowerCase().includes(ql) ||
          (c.role || '').toLowerCase().includes(ql) ||
          (c.location || '').toLowerCase().includes(ql) ||
          (c.notes || '').toLowerCase().includes(ql) ||
          (c.spiritualBackground || '').toLowerCase().includes(ql) ||
          (c.tags || []).some((t) => t.toLowerCase().includes(ql)),
      )
      .slice(0, GS_MAX);
  }, [hasQ, ql, contacts]);

  const convResults = useMemo(() => {
    if (!hasQ || !isStaff) return [];
    return interactions
      .filter((i) => (i.content || '').toLowerCase().includes(ql))
      .slice(0, GS_MAX);
  }, [hasQ, ql, isStaff, interactions]);

  const boardResults = useMemo(() => {
    if (!hasQ || !isFullStaff) return [];
    return boardNotes
      .filter(
        (n) =>
          (n.title || '').toLowerCase().includes(ql) ||
          (n.body || '').toLowerCase().includes(ql) ||
          (n.series || '').toLowerCase().includes(ql) ||
          (n.tags || []).some((t) => t.toLowerCase().includes(ql)),
      )
      .slice(0, GS_MAX);
  }, [hasQ, ql, isFullStaff, boardNotes]);

  // Every place the current role can reach — the top bar's tabs + More menu, so
  // ⌘K can jump anywhere, not just search. ("Everything is reachable from search".)
  const destinations = useMemo(() => {
    const items = navItemsForRole(role).map((item) => ({
      key: `dest:${item.href}`,
      label: item.href === '/' ? (isAdmin ? 'My Day' : 'Home') : item.label,
      href: item.href,
      tone: 'violet' as Tone,
      icon: Compass,
      external: false,
    }));
    const ext = navExternalFor(role).map((item) => ({
      key: `dest:${item.href}`,
      label: item.label,
      href: item.href,
      tone: 'neutral' as Tone,
      icon: Globe,
      external: true,
    }));
    return [...items, ...ext];
  }, [role, isAdmin]);

  const historyResults = useMemo(() => {
    if (!hasQ || !isStaff || !inclHistory) return [];
    return activities
      .filter(
        (a) =>
          (a.action || '').toLowerCase().includes(ql) ||
          (a.description || '').toLowerCase().includes(ql) ||
          (a.targetName || '').toLowerCase().includes(ql),
      )
      .slice(0, GS_MAX);
  }, [hasQ, ql, isStaff, inclHistory, activities]);

  const destResults = useMemo(() => {
    if (!hasQ) return [];
    return destinations
      .filter((d) => d.label.toLowerCase().includes(ql))
      .slice(0, GS_MAX);
  }, [hasQ, ql, destinations]);

  // ── actions ─────────────────────────────────────────────────────────────
  const openContactById = (id?: string) => {
    if (id) {
      const c = contacts.find((x) => x.id === id);
      if (c) setSelectedContact(c);
    }
    close();
  };
  const go = (path: string, state?: object) => {
    navigate(path, state ? { state } : undefined);
    close();
  };

  const quickActions = [
    {
      key: 'qa-new',
      label: 'New contact',
      sub: 'Add a new person',
      icon: UserPlus,
      tone: 'accent' as Tone,
      show: isOperator,
      run: () => {
        close();
        openNewContact();
      },
    },
    {
      key: 'qa-log',
      label: 'Log a visit',
      sub: 'Record a conversation',
      icon: Coffee,
      tone: 'amber' as Tone,
      show: isOperator,
      run: () => {
        close();
        openLogInteraction();
      },
    },
    {
      key: 'qa-signup',
      label: 'Sign-up form (for someone new)',
      sub: 'So someone new can ask to hear from us.',
      icon: Globe,
      tone: 'teal' as Tone,
      show: true,
      run: () => go('/signup'),
    },
    {
      key: 'qa-journey',
      label: 'The Journey',
      sub: 'Walk the board',
      icon: Compass,
      tone: 'violet' as Tone,
      show: isStaff,
      run: () => go('/board'),
    },
  ].filter((a) => a.show);

  // Registry-backed shortcuts the user can actually take right now, filtered
  // by role — the same commands that own the key bindings (#337).
  const registeredCommands = useSyncExternalStore(subscribeCommands, getCommands);
  const shortcutCommands = registeredCommands.filter(
    (c) =>
      !c.hidden &&
      (!c.minRole || hasMinRole(role as AppRole, c.minRole)) &&
      (!c.available || c.available()),
  );

  // ── flat list for keyboard nav (recomputed each render; small) ────────────
  const navItems: NavItem[] = [];
  if (!hasQ) {
    destinations.forEach((d) =>
      navItems.push({
        key: d.key,
        run: () => (d.external ? window.open(d.href, '_blank') : go(d.href)),
      }),
    );
    recentPeople.forEach((c) => navItems.push({ key: `c:${c.id}`, run: () => openContactById(c.id) }));
    quickActions.forEach((a) => navItems.push({ key: a.key, run: a.run }));
    shortcutCommands.forEach((c) => navItems.push({ key: `cmd:${c.id}`, run: c.handler }));
  } else {
    destResults.forEach((d) =>
      navItems.push({
        key: d.key,
        run: () => (d.external ? window.open(d.href, '_blank') : go(d.href)),
      }),
    );
    peopleResults.forEach((c) => navItems.push({ key: `c:${c.id}`, run: () => openContactById(c.id) }));
    convResults.forEach((i) => navItems.push({ key: `i:${i.id}`, run: () => openContactById(i.contactId) }));
    boardResults.forEach((n) =>
      navItems.push({
        key: `b:${n.id}`,
        run: () => go('/coordination', { focusNoteId: n.id, focusDocId: (n as { sessionId?: string }).sessionId }),
      }),
    );
    historyResults.forEach((a) => navItems.push({ key: `h:${a.id}`, run: () => go('/history') }));
  }
  const indexByKey: Record<string, number> = {};
  navItems.forEach((it, idx) => (indexByKey[it.key] = idx));

  const hasResults = hasQ
    ? peopleResults.length + convResults.length + boardResults.length + historyResults.length + destResults.length > 0
    : true;

  // Keep latest nav state in a ref so the keydown handler stays stable.
  const navRef = useRef<{ items: NavItem[]; cursor: number }>({ items: navItems, cursor });
  navRef.current = { items: navItems, cursor };

  // ── keyboard: ⌘K opens (always on) — via the central shortcut registry ──
  useCommand({
    id: 'search.open',
    scope: 'global',
    description: 'Open search',
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

  // Click-away (desktop dropdown).
  useEffect(() => {
    if (!searchOpen) return;
    const onDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        close();
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchOpen]);

  // ── row + group primitives ────────────────────────────────────────────────
  const Row = ({
    navKey,
    tone,
    icon: Icon,
    title,
    sub,
    dim,
    badge,
    onClick,
  }: {
    navKey: string;
    tone: Tone;
    icon: LucideIcon;
    title: string;
    sub?: string;
    dim?: boolean;
    badge?: React.ReactNode;
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
          active ? 'bg-surface-container-highest' : 'hover:bg-surface-container-highest/60',
        )}
      >
        <span
          className={cn(
            'w-7 h-7 rounded-full flex items-center justify-center shrink-0',
            TONE_NODE[tone],
          )}
        >
          <Icon className="w-3.5 h-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              'block text-[13.5px] font-semibold truncate',
              dim ? 'text-on-surface-variant' : 'text-on-surface',
            )}
          >
            {title}
          </span>
          {sub && <span className="block text-[12px] text-on-surface-variant truncate">{sub}</span>}
        </span>
        {badge}
      </button>
    );
  };

  const GroupLabel = ({ children }: { children: React.ReactNode }) => (
    <div className="px-2.5 pt-3 pb-1 text-xs font-medium text-on-surface-variant/70">
      {children}
    </div>
  );

  // ── panel body (shared by desktop dropdown + mobile overlay) ───────────────
  const panelBody = (
    <div className="px-2 pb-2">
      {!hasQ ? (
        <>
          <div>
            <GroupLabel>Go to</GroupLabel>
            {destinations.map((d) => (
              <Row
                key={d.key}
                navKey={d.key}
                tone={d.tone}
                icon={d.icon}
                title={d.label}
                onClick={() => (d.external ? window.open(d.href, '_blank') : go(d.href))}
                badge={
                  d.external ? (
                    <ExternalLinkIcon className="w-3.5 h-3.5 opacity-60" />
                  ) : undefined
                }
              />
            ))}
          </div>
          {recentPeople.length > 0 && (
            <div>
              <GroupLabel>Recent people</GroupLabel>
              {recentPeople.map((c) => (
                <Row
                  key={c.id}
                  navKey={`c:${c.id}`}
                  tone="accent"
                  icon={User}
                  title={c.name}
                  sub={[c.role, c.location].filter(Boolean).join(' · ') || undefined}
                  onClick={() => openContactById(c.id)}
                />
              ))}
            </div>
          )}
          <div>
            <GroupLabel>Quick actions</GroupLabel>
            {quickActions.map((a, i) => (
              <Row
                key={a.key}
                navKey={a.key}
                tone={a.tone}
                icon={a.icon}
                title={a.label}
                sub={a.sub}
                onClick={a.run}
                badge={
                  i === 0 ? (
                    <kbd className="text-[11px] font-sans px-1.5 py-0.5 rounded-md border border-outline-variant text-on-surface-variant">
                      ↵
                    </kbd>
                  ) : undefined
                }
              />
            ))}
          </div>
          {shortcutCommands.length > 0 && (
            <div>
              <GroupLabel>Shortcuts</GroupLabel>
              {shortcutCommands.map((c) => (
                <Row
                  key={c.id}
                  navKey={`cmd:${c.id}`}
                  tone="neutral"
                  icon={Keyboard}
                  title={c.description}
                  onClick={c.handler}
                  badge={
                    <kbd className="text-[11px] font-sans px-1.5 py-0.5 rounded-md border border-outline-variant text-on-surface-variant">
                      {shortcutLabel(c.shortcut)}
                    </kbd>
                  }
                />
              ))}
            </div>
          )}
        </>
      ) : !hasResults ? (
        <div className="px-3 py-10 text-center text-[13.5px] text-on-surface-variant italic">
          Nothing came up for &ldquo;{q}&rdquo;
        </div>
      ) : (
        <>
          {destResults.length > 0 && (
            <div>
              <GroupLabel>Go to</GroupLabel>
              {destResults.map((d) => (
                <Row
                  key={d.key}
                  navKey={d.key}
                  tone={d.tone}
                  icon={d.icon}
                  title={d.label}
                  onClick={() => (d.external ? window.open(d.href, '_blank') : go(d.href))}
                />
              ))}
            </div>
          )}

          {peopleResults.length > 0 && (
            <div>
              <GroupLabel>People</GroupLabel>
              {peopleResults.map((c) => (
                <Row
                  key={c.id}
                  navKey={`c:${c.id}`}
                  tone="accent"
                  icon={User}
                  title={c.name}
                  sub={[c.role, c.location].filter(Boolean).join(' · ') || undefined}
                  onClick={() => openContactById(c.id)}
                />
              ))}
            </div>
          )}

          {convResults.length > 0 && (
            <div>
              <GroupLabel>Conversations</GroupLabel>
              {convResults.map((i) => {
                const c = contacts.find((x) => x.id === i.contactId);
                const name = c?.name || i.contactName || '';
                return (
                  <Row
                    key={i.id}
                    navKey={`i:${i.id}`}
                    tone="amber"
                    icon={MessageSquare}
                    title={snippet(i.content) || 'Conversation'}
                    sub={[name, relTime(i.createdAt)].filter(Boolean).join(' · ') || undefined}
                    onClick={() => openContactById(i.contactId)}
                  />
                );
              })}
            </div>
          )}

          {boardResults.length > 0 && (
            <div>
              <GroupLabel>Coordination Notes</GroupLabel>
              {boardResults.map((n) => (
                <Row
                  key={n.id}
                  navKey={`b:${n.id}`}
                  tone="teal"
                  icon={FileText}
                  title={n.title}
                  sub={[n.type === 'learning' ? 'Learning' : 'Record', n.series]
                    .filter(Boolean)
                    .join(' · ')}
                  onClick={() => go('/coordination')}
                />
              ))}
            </div>
          )}

          {isStaff && (
            <div className="px-2.5 pt-3 pb-1">
              <button
                type="button"
                onClick={() => setInclHistory((v) => !v)}
                className={cn(
                  'inline-flex items-center gap-1.5 text-[12px] px-2.5 py-1 rounded-full border transition-colors',
                  inclHistory
                    ? 'border-accent-line bg-accent-soft text-accent'
                    : 'border-outline-variant text-on-surface-variant hover:text-on-surface',
                )}
              >
                <span
                  className={cn(
                    'w-1.5 h-1.5 rounded-full',
                    inclHistory ? 'bg-primary' : 'bg-outline',
                  )}
                />
                Search history too
              </button>
            </div>
          )}

          {historyResults.length > 0 && (
            <div>
              <GroupLabel>History</GroupLabel>
              {historyResults.map((a) => (
                <Row
                  key={a.id}
                  navKey={`h:${a.id}`}
                  tone="violet"
                  icon={Clock}
                  dim
                  title={snippet(a.description || a.action) || 'A moment'}
                  sub={[a.userName, relTime(a.createdAt)].filter(Boolean).join(' · ') || undefined}
                  onClick={() => go('/history')}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );

  return (
    <>
      {/* ── Desktop: trigger pill + in-place dropdown ── */}
      <div ref={containerRef} className="relative w-full hidden lg:block">
        <div
          className={cn(
            'relative flex items-center w-full h-10 rounded-full transition-all cursor-text',
            searchOpen
              ? 'bg-surface shadow-lg ring-1 ring-outline-variant'
              : 'bg-surface-container-high hover:bg-surface-container-highest',
          )}
          onClick={() => {
            setSearchOpen(true);
            desktopInputRef.current?.focus();
          }}
        >
          <div className="grid place-items-center h-full w-11 text-on-surface-variant">
            <Search className="w-4 h-4" />
          </div>
          <input
            ref={desktopInputRef}
            type="text"
            value={q}
            onFocus={() => setSearchOpen(true)}
            onChange={(e) => {
              setQ(e.target.value);
              setSearchOpen(true);
            }}
            className="peer h-full w-full outline-none text-sm text-on-surface bg-transparent pr-12 font-medium placeholder:text-on-surface-variant/70"
            placeholder="Search or jump to…"
            aria-label="Search"
          />
          {!searchOpen ? (
            <div className="absolute right-3 flex items-center gap-0.5 opacity-60 px-1.5 py-0.5 rounded-md border border-outline-variant text-[10px] font-medium text-on-surface-variant pointer-events-none">
              <Command className="w-3 h-3" />
              <span>K</span>
            </div>
          ) : (
            q && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setQ('');
                  desktopInputRef.current?.focus();
                }}
                className="absolute right-2.5 p-1 rounded-full hover:bg-surface-variant text-on-surface-variant"
                aria-label="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )
          )}
        </div>

        <AnimatePresence>
          {searchOpen && (
            <motion.div
              initial={{ opacity: 0, y: 4, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.99 }}
              transition={{ duration: 0.12 }}
              className="absolute right-0 top-[calc(100%+8px)] w-[420px] max-w-[calc(100vw-2rem)] bg-surface-container-high rounded-2xl shadow-2xl border border-outline-variant overflow-hidden z-50"
            >
              <div className="max-h-[min(60vh,440px)] overflow-y-auto custom-scrollbar">
                {panelBody}
              </div>
              <div className="px-4 py-2 border-t border-outline-variant/60 bg-surface-container-highest/40 text-center">
                <p className="text-[11px] text-on-surface-variant">
                  <kbd className="font-sans">⌘K</kbd> anywhere · ↑↓ navigate · ↵ open
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

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
                  placeholder="Search people, conversations, notes…"
                  aria-label="Search"
                />
                {q && (
                  <button
                    type="button"
                    onClick={() => setQ('')}
                    className="p-1 rounded-full hover:bg-surface-container-high text-on-surface-variant"
                    aria-label="Clear search"
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
