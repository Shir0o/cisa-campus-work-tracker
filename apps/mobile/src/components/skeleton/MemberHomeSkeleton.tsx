// A member screen in placeholder blocks — what the shared MemberScreen shell
// shows while its data is in flight: the date/greeting head on the room, then
// widget sections below it, the same stack the member home and prayer screens
// scroll.
import React from 'react';
import { View } from 'react-native';
import { useV2Theme } from '../../theme/v2';
import { Skeleton } from '../ui/Skeleton';
import { SkeletonSection } from './SkeletonSection';

export function MemberHomeSkeleton() {
  const { c, radius } = useV2Theme();

  return (
    <View testID="member-home-skeleton" style={{ gap: 22 }}>
      <View style={{ gap: 10 }}>
        <Skeleton style={{ width: 150, height: 11, borderRadius: radius.chip, backgroundColor: c.room.chip }} />
        <Skeleton style={{ width: 210, height: 27, borderRadius: radius.chip, backgroundColor: c.room.chip }} />
        <Skeleton style={{ width: 260, height: 13, borderRadius: radius.chip, backgroundColor: c.room.chip }} />
      </View>
      <SkeletonSection rows={2} />
      <SkeletonSection rows={3} />
      <SkeletonSection rows={2} />
    </View>
  );
}
