// Mobile v2 — "See it as they do". Ported from the design's impersonation
// layer (views/impersonate.jsx, the `impUI` fragment in views/mobile/app.jsx):
// a pill that floats over whichever shell is active while an admin is
// borrowing someone's view, and the full-screen picker that opens it.
//
// Mounted once at the app root (app/_layout.tsx), OUTSIDE the tab navigator,
// so it rides over every shell — the trainee's tab-less queue included — the
// same way the design's `impUI` renders alongside every branch of `App`.
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  impGroups,
  impScope,
  roleLabel,
  visibleContacts,
  type AppUser,
  type Contact,
  type ImpersonateTarget,
} from '@cisa/core';
import { useAuth } from '../../lib/AuthProvider';
import { subscribeUsers } from '../../lib/data/users';
import { subscribeContacts } from '../../lib/data/contacts';
import { ImpersonatePill } from './ImpersonatePill';
import { ImpersonateSheet } from './ImpersonateSheet';

interface ImpersonateSheetContextValue {
  open: () => void;
}

const ImpersonateSheetContext = createContext<ImpersonateSheetContextValue | null>(null);

/** FT "More" is the one place that opens the picker. Everywhere else reaches
 * it only through the pill's "Switch". */
export function useImpersonateSheet(): ImpersonateSheetContextValue {
  const ctx = useContext(ImpersonateSheetContext);
  if (!ctx) throw new Error('useImpersonateSheet must be used within ImpersonateLayer');
  return ctx;
}

export function ImpersonateLayer({ children }: { children: React.ReactNode }) {
  const { user, isOwner, ownerViewRole, impersonateTarget, setImpersonateTarget } = useAuth();
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<AppUser[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);

  const isSimulating = !!impersonateTarget || !!ownerViewRole;
  // Only an owner ever sees this UI, and most owners never use it — so the
  // roster/contacts reads stay off until the sheet is actually open, or a
  // restored session lands mid-impersonation and the pill needs its scope.
  const needsData = isOwner && (sheetOpen || isSimulating);

  useEffect(() => {
    if (!needsData) return;
    const unsubUsers = subscribeUsers(setUsers, () => setUsers([]));
    const unsubContacts = subscribeContacts(setContacts, () => setContacts([]));
    return () => {
      unsubUsers();
      unsubContacts();
    };
  }, [needsData]);

  const groups = useMemo(
    () => (sheetOpen ? impGroups(users, user?.uid, query) : []),
    [sheetOpen, users, user?.uid, query],
  );

  const scopeFor = (target: ImpersonateTarget) =>
    impScope(
      target,
      contacts.length,
      visibleContacts(target.role, target.persona?.staffId, contacts).length,
    );

  // A legacy path only: `ownerViewRole` alone (no `impersonateTarget`) can
  // only exist today from a pre-migration AsyncStorage value restored on
  // mount (every live picker sets both together). There's no real target to
  // build a scope from, so this is a fully-valid but nameless stand-in rather
  // than an `as`-cast partial object.
  const activeScope = impersonateTarget
    ? scopeFor(impersonateTarget)
    : impScope(
        {
          key: `role:${ownerViewRole ?? 'admin'}`,
          name: roleLabel(ownerViewRole ?? 'admin'),
          initials: '',
          sub: '',
          note: '',
          role: ownerViewRole ?? 'admin',
        },
        contacts.length,
        0,
      );

  const closeAndOpenSheet = () => {
    setQuery('');
    setSheetOpen(true);
  };

  const pick = (target: ImpersonateTarget) => {
    setImpersonateTarget(target);
    setSheetOpen(false);
    setQuery('');
    router.replace('/');
  };

  const exit = () => {
    setImpersonateTarget(null);
    setSheetOpen(false);
    router.replace('/');
  };

  return (
    <ImpersonateSheetContext.Provider value={{ open: closeAndOpenSheet }}>
      {children}

      {isOwner && isSimulating && (
        <ImpersonatePill
          name={impersonateTarget?.name}
          role={impersonateTarget?.role ?? ownerViewRole ?? 'admin'}
          scope={activeScope}
          onSwitch={closeAndOpenSheet}
          onExit={exit}
        />
      )}

      {isOwner && (
        <ImpersonateSheet
          visible={sheetOpen}
          groups={groups}
          currentKey={impersonateTarget?.key ?? null}
          query={query}
          onQueryChange={setQuery}
          onPick={pick}
          onClose={() => {
            setSheetOpen(false);
            setQuery('');
          }}
          scopeFor={scopeFor}
        />
      )}
    </ImpersonateSheetContext.Provider>
  );
}
