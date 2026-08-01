import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { canAccessRoute } from '@cisa/core';
import { Screen, AppText } from '../../src/components/ui';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useAuth } from '../../src/lib/AuthProvider';
import { JourneyScreen } from '../../src/components/journey/JourneyScreen';

// The Journey — the contact-stage pipeline, in the v2 language (the design's
// `M2Journey`, views/mobile/screens.jsx). Tap a step, then move someone with a
// sheet; not drag-and-drop. "Shape the journey" (admin stage management) stays
// on the desktop site.
//
// No shell has this as a tab: the trainee reaches it from the ☰ drawer, the
// full-timer from More — so JourneyScreen carries its own back row.
export default function Journey() {
  const { colors, spacing } = useTheme();
  const { role } = useAuth();

  // The More list hides this below 'manager', but that only removes the entry —
  // a direct URL/deep link still renders this screen, so it needs its own guard
  // too (same pattern as feedback-admin.tsx).
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

  return <JourneyScreen />;
}
