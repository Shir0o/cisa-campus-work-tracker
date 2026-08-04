import React, { useState, useRef, useEffect } from 'react';
import { Search, X, Check } from 'lucide-react';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { ImpersonateTarget } from '../../types';
import {
  DEFAULT_TEST_ACCOUNTS,
  impStaffTarget,
  impPersonaTarget,
  impContactTarget,
} from '../../lib/impersonate';
import { cn } from '../../lib/utils';

interface ImpersonatePickerProps {
  currentKey: string | null | undefined;
  onPick: (target: ImpersonateTarget) => void;
  contacts?: any[];
  users?: any[];
  autoFocus?: boolean;
}

export function ImpRow({
  target,
  active,
  onPick,
}: {
  target: ImpersonateTarget;
  active: boolean;
  onPick: (t: ImpersonateTarget) => void;
}) {
  return (
    <button
      onClick={() => onPick(target)}
      className={cn(
        'w-full text-left p-3 rounded-xl border border-outline-variant/50 bg-surface hover:bg-surface-container-high transition-all flex items-center gap-3 group',
        active && 'bg-primary/10 border-primary/40 ring-1 ring-primary/30',
      )}
    >
      <div className="w-10 h-10 rounded-full bg-primary/15 text-primary flex items-center justify-center font-bold text-xs shrink-0">
        {target.initials}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm text-on-surface truncate">{target.name}</span>
        </div>
        <div className="text-xs text-on-surface-variant truncate">{target.sub}</div>
      </div>
      <div className="hidden sm:block text-xs text-on-surface-variant/80 shrink-0">{target.note}</div>
      <div className="shrink-0 text-xs font-medium">
        {active ? (
          <span className="px-2.5 py-1 rounded-full bg-primary text-on-primary flex items-center gap-1">
            <Check className="w-3 h-3" /> You're here
          </span>
        ) : (
          <span className="text-primary group-hover:underline">See their view</span>
        )}
      </div>
    </button>
  );
}

export default function ImpersonatePicker({
  currentKey,
  onPick,
  contacts: initialContacts,
  users: initialUsers,
  autoFocus = false,
}: ImpersonatePickerProps) {
  const [q, setQ] = useState('');
  const [openAllRoster, setOpenAllRoster] = useState(false);
  const [fetchedUsers, setFetchedUsers] = useState<any[]>([]);
  const [fetchedContacts, setFetchedContacts] = useState<any[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [autoFocus]);

  useEffect(() => {
    if (initialUsers && initialUsers.length > 0) return;
    try {
      const qUsers = query(collection(db, 'users'));
      const unsub = onSnapshot(
        qUsers,
        (snap) => {
          const list = snap.docs.map((doc) => ({ uid: doc.id, ...doc.data() }));
          setFetchedUsers(list);
        },
        () => {}
      );
      return () => unsub();
    } catch {}
  }, [initialUsers]);

  useEffect(() => {
    if (initialContacts && initialContacts.length > 0) return;
    try {
      const qContacts = query(collection(db, 'contacts'), orderBy('name', 'asc'));
      const unsub = onSnapshot(
        qContacts,
        (snap) => {
          const list = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
          setFetchedContacts(list);
        },
        () => {}
      );
      return () => unsub();
    } catch {}
  }, [initialContacts]);

  const rawUsers = (initialUsers && initialUsers.length > 0 ? initialUsers : fetchedUsers);
  
  // Combine real Firestore users with default cisa-* test accounts if not already present
  const teamList = [...rawUsers];
  DEFAULT_TEST_ACCOUNTS.forEach((testAcc) => {
    if (!teamList.some((u) => (u.uid || u.id) === testAcc.id || u.email === testAcc.email)) {
      teamList.push(testAcc);
    }
  });

  const rosterSource = (initialContacts && initialContacts.length > 0 ? initialContacts : fetchedContacts);

  const rawGroups = [
    {
      id: 'team',
      label: 'The team & test accounts',
      note: 'Staff, trainees, and cisa-* test accounts — the workspace as they see it.',
      items: teamList.map(impStaffTarget),
    },
    {
      id: 'members',
      label: 'Students & friends',
      note: 'The two member views.',
      items: [impPersonaTarget('student'), impPersonaTarget('community')].filter(
        Boolean,
      ) as ImpersonateTarget[],
    },
    {
      id: 'roster',
      label: 'Anyone on the roster',
      note: "A real student's own small window into CISA.",
      items: rosterSource.map(impContactTarget),
      collapse: 6,
    },
  ];

  const needle = q.trim().toLowerCase();

  const groups = rawGroups
    .map((g) => {
      const items = needle
        ? g.items.filter((t) => (t.name + ' ' + t.sub + ' ' + t.note).toLowerCase().includes(needle))
        : g.items;

      const shown =
        !needle && g.collapse && !openAllRoster ? items.slice(0, g.collapse) : items;

      return { ...g, items, shown };
    })
    .filter((g) => g.items.length > 0);

  return (
    <div className="space-y-6 text-left">
      {/* Search Input */}
      <div className="relative">
        <Search className="w-4 h-4 text-on-surface-variant absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          ref={inputRef}
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Find a person by name or role…"
          className="w-full pl-10 pr-10 py-2.5 rounded-full bg-surface border border-outline-variant text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none focus:ring-2 focus:ring-primary/40 text-sm"
        />
        {q && (
          <button
            onClick={() => setQ('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-on-surface-variant hover:text-on-surface rounded-full"
            aria-label="Clear search"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Groups */}
      {groups.map((g) => (
        <div key={g.id} className="space-y-3">
          <div>
            <h4 className="text-sm font-semibold text-on-surface">{g.label}</h4>
            <p className="text-xs text-on-surface-variant">{g.note}</p>
          </div>
          <div className="space-y-2">
            {g.shown.map((t) => (
              <ImpRow key={t.key} target={t} active={t.key === currentKey} onPick={onPick} />
            ))}
          </div>

          {g.shown.length < g.items.length && (
            <button
              onClick={() => setOpenAllRoster(true)}
              className="text-xs font-medium text-primary hover:underline pt-1"
            >
              Show the rest of the roster ({g.items.length - g.shown.length} more)
            </button>
          )}
        </div>
      ))}

      {groups.length === 0 && (
        <p className="text-sm text-on-surface-variant text-center py-6">Nobody by that name.</p>
      )}
    </div>
  );
}

