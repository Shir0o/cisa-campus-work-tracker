// Mobile v2 — "See it as they do". Ported from the design's impersonation
// layer (views/impersonate.jsx, the `impUI` fragment in views/mobile/app.jsx):
// a strip across the top saying whose eyes you're borrowing, and the
// full-screen picker that opens it.
//
// Mounted once at the app root (app/_layout.tsx), OUTSIDE the tab navigator,
// so it covers every shell — the trainee's tab-less queue included — the
// same way the design's `impUI` renders alongside every branch of `App`.
//
// The strip is IN FLOW, not floating: it takes real space and the app renders
// beneath it. It used to float, which put it straight on top of the queue's
// own chrome row (☰ and the "Today · N to look after" counter, both of which
// start ~10px below the same inset) and buried them.
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
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

  const showPill = isOwner && isSimulating;

  return (
    <ImpersonateSheetContext.Provider value={{ open: closeAndOpenSheet }}>
      {showPill ? (
        <View style={{ flex: 1 }}>
          <ImpersonatePill
            name={impersonateTarget?.name}
            role={impersonateTarget?.role ?? ownerViewRole ?? 'admin'}
            scope={activeScope}
            onSwitch={closeAndOpenSheet}
            onExit={exit}
          />
          {/* The strip has consumed the top inset, so the screens below must
           * not claim it a second time — QueueScreen and the member/FT shells
           * all open with <SafeAreaView edges={['top']}>. */}
          <SafeAreaInsetsContext.Consumer>
            {(insets) => (
              <SafeAreaInsetsContext.Provider
                value={{ ...(insets ?? { top: 0, bottom: 0, left: 0, right: 0 }), top: 0 }}
              >
                <View style={{ flex: 1 }}>{children}</View>
              </SafeAreaInsetsContext.Provider>
            )}
          </SafeAreaInsetsContext.Consumer>
        </View>
      ) : (
        children
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
