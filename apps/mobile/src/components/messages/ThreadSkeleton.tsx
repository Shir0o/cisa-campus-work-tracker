// The shape of one conversation, drawn in placeholder blocks — what
// ChatThreadScreen and MemberThreadScreen show while useChatThreadData's first
// snapshot is in flight. Row shapes sit where rows would: a date chip, then
// left-aligned blocks (G3), alternating between the room's translucent chip and
// a card-tone block, sized like the rows.
import React from 'react';
import { View } from 'react-native';
import { useV2Theme } from '../../theme/v2';
import { Skeleton } from '../ui/Skeleton';

const ROWS = [
  { width: '62%', height: 46 },
  { width: '48%', height: 40 },
  { width: '55%', height: 52 },
  { width: '70%', height: 44 },
  { width: '44%', height: 38 },
  { width: '58%', height: 46 },
] as const;

export function ThreadSkeleton() {
  const { c, radius } = useV2Theme();

  return (
    <View testID="thread-skeleton" style={{ gap: 8, paddingVertical: 4 }}>
      <Skeleton
        style={{
          alignSelf: 'center',
          width: 52,
          height: 11,
          borderRadius: radius.chip,
          backgroundColor: c.room.chip,
          marginVertical: 8,
        }}
      />
      {ROWS.map((b, i) => (
        <Skeleton
          key={i}
          style={{
            alignSelf: 'flex-start',
            width: b.width,
            height: b.height,
            borderRadius: radius.note,
            backgroundColor: i % 2 === 0 ? c.room.chip : c.card.bg2,
          }}
        />
      ))}
    </View>
  );
}
