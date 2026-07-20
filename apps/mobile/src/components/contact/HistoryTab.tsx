import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { humanize, type Activity, type Hist } from '@cisa/core';
import { AppText } from '../ui';
import { useTheme } from '../../theme/ThemeProvider';
import { toneColors, type ToneKey } from '../../theme/tokens';

// Icon/tone keyed on the raw activity type — a different scheme than the
// standalone History screen's bucket-based HistoryRow (that one groups by
// day; this tab is a flat per-contact timeline, matching
// ContactDetailsModal.tsx's AuditActivityItem).
const TYPE_ICON: Record<Activity['type'], keyof typeof Ionicons.glyphMap> = {
  edit: 'create-outline',
  create: 'person-circle-outline',
  comment: 'chatbubble-ellipses-outline',
  call: 'call-outline',
  email: 'mail-outline',
  event: 'people-outline',
  alert: 'alert-circle-outline',
};
const TYPE_TONE: Record<Activity['type'], ToneKey> = {
  edit: 'violet',
  create: 'accent',
  comment: 'teal',
  call: 'accent',
  email: 'accent',
  event: 'teal',
  alert: 'amber',
};

// Contact Detail's "Looking back" tab — an audit timeline for this one
// contact. Design oracle: ContactDetailsModal.tsx's "history" tab body.
export function HistoryTab({ activities, loading }: { activities: Hist[]; loading: boolean }) {
  const { colors, radius, spacing } = useTheme();

  return (
    <View style={{ gap: spacing.md }}>
      <AppText variant="heading">Looking back</AppText>

      {loading ? (
        <AppText variant="body" color={colors.onSurfaceVariant}>
          Loading…
        </AppText>
      ) : activities.length === 0 ? (
        <View style={{ padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.outlineVariant, alignItems: 'center' }}>
          <AppText variant="caption">No audit history found for this contact.</AppText>
        </View>
      ) : (
        activities.map((a, idx) => {
          const h = humanize(a);
          const { fg, soft } = toneColors(colors, TYPE_TONE[a.type] ?? 'neutral');
          return (
            <View key={a.id || idx} style={{ flexDirection: 'row', gap: spacing.md }}>
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: soft,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginTop: 2,
                }}
              >
                <Ionicons name={TYPE_ICON[a.type] ?? 'calendar-outline'} size={15} color={fg} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                  <Text style={{ fontSize: 11.5, fontWeight: '700', color: colors.onSurface, textTransform: 'uppercase' }}>{a.user}</Text>
                  <AppText variant="caption">
                    {new Date(a.createdAt).toLocaleDateString()} at {new Date(a.createdAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                  </AppText>
                </View>
                <Text style={{ fontSize: 13, lineHeight: 18, color: colors.onSurfaceVariant }}>
                  {h.lead}
                  {h.showTarget && a.target ? ` ${a.target}` : ''}
                  {h.tail ? ` ${h.tail}` : ''}.
                </Text>
                {h.detail ? (
                  <View style={{ marginTop: 4, padding: 8, borderRadius: radius.sm, backgroundColor: colors.surfaceContainerHigh, borderWidth: 1, borderColor: colors.outlineVariant }}>
                    <Text style={{ fontSize: 12, lineHeight: 16, color: colors.onSurfaceVariant, fontStyle: 'italic' }}>{h.detail}</Text>
                  </View>
                ) : null}
              </View>
            </View>
          );
        })
      )}
    </View>
  );
}
