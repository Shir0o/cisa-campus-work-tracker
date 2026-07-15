import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText, Card } from '../ui';
import { useTheme } from '../../theme/ThemeProvider';

const OPTIONS: { key: 'light' | 'dark' | 'system'; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'light', label: 'Light', icon: 'sunny-outline' },
  { key: 'dark', label: 'Dark', icon: 'moon-outline' },
  { key: 'system', label: 'System', icon: 'phone-portrait-outline' },
];

// Light/dark/system appearance picker — wired to the already-built
// ThemeProvider (light+dark tokens, OS-follow by default). Scheme
// persistence stays deferred, matching ThemeProvider.tsx's own "persist it
// to AsyncStorage in a later pass" comment.
export function AppearancePicker() {
  const { colors, radius, spacing, scheme, setScheme } = useTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      <AppText variant="heading">Appearance</AppText>
      <Card>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {OPTIONS.map((o) => {
            const on = scheme === o.key;
            return (
              <Pressable
                key={o.key}
                onPress={() => setScheme(o.key)}
                style={{
                  flex: 1,
                  alignItems: 'center',
                  gap: 6,
                  paddingVertical: 12,
                  borderRadius: radius.md,
                  borderWidth: 1,
                  borderColor: on ? colors.primary : colors.outlineVariant,
                  backgroundColor: on ? colors.primaryContainer : 'transparent',
                }}
              >
                <Ionicons name={o.icon} size={18} color={on ? colors.onPrimaryContainer : colors.onSurfaceVariant} />
                <AppText variant="caption" color={on ? colors.onPrimaryContainer : colors.onSurfaceVariant} style={{ fontWeight: '600' }}>
                  {o.label}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      </Card>
    </View>
  );
}
