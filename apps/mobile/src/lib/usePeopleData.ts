import { useEffect, useMemo, useState } from 'react';
import {
  EVERYONE_PILL,
  onStepPill,
  personalContactIdsOf,
  splitDirectory,
  stepPills,
  visibleContacts,
  type AppRole,
  type Contact,
  type Leader,
  type Stage,
  type Touch,
} from '@cisa/core';
import { handleFirestoreError, OperationType } from './firebase';
import { subscribeContacts, subscribeStages, subscribeTouches } from './data/contacts';
import { subscribeUserPreferences } from './data/userPreferences';
import { useIdentityReset } from './useIdentityReset';
import { useMinLoading } from './useMinLoading';

export function usePeopleData(uid: string | null, role?: AppRole | string | null) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [touches, setTouches] = useState<Touch[]>([]);
  const [prefContactIds, setPrefContactIds] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  // Component state only, so People opens on Everyone every time (ADR 0047):
  // a remembered filter would quietly hide people.
  const [pillId, setPillId] = useState(EVERYONE_PILL);

  // Drop the previous identity's content the moment it changes (impersonation)
  // instead of flashing it until the new snapshot lands.
  useIdentityReset(uid, () => {
    setContacts([]);
    setStages([]);
    setTouches([]);
    setPrefContactIds(null);
    setLoading(true);
    setError(null);
  });

  useEffect(() => {
    if (!uid) return;
    const onLoadError = (e: unknown, path: string) => {
      setError(`Couldn't load ${path}.`);
      handleFirestoreError(e, OperationType.LIST, path, { rethrow: false });
    };
    const unsubContacts = subscribeContacts(
      (list) => {
        setContacts(list);
        setLoading(false);
      },
      (e) => onLoadError(e, 'contacts'),
      { role, staffId: uid },
    );
    const unsubStages = subscribeStages(setStages, (e) => onLoadError(e, 'stages'));
    const unsubTouches = subscribeTouches(setTouches, (e) => onLoadError(e, 'touches'), {
      role,
      staffId: uid,
    });
    // "In your care" — the picker's choice, else the people I added. Same
    // notion of ownership as My Day and the full-timer's home.
    const unsubPrefs = subscribeUserPreferences(uid, (prefs) =>
      setPrefContactIds(prefs.personalContactIds ?? null),
    );
    return () => {
      unsubContacts();
      unsubStages();
      unsubTouches();
      unsubPrefs();
    };
  }, [uid, role]);

  const scopedContacts = useMemo(
    () => visibleContacts(role ?? null, uid, contacts),
    [role, uid, contacts],
  );

  const personalContactIds = useMemo(
    () => personalContactIdsOf(prefContactIds, scopedContacts, uid),
    [prefContactIds, scopedContacts, uid],
  );

  const matched = useMemo(
    () => splitDirectory(scopedContacts, touches, personalContactIds, search),
    [scopedContacts, touches, personalContactIds, search],
  );

  // The pills count the search's matches, so a match on another Step is one
  // tap away.
  const pills = useMemo(
    () => stepPills([...matched.mine, ...matched.rest].map((l) => l.contact), stages),
    [matched, stages],
  );

  // A pill can go away under you — Not on a step once the last unplaced person
  // is moved or searched out — and then the list falls back to Everyone.
  const activePill = pills.some((p) => p.id === pillId) ? pillId : EVERYONE_PILL;

  // Narrowing keeps splitDirectory's order, so every pill reads like People.
  const { mine, rest } = useMemo(() => {
    const onPill = (l: Leader) => onStepPill(l.contact, activePill, stages);
    return { mine: matched.mine.filter(onPill), rest: matched.rest.filter(onPill) };
  }, [matched, activePill, stages]);

  const shownLoading = useMinLoading(loading);

  return {
    contacts: scopedContacts,
    stages,
    mine,
    rest,
    pills,
    pillId: activePill,
    setPillId,
    totalCount: scopedContacts.length,
    loading: shownLoading,
    error,
    search,
    setSearch,
  };
}
