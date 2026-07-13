import { ScrollView, View } from 'react-native';
import { NAV_ITEMS, roleLabel } from '@cisa/core';
import { Screen, AppText, Card } from '../../src/components/ui';
import { useTheme } from '../../src/theme/ThemeProvider';

// "More" surfaces the NAV_ITEMS destinations not in the bottom tabs — driven by
// the SHARED NAV_ITEMS + role labels from @cisa/core (the mobile drawer in the
// design). Role-gating (canAccessRoute) applies once auth is live.
const TAB_HREFS = ['/', '/directory', '/prayer'];

export default function More() {
  const { colors, spacing } = useTheme();
  const rest = NAV_ITEMS.filter((n) => !TAB_HREFS.includes(n.href));
  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
        <AppText variant="title">More</AppText>
        {rest.map((n) => (
          <Card key={n.href} onPress={() => {}}>
            <View style={{ gap: 2 }}>
              <AppText variant="heading">{n.label}</AppText>
              <AppText variant="caption" color={colors.onSurfaceVariant}>
                {n.href} · from {roleLabel(n.minRole)}
              </AppText>
            </View>
          </Card>
        ))}
        <AppText variant="caption" color={colors.onSurfaceVariant}>
          Labels come from the shared @cisa/core NAV_ITEMS — one source for web + mobile.
        </AppText>
      </ScrollView>
    </Screen>
  );
}
