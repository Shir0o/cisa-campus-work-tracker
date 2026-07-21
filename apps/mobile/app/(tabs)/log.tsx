import { Screen, AppText } from '../../src/components/ui';
import { useTheme } from '../../src/theme/ThemeProvider';

// Quick Capture (design: the center FAB in the mobile shell). The tab's press
// is intercepted in _layout.tsx to open QuickCaptureSheet instead of
// navigating here; this route exists so expo-router always has somewhere to
// resolve "log" to, but is otherwise unreachable.
export default function Log() {
  const { colors, spacing } = useTheme();
  return (
    <Screen>
      <AppText variant="body" color={colors.onSurfaceVariant} style={{ padding: spacing.lg }}>
        Quick capture opens from the Log tab.
      </AppText>
    </Screen>
  );
}
