import { ScrollView, View } from 'react-native';
import { Screen, AppText, Card, Avatar, StatusPill } from '../../src/components/ui';
import { useTheme } from '../../src/theme/ThemeProvider';

// People (design: dir-*.png). Whole-card-opens rows are the settled per-item
// pattern. Live contacts come from Firestore in Phase 2; these are placeholders
// to validate the row layout + primitives.
const DEMO = [
  { name: 'Mei Lin', detail: 'Sophomore · Biology', tone: 'accent' as const, stage: 'Regular' },
  { name: 'Ana Reyes', detail: 'Freshman · Undeclared', tone: 'amber' as const, stage: 'New' },
  { name: 'Sam Cho', detail: 'Junior · CS', tone: 'teal' as const, stage: 'Church' },
];

export default function People() {
  const { colors, spacing } = useTheme();
  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
        <AppText variant="title">People</AppText>
        {DEMO.map((p) => (
          <Card key={p.name} onPress={() => {}}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <Avatar name={p.name} />
              <View style={{ flex: 1, gap: 4 }}>
                <AppText variant="heading">{p.name}</AppText>
                <AppText variant="caption">{p.detail}</AppText>
              </View>
              <StatusPill label={p.stage} tone={p.tone} />
            </View>
          </Card>
        ))}
        <AppText variant="caption" color={colors.onSurfaceVariant}>
          Placeholder rows — live contacts wire to Firestore in Phase 2.
        </AppText>
      </ScrollView>
    </Screen>
  );
}
