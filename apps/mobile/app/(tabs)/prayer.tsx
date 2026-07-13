import { ScrollView, View } from 'react-native';
import { NAV_ITEMS } from '@cisa/core';
import { Screen, AppText, Card, SectionHead, Button } from '../../src/components/ui';
import { useTheme } from '../../src/theme/ThemeProvider';

// Prayer / "On our hearts" (design: prayer*.png). Scaffold; the people-picker
// bottom sheet + status marks come in Phase 2.
export default function Prayer() {
  const { colors, spacing } = useTheme();
  const title = NAV_ITEMS.find((n) => n.href === '/prayer')?.label ?? 'Prayer';
  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
        <View style={{ gap: 4 }}>
          <AppText variant="label" color={colors.primary}>
            {title.toUpperCase()}
          </AppText>
          <AppText variant="title">Who we're carrying</AppText>
          <AppText variant="body" color={colors.onSurfaceVariant}>
            The people and burdens the team is holding in prayer.
          </AppText>
        </View>

        <Card>
          <SectionHead title="Ongoing" />
          <AppText variant="body" color={colors.onSurfaceVariant}>
            Prayer records (ongoing / answered / archived) wire to Firestore in
            Phase 2.
          </AppText>
        </Card>

        <Button title="Add someone to carry" full />
      </ScrollView>
    </Screen>
  );
}
