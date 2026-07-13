import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Leader } from '@cisa/core';
import { useTheme } from '../../theme/ThemeProvider';

// One relational prompt for today — design: mdm-nudge.
export function RelationalNudge({ staleLeader, onPress }: { staleLeader?: Leader; onPress: () => void }) {
  const { colors, radius } = useTheme();
  if (!staleLeader) return null;

  const weeks = Math.max(1, Math.round(staleLeader.days / 7));
  const firstName = staleLeader.contact.name.split(' ')[0];

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 13,
        padding: 14,
        borderRadius: radius.lg,
        backgroundColor: colors.stageAccentSoft,
        borderWidth: 1,
        borderColor: colors.primary + '33',
        opacity: pressed ? 0.95 : 1,
      })}
    >
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: 17,
          backgroundColor: colors.surface,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name="heart" size={16} color={colors.primary} />
      </View>
      <Text style={{ flex: 1, fontSize: 14.5, lineHeight: 20, color: colors.onSurfaceVariant }}>
        It's been <Text style={{ fontWeight: '600', color: colors.onSurface }}>
          {weeks} {weeks === 1 ? 'week' : 'weeks'}
        </Text>{' '}
        since you sat with {firstName}. Maybe today.
      </Text>
      <Ionicons name="chevron-forward" size={18} color={colors.primary} />
    </Pressable>
  );
}
