import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ntfWhen, toneForNotification, type Notification, type NotificationTone } from '@cisa/core';
import { AppText, IconButton } from '../ui';
import { useTheme } from '../../theme/ThemeProvider';
import { toneColors, type ToneKey } from '../../theme/tokens';

// packages/core's toneForNotification only returns the web's 5-way tone (it
// can't import RN color tokens) — each platform owns this map, same pattern
// as AnsweredTile's ANSWERED_TONE_MAP. 'sage' collapses onto 'teal' since RN's
// ToneKey has no separate success/sage token.
const NOTIFICATION_TONE_MAP: Record<NotificationTone, ToneKey> = {
  accent: 'accent',
  violet: 'violet',
  amber: 'amber',
  teal: 'teal',
  sage: 'teal',
};

function iconFor(notif: Notification, tone: NotificationTone): keyof typeof Ionicons.glyphMap {
  if (notif.type === 'warning' || notif.type === 'error') return 'alert-circle-outline';
  if (notif.type === 'assignment') return 'people-outline';
  switch (tone) {
    case 'violet': return 'sparkles-outline';
    case 'amber': return 'calendar-outline';
    case 'teal': return 'people-outline';
    case 'sage': return 'checkmark-circle-outline';
    default: return 'heart-outline';
  }
}

// One row in the Notifications list — tonal icon, title/message, relative
// time, tap-to-read, and a hover/press-revealed set-aside action. Mirrors
// web's NtfItem.
export function NotificationRow({
  notif,
  onPress,
  onSetAside,
}: {
  notif: Notification;
  onPress: () => void;
  onSetAside: () => void;
}) {
  const { colors, spacing } = useTheme();
  const tone = toneForNotification(notif);
  const { fg } = toneColors(colors, NOTIFICATION_TONE_MAP[tone]);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        gap: spacing.sm,
        alignItems: 'flex-start',
        paddingVertical: spacing.sm,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <IconButton name={iconFor(notif, tone)} size={30} tone={NOTIFICATION_TONE_MAP[tone]} />

      <View style={{ flex: 1, gap: 2 }}>
        <AppText
          variant="body"
          style={{ fontWeight: notif.read ? '500' : '700', color: notif.read ? colors.onSurfaceVariant : colors.onSurface }}
        >
          {notif.title}
        </AppText>
        <AppText variant="caption" color={colors.onSurfaceVariant}>
          {notif.message}
        </AppText>
        <AppText variant="caption" color={colors.outline}>
          {ntfWhen(notif.createdAt)}
        </AppText>
      </View>

      {!notif.read && (
        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.primary, marginTop: 6 }} />
      )}

      <Pressable onPress={onSetAside} hitSlop={8} style={{ padding: 4 }}>
        <Ionicons name="close" size={16} color={fg} />
      </Pressable>
    </Pressable>
  );
}
