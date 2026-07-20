import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { Contact } from '@cisa/core';
import { Screen } from '../ui';
import { useTheme } from '../../theme/ThemeProvider';
import { useAuth } from '../../lib/AuthProvider';
import { useMyDayData } from '../../lib/useMyDayData';
import { openMessage } from '../../lib/messaging';
import { Hero } from './Hero';
import { RelationalNudge } from './RelationalNudge';
import { FromTeamInbox } from './FromTeamInbox';
import { OnTheHorizon } from './OnTheHorizon';
import { YourSheep } from './YourSheep';
import { YourWeek } from './YourWeek';
import { YourPrayers } from './YourPrayers';
import { FiguresFooter } from './FiguresFooter';
import { ContactsPickerSheet } from './ContactsPickerSheet';

// Home for Full-timers (admin) — the flagship cockpit (design: mob-myday.png).
// Live Firestore data via useMyDayData; contact-detail navigation is a Phase 2
// placeholder. Extracted from (tabs)/index.tsx so the Home route can dispatch
// to a different landing per role (see packages/core's pickLandingForRole).
export function MyDayScreen() {
  const { spacing } = useTheme();
  const router = useRouter();
  const { uid, user } = useAuth();
  const data = useMyDayData(uid, user?.displayName ?? null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const firstName = (user?.displayName || 'friend').split(' ')[0];

  const onOpenContact = (contact: Contact, opts?: { tab: 'thread'; interactionId?: string | null }) => {
    router.push({
      pathname: '/contact/[contactId]',
      params: {
        contactId: contact.id,
        ...(opts?.tab ? { tab: opts.tab } : {}),
        ...(opts?.interactionId ? { interactionId: opts.interactionId } : {}),
      },
    });
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40, gap: spacing.xl }}>
        <Hero
          firstName={firstName}
          leadersCount={data.leaders.length}
          tasksLeft={data.leftToDo}
          prayersCount={data.prayersCount}
          onOpenBoard={() => router.push('/journey')}
          onOpenPrayer={() => router.push('/prayer')}
        />

        <RelationalNudge staleLeader={data.staleLeader} onPress={() => data.staleLeader && onOpenContact(data.staleLeader.contact)} />

        {data.isFullTimer && (
          <FromTeamInbox
            items={data.inboxItems}
            contacts={data.contacts}
            nameByUid={data.nameByUid}
            isRead={data.isInboxRead}
            onOpenContact={onOpenContact}
            onPostReply={data.postInboxReply}
            onMarkRead={data.markInboxRead}
            onMarkUnread={data.markInboxUnread}
            onMarkAllRead={data.markAllInboxRead}
          />
        )}

        <OnTheHorizon
          assignedTasks={data.assignedTasks}
          personalTasks={data.personalTasks}
          onToggle={data.toggleTask}
          onAdd={data.addTask}
          onUpdate={data.updateTask}
          onDelete={data.deleteTask}
        />

        <YourSheep
          leaders={data.leaders}
          stages={data.stages}
          onOpenContact={onOpenContact}
          onMessage={(contact) => openMessage(contact.phone)}
          onOpenPicker={() => setPickerOpen(true)}
        />

        <YourWeek thisWeek={data.thisWeek} />

        <YourPrayers
          contactPrayers={data.contactPrayers}
          activePersonalPrayers={data.activePersonalPrayers}
          contacts={data.contacts}
          onOpenContact={onOpenContact}
          onOpenPicker={() => setPickerOpen(true)}
          onSetStatus={data.setPrayerStatus}
          onAddPersonal={data.addPersonalPrayer}
          onUpdatePersonal={data.updatePersonalPrayer}
          onDeletePersonal={data.deletePersonalPrayer}
        />

        <FiguresFooter
          contacts={data.leaders.length}
          prayers={data.prayersCount}
          tasks={data.leftToDo}
          gatherings={data.thisWeek.length}
        />
      </ScrollView>

      <ContactsPickerSheet
        visible={pickerOpen}
        contacts={data.contacts}
        stages={data.stages}
        personalContactIds={data.personalContactIds}
        onToggle={data.togglePersonalContact}
        onClose={() => setPickerOpen(false)}
      />
    </Screen>
  );
}
