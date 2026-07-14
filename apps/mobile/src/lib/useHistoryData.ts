// Live data for the native History ("Looking back") screen — the team's
// recent activity feed, filterable by kind/who. Mirrors the subscriptions +
// derivations in the web app's src/views/History.tsx.
import { useEffect, useMemo, useState } from 'react';
import {
  buildHistoryRows,
  historyStaff,
  peopleRemembered as countPeopleRemembered,
  type Bucket,
  type Contact,
  type Hist,
} from '@cisa/core';
import { handleFirestoreError, OperationType } from './firebase';
import { subscribeActivities } from './data/activities';
import { subscribeContacts } from './data/contacts';

export function useHistoryData() {
  const [activities, setActivities] = useState<Hist[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [kind, setKind] = useState<'all' | Bucket>('all');
  const [who, setWho] = useState('all');

  useEffect(() => {
    const onLoadError = (e: unknown, path: string) => {
      setError(`Couldn't load ${path}.`);
      setLoading(false);
      handleFirestoreError(e, OperationType.LIST, path, { rethrow: false });
    };
    const unsubContacts = subscribeContacts(setContacts, (e) => onLoadError(e, 'contacts'));
    const unsubActivities = subscribeActivities((list) => {
      setActivities(list);
      setLoading(false);
    }, (e) => onLoadError(e, 'activities'));
    return () => {
      unsubContacts();
      unsubActivities();
    };
  }, []);

  const staff = useMemo(() => historyStaff(activities), [activities]);
  const rows = useMemo(() => buildHistoryRows(activities, { kind, who }), [activities, kind, who]);
  const remembered = useMemo(() => countPeopleRemembered(activities), [activities]);

  const openContact = (contactId?: string): Contact | undefined =>
    contactId ? contacts.find((c) => c.id === contactId) : undefined;

  return {
    activities,
    loading,
    error,
    kind,
    setKind,
    who,
    setWho,
    staff,
    rows,
    peopleRemembered: remembered,
    openContact,
  };
}
