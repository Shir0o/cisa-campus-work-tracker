import { Alert, Linking, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { FullTimerSummary } from '@cisa/core';
import { AppText, Avatar, Button, Card, Screen, SectionHead } from '../ui';
import { useTheme } from '../../theme/ThemeProvider';
import { useAuth } from '../../lib/AuthProvider';
import { useCommunityLandingData } from '../../lib/useCommunityLandingData';
import { UpcomingEventsRsvp } from './UpcomingEventsRsvp';

// Community landing: the gatherings you're welcome to + a way to reach a
// Full-timer. Ported from src/views/landings/LandingCommunity.tsx. Messaging
// isn't built on mobile yet (Phase 4), so "Reach out" opens email instead of
// a direct-message chat.
export function LandingCommunity() {
  const { colors, spacing, typography } = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const { fullTimers } = useCommunityLandingData();
  const firstName = (user?.displayName || 'friend').split(' ')[0];
  const lead = fullTimers[0];

  const reachOut = (ft: FullTimerSummary) => {
    if (ft.email) {
      Linking.openURL(`mailto:${ft.email}`).catch(() =>
        Alert.alert('Reach out', "Messaging isn't wired up yet — coming in a later pass."),
      );
    } else {
      Alert.alert('Reach out', "Messaging isn't wired up yet — coming in a later pass.");
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40, gap: spacing.xl }}>
        <View style={{ gap: 6 }}>
          <AppText variant="title">Hello, {firstName}.</AppText>
          <AppText variant="body">
            Thank you for being part of the family around these students. Here's what's open to you, and the
            team is always glad to hear from you.
          </AppText>
        </View>

        <UpcomingEventsRsvp
          heading="Open gatherings"
          sub="You're warmly invited."
          emptyText="Nothing on the calendar just yet — check back soon."
          linkLabel="Full calendar"
          onLink={() => router.push('/attendance')}
        />

        <View>
          <SectionHead title="Reach out" />
          {lead ? (
            <Card>
              <View style={{ gap: 14 }}>
                <View style={{ flexDirection: 'row' }}>
                  {fullTimers.slice(0, 4).map((ft, i) => (
                    <View
                      key={ft.uid}
                      style={{
                        marginLeft: i > 0 ? -12 : 0,
                        borderRadius: 999,
                        borderWidth: 2,
                        borderColor: colors.surface,
                      }}
                    >
                      <Avatar name={ft.name} />
                    </View>
                  ))}
                </View>
                <View>
                  <Text style={{ fontFamily: typography.fontSerif, fontSize: 18.5, color: colors.onSurface }}>
                    {lead.name.split(' ')[0]} and the team are glad you're here
                  </Text>
                  <AppText variant="body" style={{ marginTop: 4 }}>
                    Questions about a student, a gathering, or anything at all? They coordinate it all and
                    would love to hear from you — no need to wait for the right moment.
                  </AppText>
                </View>
                <Button
                  title="Reach out"
                  onPress={() => reachOut(lead)}
                  style={{ flexDirection: 'row', alignSelf: 'flex-start' }}
                />
              </View>
            </Card>
          ) : (
            <Card>
              <AppText variant="body" style={{ textAlign: 'center' }}>
                We'll have someone to connect you with here soon.
              </AppText>
            </Card>
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}
