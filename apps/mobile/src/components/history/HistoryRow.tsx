import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { dayInfo, firstName, humanize, type Bucket, type HistoryRow as HistoryRowData } from '@cisa/core';
import { AppText } from '../ui';
import { useTheme } from '../../theme/ThemeProvider';
import { toneColors, type ToneKey } from '../../theme/tokens';

// Icon/tone per bucket — packages/core's humanize() only returns a `bucket`
// (it can't import a platform icon library), so each platform owns this map.
const BUCKET_ICON: Record<Bucket, keyof typeof Ionicons.glyphMap> = {
  steps: 'walk',
  prayer: 'heart',
  talk: 'chatbubble-ellipses',
  gather: 'people',
};
const BUCKET_TONE: Record<Bucket, ToneKey> = {
  steps: 'accent',
  prayer: 'violet',
  talk: 'amber',
  gather: 'teal',
};

// One row in the "Looking back" timeline — a day marker or a logged moment.
// Design: HistoryMobile.tsx's hist-datemark / hist-body rows.
export function HistoryRow({
  row,
  onOpenContact,
}: {
  row: HistoryRowData;
  onOpenContact: (contactId: string) => void;
}) {
  const { colors, radius, spacing, typography } = useTheme();

  if (row.type === 'date') {
    const info = dayInfo(row.at);
    return (
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, paddingTop: spacing.md, paddingBottom: 4 }}>
        <Text style={{ fontFamily: typography.fontSerif, fontSize: 17, fontWeight: '500', color: colors.onSurface }}>
          {info.label}
        </Text>
        <AppText variant="caption">{info.sub}</AppText>
      </View>
    );
  }

  const a = row.a;
  const h = humanize(a);
  const { fg, soft } = toneColors(colors, BUCKET_TONE[h.bucket]);
  const clickable = h.showTarget && !!a.contactId;

  return (
    <View style={{ flexDirection: 'row', gap: spacing.md, paddingVertical: 8 }}>
      <View
        style={{
          width: 26,
          height: 26,
          borderRadius: radius.sm,
          backgroundColor: soft,
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: 2,
        }}
      >
        <Ionicons name={BUCKET_ICON[h.bucket]} size={13} color={fg} />
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={{ fontSize: 14.5, lineHeight: 20, color: colors.onSurfaceVariant }}>
          <Text style={{ fontWeight: '600', color: colors.onSurface }}>{firstName(a.user)}</Text> {h.lead}{' '}
          {h.showTarget && a.target ? (
            clickable ? (
              <Text
                onPress={() => onOpenContact(a.contactId!)}
                style={{ fontWeight: '600', color: colors.onSurface, textDecorationLine: 'underline' }}
              >
                {a.target}
              </Text>
            ) : (
              <Text style={{ fontWeight: '600', color: colors.onSurface }}>{a.target}</Text>
            )
          ) : null}
          {h.tail ? ` ${h.tail}` : ''}.
        </Text>
        {h.detail && (
          <Text style={{ fontSize: 13, lineHeight: 18, color: colors.onSurfaceVariant, fontStyle: 'italic' }}>
            {h.detail}
          </Text>
        )}
        <AppText variant="caption">
          {new Date(a.createdAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
        </AppText>
      </View>
    </View>
  );
}
