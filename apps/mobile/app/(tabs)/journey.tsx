import { ScrollView, View } from 'react-native';
import { NAV_ITEMS } from '@cisa/core';
import { Screen, AppText, Card, SectionHead } from '../../src/components/ui';
import { useTheme } from '../../src/theme/ThemeProvider';

// The Journey (design: journey.png). Scaffold; the stage board + drag-to-move
// gestures are Phase 4 (dnd-kit → gesture-based move on web).
export default function Journey() {
  const { colors, spacing } = useTheme();
  const title = NAV_ITEMS.find((n) => n.href === '/board')?.label ?? 'The Journey';
  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
        <View style={{ gap: 4 }}>
          <AppText variant="label" color={colors.primary}>
            {title.toUpperCase()}
          </AppText>
          <AppText variant="title">Where everyone stands</AppText>
          <AppText variant="body" color={colors.onSurfaceVariant}>
            The stage board — who's new, who's regular, who's church-ready.
          </AppText>
        </View>

        <Card>
          <SectionHead title="Stages" />
          <AppText variant="body" color={colors.onSurfaceVariant}>
            The full journey board (drag between stages) wires up in Phase 4.
          </AppText>
        </Card>
      </ScrollView>
    </Screen>
  );
}
