import { ScrollView, View } from 'react-native';
import { seasonForDate, seasonLabel } from '@cisa/core';
import { Screen, AppText, Card, SectionHead, StatusPill, Button } from '../../src/components/ui';
import { useTheme } from '../../src/theme/ThemeProvider';

// Home = My Day. Scaffold for the mobile-native cockpit (design: mob-myday.png).
// Data (the "From the team" inbox, your people, prayers) wires to Firestore in
// Phase 2 via @cisa/core's inboxItemsFor over live subscriptions.
export default function Home() {
  const { colors, spacing } = useTheme();
  const season = seasonLabel(seasonForDate());

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
        <View style={{ gap: 4 }}>
          <AppText variant="label" color={colors.primary}>
            MY DAY · {season}
          </AppText>
          <AppText variant="title">Good to see you.</AppText>
          <AppText variant="body" color={colors.onSurfaceVariant}>
            A quiet place to start — who you're carrying, and what's waiting on you.
          </AppText>
        </View>

        <Card>
          <SectionHead title="From the team" action="See all" />
          <AppText variant="body" color={colors.onSurfaceVariant}>
            New contacts, logged interactions, and questions from the team surface
            here. (Wired to Firestore in Phase 2.)
          </AppText>
        </Card>

        <Card>
          <SectionHead title="On the horizon" />
          <View style={{ gap: 8 }}>
            <StatusPill label="Today" tone="accent" />
            <AppText variant="body">Your week's gatherings and to-dos live here.</AppText>
          </View>
        </Card>

        <Button title="Pray together" variant="secondary" full />
      </ScrollView>
    </Screen>
  );
}
