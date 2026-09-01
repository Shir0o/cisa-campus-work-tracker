// Live data for the person screen — the contact doc + stages plus its
// interactions/prayers/threads subcollections, and the writes its three tabs
// need.
//
// It was written for the Material six-tab screen (ported from
// src/components/modals/ContactDetailsModal.tsx). The v2 port cut Discussion,
// History and the admin edit form, so the comments/activities subscriptions and
// the edit/tag/comment/interaction-edit writes went with them — they had no
// other caller. The shared modules behind them (data/comments.ts, the tag and
// contact-edit functions) are untouched; the desktop site still uses them.
import { useEffect, useMemo, useState } from 'react';
import {
  personalContactIdsOf,
  isTrainee,
  walkingRecipient,
  type Contact,
  type PrayerRecord,
  type Stage,
  type ThreadKind,
  type ThreadMessage,
  type Interaction,
} from '@cisa/core';
import { useAuth } from './AuthProvider';
import { handleFirestoreError, logActivity, OperationType } from './firebase';
import { useFullTimerNames } from './useFullTimerNames';
import { resolveCaregiverName } from './caregiverName';
import { subscribeContact, subscribeStages } from './data/contacts';
import {
  addInteraction as addInteractionApi,
  deleteInteraction as deleteInteractionApi,
  subscribeInteractions,
} from './data/interactions';
import {
  addPrayer as addPrayerApi,
  subscribeContactPrayers,
  updatePrayerStatus,
} from './data/prayers';
import { addThreadMessage, subscribeThreads, toggleReaction as toggleReactionApi } from './data/threads';
import { subscribeUserPreferences } from './data/userPreferences';
import { useIdentityReset } from './useIdentityReset';
import { useMinLoading } from './useMinLoading';

