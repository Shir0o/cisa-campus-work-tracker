// A v2 widget section in placeholder blocks: the design's section label sits
// out on the room, and the rows below it stand on the widget card — the same
// `Sech` + `Widget`/`WidgetRow` stack the home screens scroll through.
import React from 'react';
import { View } from 'react-native';
import { useV2Theme } from '../../theme/v2';
import { Skeleton } from '../ui/Skeleton';

export function SkeletonSection({ rows = 3 }: { rows?: number }) {
  const { c, radius } = useV2Theme();

  return (
    <View testID="skeleton-section" style={{ gap: 10 }}>
      <Skeleton style={{ width: 92, height: 11, borderRadius: radius.chip, backgroundColor: c.room.chip }} />
      <View style={{ gap: 0, borderRadius: radius.tile, backgroundColor: c.widget.bg, paddingVertical: 4, ...c.widget.shadow }}>
        {Array.from({ length: rows }, (_, i) => (
          <View
            key={i}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 13,
              minHeight: 56,
              paddingVertical: 11,
              paddingHorizontal: 16,
              borderTopWidth: i === 0 ? 0 : 1,
              borderTopColor: c.widget.line,
            }}
          >
            <Skeleton style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: c.widget.tile }} />
            <View style={{ flex: 1, gap: 6 }}>
              <Skeleton style={{ width: '50%', height: 12, borderRadius: radius.chip, backgroundColor: c.widget.tile }} />
              <Skeleton style={{ width: '30%', height: 10, borderRadius: radius.chip, backgroundColor: c.widget.tile }} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}
