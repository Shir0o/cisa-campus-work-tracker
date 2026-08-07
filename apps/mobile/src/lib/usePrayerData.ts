// Live data for the native Prayer tab — the full team prayer list (not just
// personal-contact prayers, unlike My Day's cockpit slice). Mirrors the
// subscriptions + entry logic in the web app's src/views/PrayerList.tsx.
import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { isTeamPrayer, type Contact, type PrayerRecord } from '@cisa/core';
import { db, handleFirestoreError, OperationType } from './firebase';
import { addPrayer, subscribeAllPrayers, updatePrayerBurden, updatePrayerStatus } from './data/prayers';
import { PrayerHidden, usePrayerHidden } from './data/prayerHidden';

export function usePrayerData(uid: string | null, displayName: string | null) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [prayers, setPrayers] = useState<PrayerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Contacts started this session that have no prayer doc yet — cleared on
  // app restart (matches web's session-only `startedIds`; persisted hiding is
  // the only thing that survives via PrayerHidden/AsyncStorage).
  const [startedIds, setStartedIds] = useState<Set<string>>(new Set());
  const hiddenApi = usePrayerHidden();

  useEffect(() => {
    if (!uid) return;
    const onLoadError = (e: unknown, path: string) => {
      setError(`Couldn't load ${path}.`);
      handleFirestoreError(e, OperationType.LIST, path, { rethrow: false });
    };
    const unsubContacts = onSnapshot(
      query(collection(db, 'contacts'), orderBy('name', 'asc')),
      (snap) => {
        setContacts(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Contact[]);
        setLoading(false);
      },
      (e) => onLoadError(e, 'contacts'),
    );
    const unsubPrayers = subscribeAllPrayers(setPrayers, (e) => onLoadError(e, 'prayers'));
    return () => {
      unsubContacts();
      unsubPrayers();
    };
  }, [uid]);

  // Burdens the trainee kept to themselves in the log sheet never reach this
  // page — they live on their own contact's Prayers tab. Prayers written before
  // that toggle existed carry no flag and stay here (see `isTeamPrayer`).
  const teamPrayers = useMemo(() => prayers.filter(isTeamPrayer), [prayers]);

  const heldContactIds = useMemo(() => {
    if (!uid) return new Set<string>();
    const ids = new Set<string>();
    for (const p of teamPrayers) if (!hiddenApi.isHidden(uid, p.contactId)) ids.add(p.contactId);
    for (const id of startedIds) if (!hiddenApi.isHidden(uid, id)) ids.add(id);
    return ids;
  }, [uid, teamPrayers, startedIds, hiddenApi]);

  const entries = useMemo(() => {
    const list: { contact: Contact; prayers: PrayerRecord[] }[] = [];
    for (const id of heldContactIds) {
      const contact = contacts.find((c) => c.id === id);
      if (!contact) continue;
      list.push({ contact, prayers: teamPrayers.filter((p) => p.contactId === id) });
    }
    return list;
  }, [heldContactIds, contacts, teamPrayers]);

  const answeredThisYear = useMemo(() => {
    const year = new Date().getFullYear();
    return teamPrayers.filter((p) => {
      if (p.status !== 'answered') return false;
      return new Date(p.updatedAt || p.date).getFullYear() === year;
    }).length;
  }, [teamPrayers]);

  const meName = displayName || 'Someone';

  return {
    contacts,
    entries,
    loading,
    error,
    answeredThisYear,

    startHolding: (contact: Contact) => {
      setStartedIds((prev) => new Set(prev).add(contact.id));
      if (uid) hiddenApi.unhide(uid, contact.id);
    },
    stopHolding: (contactId: string) => {
      if (uid) hiddenApi.hide(uid, contactId);
    },

    addPrayer: (contactId: string, burden: string) => addPrayer({ contactId, burden }, { uid, name: meName }),
    updateBurden: (prayerId: string, burden: string) => updatePrayerBurden(prayerId, burden, { uid, name: meName }),
    setStatus: (prayerId: string, status: PrayerRecord['status'], answer?: string, answeredAt?: string | null) =>
      updatePrayerStatus(prayerId, status, { uid, name: meName }, answer, answeredAt),
  };
}
