import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { canSeePrefs, memberRoleOf } from '@cisa/core';
import { Screen, AppText } from '../src/components/ui';
import { useTheme } from '../src/theme/ThemeProvider';
import { useAuth } from '../src/lib/AuthProvider';
import { MemberYouScreen } from '../src/components/member/MemberYouScreen';
import { SettingsScreen } from '../src/components/settings/SettingsScreen';

// Settings — two v2 screens, one per shape of app. Members land on "You" (the
// design gives them a much shorter page); trainee and full-timer get the
// design's `M2Settings`, which also absorbed the old separate "Your queue"
// screen.
//
// Gated on `canSeePrefs`, NOT `canAccessRoute('/settings')`: the latter is the
// web sidebar's rule and closes Settings to the trainee, but this screen is
// where their queue prefs live (on-campus window, nudges, day cap, how it
// looks). `canSeePrefs` is the predicate the design's `M2Sub` uses.
//
// The team roster that used to live here — approving a signup, inviting
// someone, changing a role, removing access — is gone from the phone. Mobile v2
// mounts no admin surface at all; that work is the desktop site's, and the
// screen's own foot line says so.
export default function SettingsRoute() {
  const { colors, spacing } = useTheme();
  const { role } = useAuth();
  const memberRole = memberRoleOf(role);
  if (memberRole) return <MemberYouScreen role={memberRole} showBack />;

  if (!canSeePrefs(role)) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: 8 }}>
          <Ionicons name="lock-closed-outline" size={32} color={colors.onSurfaceVariant} />
          <AppText variant="heading">Not available</AppText>
        </View>
      </Screen>
    );
  }

  return <SettingsScreen />;
}
