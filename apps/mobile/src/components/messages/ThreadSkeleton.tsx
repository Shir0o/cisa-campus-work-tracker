// The shape of one conversation, drawn in placeholder blocks — what
// ChatThreadScreen and MemberThreadScreen show while useChatThreadData's first
// snapshot is in flight. Bubble shapes sit where bubbles would: a date chip,
// then messages alternating between the room's translucent chip (theirs) and a
// card-tone block (mine), sized like the real bubbles.
import React from 'react';
import { View } from 'react-native';
import { useV2Theme } from '../../theme/v2';
import { Skeleton } from '../ui/Skeleton';

const BUBBLES = [
  { align: 'flex-start', width: '62%', height: 46 },
  { align: 'flex-end', width: '48%', height: 40 },
  { align: 'flex-start', width: '55%', height: 52 },
  { align: 'flex-end', width: '70%', height: 44 },
  { align: 'flex-start', width: '44%', height: 38 },
  { align: 'flex-end', width: '58%', height: 46 },
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
      {BUBBLES.map((b, i) => (
        <Skeleton
          key={i}
          style={{
            alignSelf: b.align,
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
