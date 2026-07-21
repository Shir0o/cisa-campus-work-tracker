// Live data for the Contact Detail screen — the contact doc + stages plus
// its interactions/comments/activities/prayers/threads subcollections, and
// the write actions each tab needs. Mirrors
// src/components/modals/ContactDetailsModal.tsx's subscriptions/handlers.
import { useEffect, useMemo, useState } from 'react';
import {
  traineesOf,
  walkingRecipient,
  type Comment,
  type Contact,
  type ContactEditFields,
  type Hist,
  type Interaction,
  type PrayerRecord,
  type Stage,
  type ThreadKind,
  type ThreadMessage,
} from '@cisa/core';
import { useAuth } from './AuthProvider';
import { handleFirestoreError, logActivity, OperationType } from './firebase';
import {
  deleteContact as deleteContactApi,
  subscribeContact,
  subscribeStages,
  updateContact as updateContactApi,
  updateContactTags as updateContactTagsApi,
} from './data/contacts';
import {
  addInteraction as addInteractionApi,
  deleteInteraction as deleteInteractionApi,
  subscribeInteractions,
  updateInteraction as updateInteractionApi,
} from './data/interactions';
import { addComment as addCommentApi, subscribeComments } from './data/comments';
import { subscribeContactActivities } from './data/activities';
import { addPrayer as addPrayerApi, subscribeContactPrayers } from './data/prayers';
import { addThreadMessage, subscribeThreads, toggleReaction as toggleReactionApi } from './data/threads';

export function useContactDetailData(contactId: string) {
  const { uid, user } = useAuth();
  const by = { uid, name: user?.displayName || user?.email?.split('@')[0] || 'Unknown User', photoURL: user?.photoURL };

  const [contact, setContact] = useState<Contact | null>(null);
  const [stages, setStages] = useState<Stage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [interactionsLoading, setInteractionsLoading] = useState(true);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [activities, setActivities] = useState<Hist[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState(true);
  const [prayers, setPrayers] = useState<PrayerRecord[]>([]);
  const [prayersLoading, setPrayersLoading] = useState(true);
  const [threadMessages, setThreadMessages] = useState<ThreadMessage[]>([]);

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
      subscribeComments(
        contactId,
        (list) => {
          setComments(list);
          setCommentsLoading(false);
        },
        (e) => onLoadError(e, `contacts/${contactId}/comments`),
      ),
      subscribeContactActivities(
        contactId,
        (list) => {
          setActivities(list);
          setActivitiesLoading(false);
        },
        (e) => onLoadError(e, 'activities'),
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
    ];

    return () => unsubs.forEach((unsub) => unsub());
  }, [uid, contactId]);

  // "Alongside" tab label + who gets pinged on the bell when the viewer
  // posts a thread message — mirrors ContactDetailsModal's inline derivations.
  const viewerWalksWithAdder = useMemo(
    () => !!contact?.createdBy && traineesOf(uid).includes(contact.createdBy),
    [contact?.createdBy, uid],
  );
  const walkLabel =
    viewerWalksWithAdder && contact?.createdByName ? `Alongside ${contact.createdByName.split(' ')[0]}` : 'Alongside';
  const threadRecipient = useMemo(() => walkingRecipient(uid, contact?.createdBy), [uid, contact?.createdBy]);

  return {
    contact,
    stages,
    loading,
    error,
    interactions,
    interactionsLoading,
    comments,
    commentsLoading,
    activities,
    activitiesLoading,
    prayers,
    prayersLoading,
    threadMessages,
    walkLabel,

    saveEdit: async (edits: ContactEditFields) => {
      if (!contact) return;
      await updateContactApi(contact, edits, by);
    },

    addTag: async (tag: string) => {
      if (!contact) return;
      const current = contact.tags ?? [];
      if (current.includes(tag)) return;
      await updateContactTagsApi(contact, [...current, tag], 'added', tag, by);
    },

    removeTag: async (tag: string) => {
      if (!contact) return;
      await updateContactTagsApi(contact, (contact.tags ?? []).filter((t) => t !== tag), 'removed', tag, by);
    },

    deleteContact: async () => {
      if (!contact) return;
      await deleteContactApi(contact);
    },

    addInteraction: async (input: { content: string; dateTime: string; type: string }) => {
      if (!contact || !uid) return;
      await addInteractionApi(contactId, contact.name, input, { uid, name: by.name, photoURL: by.photoURL });
    },

    updateInteraction: async (interactionId: string, patch: { content: string; dateTime: string; type: string }) => {
      if (!contact) return;
      await updateInteractionApi(contactId, contact.name, interactionId, patch);
    },

    deleteInteraction: async (interaction: Interaction) => {
      if (!contact) return;
      await deleteInteractionApi(contactId, contact.name, interaction);
    },

    addComment: async (input: { text: string; parentId?: string | null }) => {
      if (!contact || !uid) return;
      await addCommentApi(contactId, contact, input, { uid, name: by.name, photoURL: by.photoURL });
    },

    // Prayer's data/prayers.ts wrapper stays a plain write (matching the Prayer
    // tab's own addPrayer) — Contact Detail additionally logs it, since a new
    // prayer here should surface live in this same screen's History tab.
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
