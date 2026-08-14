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
import { InteractionManager, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  impGroups,
  impScope,
  visibleContacts,
  type AppUser,
  type Contact,
  type ImpersonateTarget,
} from '@cisa/core';
import { useAuth } from '../../lib/AuthProvider';
import { TopInsetOwnedContext } from '../../lib/screenChrome';
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

  const closeAndOpenSheet = () => {
    setQuery('');
    setSheetOpen(true);
  };

  const pick = (target: ImpersonateTarget) => {
    setImpersonateTarget(target);
    setSheetOpen(false);
    setQuery('');
    goHome();
  };

  const exit = () => {
    setImpersonateTarget(null);
    setSheetOpen(false);
    goHome();
  };

  // Landing on the role's home must wait for the impersonation change to
  // commit: the change re-keys the tab navigator in the same render, so a
  // replace dispatched synchronously is queued against the OLD key and
  // expo-router logs "The action 'REPLACE' ... was not handled by any
  // navigator" (and skips the move entirely). But a bare setTimeout(0) is not
  // enough either: on a device the navigation can still run before the
  // identity-change frame (the loading skeleton) has been flushed and
  // PRESENTED, so the back/pop transition animates the previously drawn frame
  // — the previous viewer's content, the "See it as they do" flash.
  // runAfterInteractions waits out the JS interaction queue (and the picker
  // sheet's dismiss animation); the inner frame callback then runs after the
  // next frame has been presented, so the transition reveals the skeleton,
  // not the previous user's screen. Prefer popping back to the existing tabs
  // when there is one to pop — replace('/') from a pushed root screen would
  // stack a SECOND (tabs) instance on the root stack, leaving the old shell
  // mounted underneath (a stale back button).
  const goHome = () => {
    InteractionManager.runAfterInteractions(() => {
      requestAnimationFrame(() => {
        if (router.canGoBack()) router.back();
        else router.replace('/');
      });
    });
  };

  const showPill = isOwner && isSimulating;

  return (
    <ImpersonateSheetContext.Provider value={{ open: closeAndOpenSheet }}>
      {showPill ? (
        <View style={{ flex: 1 }}>
          <ImpersonatePill
            name={impersonateTarget?.name}
            role={impersonateTarget?.role ?? ownerViewRole ?? 'admin'}
            onSwitch={closeAndOpenSheet}
            onExit={exit}
          />
          {/* The strip has consumed the top inset, so the screens below must
           * not claim it a second time — QueueScreen and the member/FT shells
           * all open with <SafeAreaView edges={['top']}>. They read this and
           * drop the edge (components/ui/SafeArea); a JS inset override would
           * not do it, since the library's SafeAreaView is a native view on
           * device and only its .web build reads SafeAreaInsetsContext. */}
          <TopInsetOwnedContext.Provider value>
            <View style={{ flex: 1 }}>{children}</View>
          </TopInsetOwnedContext.Provider>
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
