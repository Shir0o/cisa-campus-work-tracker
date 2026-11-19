import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { canAccessRoute } from '@cisa/core';
import { Screen, AppText } from '../../../src/components/ui';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { useAuth } from '../../../src/lib/AuthProvider';
import { ContactScreen, type ContactV2Tab } from '../../../src/components/contact/ContactScreen';

// The person screen — mobile v2's `M2Contact`. Reached from People, the queue,
// Prayer, Attendance, Search, and a direct-message thread's "Open {first}'s
// page →". `?tab=` is the deep link its callers set; an old `?interactionId=`
// lands on Story. A message's Thread opens over it as ./thread.
export default function ContactDetail() {
  const { contactId, tab } = useLocalSearchParams<{
    contactId: string;
    tab?: string;
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

  const initialTab: ContactV2Tab =
    tab === 'thread' || tab === 'conversation'
      ? 'conversation'
      : tab === 'prayer' || tab === 'prayers'
        ? 'prayers'
        : 'story';

  return <ContactScreen contactId={contactId} initialTab={initialTab} />;
}
