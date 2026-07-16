import { ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NAV_ITEMS, canAccessRoute } from '@cisa/core';
import { Screen, AppText, Card, SectionHead } from '../../src/components/ui';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useAuth } from '../../src/lib/AuthProvider';

// The Journey (design: journey.png). Scaffold; the stage board + drag-to-move
// gestures are Phase 4 (dnd-kit → gesture-based move on web).
export default function Journey() {
  const { colors, spacing } = useTheme();
  const { role } = useAuth();
  const title = NAV_ITEMS.find((n) => n.href === '/board')?.label ?? 'The Journey';

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

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
        <View style={{ gap: 4 }}>
          <AppText variant="label" color={colors.primary}>
            {title.toUpperCase()}
          </AppText>
          <AppText variant="title">Where everyone stands</AppText>
          <AppText variant="body" color={colors.onSurfaceVariant}>
            The stage board — who's new, who's regular, who's church-ready.
          </AppText>
        </View>

        <Card>
          <SectionHead title="Stages" />
          <AppText variant="body" color={colors.onSurfaceVariant}>
            The full journey board (drag between stages) wires up in Phase 4.
          </AppText>
        </Card>
      </ScrollView>
    </Screen>
  );
}
