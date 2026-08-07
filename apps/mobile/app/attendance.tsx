import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { canAccessRoute } from '@cisa/core';
import { Screen, AppText } from '../src/components/ui';
import { useTheme } from '../src/theme/ThemeProvider';
import { useAuth } from '../src/lib/AuthProvider';
import { GatheringsScreen } from '../src/components/attendance/GatheringsScreen';

// Gatherings — who we've missed, the sessions we've had with their rosters, and
// what's coming, in the v2 language (the design's `M2Gatherings`,
// views/mobile/screens.jsx).
//
// Always a pushed screen: the full-timer reaches it from More, and members from
// their home's "Full calendar". NOT the trainee — Gatherings is closed to them,
// so the row is gone from `TRAINEE_DRAWER` and this guard closes the deep link
// behind it (same shape as app/coordination/index.tsx).
export default function Attendance() {
  const { colors, spacing } = useTheme();
  const { role } = useAuth();

  if (!canAccessRoute(role, '/attendance')) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: 8 }}>
          <Ionicons name="lock-closed-outline" size={32} color={colors.onSurfaceVariant} />
          <AppText variant="heading">Not available</AppText>
        </View>
      </Screen>
    );
  }

  return <GatheringsScreen />;
}
