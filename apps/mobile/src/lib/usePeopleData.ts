// Live data for the native People (Directory) tab — the full team contact
// list with search + stage filtering. Mirrors the subscriptions in the web
// app's src/views/Directory.tsx, using @cisa/core's filterAndSortDirectory
// as the shared behavior oracle.
import { useEffect, useMemo, useState } from 'react';
import {
  daysSince,
  filterAndSortDirectory,
  parseMs,
  type Contact,
  type Leader,
  type Stage,
  type Touch,
} from '@cisa/core';
import { handleFirestoreError, OperationType } from './firebase';
import { subscribeContacts, subscribeStages, subscribeTouches } from './data/contacts';

export interface StagePillCount {
  stage: Stage;
  count: number;
}

export function usePeopleData(uid: string | null) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [touches, setTouches] = useState<Touch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  // A stage's label ("Contact.stage" stores the label, not a doc id), or "all".
  const [stageFilter, setStageFilter] = useState('all');

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
    return () => {
      unsubContacts();
      unsubStages();
      unsubTouches();
    };
  }, [uid]);

  const entries: Leader[] = useMemo(
    () => filterAndSortDirectory(contacts, touches, { search, stageId: stageFilter }),
    [contacts, touches, search, stageFilter],
  );

  const stageCounts: StagePillCount[] = useMemo(
    () => stages.map((stage) => ({ stage, count: contacts.filter((c) => c.stage === stage.label).length })),
    [stages, contacts],
  );

  const newCount = useMemo(
    () =>
      contacts.filter((c) => {
        const ms = parseMs(c.createdAt);
        return ms != null && daysSince(ms) <= 14;
      }).length,
    [contacts],
  );

  const overdueCount = useMemo(
    () => filterAndSortDirectory(contacts, touches, { search: '', stageId: 'all' }).filter((l) => l.days >= 7).length,
    [contacts, touches],
  );

  return {
    contacts,
    stages,
    entries,
    stageCounts,
    totalCount: contacts.length,
    newCount,
    overdueCount,
    loading,
    error,
    search,
    setSearch,
    stageFilter,
    setStageFilter,
  };
}
