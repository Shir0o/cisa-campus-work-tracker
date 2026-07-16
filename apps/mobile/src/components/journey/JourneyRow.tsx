import { Text, View } from 'react-native';
import { connectedLabel, type Leader } from '@cisa/core';
import { AppText, Avatar, IconButton } from '../ui';
import { useTheme } from '../../theme/ThemeProvider';

// One row in a Journey stage panel — avatar, name, role/location subline,
// overdue-toned "last connected" line, truncated last-touch note, and a move
// button that opens MoveSheet. Design: web's OutreachBoardMobile.tsx person
// card (no stage chip — redundant once grouped by stage tab).
export function JourneyRow({ entry, onMove }: { entry: Leader; onMove: () => void }) {
  const { colors, radius, typography } = useTheme();
  const { contact, days, note } = entry;
  const overdue = Number.isFinite(days) && days >= 7;
  const sub = [contact.role, contact.location].filter(Boolean).join(' · ');

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 13,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.outlineVariant,
        borderRadius: radius.lg,
        padding: 12,
      }}
    >
      <Avatar name={contact.name} />
      <View style={{ flex: 1, gap: 3 }}>
        <Text
          numberOfLines={1}
          style={{ fontFamily: typography.fontSerif, fontSize: 16, fontWeight: '500', color: colors.onSurface }}
        >
          {contact.name}
        </Text>
        {sub ? (
          <AppText variant="caption" color={colors.onSurfaceVariant}>
            {sub}
          </AppText>
        ) : null}
        <Text style={{ fontSize: 12.5, color: overdue ? colors.error : colors.onSurfaceVariant }}>
          {Number.isFinite(days) ? connectedLabel(days) : 'No contact logged.'}
        </Text>
        {note ? (
          <AppText variant="caption" color={colors.onSurfaceVariant} numberOfLines={2}>
            {note}
          </AppText>
        ) : null}
      </View>
      <IconButton name="arrow-forward" onPress={onMove} tone="neutral" />
    </View>
  );
}
