import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format, isValid } from 'date-fns';
import type { AttendanceStatus, Contact, Event } from '@cisa/core';
import { AppText, Avatar, Sheet } from '../ui';
import { useTheme, type Theme } from '../../theme/ThemeProvider';

const statusLabel = (status: AttendanceStatus | undefined) =>
  status === true ? 'Present' : status === 'late' ? 'Late' : status === 'absent' ? 'Absent' : 'Unmarked';

function statusTone(status: AttendanceStatus | undefined, colors: Theme['colors']) {
  if (status === true) return { fg: colors.success, soft: colors.successContainer };
  if (status === 'late') return { fg: colors.warning, soft: colors.warningContainer };
  if (status === 'absent') return { fg: colors.error, soft: colors.errorContainer };
  return { fg: colors.onSurfaceVariant, soft: colors.surfaceVariant };
}

// Bottom sheet for one gathering's roster — tap a name to cycle
// present → late → absent → present (see core's cycleAttendanceStatus).
// Read-only for roles below operator (see useAttendanceData's
// canTakeAttendance). Design: src/views/AttendanceMobile.tsx's RosterSheet.
export function RosterSheet({
  visible,
  session,
  contacts,
  canTakeAttendance,
  onCycle,
  onClose,
}: {
  visible: boolean;
  session: Event | null;
  contacts: Contact[];
  canTakeAttendance: boolean;
  onCycle: (contact: Contact, eventId: string) => void;
  onClose: () => void;
}) {
  const { colors, radius, spacing, typography } = useTheme();
  // Keep the last-known session rendered while the sheet animates closed, so
  // content doesn't blank out mid-slide when the caller clears `session`.
  const [shown, setShown] = useState(session);
  useEffect(() => {
    if (session) setShown(session);
  }, [session]);

  if (!shown) return null;
  const d = new Date(shown.date);

  return (
    <Sheet visible={visible} onClose={onClose} maxHeightRatio={0.85}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ fontFamily: typography.fontSerif, fontSize: 18, fontWeight: '500', color: colors.onSurface }}>
            {shown.name}
          </Text>
          <AppText variant="caption" color={colors.onSurfaceVariant}>
            {isValid(d) ? format(d, 'EEEE, MMMM d') : ''}
          </AppText>
        </View>
        <Pressable onPress={onClose} hitSlop={8} style={{ padding: 6 }}>
          <Ionicons name="close" size={18} color={colors.onSurfaceVariant} />
        </Pressable>
      </View>

      {!canTakeAttendance ? (
        <AppText variant="caption" color={colors.onSurfaceVariant} style={{ paddingHorizontal: spacing.lg, marginTop: 10 }}>
          Roster is read-only for your role.
        </AppText>
      ) : null}

      <View style={{ padding: spacing.lg, gap: 2 }}>
        {contacts.map((c) => {
          const status = c.attendance?.[shown.id];
          const tone = statusTone(status, colors);
          const row = (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}>
              <Avatar name={c.name} size={32} />
              <Text numberOfLines={1} style={{ flex: 1, fontSize: 14.5, color: colors.onSurface }}>
                {c.name}
              </Text>
              <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.full, backgroundColor: tone.soft }}>
                <Text style={{ fontSize: 11.5, fontWeight: '700', color: tone.fg }}>{statusLabel(status)}</Text>
              </View>
            </View>
          );
          return canTakeAttendance ? (
            <Pressable key={c.id} onPress={() => onCycle(c, shown.id)} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
              {row}
            </Pressable>
          ) : (
            <View key={c.id}>{row}</View>
          );
        })}
      </View>
    </Sheet>
  );
}
