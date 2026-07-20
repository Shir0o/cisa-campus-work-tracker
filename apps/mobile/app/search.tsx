import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { Contact, QuickAction } from '@cisa/core';
import { Screen, AppText, InlineInput } from '../src/components/ui';
import { useTheme } from '../src/theme/ThemeProvider';
import { useAuth } from '../src/lib/AuthProvider';
import { useSearchData } from '../src/lib/useSearchData';
import { useActiveSeason } from '../src/lib/useActiveSeason';
import { addContact } from '../src/lib/data/contacts';
import { AddContactSheet } from '../src/components/people/AddContactSheet';
import { PersonResultRow } from '../src/components/search/PersonResultRow';
import { HistoryResultRow } from '../src/components/search/HistoryResultRow';
import { QuickActionRow } from '../src/components/search/QuickActionRow';

// Search — reached from "More" since web's version (GlobalSearch.tsx) is a
// ⌘K overlay, not a routed page. MVP scope: People + Quick actions + History
// (Conversations and Coordination Notes are deferred — see MIGRATION.md).
export default function SearchScreen() {
  const router = useRouter();
  const { colors, spacing } = useTheme();
  const { user, uid, role } = useAuth();
  const data = useSearchData(role);
  const season = useActiveSeason();
  const [showAddSheet, setShowAddSheet] = useState(false);

  const onOpenContact = (contact: Contact) => {
    router.push(`/contact/${contact.id}`);
  };

  const onQuickAction = (action: QuickAction) => {
    if (action.key === 'new-contact') setShowAddSheet(true);
    else if (action.key === 'signup') router.push('/signup');
  };

  const handleAddContact = async (input: Parameters<typeof addContact>[0]) => {
    await addContact(input, { uid, name: user?.displayName });
  };

  const nothingFound = data.hasQuery && data.people.length === 0 && data.history.length === 0;

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingTop: spacing.sm }}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={{ padding: 6 }}>
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing.sm, paddingBottom: 40, gap: spacing.lg }}>
        <AppText variant="title">Search</AppText>

        <InlineInput
          placeholder="Search people, history…"
          value={data.q}
          onChangeText={data.setQ}
          autoFocus
        />

        {nothingFound ? (
          <AppText variant="body" color={colors.onSurfaceVariant} style={{ textAlign: 'center', paddingVertical: 24 }}>
            Nothing came up for "{data.q}"
          </AppText>
        ) : (
          <>
            {data.people.length > 0 && (
              <View style={{ gap: 4 }}>
                <AppText variant="label" color={colors.onSurfaceVariant}>
                  {data.hasQuery ? 'PEOPLE' : 'RECENT PEOPLE'}
                </AppText>
                {data.people.map((c) => (
                  <PersonResultRow key={c.id} contact={c} onPress={onOpenContact} />
                ))}
              </View>
            )}

            {data.hasQuery && data.history.length > 0 && (
              <View style={{ gap: 4 }}>
                <AppText variant="label" color={colors.onSurfaceVariant}>
                  HISTORY
                </AppText>
                {data.history.map((a) => (
                  <HistoryResultRow key={a.id} item={a} onPress={() => router.push('/history')} />
                ))}
              </View>
            )}

            {!data.hasQuery && data.quickActions.length > 0 && (
              <View style={{ gap: 4 }}>
                <AppText variant="label" color={colors.onSurfaceVariant}>
                  QUICK ACTIONS
                </AppText>
                {data.quickActions.map((a) => (
                  <QuickActionRow key={a.key} action={a} onPress={onQuickAction} />
                ))}
              </View>
            )}
          </>
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
