import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { canAccessRoute, FEEDBACK_KINDS, type FeedbackStatus } from '@cisa/core';
import { Screen, AppText, InlineInput } from '../src/components/ui';
import { useTheme } from '../src/theme/ThemeProvider';
import { useAuth } from '../src/lib/AuthProvider';
import { useFeedbackAdminData } from '../src/lib/useFeedbackAdminData';
import { FeedbackRow } from '../src/components/feedback/FeedbackRow';

const STATUS_OPTIONS: { id: FeedbackStatus | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'new', label: 'New' },
  { id: 'in_progress', label: 'In progress' },
  { id: 'resolved', label: 'Resolved' },
];

// Admin review of every "Leave a note" submission — ported from web's
// src/views/FeedbackList.tsx. Admin-only (ROUTE_MIN_ROLE['/admin/feedback']
// = 'admin'); pushed from "More", reusing that existing permission key even
// though this route's own path differs from web's /admin/feedback. GitHub
// issue creation is deferred (see MIGRATION.md) — an existing issue link
// still opens via FeedbackRow.
export default function FeedbackAdmin() {
  const router = useRouter();
  const { colors, spacing, radius } = useTheme();
  const { role } = useAuth();
  const data = useFeedbackAdminData();

  if (!canAccessRoute(role, '/admin/feedback')) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: 8 }}>
          <Ionicons name="lock-closed-outline" size={32} color={colors.onSurfaceVariant} />
          <AppText variant="heading">Admins only</AppText>
          <AppText variant="body" color={colors.onSurfaceVariant} style={{ textAlign: 'center' }}>
            This review list is only visible to admins.
          </AppText>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingTop: spacing.sm }}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={{ padding: 6 }}>
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing.sm, paddingBottom: 40, gap: spacing.md }}
      >
        <View style={{ gap: 4 }}>
          <AppText variant="title">Notes from the team</AppText>
          <AppText variant="body" color={colors.onSurfaceVariant}>
            {data.total} {data.total === 1 ? 'note' : 'notes'} total.
          </AppText>
        </View>

        <InlineInput placeholder="Search notes…" value={data.filters.search ?? ''} onChangeText={data.setSearch} />

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <FilterPill label="All kinds" on={data.filters.kind === 'all'} onPress={() => data.setKind('all')} />
          {FEEDBACK_KINDS.map((k) => (
            <FilterPill key={k.id} label={k.label} on={data.filters.kind === k.id} onPress={() => data.setKind(k.id)} />
          ))}
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {STATUS_OPTIONS.map((s) => (
            <FilterPill key={s.id} label={s.label} on={data.filters.status === s.id} onPress={() => data.setStatus(s.id)} />
          ))}
          <FilterPill
            label="Archived"
            on={data.filters.includeArchived}
            onPress={() => data.setIncludeArchived(!data.filters.includeArchived)}
          />
        </View>

        {data.error ? (
          <AppText variant="body" color={colors.onSurfaceVariant} style={{ textAlign: 'center', paddingVertical: 24 }}>
            {data.error}
          </AppText>
        ) : data.loading ? (
          <AppText variant="body" color={colors.onSurfaceVariant} style={{ textAlign: 'center', paddingVertical: 24 }}>
            Gathering notes…
          </AppText>
        ) : data.items.length === 0 ? (
          <AppText variant="body" color={colors.onSurfaceVariant} style={{ textAlign: 'center', paddingVertical: 24 }}>
            No notes match that just yet.
          </AppText>
        ) : (
          <View style={{ gap: spacing.sm }}>
            {data.items.map((item) => (
              <FeedbackRow
                key={item.id}
                item={item}
                onStatusChange={(status) => data.updateStatus(item.id, status)}
                onToggleArchive={() => data.toggleArchive(item.id, !item.archived)}
                onDelete={() => data.remove(item.id)}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

function FilterPill({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const { colors, radius } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: radius.full,
        borderWidth: 1,
        borderColor: on ? colors.primary : colors.outlineVariant,
        backgroundColor: on ? colors.primary : 'transparent',
      }}
    >
      <AppText variant="caption" color={on ? colors.onPrimary : colors.onSurface} style={{ fontWeight: '600' }}>
        {label}
      </AppText>
    </Pressable>
  );
}
