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
import { useFrecency, rankByFrecency, Frecency } from '../../lib/frecency';
import { useLayout } from '../../App';
import { useAuth } from '../AuthProvider';
import { useLanguage } from '../LanguageProvider';
import { UsageStats } from '../../lib/usageStats';
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
  const { t } = useLanguage();
  const navigate = useNavigate();

  const isStaff = isManager; // Trainee+ (manager/admin)
  const isFullStaff = isAdmin; // Full-timer
  const isOperator = hasMinRole(role as AppRole, 'operator');
  const currentUid = auth.currentUser?.uid || '';
  useFrecency(currentUid);

  const [q, setQ] = useState('');
  const [cursor, setCursor] = useState(-1);
  const [inclHistory, setInclHistory] = useState(false);
  const resolvedRef = useRef(false);

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [boardNotes, setBoardNotes] = useState<BoardNote[]>([]);
  const [activities, setActivities] = useState<(SystemActivity & { id: string })[]>([]);

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
    const tieBreaker = (a: Contact, b: Contact) => {
      const keyA = stampKey(a.updatedAt || a.createdAt || a.lastSeen);
      const keyB = stampKey(b.updatedAt || b.createdAt || b.lastSeen);
      return keyB.localeCompare(keyA);
    };
    return rankByFrecency(currentUid, contacts, (c) => c.id, tieBreaker).slice(0, GS_MAX);
  }, [contacts, currentUid]);

  const peopleResults = useMemo(() => {
    if (!hasQ) return [];
    const matched = contacts.filter(
      (c) =>
        c.name?.toLowerCase().includes(ql) ||
        (c.role || '').toLowerCase().includes(ql) ||
        (c.notes || '').toLowerCase().includes(ql) ||
        (c.spiritualBackground || '').toLowerCase().includes(ql) ||
        (c.tags || []).some((t) => t.toLowerCase().includes(ql)),
    );
    return rankByFrecency(currentUid, matched, (c) => c.id).slice(0, GS_MAX);
  }, [hasQ, ql, contacts, currentUid]);
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
      label: item.href === '/' ? (isAdmin ? t('search.my_day') : t('search.home')) : item.label,
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
    const matched = destinations.filter((d) => d.label.toLowerCase().includes(ql));
    return rankByFrecency(currentUid, matched, (d) => d.key).slice(0, GS_MAX);
  }, [hasQ, ql, destinations, currentUid]);

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
  const go = (path: string, state?: object, entityKey?: string) => {
    if (currentUid && entityKey) {
      Frecency.recordOpen(currentUid, entityKey);
    }
    resolvedRef.current = true;
    navigate(path, state ? { state } : undefined);
    close();
  };

  const quickActions = [
    {
      key: 'qa-new',
      label: t('search.new_contact'),
      sub: t('search.add_new_person'),
      icon: UserPlus,
      tone: 'accent' as Tone,
      show: isOperator,
      run: () => {
        resolvedRef.current = true;
        close();
        openNewContact();
      },
    },
    {
      key: 'qa-log',
      label: t('search.log_visit'),
      sub: t('search.record_conversation'),
      icon: Coffee,
      tone: 'amber' as Tone,
      show: isOperator,
      run: () => {
        resolvedRef.current = true;
        close();
        openLogInteraction();
      },
    },
    {
      key: 'qa-signup',
      label: t('search.signup_form'),
      sub: t('search.signup_form_sub'),
      icon: Globe,
      tone: 'teal' as Tone,
      show: true,
      run: () => go('/signup'),
    },
    {
      key: 'qa-journey',
      label: t('search.the_journey'),
      sub: t('search.walk_the_board'),
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
        run: () => (d.external ? window.open(d.href, '_blank') : go(d.href, undefined, d.key)),
      }),
    );
    recentPeople.forEach((c) => navItems.push({ key: `c:${c.id}`, run: () => openContactById(c.id) }));
    quickActions.forEach((a) => navItems.push({ key: a.key, run: a.run }));
    shortcutCommands.forEach((c) => navItems.push({ key: `cmd:${c.id}`, run: c.handler }));
  } else {
    destResults.forEach((d) =>
      navItems.push({
        key: d.key,
        run: () => (d.external ? window.open(d.href, '_blank') : go(d.href, undefined, d.key)),
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
          active ? 'bg-surface-container-highest' : 'hover:bg-[rgba(203,212,225,0.2)]',
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
            <GroupLabel>{t('search.go_to')}</GroupLabel>
            {destinations.map((d) => (
              <Row
                key={d.key}
                navKey={d.key}
                tone={d.tone}
                icon={d.icon}
                title={d.label}
                onClick={() => (d.external ? window.open(d.href, '_blank') : go(d.href, undefined, d.key))}
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
              <GroupLabel>{t('search.recent_people')}</GroupLabel>
              {recentPeople.map((c) => (
                <Row
                  key={c.id}
                  navKey={`c:${c.id}`}
                  tone="accent"
                  icon={User}
                  title={c.name}
                  sub={c.role || undefined}
                  onClick={() => openContactById(c.id)}
                />
              ))}
            </div>
          )}
          <div>
            <GroupLabel>{t('search.quick_actions')}</GroupLabel>
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
              <GroupLabel>{t('search.shortcuts')}</GroupLabel>
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
          {t('search.nothing_came_up').replace('{q}', q)}
        </div>
      ) : (
        <>
          {destResults.length > 0 && (
            <div>
              <GroupLabel>{t('search.go_to')}</GroupLabel>
              {destResults.map((d) => (
                <Row
                  key={d.key}
                  navKey={d.key}
                  tone={d.tone}
                  icon={d.icon}
                  title={d.label}
                  onClick={() => (d.external ? window.open(d.href, '_blank') : go(d.href, undefined, d.key))}
                />
              ))}
            </div>
          )}

          {peopleResults.length > 0 && (
            <div>
              <GroupLabel>{t('search.people')}</GroupLabel>
              {peopleResults.map((c) => (
                <Row
                  key={c.id}
                  navKey={`c:${c.id}`}
                  tone="accent"
                  icon={User}
                  title={c.name}
                  sub={c.role || undefined}
                  onClick={() => openContactById(c.id)}
                />
              ))}
            </div>
          )}

          {convResults.length > 0 && (
            <div>
              <GroupLabel>{t('search.conversations')}</GroupLabel>
              {convResults.map((i) => {
                const c = contacts.find((x) => x.id === i.contactId);
                const name = c?.name || i.contactName || '';
                return (
                  <Row
                    key={i.id}
                    navKey={`i:${i.id}`}
                    tone="amber"
                    icon={MessageSquare}
                    title={snippet(i.content) || t('search.conversation')}
                    sub={[name, relTime(i.createdAt)].filter(Boolean).join(' · ') || undefined}
                    onClick={() => openContactById(i.contactId)}
                  />
                );
              })}
            </div>
          )}

          {boardResults.length > 0 && (
            <div>
              <GroupLabel>{t('search.coordination_notes')}</GroupLabel>
              {boardResults.map((n) => (
                <Row
                  key={n.id}
                  navKey={`b:${n.id}`}
                  tone="teal"
                  icon={FileText}
                  title={n.title}
                  sub={[n.type === 'learning' ? t('search.learning') : t('search.record'), n.series]
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
                    ? 'border-primary bg-primary text-on-primary'
                    : 'border-outline-variant text-on-surface-variant hover:text-on-surface',
                )}
              >
                <span
                  className={cn(
                    'w-1.5 h-1.5 rounded-full',
                    inclHistory ? 'bg-on-primary' : 'bg-outline',
                  )}
                />
                {t('search.search_history_too')}
              </button>
            </div>
          )}

          {historyResults.length > 0 && (
            <div>
              <GroupLabel>{t('search.history')}</GroupLabel>
              {historyResults.map((a) => (
                <Row
                  key={a.id}
                  navKey={`h:${a.id}`}
                  tone="violet"
                  icon={Clock}
                  dim
                  title={snippet(a.description || a.action) || t('search.a_moment')}
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
            {t('search.search_or_jump')}
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
                    placeholder={t('search.search_or_jump')}
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
                  placeholder={t('search.people_conversations_notes')}
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
