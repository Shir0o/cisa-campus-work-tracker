// The trainee's focus queue in placeholder blocks — what QueueScreen shows
// while its first snapshot is in flight. The chrome meta line rides above a
// big card that fills the room the way FocusCard does: a tone pill, body
// lines, and an action stub in the foot.
import React from 'react';
import { View } from 'react-native';
import { useV2Theme } from '../../theme/v2';
import { Skeleton } from '../ui/Skeleton';

export function QueueSkeleton() {
  const { c, radius, shadow } = useV2Theme();

  return (
    <View testID="queue-skeleton" style={{ flex: 1 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingHorizontal: 18,
          paddingTop: 10,
          paddingBottom: 14,
        }}
      >
        <Skeleton style={{ width: 44, height: 44, borderRadius: radius.chip, backgroundColor: c.room.chip }} />
        <Skeleton style={{ flex: 1, height: 12, borderRadius: radius.chip, backgroundColor: c.room.chip }} />
      </View>
      <View style={{ flex: 1, paddingHorizontal: 18, minHeight: 0 }}>
        <View
          style={{
            flex: 1,
            backgroundColor: c.card.bg,
            borderRadius: radius.card,
            paddingTop: 24,
            paddingHorizontal: 24,
            paddingBottom: 18,
            ...shadow.card,
          }}
        >
          <Skeleton style={{ width: 96, height: 24, borderRadius: radius.chip, backgroundColor: c.card.bg2 }} />
          <View style={{ gap: 9, marginTop: 20 }}>
            <Skeleton style={{ width: '80%', height: 15, borderRadius: radius.chip, backgroundColor: c.card.bg2 }} />
            <Skeleton style={{ width: '92%', height: 15, borderRadius: radius.chip, backgroundColor: c.card.bg2 }} />
            <Skeleton style={{ width: '64%', height: 15, borderRadius: radius.chip, backgroundColor: c.card.bg2 }} />
            <Skeleton style={{ width: '86%', height: 13, borderRadius: radius.chip, backgroundColor: c.card.bg2 }} />
            <Skeleton style={{ width: '70%', height: 13, borderRadius: radius.chip, backgroundColor: c.card.bg2 }} />
          </View>
          <View style={{ gap: 9, marginTop: 'auto', paddingTop: 20 }}>
            <Skeleton style={{ height: 44, borderRadius: radius.button, backgroundColor: c.card.primary }} />
            <Skeleton style={{ height: 44, borderRadius: radius.button, backgroundColor: c.card.bg2 }} />
          </View>
        </View>
      </View>
    </View>
  );
}
