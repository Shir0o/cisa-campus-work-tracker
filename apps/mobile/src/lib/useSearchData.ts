// Live data for the native Search screen — contacts (always), stages (for
// the "New contact" quick action's AddContactSheet), and activities
// (Trainee+ only). Mirrors web's GlobalSearch.tsx's live listeners + derived
// result groups, trimmed to the MVP scope (People + Quick actions + History
// — see MIGRATION.md for the deferred Conversations/Coordination Notes
// groups).
import { useEffect, useMemo, useState } from 'react';
import {
  hasMinRole,
  quickActionsFor,
  recentPeople as recentPeopleFn,
  searchHistory as searchHistoryFn,
  searchPeople as searchPeopleFn,
  type AppRole,
  type Contact,
  type Hist,
  type Stage,
} from '@cisa/core';
import { handleFirestoreError, OperationType } from './firebase';
import { subscribeContacts, subscribeStages } from './data/contacts';
import { subscribeActivities } from './data/activities';

export function useSearchData(role: AppRole | null) {
  const canSeeHistory = hasMinRole(role, 'manager');

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [activities, setActivities] = useState<Hist[]>([]);
  const [q, setQ] = useState('');

  useEffect(() => {
    const onLoadError = (e: unknown, path: string) =>
      handleFirestoreError(e, OperationType.LIST, path, { rethrow: false });
    const unsubContacts = subscribeContacts(setContacts, (e) => onLoadError(e, 'contacts'));
    const unsubStages = subscribeStages(setStages, (e) => onLoadError(e, 'stages'));
    return () => {
      unsubContacts();
      unsubStages();
    };
  }, []);

  useEffect(() => {
    if (!canSeeHistory) return;
    return subscribeActivities(setActivities, (e) =>
      handleFirestoreError(e, OperationType.LIST, 'activities', { rethrow: false }),
    );
  }, [canSeeHistory]);

  const hasQuery = q.trim().length > 0;
  const people = useMemo(
    () => (hasQuery ? searchPeopleFn(contacts, q) : recentPeopleFn(contacts)),
    [hasQuery, q, contacts],
  );
  const history = useMemo(() => (hasQuery ? searchHistoryFn(activities, q, role) : []), [hasQuery, q, activities, role]);
  const quickActions = useMemo(() => (hasQuery ? [] : quickActionsFor(role)), [hasQuery, role]);

  return { contacts, stages, q, setQ, hasQuery, people, history, quickActions, canSeeHistory };
}
