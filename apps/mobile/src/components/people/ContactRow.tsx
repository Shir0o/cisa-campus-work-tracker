import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { connectedLabel, type Contact, type Stage } from '@cisa/core';
import { AppText, Avatar, StatusPill } from '../ui';
import { useTheme } from '../../theme/ThemeProvider';
import { toneForStage } from '../../theme/tokens';

// One row in the People list — avatar, name + stage chip, year/major,
// overdue-toned "last connected" line. Design: views/contacts.jsx's
// `isMobile` `contact-card` (no bulk-select, no "Lately:" note on mobile).
export function ContactRow({
  contact,
  days,
  stages,
  onPress,
}: {
  contact: Contact;
  days: number;
  stages: Stage[];
  onPress: (contact: Contact) => void;
}) {
  const { colors, radius, typography } = useTheme();
  const overdue = days >= 7;
  const yearMajor = [contact.year, contact.major].filter(Boolean).join(' · ');

  return (
    <Pressable
      onPress={() => onPress(contact)}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 13,
        backgroundColor: pressed ? colors.surfaceVariant : colors.surface,
        borderWidth: 1,
        borderColor: colors.outlineVariant,
        borderRadius: radius.lg,
        padding: 12,
      })}
    >
      <Avatar name={contact.name} />
      <View style={{ flex: 1, gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Text
            numberOfLines={1}
            style={{ fontFamily: typography.fontSerif, fontSize: 16, fontWeight: '500', color: colors.onSurface }}
          >
            {contact.name}
          </Text>
          {contact.stage ? <StatusPill label={contact.stage} tone={toneForStage(stages, contact.stage)} /> : null}
        </View>
        {yearMajor ? (
          <AppText variant="caption" color={colors.onSurfaceVariant}>
            {yearMajor}
          </AppText>
        ) : null}
        <Text style={{ fontSize: 12.5, color: overdue ? colors.error : colors.onSurfaceVariant }}>
          {Number.isFinite(days) ? connectedLabel(days) : ''}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceVariant} />
    </Pressable>
  );
}
