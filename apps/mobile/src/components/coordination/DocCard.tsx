import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DOC_STATUS, dayNum, mdPreview, sessionStatus, weekdayShort, type BoardDoc } from '@cisa/core';
import { AppText, Card, StatusPill } from '../ui';
import { useTheme } from '../../theme/ThemeProvider';
import { AudienceBadge } from './AudienceBadge';

// One row in the Board's Pages list — date chip, title, audience + status
// pills, one-line preview. Design oracle: web's src/views/CoordinationNotes.tsx
// DocRow, adapted for a native card since that oracle's row assumes a hover
// sidebar (a desktop-only layout with no direct mobile equivalent).
export function DocCard({
  doc,
  isAdmin,
  onPress,
  onTogglePin,
}: {
  doc: BoardDoc;
  isAdmin: boolean;
  onPress: () => void;
  onTogglePin?: () => void;
}) {
  const { colors, radius, spacing } = useTheme();
  const status = sessionStatus(doc.date);
  const statusMeta = DOC_STATUS[status];
  const audience = doc.audience ?? 'team';
  const showAudience = isAdmin || audience !== 'everyone';

  return (
    <Card onPress={onPress}>
      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <View
          style={{
            width: 44,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: radius.sm,
            backgroundColor: colors.surfaceVariant,
            paddingVertical: 8,
          }}
        >
          <Text style={{ fontSize: 11, fontWeight: '600', color: colors.onSurfaceVariant }}>
            {weekdayShort(doc.date)}
          </Text>
          <Text style={{ fontSize: 18, fontWeight: '700', color: colors.onSurface }}>{dayNum(doc.date)}</Text>
        </View>

        <View style={{ flex: 1, gap: 6 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            {statusMeta.tone ? <StatusPill label={statusMeta.label} tone={statusMeta.tone} /> : null}
            {showAudience ? <AudienceBadge audience={audience} /> : null}
          </View>
          <AppText variant="heading" numberOfLines={1}>
            {doc.title}
          </AppText>
          <AppText variant="body" color={colors.onSurfaceVariant} numberOfLines={1}>
            {mdPreview(doc.md)}
          </AppText>
        </View>

        {isAdmin && onTogglePin ? (
          <Pressable onPress={onTogglePin} hitSlop={8} style={{ padding: 4, alignSelf: 'flex-start' }}>
            <Ionicons
              name={doc.pinned ? 'bookmark' : 'bookmark-outline'}
              size={18}
              color={doc.pinned ? colors.primary : colors.onSurfaceVariant}
            />
          </Pressable>
        ) : null}
      </View>
    </Card>
  );
}
