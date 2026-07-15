import { Pressable, View } from 'react-native';
import type { MissedContact } from '@cisa/core';
import { AppText, Avatar, IconButton, SectionHead } from '../ui';
import { useTheme } from '../../theme/ThemeProvider';
import { openMessage } from '../../lib/messaging';

// "Who we've missed" — attended before, but absent the last 2+ gatherings.
// Design: src/views/AttendanceMobile.tsx's missed section (text-to-check-in
// via openMessage, same as My Day's contact rows).
export function MissedList({
  missed,
  onOpenContact,
}: {
  missed: MissedContact[];
  onOpenContact: (contact: MissedContact['contact']) => void;
}) {
  const { colors, spacing, radius } = useTheme();
  if (missed.length === 0) return null;

  return (
    <View>
      <SectionHead title="Who we've missed" />
      <View style={{ gap: 8 }}>
        {missed.map(({ contact, since }) => (
          <Pressable
            key={contact.id}
            onPress={() => onOpenContact(contact)}
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
            <Avatar name={contact.name} size={38} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <AppText variant="body" numberOfLines={1}>
                {contact.name}
              </AppText>
              <AppText variant="caption" color={colors.onSurfaceVariant}>
                Missed the last {since} {since === 1 ? 'gathering' : 'gatherings'}
              </AppText>
            </View>
            {contact.phone ? (
              <IconButton name="chatbubble-outline" size={36} onPress={() => openMessage(contact.phone)} />
            ) : null}
          </Pressable>
        ))}
      </View>
    </View>
  );
}
