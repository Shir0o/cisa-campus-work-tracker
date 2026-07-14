// Live data for the native Answered screen — the team's wall of answered
// prayers, grouped into recent/earlier. Mirrors the subscriptions in the web
// app's src/views/AnsweredList.tsx; grouping is delegated to the shared,
// unit-tested groupAnsweredPrayers.
import { useEffect, useMemo, useState } from 'react';
import { groupAnsweredPrayers, type Contact, type PrayerRecord } from '@cisa/core';
import { handleFirestoreError, OperationType } from './firebase';
import { subscribeAllPrayers } from './data/prayers';
import { subscribeContacts } from './data/contacts';

export function useAnsweredData() {
  const [prayers, setPrayers] = useState<PrayerRecord[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onLoadError = (e: unknown, path: string) => {
      setError(`Couldn't load ${path}.`);
      setLoading(false);
      handleFirestoreError(e, OperationType.LIST, path, { rethrow: false });
    };
    const unsubContacts = subscribeContacts(setContacts, (e) => onLoadError(e, 'contacts'));
    const unsubPrayers = subscribeAllPrayers((list) => {
      setPrayers(list);
      setLoading(false);
    }, (e) => onLoadError(e, 'prayers'));
    return () => {
      unsubContacts();
      unsubPrayers();
    };
  }, []);

  const { recent, earlier, totalThisYear } = useMemo(() => groupAnsweredPrayers(prayers), [prayers]);

  const openContact = (contactId?: string): Contact | undefined =>
    contactId ? contacts.find((c) => c.id === contactId) : undefined;

  return { loading, error, recent, earlier, totalThisYear, openContact };
}
