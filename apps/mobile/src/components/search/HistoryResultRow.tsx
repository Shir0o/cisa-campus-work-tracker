import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { relTime, snippet, type Hist } from '@cisa/core';
import { AppText } from '../ui';
import { useTheme } from '../../theme/ThemeProvider';
import { toneColors } from '../../theme/tokens';

// A "History" result row — violet tonal node, matching web's GlobalSearch
// History rows (dimmed/secondary, since it's the least-central group).
export function HistoryResultRow({ item, onPress }: { item: Hist; onPress: (item: Hist) => void }) {
  const { colors, radius, spacing } = useTheme();
  const { fg, soft } = toneColors(colors, 'violet');
  const sub = [item.user, relTime(item.createdAt)].filter(Boolean).join(' · ');
  return (
    <Pressable
      onPress={() => onPress(item)}
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
        <Ionicons name="time-outline" size={14} color={fg} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <AppText variant="body" color={colors.onSurfaceVariant} numberOfLines={1}>
          {snippet(item.description || item.action) || 'A moment'}
        </AppText>
        {sub ? (
          <AppText variant="caption" color={colors.onSurfaceVariant} numberOfLines={1}>
            {sub}
          </AppText>
        ) : null}
      </View>
    </Pressable>
  );
}
