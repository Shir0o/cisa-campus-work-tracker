import { useEffect, useMemo, useState } from 'react';
import {
  daysSince,
  lastTouchByContact,
  parseMs,
  personalContactIdsOf,
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

export interface JourneyStage {
  id: string;
  label: string;
}

export interface JourneyTab extends JourneyStage {
  count: number;
}

const UNASSIGNED: JourneyStage = { id: 'uncategorized', label: 'Unassigned' };

export function useJourneyData(uid: string | null, role?: AppRole | string | null) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [touches, setTouches] = useState<Touch[]>([]);
  const [prefContactIds, setPrefContactIds] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

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
    // The v2 screen puts the people in my care at the top of every step.
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

  const stageLabels = useMemo(() => new Set(stages.map((s) => s.label)), [stages]);

  // Contacts with no stage, or a stale stage label that no longer exists.
  const unmappedContacts = useMemo(
    () => scopedContacts.filter((c) => !c.stage || !stageLabels.has(c.stage)),
    [scopedContacts, stageLabels],
  );

  const mobileStages: JourneyStage[] = useMemo(() => {
    const list: JourneyStage[] = stages.map((s) => ({ id: s.id, label: s.label }));
    if (unmappedContacts.length > 0) list.unshift(UNASSIGNED);
    return list;
  }, [stages, unmappedContacts]);

  const tabs: JourneyTab[] = useMemo(
    () =>
      mobileStages.map((s) => ({
        ...s,
        count:
          s.id === UNASSIGNED.id ? unmappedContacts.length : scopedContacts.filter((c) => c.stage === s.label).length,
      })),
    [mobileStages, scopedContacts, unmappedContacts],
  );

  const activeIdx = Math.min(activeIndex, Math.max(mobileStages.length - 1, 0));
  const activeStage = mobileStages[activeIdx] ?? UNASSIGNED;

  const shownLoading = useMinLoading(loading);

  const touchMap = useMemo(() => lastTouchByContact(touches), [touches]);

  const items: Leader[] = useMemo(() => {
    const pool =
      activeStage.id === UNASSIGNED.id ? unmappedContacts : scopedContacts.filter((c) => c.stage === activeStage.label);
    return pool
      .map((c) => {
        const touch = touchMap.get(c.id);
        const ms = touch?.ms ?? parseMs(c.createdAt);
        const days = ms == null ? Infinity : daysSince(ms);
        return { contact: c, days, note: (touch?.note || c.notes || '').trim() };
      })
      .sort((a, b) => {
        const mine = Number(personalContactIds.has(b.contact.id)) - Number(personalContactIds.has(a.contact.id));
        return mine || a.contact.name.localeCompare(b.contact.name);
      });
  }, [activeStage, scopedContacts, unmappedContacts, touchMap, personalContactIds]);

  return {
    stages,
    mobileStages,
    tabs,
    activeIndex: activeIdx,
    setActiveIndex,
    activeStage,
    items,
    personalContactIds,
    totalCount: scopedContacts.length,
    loading: shownLoading,
    error,
  };
}
