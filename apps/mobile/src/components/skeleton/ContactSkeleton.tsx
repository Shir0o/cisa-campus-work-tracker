// A person screen in placeholder blocks — what ContactScreen shows while its
// first snapshot is in flight: the hero card (avatar, name, stage pills,
// action stubs) then list rows beneath it.
import React from 'react';
import { View } from 'react-native';
import { useV2Theme } from '../../theme/v2';
import { Skeleton } from '../ui/Skeleton';
import { SkeletonList } from './SkeletonList';

export function ContactSkeleton() {
  const { c, radius, shadow } = useV2Theme();

  return (
    <View testID="contact-skeleton" style={{ paddingHorizontal: 12 }}>
      <View
        style={{
          backgroundColor: c.card.bg,
          borderRadius: radius.hero,
          padding: 20,
          ...shadow.soft,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Skeleton style={{ width: 60, height: 60, borderRadius: 21, backgroundColor: c.card.bg2 }} />
          <View style={{ flex: 1, gap: 8 }}>
            <Skeleton style={{ width: '55%', height: 22, borderRadius: radius.chip, backgroundColor: c.card.bg2 }} />
            <Skeleton style={{ width: '38%', height: 12, borderRadius: radius.chip, backgroundColor: c.card.bg2 }} />
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
          <Skeleton style={{ width: 72, height: 14, borderRadius: radius.chip, backgroundColor: c.card.bg2 }} />
          <Skeleton style={{ width: 88, height: 14, borderRadius: radius.chip, backgroundColor: c.card.bg2 }} />
        </View>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 18 }}>
          <Skeleton style={{ flex: 1, height: 44, borderRadius: radius.button, backgroundColor: c.card.bg2 }} />
          <Skeleton style={{ flex: 1, height: 44, borderRadius: radius.button, backgroundColor: c.card.bg2 }} />
          <Skeleton style={{ flex: 1, height: 44, borderRadius: radius.button, backgroundColor: c.card.bg2 }} />
        </View>
      </View>

      <SkeletonList rows={3} style={{ marginTop: 20 }} />
    </View>
  );
}
