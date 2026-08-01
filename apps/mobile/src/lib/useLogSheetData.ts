// The roster the v2 log sheet needs: who you could be logging, when you last
// saw them, and the first stage a new person lands on.
//
// Subscribed only while the sheet is OPEN — it is mounted by three screens at
// once (the queue, the full-timer's home, a person's page), and a log sheet
// nobody has opened should not be holding three Firestore listeners each.
import { useEffect, useState } from 'react';
import type { Contact, Stage, Touch } from '@cisa/core';
import { subscribeContacts, subscribeStages, subscribeTouches } from './data/contacts';

export interface LogSheetData {
  contacts: Contact[];
  stages: Stage[];
  touches: Touch[];
}

export function useLogSheetData(active: boolean): LogSheetData {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [touches, setTouches] = useState<Touch[]>([]);

  useEffect(() => {
    if (!active) return;
    const unsubContacts = subscribeContacts(setContacts);
    const unsubStages = subscribeStages(setStages);
    const unsubTouches = subscribeTouches(setTouches);
    return () => {
      unsubContacts();
      unsubStages();
      unsubTouches();
    };
  }, [active]);

  return { contacts, stages, touches };
}