export function useContactDetailData(contactId: string) {
  const { uid, user } = useAuth();
  const by = { uid, name: user?.displayName || user?.email?.split('@')[0] || 'Unknown User', photoURL: user?.photoURL };

  const [contact, setContact] = useState<Contact | null>(null);
  const [stages, setStages] = useState<Stage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [interactionsLoading, setInteractionsLoading] = useState(true);
  const [prayers, setPrayers] = useState<PrayerRecord[]>([]);
  const [prayersLoading, setPrayersLoading] = useState(true);
  const [threadMessages, setThreadMessages] = useState<ThreadMessage[]>([]);
  const [prefContactIds, setPrefContactIds] = useState<string[] | null>(null);

  // Drop the previous identity's content the moment it changes (impersonation)
  // instead of flashing it until the new snapshot lands.
  useIdentityReset(uid, () => {
    setContact(null);
    setStages([]);
    setInteractions([]);
    setPrayers([]);
    setThreadMessages([]);
    setPrefContactIds(null);
    setLoading(true);
    setInteractionsLoading(true);
    setPrayersLoading(true);
    setError(null);
  });

  useEffect(() => {
    if (!uid || !contactId) return;
    const onLoadError = (e: unknown, path: string) => {
      setError(`Couldn't load ${path}.`);
      handleFirestoreError(e, OperationType.LIST, path, { rethrow: false });
    };

    const unsubs = [
      subscribeContact(
        contactId,
        (c) => {
          setContact(c);
          setLoading(false);
        },
        (e) => onLoadError(e, `contacts/${contactId}`),
      ),
      subscribeStages(setStages, (e) => onLoadError(e, 'stages')),
      subscribeInteractions(
        contactId,
        (list) => {
          setInteractions(list);
          setInteractionsLoading(false);
        },
        (e) => onLoadError(e, `contacts/${contactId}/interactions`),
      ),
      subscribeContactPrayers(
        contactId,
        (list) => {
          setPrayers(list);
          setPrayersLoading(false);
        },
        (e) => onLoadError(e, 'prayers'),
      ),
      subscribeThreads(contactId, setThreadMessages, (e) => onLoadError(e, `contacts/${contactId}/threads`)),
      // "In your care" — the picker's choice, else the people I added. The same
      // notion of ownership People, My Day and the full-timer's home all read.
      subscribeUserPreferences(uid, (prefs) => setPrefContactIds(prefs.personalContactIds ?? null)),
    ];

    return () => unsubs.forEach((unsub) => unsub());
  }, [uid, contactId]);

  // "Alongside" tab label + who gets pinged on the bell when the viewer
  // posts a thread message — mirrors ContactDetailsModal's inline derivations.
  const viewerWalksWithAdder = useMemo(
    () => !!contact?.createdBy && isTrainee(contact.createdBy),
    [contact?.createdBy],
  );
  const walkLabel =
    viewerWalksWithAdder && contact?.createdByName ? `Alongside ${contact.createdByName.split(' ')[0]}` : 'Alongside';
  const threadRecipient = useMemo(() => walkingRecipient(uid, contact?.createdBy), [uid, contact?.createdBy]);

  const inYourCare = useMemo(
    () => (contact ? personalContactIdsOf(prefContactIds, [contact], uid).has(contact.id) : false),
    [prefContactIds, contact, uid],
  );

  const shownLoading = useMinLoading(loading);

  // Resolve the contact's "Cared for by" name. The display is bound to the
  // mutable `owner` field, not `createdBy` — when a contact is handed off,
  // the name shown here should change. The full-timer roster is the source
  // of uid → name; if the owner isn't in the roster (deleted user, anon
  // sign-up), fall back to the immutable `createdByName` so the row never
  // shows nothing.
  const fullTimerNames = useFullTimerNames();
  const caregiverName = resolveCaregiverName(
    contact?.owner ?? null,
    contact?.createdByName ?? null,
    fullTimerNames,
  );

  return {
    contact,
    stages,
    loading: shownLoading,
    error,
    interactions,
    interactionsLoading,
    prayers,
    prayersLoading,
    threadMessages,
    walkLabel,
    inYourCare,
    caregiverName,

    addInteraction: async (input: { content: string; dateTime: string; type: string }) => {
      if (!contact || !uid) return;
      await addInteractionApi(contactId, contact.name, input, { uid, name: by.name, photoURL: by.photoURL });
    },
    // The wrapper logs the audit entry and handles errors; the removal
    // registry decides WHEN this fires (after the Undo window).
    deleteInteraction: async (interaction: Interaction) => {
      if (!contact || !uid) return;
      await deleteInteractionApi(contactId, contact.name, interaction);
    },

    // data/prayers.ts's wrapper stays a plain write (matching the Prayer tab's
    // own addPrayer) — a prayer written down here is additionally logged, so it
    // surfaces in "Looking back" and in the person's audit trail on the desk.
    addPrayer: async (input: { burden: string; context?: string }) => {
      if (!contact || !uid) return;
      const burden = [input.burden.trim(), input.context?.trim()].filter(Boolean).join('\n\n');
      await addPrayerApi({ contactId, burden }, by);
      void logActivity({
        action: 'added a prayer burden for',
        targetId: contactId,
        targetName: contact.name,
        targetType: 'contact',
        type: 'comment',
        description: input.burden.trim(),
      });
    },

    // "Answered" on an open prayer. The design also lets you set one down
    // unanswered; the person screen offers only the glad one, as it does.
    //
    // `answeredAt` is a DISPLAY string, not a timestamp — the web app writes
    // "Jul 13" and prints it straight back (src/components/landing/PrayerRows.tsx),
    // so an ISO string here would show up as one on the desktop site. The
    // format is matched rather than fixed; changing it is a web-app change.
    markPrayerAnswered: async (prayer: PrayerRecord) => {
      if (!contact) return;
      const answeredAt = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      await updatePrayerStatus(prayer.id, 'answered', by, null, answeredAt);
      void logActivity({
        action: 'marked a prayer answered for',
        targetId: contactId,
        targetName: contact.name,
        targetType: 'contact',
        type: 'comment',
        description: prayer.burden,
      });
    },

    postThreadMessage: async (input: { interactionId?: string | null; kind: ThreadKind; body: string }) => {
      if (!contact || !uid) return;
      await addThreadMessage(
        contactId,
        { interactionId: input.interactionId ?? null, from: uid, fromName: by.name, kind: input.kind, body: input.body },
        { to: threadRecipient, contactName: contact.name },
      );
    },

    toggleReaction: async (messageId: string, emoji: string) => {
      if (!uid) return;
      await toggleReactionApi(contactId, messageId, uid, emoji);
    },
  };
}
