import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { canAccessRoute } from '@cisa/core';
import { Screen, AppText } from '../../src/components/ui';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useAuth } from '../../src/lib/AuthProvider';
import { ContactScreen, type ContactV2Tab } from '../../src/components/contact/ContactScreen';

// The person screen — mobile v2's `M2Contact`. Reached from People, the queue,
// Prayer, Attendance, Search, and a direct-message thread's "Open {first}'s
// page →". `?tab=` and `?interactionId=` are the deep links its callers set.
export default function ContactDetail() {
  const { contactId, tab, interactionId } = useLocalSearchParams<{
    contactId: string;
    tab?: string;
    interactionId?: string;
  }>();
  const { colors, spacing } = useTheme();
  const { role } = useAuth();

  if (!canAccessRoute(role, '/contact')) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: 8 }}>
          <Ionicons name="lock-closed-outline" size={32} color={colors.onSurfaceVariant} />
          <AppText variant="heading">Can't open this profile</AppText>
        </View>
      </Screen>
    );
  }

  const initialTab: ContactV2Tab = interactionId
    ? 'story'
    : tab === 'thread' || tab === 'alongside'
      ? 'alongside'
      : tab === 'prayer' || tab === 'prayers'
        ? 'prayers'
        : 'story';

  return <ContactScreen contactId={contactId} initialTab={initialTab} initialInteractionId={interactionId ?? null} />;
}
