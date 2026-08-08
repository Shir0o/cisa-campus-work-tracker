import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { canAccessRoute } from '@cisa/core';
import { Screen, AppText } from '../../src/components/ui';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useAuth } from '../../src/lib/AuthProvider';
import { PeopleScreen } from '../../src/components/people/PeopleScreen';

// People / Directory — the full team contact list, in the v2 language (the
// design's `M2People`, views/mobile/screens.jsx).
//
// It's a tab for the full-timer only; the trainee reaches it from the ☰ drawer
// and members never do — so the back row appears only when it was pushed
// (PeopleScreen asks isPushedScreen).
export default function People() {
  const { colors, spacing } = useTheme();
  const { role } = useAuth();

  // The tab bar hides this tab below 'operator' (see (tabs)/_layout.tsx), but
  // that only removes the tab entry — a direct URL/deep link still renders
  // this screen, so it needs its own guard too (same pattern as
  // prayer-log.tsx).
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

  return <PeopleScreen />;
}
