import { Alert, Linking, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { kindMeta, relTime, typeToKind, type Feedback, type FeedbackStatus } from '@cisa/core';
import { AppText, Card } from '../ui';
import { useTheme } from '../../theme/ThemeProvider';
import { toneColors } from '../../theme/tokens';
import { FEEDBACK_TONE_MAP, FEEDBACK_ICON } from './tone';

const STATUS_LABEL: Record<FeedbackStatus, string> = {
  new: 'New',
  in_progress: 'In progress',
  resolved: 'Resolved',
};
const STATUS_ORDER: FeedbackStatus[] = ['new', 'in_progress', 'resolved'];

// One row in the admin review list — tonal kind icon, author + relative
// time, message, an optional GitHub issue link, and status/archive/delete
// actions. Mirrors the admin controls in web's FeedbackList.tsx, minus
// GitHub issue creation (deferred — see MIGRATION.md).
export function FeedbackRow({
  item,
  onStatusChange,
  onToggleArchive,
  onDelete,
}: {
  item: Feedback;
  onStatusChange: (status: FeedbackStatus) => void;
  onToggleArchive: () => void;
  onDelete: () => void;
}) {
  const { colors, radius, spacing } = useTheme();
  const kind = item.kind ?? typeToKind(item.type);
  const meta = kindMeta(kind);
  const { fg, soft } = toneColors(colors, FEEDBACK_TONE_MAP[meta.tone]);

  const confirmDelete = () => {
    Alert.alert('Delete this note?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: onDelete },
    ]);
  };

  return (
    <Card style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
        <View
          style={{
            width: 34,
            height: 34,
            borderRadius: radius.md,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: soft,
          }}
        >
          <Ionicons name={FEEDBACK_ICON[kind]} size={16} color={fg} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="label" style={{ fontWeight: '700' }}>
            {item.userName}
          </AppText>
          <AppText variant="caption" color={colors.onSurfaceVariant}>
            {meta.label} · {relTime(item.createdAt)}
          </AppText>
        </View>
        {item.archived && <Ionicons name="archive-outline" size={16} color={colors.onSurfaceVariant} />}
      </View>

      <AppText variant="body">{item.message}</AppText>

      {item.githubIssueUrl && (
        <Pressable onPress={() => Linking.openURL(item.githubIssueUrl!)} hitSlop={8}>
          <AppText variant="caption" color={colors.primary} style={{ fontWeight: '600' }}>
            View GitHub issue ↗
          </AppText>
        </Pressable>
      )}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs, marginTop: 2 }}>
        {STATUS_ORDER.map((s) => {
          const on = item.status === s;
          return (
            <Pressable
              key={s}
              onPress={() => onStatusChange(s)}
              style={{
                paddingHorizontal: 10,
                paddingVertical: 5,
                borderRadius: radius.full,
                borderWidth: 1,
                borderColor: on ? colors.primary : colors.outlineVariant,
                backgroundColor: on ? colors.primary : 'transparent',
              }}
            >
              <AppText variant="caption" color={on ? colors.onPrimary : colors.onSurface} style={{ fontWeight: '600' }}>
                {STATUS_LABEL[s]}
              </AppText>
            </Pressable>
          );
        })}
        <View style={{ flex: 1 }} />
        <Pressable onPress={onToggleArchive} hitSlop={8} style={{ padding: 4 }}>
          <Ionicons
            name={item.archived ? 'arrow-up-circle-outline' : 'archive-outline'}
            size={18}
            color={colors.onSurfaceVariant}
          />
        </Pressable>
        <Pressable onPress={confirmDelete} hitSlop={8} style={{ padding: 4 }}>
          <Ionicons name="trash-outline" size={18} color={colors.error} />
        </Pressable>
      </View>
    </Card>
  );
}
