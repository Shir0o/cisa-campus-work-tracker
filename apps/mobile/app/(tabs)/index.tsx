import { useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { Contact } from '@cisa/core';
import { Screen } from '../../src/components/ui';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useAuth } from '../../src/lib/AuthProvider';
import { useMyDayData } from '../../src/lib/useMyDayData';
import { openMessage } from '../../src/lib/messaging';
import { Hero } from '../../src/components/myday/Hero';
import { RelationalNudge } from '../../src/components/myday/RelationalNudge';
import { FromTeamInbox } from '../../src/components/myday/FromTeamInbox';
import { OnTheHorizon } from '../../src/components/myday/OnTheHorizon';
import { YourSheep } from '../../src/components/myday/YourSheep';
import { YourWeek } from '../../src/components/myday/YourWeek';
import { YourPrayers } from '../../src/components/myday/YourPrayers';
import { FiguresFooter } from '../../src/components/myday/FiguresFooter';
import { ContactsPickerSheet } from '../../src/components/myday/ContactsPickerSheet';

// Home = My Day, the flagship cockpit (design: mob-myday.png). Live Firestore
// data via useMyDayData; contact-detail navigation is a Phase 2 placeholder.
export default function MyDay() {
  const { spacing } = useTheme();
  const router = useRouter();
  const { uid, user } = useAuth();
  const data = useMyDayData(uid, user?.displayName ?? null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const firstName = (user?.displayName || 'friend').split(' ')[0];

  const onOpenContact = (contact: Contact) => {
    Alert.alert(contact.name, "Contact details aren't wired up yet — coming in a later pass.");
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
