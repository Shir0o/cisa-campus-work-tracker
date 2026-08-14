// The full-timer's home in placeholder blocks — what FtHomeScreen shows while
// its first snapshot is in flight: the greeting head with the avatar, the two
// quick tiles, then the widget sections the page scrolls.
import React from 'react';
import { View } from 'react-native';
import { useV2Theme } from '../../theme/v2';
import { Skeleton } from '../ui/Skeleton';
import { SkeletonSection } from './SkeletonSection';

export function FtHomeSkeleton() {
  const { c, radius } = useV2Theme();

  return (
    <View testID="ft-home-skeleton" style={{ gap: 22 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <View style={{ flex: 1, gap: 9 }}>
          <Skeleton style={{ width: 150, height: 11, borderRadius: radius.chip, backgroundColor: c.room.chip }} />
          <Skeleton style={{ width: 210, height: 27, borderRadius: radius.chip, backgroundColor: c.room.chip }} />
          <Skeleton style={{ width: 260, height: 13, borderRadius: radius.chip, backgroundColor: c.room.chip }} />
        </View>
        <Skeleton style={{ width: 44, height: 44, borderRadius: 15, backgroundColor: c.room.chip }} />
      </View>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Skeleton style={{ flex: 1, height: 92, borderRadius: radius.tile, backgroundColor: c.widget.bg }} />
        <Skeleton style={{ flex: 1, height: 92, borderRadius: radius.tile, backgroundColor: c.widget.bg }} />
      </View>

      <SkeletonSection rows={2} />
      <SkeletonSection rows={3} />
      <SkeletonSection rows={2} />
    </View>
  );
}
