import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { QuickAction } from '@cisa/core';
import { AppText } from '../ui';
import { useTheme } from '../../theme/ThemeProvider';
import { toneColors, type ToneKey } from '../../theme/tokens';

// Icon/tone per quick action — kept out of packages/core (RN-specific),
// matching feedback/tone.ts's convention.
const QUICK_ACTION_STYLE: Record<QuickAction['key'], { icon: keyof typeof Ionicons.glyphMap; tone: ToneKey }> = {
  'new-contact': { icon: 'person-add-outline', tone: 'accent' },
  signup: { icon: 'globe-outline', tone: 'teal' },
};

export function QuickActionRow({ action, onPress }: { action: QuickAction; onPress: (action: QuickAction) => void }) {
  const { colors, radius, spacing } = useTheme();
  const { icon, tone } = QUICK_ACTION_STYLE[action.key];
  const { fg, soft } = toneColors(colors, tone);
  return (
    <Pressable
      onPress={() => onPress(action)}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        paddingVertical: 8,
        paddingHorizontal: 4,
        borderRadius: 10,
        backgroundColor: pressed ? colors.surfaceVariant : 'transparent',
      })}
    >
      <View style={{ width: 28, height: 28, borderRadius: radius.full, backgroundColor: soft, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={14} color={fg} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <AppText variant="body" style={{ fontWeight: '600' }} numberOfLines={1}>
          {action.label}
        </AppText>
        <AppText variant="caption" color={colors.onSurfaceVariant} numberOfLines={1}>
          {action.sub}
        </AppText>
      </View>
    </Pressable>
  );
}
