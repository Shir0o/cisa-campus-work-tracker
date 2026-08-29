import { useEffect, useMemo, useState } from 'react';
import {
  personalContactIdsOf,
  splitDirectory,
  visibleContacts,
  type AppRole,
  type Contact,
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
    );
    const unsubStages = subscribeStages(setStages, (e) => onLoadError(e, 'stages'));
    const unsubTouches = subscribeTouches(setTouches, (e) => onLoadError(e, 'touches'));
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
  }, [uid]);

  const scopedContacts = useMemo(
    () => visibleContacts(role ?? null, uid, contacts),
    [role, uid, contacts],
  );

  const personalContactIds = useMemo(
    () => personalContactIdsOf(prefContactIds, scopedContacts, uid),
    [prefContactIds, scopedContacts, uid],
  );

  const { mine, rest } = useMemo(
    () => splitDirectory(scopedContacts, touches, personalContactIds, search),
    [scopedContacts, touches, personalContactIds, search],
  );

  const shownLoading = useMinLoading(loading);

  return {
    contacts: scopedContacts,
    stages,
    mine,
    rest,
    totalCount: scopedContacts.length,
    loading: shownLoading,
    error,
    search,
    setSearch,
  };
}
