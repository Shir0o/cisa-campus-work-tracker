// Live data for the native Student landing — personal prayers only (a
// "friend" is just a titled personal prayer, no contact linkage). Mirrors
// src/views/landings/LandingStudent.tsx.
import { useEffect, useMemo, useState } from 'react';
import type { PersonalPrayer } from '@cisa/core';
import {
  addPersonalPrayer as addPersonalPrayerDoc,
  deletePersonalPrayer as deletePersonalPrayerDoc,
  subscribePersonalPrayers,
  updatePersonalPrayer as updatePersonalPrayerDoc,
} from './data/personalPrayers';

export function useStudentLandingData(uid: string | null) {
  const [personalPrayers, setPersonalPrayers] = useState<PersonalPrayer[]>([]);

  useEffect(() => {
    if (!uid) return;
    return subscribePersonalPrayers(uid, setPersonalPrayers);
  }, [uid]);

  const activePersonalPrayers = useMemo(
    () => personalPrayers.filter((p) => p.status !== 'archived'),
    [personalPrayers],
  );

  return {
    activePersonalPrayers,
    addPersonalPrayer: (title: string) => uid && addPersonalPrayerDoc(uid, { title }),
    updatePersonalPrayer: (id: string, patch: Parameters<typeof updatePersonalPrayerDoc>[2]) =>
      uid && updatePersonalPrayerDoc(uid, id, patch),
    deletePersonalPrayer: (id: string) => uid && deletePersonalPrayerDoc(uid, id),
  };
}
