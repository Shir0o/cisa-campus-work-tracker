import React, { useState } from "react";
import type { Contact, Interaction, PrayerRecord } from "../../types";
import type { StoryEntry } from "../../lib/contactStory";
import ContactStory from "./ContactStory";
import ContactInteractionItem from "./ContactInteractionItem";
import ContactPrayerCard from "./ContactPrayerCard";
import { canRemoveInteraction } from "../../lib/interactionRemoval";

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
  interactionAdapterFor: (interaction: Interaction) => any;
  streamViewer: { uid: string; role?: string };
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
  interactionAdapterFor,
  streamViewer,
}: ContactStorySectionProps) {
  const [editingInteractionId, setEditingInteractionId] = useState<string | null>(null);
  const [editInteractionData, setEditInteractionData] = useState({
    content: "",
    dateTime: "",
    type: "interaction",
  });
  const [isUpdatingInteraction, setIsUpdatingInteraction] = useState(false);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editInteractionData.content.trim() || !editingInteractionId) return;
    setIsUpdatingInteraction(true);
    try {
      await onUpdateInteraction(editingInteractionId, {
        content: editInteractionData.content.trim(),
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
        setEditInteractionData({
          content: interaction.content,
          dateTime: interaction.dateTime,
          type: interaction.type || "interaction",
        });
      }}
      onCancelEdit={() => setEditingInteractionId(null)}
      onUpdate={handleUpdate}
      updating={isUpdatingInteraction}
      onRemove={() => onRemoveInteraction(interaction)}
      adapterFor={interactionAdapterFor}
      viewer={streamViewer}
      threadOpen={openThread === interaction.id}
      onOpenThread={() => onOpenThread(interaction.id)}
    />
  );

  const renderPrayerCard = (p: PrayerRecord) => (
    <ContactPrayerCard
      prayer={p}
      canUpdatePrayers={canUpdatePrayers}
      onUpdateStatus={onUpdatePrayerStatus}
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
