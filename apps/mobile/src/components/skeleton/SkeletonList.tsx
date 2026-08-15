// A list of card rows in placeholder blocks — what list screens (People, The
// Journey, Gatherings, The Board, the FT prayer log, outreach) show while their
// first snapshot is in flight. Rows mirror V2PersonRow's geometry: an avatar
// tile, a name line, a sub line, and a right-hand stub, on the card layer.
// `avatar: false` draws plain line rows for text-heavy cards (a person's story
// cards), and `style` lets a call site keep the spacing the spinner it replaces
// had.
import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useV2Theme } from '../../theme/v2';
import { Skeleton } from '../ui/Skeleton';

export function SkeletonList({
  rows = 5,
  avatar = true,
  style,
}: {
  rows?: number;
  avatar?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { c, radius } = useV2Theme();

  return (
    <View testID="skeleton-list" style={[{ gap: 9 }, style]}>
      {Array.from({ length: rows }, (_, i) => (
        <View
          key={i}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 13,
            minHeight: 64,
            paddingVertical: 14,
            paddingHorizontal: 16,
            borderRadius: radius.row,
            backgroundColor: c.card.bg,
          }}
        >
          {avatar && (
            <Skeleton style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: c.card.bg2 }} />
          )}
          <View style={{ flex: 1, gap: 7 }}>
            <Skeleton style={{ width: '45%', height: 13, borderRadius: radius.chip, backgroundColor: c.card.bg2 }} />
            <Skeleton style={{ width: '70%', height: 11, borderRadius: radius.chip, backgroundColor: c.card.bg2 }} />
          </View>
          <Skeleton style={{ width: 40, height: 10, borderRadius: radius.chip, backgroundColor: c.card.bg2 }} />
        </View>
      ))}
    </View>
  );
}
