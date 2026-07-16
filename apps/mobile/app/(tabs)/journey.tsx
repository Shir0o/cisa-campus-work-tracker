import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NAV_ITEMS, canAccessRoute, type Contact, type NewContactInput } from '@cisa/core';
import { Screen, AppText, Button } from '../../src/components/ui';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useAuth } from '../../src/lib/AuthProvider';
import { useJourneyData } from '../../src/lib/useJourneyData';
import { useActiveSeason } from '../../src/lib/useActiveSeason';
import { addContact, moveContactStage } from '../../src/lib/data/contacts';
import { StageTabs } from '../../src/components/journey/StageTabs';
import { JourneyRow } from '../../src/components/journey/JourneyRow';
import { MoveSheet } from '../../src/components/journey/MoveSheet';
import { AddContactSheet } from '../../src/components/people/AddContactSheet';

// The Journey — the contact-stage pipeline board (design: journey.png;
// behavior oracle: web's src/views/OutreachBoardMobile.tsx). Tap-to-switch
// stage tabs + a MoveSheet, not drag-and-drop. "Shape the journey" (admin
// stage management) is out of scope, matching how People defers contact
// details to a later pass.
export default function Journey() {
  const { colors, spacing } = useTheme();
  const { user, uid, role } = useAuth();
  const data = useJourneyData(uid);
  const season = useActiveSeason();
  const [movingContact, setMovingContact] = useState<Contact | null>(null);
  const [showAddSheet, setShowAddSheet] = useState(false);

  // The tab bar hides this tab below 'manager' (see (tabs)/_layout.tsx), but
  // that only removes the tab entry — a direct URL/deep link still renders
  // this screen, so it needs its own guard too (same pattern as
  // feedback-admin.tsx).
  if (!canAccessRoute(role, '/board')) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: 8 }}>
          <Ionicons name="lock-closed-outline" size={32} color={colors.onSurfaceVariant} />
          <AppText variant="heading">Trainees and up</AppText>
          <AppText variant="body" color={colors.onSurfaceVariant} style={{ textAlign: 'center' }}>
            The Journey is only visible to Trainees and Full-timers.
          </AppText>
        </View>
      </Screen>
    );
  }

  const title = NAV_ITEMS.find((n) => n.href === '/board')?.label ?? 'The Journey';

  const handleMove = async (_contactId: string, newStageLabel: string) => {
    if (!movingContact) return;
    await moveContactStage(movingContact, newStageLabel, { uid, name: user?.displayName });
  };

  const handleAddContact = async (input: NewContactInput) => {
    await addContact(input, { uid, name: user?.displayName });
  };

  const isFirstRealStage = data.stages[0]?.label === data.activeStage.label;
  const addLabel =
    data.activeStage.id === 'uncategorized' || isFirstRealStage
      ? 'Welcome someone new'
      : `Add to ${data.activeStage.label}`;

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40, gap: spacing.lg }}>
        <View style={{ gap: 4 }}>
          <AppText variant="label" color={colors.primary}>
            {title.toUpperCase()}
          </AppText>
          <AppText variant="title">Where everyone stands</AppText>
          <AppText variant="body" color={colors.onSurfaceVariant}>
            {data.totalCount} {data.totalCount === 1 ? 'student' : 'students'}, moving from a first hello toward a
            church family.
          </AppText>
        </View>

        <StageTabs tabs={data.tabs} activeIndex={data.activeIndex} onChange={data.setActiveIndex} />

        <View style={{ gap: 10 }}>
          <AppText variant="label" color={colors.onSurfaceVariant}>
            {data.items.length === 0
              ? 'no one here yet'
              : data.items.length === 1
                ? '1 person'
                : `${data.items.length} people`}
          </AppText>

          {data.items.length === 0 ? (
            <View
              style={{
                paddingVertical: 32,
                alignItems: 'center',
                borderWidth: 1,
                borderStyle: 'dashed',
                borderColor: colors.outlineVariant,
                borderRadius: 16,
              }}
            >
              <AppText variant="body" color={colors.onSurfaceVariant}>
                No one at this step just now.
              </AppText>
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              {data.items.map((entry) => (
                <JourneyRow key={entry.contact.id} entry={entry} onMove={() => setMovingContact(entry.contact)} />
              ))}
            </View>
          )}
        </View>

        <Button title={addLabel} variant="ghost" full onPress={() => setShowAddSheet(true)} />
      </ScrollView>

      <MoveSheet
        visible={!!movingContact}
        contact={movingContact}
        stages={data.mobileStages}
        onMove={handleMove}
        onClose={() => setMovingContact(null)}
      />

      <AddContactSheet
        visible={showAddSheet}
        stages={data.stages}
        season={season}
        defaultStage={data.activeStage.label}
        onSubmit={handleAddContact}
        onClose={() => setShowAddSheet(false)}
      />
    </Screen>
  );
}
