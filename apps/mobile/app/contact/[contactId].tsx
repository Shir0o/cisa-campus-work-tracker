import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { canAccessRoute, countFor, threadsFor, type Interaction, type ThreadKind } from '@cisa/core';
import { Screen, AppText, Snackbar } from '../../src/components/ui';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useAuth } from '../../src/lib/AuthProvider';
import { useContactDetailData } from '../../src/lib/useContactDetailData';
import { ContactHeader } from '../../src/components/contact/ContactHeader';
import { ContactTabs, type ContactDetailTab } from '../../src/components/contact/ContactTabs';
import { ContactEditForm } from '../../src/components/contact/ContactEditForm';
import { OverviewTab } from '../../src/components/contact/OverviewTab';
import { ConversationsTab } from '../../src/components/contact/ConversationsTab';
import { AlongsideThreadView } from '../../src/components/contact/AlongsideThreadView';
import { PrayerTab } from '../../src/components/contact/PrayerTab';
import { DiscussionTab } from '../../src/components/contact/DiscussionTab';
import { HistoryTab } from '../../src/components/contact/HistoryTab';

// Contact Detail — the full profile: overview/edit, conversations, the
// "Alongside" walking-together thread, prayer, team discussion, and audit
// history. Design oracle: ContactDetailsModal.tsx's isMobile branch. Reached
// from People/Prayer/My Day/History/Answered/Attendance/Search/LandingTrainee
// (see MIGRATION.md's Contact Detail entry for the 9th call site,
// Messages' ChatDetailsSheet, left out of scope).
export default function ContactDetail() {
  const { contactId, tab, interactionId } = useLocalSearchParams<{ contactId: string; tab?: string; interactionId?: string }>();
  const router = useRouter();
  const { colors, spacing } = useTheme();
  const { uid, role } = useAuth();
  const data = useContactDetailData(contactId);
  const [isEditing, setIsEditing] = useState(false);
  const [activeTab, setActiveTab] = useState<ContactDetailTab>(
    interactionId ? 'interactions' : tab === 'thread' ? 'thread' : 'overview',
  );

  const canWrite = role !== 'viewer';
  const isAdmin = role === 'admin';
  const contactThreadCount = useMemo(() => countFor(data.threadMessages, null), [data.threadMessages]);

  // Deleting an interaction gives a brief undo window via a Snackbar instead
  // of an Alert.alert confirm — the Snackbar's "Undo" action is the
  // confirmation. Held here (not in ConversationsTab) so it can render above
  // the tab's own ScrollView rather than inside its scrollable content.
  const [pendingDelete, setPendingDelete] = useState<Interaction | null>(null);
  const pendingDeleteRef = useRef<Interaction | null>(null);
  pendingDeleteRef.current = pendingDelete;
  useEffect(
    () => () => {
      // If this screen unmounts (e.g. the user navigates away) while a
      // delete is still in its undo window, commit it immediately rather
      // than silently reviving the interaction next time it's opened.
      if (pendingDeleteRef.current) void data.deleteInteraction(pendingDeleteRef.current);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const commitPendingDelete = async () => {
    const toDelete = pendingDelete;
    setPendingDelete(null);
    if (toDelete) await data.deleteInteraction(toDelete);
  };

  if (!canAccessRoute(role, '/contact')) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: 8 }}>
          <Ionicons name="lock-closed-outline" size={32} color={colors.onSurfaceVariant} />
          <AppText variant="heading">Can't open this profile</AppText>
        </View>
      </Screen>
    );
  }

  if (data.error || (!data.loading && !data.contact)) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: 8 }}>
          <Ionicons name="alert-circle-outline" size={32} color={colors.onSurfaceVariant} />
          <AppText variant="body" color={colors.onSurfaceVariant} style={{ textAlign: 'center' }}>
            {data.error || "This contact couldn't be found."}
          </AppText>
        </View>
      </Screen>
    );
  }

  if (data.loading || !data.contact) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <AppText variant="body" color={colors.onSurfaceVariant}>
            Loading…
          </AppText>
        </View>
      </Screen>
    );
  }

  const contact = data.contact;

  if (isEditing) {
    return (
      <Screen edges={['top', 'bottom']}>
        <ContactEditForm
          contact={contact}
          stages={data.stages}
          onSave={async (edits) => {
            await data.saveEdit(edits);
            setIsEditing(false);
          }}
          onDelete={async () => {
            await data.deleteContact();
            router.back();
          }}
          onCancel={() => setIsEditing(false)}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <ContactHeader
        contact={contact}
        canEdit={isAdmin}
        onBack={() => router.back()}
        onEdit={() => setIsEditing(true)}
        onLogInteraction={() => setActiveTab('interactions')}
        onAddPrayer={() => setActiveTab('prayer')}
      />

      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.sm }}>
        <ContactTabs
          value={activeTab}
          onChange={setActiveTab}
          tabs={[
            { id: 'overview', label: 'Overview' },
            { id: 'interactions', label: 'Conversations', count: data.interactions.length },
            { id: 'thread', label: data.walkLabel, count: contactThreadCount },
            { id: 'prayer', label: 'Prayer', count: data.prayers.length },
            { id: 'comments', label: 'Discussion', count: data.comments.length },
            { id: 'history', label: 'History' },
          ]}
        />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}>
        {activeTab === 'overview' ? (
          <OverviewTab contact={contact} stages={data.stages} canEditTags={canWrite} onAddTag={data.addTag} onRemoveTag={data.removeTag} />
        ) : null}

        {activeTab === 'interactions' ? (
          <ConversationsTab
            interactions={data.interactions.filter((i) => i.id !== pendingDelete?.id)}
            loading={data.interactionsLoading}
            threadMessages={data.threadMessages}
            meStaffId={uid ?? ''}
            canWrite={canWrite}
            isAdmin={isAdmin}
            initialOpenThreadId={interactionId ?? null}
            onAdd={data.addInteraction}
            onUpdate={data.updateInteraction}
            onDelete={setPendingDelete}
            onPostThread={(id, input) => data.postThreadMessage({ interactionId: id, ...input })}
            onToggleReaction={data.toggleReaction}
          />
        ) : null}

        {activeTab === 'thread' ? (
          <AlongsideThreadView
            messages={threadsFor(data.threadMessages, null)}
            meStaffId={uid ?? ''}
            canPost={canWrite}
            onPost={(input: { kind: ThreadKind; body: string }) => data.postThreadMessage({ interactionId: null, ...input })}
            onToggleReaction={data.toggleReaction}
          />
        ) : null}

        {activeTab === 'prayer' ? (
          <PrayerTab prayers={data.prayers} loading={data.prayersLoading} canWrite={canWrite} firstName={contact.name.split(' ')[0]} onAdd={data.addPrayer} />
        ) : null}

        {activeTab === 'comments' ? (
          <DiscussionTab comments={data.comments} loading={data.commentsLoading} canWrite={canWrite} onAdd={data.addComment} />
        ) : null}

        {activeTab === 'history' ? <HistoryTab activities={data.activities} loading={data.activitiesLoading} /> : null}
      </ScrollView>

      {pendingDelete ? (
        <Snackbar
          message="Interaction deleted"
          actionLabel="Undo"
          onAction={() => setPendingDelete(null)}
          onDismiss={commitPendingDelete}
        />
      ) : null}
    </Screen>
  );
}
