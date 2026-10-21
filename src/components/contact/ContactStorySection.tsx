import React, { useState } from "react";
import type { Contact, Interaction, PrayerRecord } from "../../types";
import type { StoryEntry } from "../../lib/contactStory";
import ContactStory from "./ContactStory";
import ContactInteractionItem from "./ContactInteractionItem";
import ContactPrayerCard from "./ContactPrayerCard";
import { canRemoveInteraction } from "../../lib/interactionRemoval";
import ContactComposer from "./ContactComposer";
import type { ContactTeamMember } from "./types";
import {
  emptyComposer,
  interactionEditValue,
  splitPrayerBurden,
  type ComposerValue,
} from "../../lib/contactComposer";

export interface ContactStorySectionProps {
  story: StoryEntry[];
  fmtDate: (v?: string | null) => string | null;
  composer: React.ReactNode;
  interactionsLoading: boolean;
  currentContact: Contact;
  currentUid?: string | null;
  role?: string;
  user: { uid?: string } | null;
  isAdmin: boolean;
  canUpdatePrayers: boolean;
  openThread: string | null;
  onOpenThread: (id: string) => void;
  onOpenConversation: (messageId?: string) => void;
  onRemoveInteraction: (interaction: Interaction) => void;
  onUpdateInteraction(
    interactionId: string,
    data: { content: string; dateTime?: string; type?: string },
  ): Promise<void>;
  onUpdatePrayerStatus: (prayer: PrayerRecord, status: PrayerRecord["status"]) => void;
  onUpdatePrayerBurden(prayer: PrayerRecord, words: { text: string; context: string }): Promise<void>;
  interactionAdapterFor: (interaction: Interaction) => any;
  streamViewer: { uid: string; role?: string };
  /** The roster, so a story row can show the reacher's portrait (#1669). */
  teamMembers: ContactTeamMember[];
}

export default function ContactStorySection({
  story,
  fmtDate,
  composer,
  interactionsLoading,
  currentContact,
  currentUid,
  role,
  user,
  isAdmin,
  canUpdatePrayers,
  openThread,
  onOpenThread,
  onOpenConversation,
  onRemoveInteraction,
  onUpdateInteraction,
  onUpdatePrayerStatus,
  onUpdatePrayerBurden,
  interactionAdapterFor,
  streamViewer,
  teamMembers,
}: ContactStorySectionProps) {
  const [editingInteractionId, setEditingInteractionId] = useState<string | null>(null);
  const [editInteractionData, setEditInteractionData] = useState<ComposerValue>(() => emptyComposer());
  const [isUpdatingInteraction, setIsUpdatingInteraction] = useState(false);
  const [editingPrayerId, setEditingPrayerId] = useState<string | null>(null);
  const [editPrayerData, setEditPrayerData] = useState<ComposerValue>(() => emptyComposer());
  const [isUpdatingPrayer, setIsUpdatingPrayer] = useState(false);
  const firstName = (currentContact.name || "").split(" ")[0];

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editInteractionData.text.trim() || !editingInteractionId) return;
    setIsUpdatingInteraction(true);
    try {
      await onUpdateInteraction(editingInteractionId, {
        content: editInteractionData.text.trim(),
        dateTime: editInteractionData.dateTime,
        type: editInteractionData.type,
      });
      setEditingInteractionId(null);
    } finally {
      setIsUpdatingInteraction(false);
    }
  };

  const renderInteractionItem = (interaction: Interaction) => (
    <ContactInteractionItem
      interaction={interaction}
      canEdit={user?.uid === interaction.userId || isAdmin}
      canRemove={canRemoveInteraction(interaction, currentUid, role, isAdmin)}
      editing={editingInteractionId === interaction.id}
      editData={editInteractionData}
      onEditDataChange={setEditInteractionData}
      onStartEdit={() => {
        setEditingInteractionId(interaction.id);
        setEditInteractionData(interactionEditValue(interaction));
      }}
      onCancelEdit={() => setEditingInteractionId(null)}
      onUpdate={handleUpdate}
      updating={isUpdatingInteraction}
      onRemove={() => onRemoveInteraction(interaction)}
      adapterFor={interactionAdapterFor}
      viewer={streamViewer}
      threadOpen={openThread === interaction.id}
      onOpenThread={() => onOpenThread(interaction.id)}
      firstName={firstName}
      teamMembers={teamMembers}
    />
  );

  const handleUpdatePrayer = (prayer: PrayerRecord) => async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editPrayerData.text.trim()) return;
    setIsUpdatingPrayer(true);
    try {
      await onUpdatePrayerBurden(prayer, {
        text: editPrayerData.text,
        context: editPrayerData.context,
      });
      setEditingPrayerId(null);
    } finally {
      setIsUpdatingPrayer(false);
    }
  };

  // A prayer's words are edited in the composer, in prayer mode (#1674).
  const renderPrayerCard = (p: PrayerRecord) =>
    editingPrayerId === p.id ? (
      <ContactComposer
        open
        variant="edit"
        value={editPrayerData}
        onChange={setEditPrayerData}
        onOpen={() => {}}
        onCancel={() => setEditingPrayerId(null)}
        onSubmit={handleUpdatePrayer(p)}
        submitting={isUpdatingPrayer}
        firstName={firstName}
      />
    ) : (
      <ContactPrayerCard
        prayer={p}
        canUpdatePrayers={canUpdatePrayers}
        onUpdateStatus={onUpdatePrayerStatus}
        onEdit={() => {
          setEditingPrayerId(p.id);
          setEditPrayerData({ ...emptyComposer(), mode: "prayer", ...splitPrayerBurden(p.burden) });
        }}
      />
    );

  const openStoryMessage = (messageId: string) => {
    onOpenConversation(messageId);
  };

  return (
    <ContactStory
      story={story}
      fmtDate={fmtDate}
      composer={composer}
      interactionsLoading={interactionsLoading}
      renderInteraction={renderInteractionItem}
      renderPrayerCard={renderPrayerCard}
      onOpenStoryMessage={openStoryMessage}
    />
  );
}
