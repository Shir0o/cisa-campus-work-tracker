// Live data for the full-timer's outreach screen — subscriptions + derivations
// with @cisa/core's outreach.ts as the shared behavior oracle, the same shape
// as useFtHomeData / useAttendanceData.
import { useEffect, useMemo, useState } from 'react';
import {
  outreachNewestFirst,
  outreachMonthKey,
  outreachPending,
  outreachStats,
  type AppUser,
  type Contact,
  type OutreachPendingItem,
  type OutreachRecord,
  type Touch,
} from '@cisa/core';
import { db, handleFirestoreError, OperationType } from './firebase';
import { subscribeOutreach } from './data/outreach';
import { subscribeContacts, subscribeTouches } from './data/contacts';
import { subscribeUsers } from './data/users';

export function useOutreachData() {
  const [records, setRecords] = useState<OutreachRecord[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [touches, setTouches] = useState<Touch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onError = (e: unknown, path: string) => {
      setError(`Couldn't load ${path}.`);
      setLoading(false);
      handleFirestoreError(e, OperationType.LIST, path, { rethrow: false });
    };
    const unsubOutreach = subscribeOutreach(
      (list) => {
        setRecords(list);
        setLoading(false);
      },
      (e) => onError(e, 'outreach'),
    );
    const unsubContacts = subscribeContacts(setContacts, (e) => onError(e, 'contacts'));
    const unsubUsers = subscribeUsers(setUsers, (e) => onError(e, 'team'));
    const unsubTouches = subscribeTouches(setTouches, (e) => onError(e, 'recent activity'));
    return () => {
      unsubOutreach();
      unsubContacts();
      unsubUsers();
      unsubTouches();
    };
  }, []);

  const newest = useMemo(() => outreachNewestFirst(records), [records]);
  const pending = useMemo<OutreachPendingItem[]>(() => outreachPending(records, touches), [records, touches]);
  const thisMonth = newest.filter((o) => outreachMonthKey(o.date) === outreachMonthKey(new Date().toISOString().slice(0, 10)));
  const earlier = newest.filter((o) => !thisMonth.includes(o));
  const stats = useMemo(() => outreachStats(records), [records]);

  const contactById = (id?: string | null) => contacts.find((c) => c.id === id);
  const userById = (id?: string | null) => users.find((u) => u.uid === id);

  // Firestore instances for writes are exported from data/outreach; the db
  // import above keeps the subscription wiring here.
  void db;

  return { records, users, contacts, touches, loading, error, pending, thisMonth, earlier, stats, contactById, userById };
}
