// A Board page in placeholder blocks — what BoardDocScreen shows while its
// first snapshot is in flight: the audience line, then a card of document
// lines the way DocBody fills its card.
import React from 'react';
import { View } from 'react-native';
import { useV2Theme } from '../../theme/v2';
import { Skeleton } from '../ui/Skeleton';

export function DocSkeleton() {
  const { c, radius } = useV2Theme();

  return (
    <View testID="doc-skeleton" style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 2 }}>
        <Skeleton style={{ width: 64, height: 20, borderRadius: radius.chip, backgroundColor: c.room.chip }} />
        <Skeleton style={{ width: 140, height: 11, borderRadius: radius.chip, backgroundColor: c.room.chip }} />
      </View>
      <View style={{ borderRadius: radius.hero, backgroundColor: c.card.bg, paddingHorizontal: 16, paddingVertical: 14 }}>
        <View style={{ gap: 10 }}>
          <Skeleton style={{ width: '70%', height: 16, borderRadius: radius.chip, backgroundColor: c.card.bg2 }} />
          <Skeleton style={{ width: '92%', height: 12, borderRadius: radius.chip, backgroundColor: c.card.bg2 }} />
          <Skeleton style={{ width: '85%', height: 12, borderRadius: radius.chip, backgroundColor: c.card.bg2 }} />
          <Skeleton style={{ width: '60%', height: 12, borderRadius: radius.chip, backgroundColor: c.card.bg2 }} />
          <Skeleton style={{ width: '88%', height: 12, borderRadius: radius.chip, backgroundColor: c.card.bg2 }} />
        </View>
      </View>
    </View>
  );
}
