import { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Screen, AppText } from '../src/components/ui';
import { useTheme } from '../src/theme/ThemeProvider';
import { useHistoryData } from '../src/lib/useHistoryData';
import { HistoryRow } from '../src/components/history/HistoryRow';
import { HistoryFilterSheet } from '../src/components/history/HistoryFilterSheet';
import { HISTORY_KINDS } from '@cisa/core';

// History / "Looking back" — the team's recent activity feed. Design:
// src/views/HistoryMobile.tsx (already shipped on the web app at mobile
// width) — a compact hero, a Filter button + active chips, and an unbroken
// timeline. First pushed (non-tab) screen in the mobile app.
export default function History() {
  const router = useRouter();
  const { colors, spacing } = useTheme();
  const data = useHistoryData();
  const [filterOpen, setFilterOpen] = useState(false);

  const activeCount = (data.kind !== 'all' ? 1 : 0) + (data.who !== 'all' ? 1 : 0);
  const kindLabel = HISTORY_KINDS.find((k) => k.id === data.kind)?.label;
  const todayLong = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  const onOpenContact = (contactId: string) => {
    const contact = data.openContact(contactId);
    if (contact) Alert.alert(contact.name, "Contact details aren't wired up yet — coming in a later pass.");
  };

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingTop: spacing.sm }}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={{ padding: 6 }}>
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing.sm, paddingBottom: 40, gap: spacing.lg }}>
        <View style={{ gap: 4 }}>
          <AppText variant="label" color={colors.primary}>
            {todayLong.toUpperCase()}
          </AppText>
          <AppText variant="title">Looking back</AppText>
          <AppText variant="body" color={colors.onSurfaceVariant}>
            The small, faithful work of these days — {data.activities.length}{' '}
            {data.activities.length === 1 ? 'moment' : 'moments'} across the team, touching {data.peopleRemembered}{' '}
            of the people in our care.
          </AppText>
        </View>

        <View style={{ gap: spacing.sm }}>
          <Pressable
            onPress={() => setFilterOpen(true)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              height: 44,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: activeCount > 0 ? colors.primary : colors.outlineVariant,
              backgroundColor: activeCount > 0 ? colors.primaryContainer : colors.surface,
            }}
          >
            <Ionicons name="filter" size={16} color={activeCount > 0 ? colors.primary : colors.onSurface} />
            <Text style={{ fontSize: 14, fontWeight: '600', color: activeCount > 0 ? colors.primary : colors.onSurface }}>
              Filter history
            </Text>
            {activeCount > 0 && (
              <View style={{ paddingHorizontal: 7, paddingVertical: 1, borderRadius: 999, backgroundColor: colors.primary }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: colors.onPrimary }}>{activeCount}</Text>
              </View>
            )}
          </Pressable>

          {activeCount > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {data.kind !== 'all' && (
                <Pressable
                  onPress={() => data.setKind('all')}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: colors.primaryContainer }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '600', color: colors.primary }}>{kindLabel}</Text>
                  <Ionicons name="close" size={13} color={colors.primary} />
                </Pressable>
              )}
              {data.who !== 'all' && (
                <Pressable
                  onPress={() => data.setWho('all')}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: colors.primaryContainer }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '600', color: colors.primary }}>{data.who}</Text>
                  <Ionicons name="close" size={13} color={colors.primary} />
                </Pressable>
              )}
            </View>
          )}
        </View>

        {data.error ? (
          <AppText variant="body" color={colors.onSurfaceVariant} style={{ textAlign: 'center', paddingVertical: 24 }}>
            {data.error}
          </AppText>
        ) : data.loading ? (
          <AppText variant="body" color={colors.onSurfaceVariant} style={{ textAlign: 'center', paddingVertical: 24 }}>
            Gathering the last few days…
          </AppText>
        ) : data.rows.length === 0 ? (
          <AppText variant="body" color={colors.onSurfaceVariant} style={{ textAlign: 'center', paddingVertical: 24 }}>
            Nothing here yet for that filter.
          </AppText>
        ) : (
          <View>
            {data.rows.map((row) => (
              <HistoryRow key={row.key} row={row} onOpenContact={onOpenContact} />
            ))}
          </View>
        )}
      </ScrollView>

      <HistoryFilterSheet
        visible={filterOpen}
        kind={data.kind}
        setKind={data.setKind}
        who={data.who}
        setWho={data.setWho}
        staff={data.staff}
        onClose={() => setFilterOpen(false)}
      />
    </Screen>
  );
}
