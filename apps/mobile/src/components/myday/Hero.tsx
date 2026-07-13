import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { getGreeting } from '@cisa/core';
import { AppText } from '../ui';
import { useTheme } from '../../theme/ThemeProvider';

// My Day hero — design: mob-myday.png / mdm-hero, mdm-greet, mdm-line, mdm-actions.
export function Hero({
  firstName,
  leadersCount,
  tasksLeft,
  prayersCount,
  onOpenBoard,
  onOpenPrayer,
}: {
  firstName: string;
  leadersCount: number;
  tasksLeft: number;
  prayersCount: number;
  onOpenBoard: () => void;
  onOpenPrayer: () => void;
}) {
  const { colors, typography, spacing } = useTheme();

  return (
    <View style={{ gap: 4 }}>
      <Text style={{ fontSize: 12.5, color: colors.onSurfaceVariant, letterSpacing: 0.2 }}>
        {format(new Date(), 'EEEE, MMMM d').toUpperCase()}
      </Text>
      <Text
        style={{
          fontFamily: typography.fontSerif,
          fontSize: 29,
          fontWeight: '500',
          letterSpacing: -0.3,
          lineHeight: 32,
          color: colors.onSurface,
          marginBottom: 6,
        }}
      >
        {getGreeting()}, {firstName}.
      </Text>
      <AppText variant="body" color={colors.onSurfaceVariant} style={{ lineHeight: 22 }}>
        You're caring for <Text style={{ fontWeight: '600', color: colors.onSurface }}>{leadersCount}</Text>{' '}
        people this season — <Text style={{ fontWeight: '600', color: colors.onSurface }}>{tasksLeft}</Text>{' '}
        things to tend, <Text style={{ fontWeight: '600', color: colors.onSurface }}>{prayersCount}</Text>{' '}
        prayers to hold.
      </AppText>

      <View style={{ flexDirection: 'row', gap: 10, marginTop: spacing.md }}>
        <HeroAction icon="clipboard-outline" label="The board" onPress={onOpenBoard} />
        <HeroAction icon="heart-outline" label="Pray together" onPress={onOpenPrayer} />
      </View>
    </View>
  );
}

function HeroAction({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  const { colors, radius } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        height: 46,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.outlineVariant,
        backgroundColor: pressed ? colors.surfaceVariant : colors.surface,
      })}
    >
      <Ionicons name={icon} size={16} color={colors.primary} />
      <Text style={{ fontSize: 14.5, fontWeight: '600', color: colors.onSurface }}>{label}</Text>
    </Pressable>
  );
}
