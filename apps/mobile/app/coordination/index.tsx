import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { canAccessRoute } from '@cisa/core';
import { Screen, AppText } from '../../src/components/ui';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useAuth } from '../../src/lib/AuthProvider';
import { BoardScreen } from '../../src/components/coordination/BoardScreen';

// The Board — the Pages list, in the v2 language (the design's `M2Board`).
// Reached from the trainee's ☰ drawer and the full-timer's More list, so it is
// never a tab and always carries its own back row.
//
// Read-only for every role now: the design mounts no editor on the phone, which
// also retires the Trash entry point (the /coordination/trash route still
// works, it just isn't linked from anywhere — the same call the shells pass
// made for Search, Answered and Looking back).
export default function CoordinationList() {
  const { colors, spacing } = useTheme();
  const { role } = useAuth();

  if (!canAccessRoute(role, '/coordination')) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: 8 }}>
          <Ionicons name="lock-closed-outline" size={32} color={colors.onSurfaceVariant} />
          <AppText variant="heading">Not available</AppText>
        </View>
      </Screen>
    );
  }

  return <BoardScreen />;
}
