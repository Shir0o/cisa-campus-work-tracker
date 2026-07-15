import { Pressable, View } from 'react-native';
import type { Contact } from '@cisa/core';
import { AppText, Avatar } from '../ui';
import { useTheme } from '../../theme/ThemeProvider';

// A "People" (or "Recent people") result row — tone/icon match web's
// GlobalSearch People rows (accent-toned person node), simplified to an
// avatar since RN's row already reads as a person.
export function PersonResultRow({ contact, onPress }: { contact: Contact; onPress: (c: Contact) => void }) {
  const { colors, spacing } = useTheme();
  const sub = [contact.role, contact.location].filter(Boolean).join(' · ');
  return (
    <Pressable
      onPress={() => onPress(contact)}
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
      <Avatar name={contact.name} size={34} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <AppText variant="body" style={{ fontWeight: '600' }} numberOfLines={1}>
          {contact.name}
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
