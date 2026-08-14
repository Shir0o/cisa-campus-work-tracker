// The shape of the Messages room list, drawn in placeholder blocks — what
// MessagesScreen shows while useMessagesData's first snapshot is in flight.
// Rows mirror ConversationRow's geometry: a square avatar tile, then a name
// line and a preview line, on the card layer.
import React from 'react';
import { View } from 'react-native';
import { useV2Theme } from '../../theme/v2';
import { Skeleton } from '../ui/Skeleton';

const ROWS = 6;

export function MessagesListSkeleton() {
  const { c, radius } = useV2Theme();

  return (
    <View testID="messages-list-skeleton" style={{ gap: 9 }}>
      {Array.from({ length: ROWS }, (_, i) => (
        <View
          key={i}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            minHeight: 68,
            paddingHorizontal: 14,
            paddingVertical: 12,
            borderRadius: radius.row,
            backgroundColor: c.card.bg,
          }}
        >
          <Skeleton style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: c.card.bg2 }} />
          <View style={{ flex: 1, gap: 7 }}>
            <Skeleton style={{ width: '55%', height: 13, borderRadius: radius.chip, backgroundColor: c.card.bg2 }} />
            <Skeleton style={{ width: '82%', height: 11, borderRadius: radius.chip, backgroundColor: c.card.bg2 }} />
          </View>
          <Skeleton style={{ width: 34, height: 10, borderRadius: radius.chip, backgroundColor: c.card.bg2 }} />
        </View>
      ))}
    </View>
  );
}
