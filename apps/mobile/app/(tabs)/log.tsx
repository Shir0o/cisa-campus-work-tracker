import { Screen, AppText } from '../../src/components/ui';
import { useTheme } from '../../src/theme/ThemeProvider';

// Quick Capture (design: the center FAB in the mobile shell). The tab's press
// is intercepted in _layout.tsx to show a placeholder alert instead of
// navigating here; this route exists so expo-router always has somewhere to
// resolve "log" to.
export default function Log() {
  const { colors, spacing } = useTheme();
  return (
    <Screen>
      <AppText variant="body" color={colors.onSurfaceVariant} style={{ padding: spacing.lg }}>
        Quick capture isn't wired up yet.
      </AppText>
    </Screen>
  );
}
