import { Pressable, Text, View } from 'react-native';
import { format, isValid } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';
import type { Contact, Event } from '@cisa/core';
import { AppText } from '../ui';
import { useTheme } from '../../theme/ThemeProvider';

// One row in "When we met" — tap to open the roster sheet. Design:
// src/views/AttendanceMobile.tsx's session accordion header.
export function SessionCard({
  session,
  contacts,
  hereFn,
  onPress,
}: {
  session: Event;
  contacts: Contact[];
  hereFn: (contact: Contact, eventId: string) => boolean;
  onPress: () => void;
}) {
  const { colors, radius, spacing, typography } = useTheme();
  const d = new Date(session.date);
  const presentCount = contacts.filter((c) => hereFn(c, session.id)).length;
  const meta = [isValid(d) ? format(d, 'EEE, MMM d') : '', session.type].filter(Boolean).join(' · ');

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        backgroundColor: pressed ? colors.surfaceVariant : colors.surface,
        borderWidth: 1,
        borderColor: colors.outlineVariant,
        borderRadius: radius.lg,
        padding: spacing.md,
      })}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontFamily: typography.fontSerif, fontSize: 16, color: colors.onSurface }}>
          {session.name}
        </Text>
        {meta ? (
          <AppText variant="caption" color={colors.onSurfaceVariant}>
            {meta}
          </AppText>
        ) : null}
      </View>
      <AppText variant="caption" color={colors.onSurfaceVariant}>
        {presentCount} here
      </AppText>
      <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceVariant} />
    </Pressable>
  );
}
