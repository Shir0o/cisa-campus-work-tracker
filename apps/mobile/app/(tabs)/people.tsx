import { useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { canAccessRoute, type Contact, type NewContactInput } from '@cisa/core';
import { Screen, AppText, IconButton, InlineInput } from '../../src/components/ui';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useAuth } from '../../src/lib/AuthProvider';
import { usePeopleData } from '../../src/lib/usePeopleData';
import { useActiveSeason } from '../../src/lib/useActiveSeason';
import { addContact } from '../../src/lib/data/contacts';
import { StagePills } from '../../src/components/people/StagePills';
import { ContactRow } from '../../src/components/people/ContactRow';
import { AddContactSheet } from '../../src/components/people/AddContactSheet';

// People / Directory — the full team contact list (design: views/contacts.jsx,
// screenshots/dir-*.png). Contact-detail navigation is a Phase 2 placeholder,
// matching Prayer's onOpenContact.
export default function People() {
  const { colors, spacing } = useTheme();
  const { user, uid, role } = useAuth();
  const data = usePeopleData(uid);
  const season = useActiveSeason();
  const [showAddSheet, setShowAddSheet] = useState(false);

  const onOpenContact = (contact: Contact) => {
    Alert.alert(contact.name, "Contact details aren't wired up yet — coming in a later pass.");
  };

  const handleAddContact = async (input: NewContactInput) => {
    await addContact(input, { uid, name: user?.displayName });
  };

  // The tab bar hides this tab below 'operator' (see (tabs)/_layout.tsx), but
  // that only removes the tab entry — a direct URL/deep link still renders
  // this screen, so it needs its own guard too (same pattern as
  // feedback-admin.tsx).
  if (!canAccessRoute(role, '/directory')) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: 8 }}>
          <Ionicons name="lock-closed-outline" size={32} color={colors.onSurfaceVariant} />
          <AppText variant="heading">Students and up</AppText>
          <AppText variant="body" color={colors.onSurfaceVariant} style={{ textAlign: 'center' }}>
            Your directory is only visible to Students, Trainees, and Full-timers.
          </AppText>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40, gap: spacing.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <View style={{ gap: 4, flex: 1 }}>
            <AppText variant="label" color={colors.primary}>
              PEOPLE
            </AppText>
            <AppText variant="title">Your directory</AppText>
            <AppText variant="body" color={colors.onSurfaceVariant}>
              {data.totalCount} {data.totalCount === 1 ? 'person' : 'people'} in your care — {data.newCount} new in
              the last two weeks, {data.overdueCount} you haven't connected with in over a week.
            </AppText>
          </View>
          {role !== 'viewer' && (
            <IconButton name="person-add" onPress={() => setShowAddSheet(true)} tone="accent" />
          )}
        </View>

        <InlineInput placeholder="Find someone by name…" value={data.search} onChangeText={data.setSearch} />

        <StagePills
          stageCounts={data.stageCounts}
          totalCount={data.totalCount}
          value={data.stageFilter}
          onChange={data.setStageFilter}
        />

        {data.entries.length === 0 ? (
          <AppText variant="body" color={colors.onSurfaceVariant} style={{ textAlign: 'center', paddingVertical: 24 }}>
            No one matches that just yet.
          </AppText>
        ) : (
          <View style={{ gap: 8 }}>
            {data.entries.map((e) => (
              <ContactRow key={e.contact.id} contact={e.contact} days={e.days} stages={data.stages} onPress={onOpenContact} />
            ))}
          </View>
        )}
      </ScrollView>

      <AddContactSheet
        visible={showAddSheet}
        stages={data.stages}
        season={season}
        onSubmit={handleAddContact}
        onClose={() => setShowAddSheet(false)}
      />
    </Screen>
  );
}
