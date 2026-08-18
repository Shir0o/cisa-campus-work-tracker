// Mobile v2 — "At a glance". Two tiles: what you're carrying in prayer, and the
// next gathering. Ported from the design's `.ft-glance` / `.ft-gl`.
//
// The trainee's room forbids number tiles; the full-timer's room is direction 05
// "Widgets", where they are the point. See the note in src/theme/v2.ts.
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import type { FtCarrying, FtNextGathering } from '@cisa/core';
import { useV2Theme } from '../../theme/v2';
import { Sech } from '../v2/Widget';

function Tile({
  dot,
  label,
  value,
  caption,
  detail,
  onPress,
}: {
  dot: string;
  label: string;
  value: string;
  caption: string;
  detail: string;
  onPress: () => void;
}) {
  const { c, font, radius, fs } = useV2Theme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 128,
        backgroundColor: c.widget.bg,
        borderRadius: radius.tile,
        paddingVertical: 14,
        paddingHorizontal: 15,
        opacity: pressed ? 0.85 : 1,
        ...c.widget.shadow,
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot }} />
        <Text
          style={{
            fontFamily: font.bold,
            fontSize: fs(10.5),
            
            
            color: c.widget.ink3,
          }}
        >
          {label}
        </Text>
      </View>
      <Text
        style={{
          fontFamily: font.extra,
          fontSize: fs(34),
          lineHeight: fs(38),
          letterSpacing: -1.2,
          color: c.widget.ink,
          marginTop: 8,
        }}
      >
        {value}
      </Text>
      <Text
        style={{
          fontFamily: font.semi,
          fontSize: fs(13),
          color: c.widget.ink2,
          marginTop: 1,
        }}
      >
        {caption}
      </Text>
      <Text
        style={{
          fontFamily: font.medium,
          fontSize: fs(12),
          lineHeight: fs(16),
          color: c.widget.ink3,
          marginTop: 8,
        }}
        numberOfLines={2}
      >
        {detail}
      </Text>
    </Pressable>
  );
}

export function FtGlance({
  carrying,
  next,
  onOpenPrayers,
  onOpenGatherings,
}: {
  carrying: FtCarrying;
  next: FtNextGathering | null;
  onOpenPrayers: () => void;
  onOpenGatherings: () => void;
}) {
  const { c, fs } = useV2Theme();
  return (
    <View>
      <Sech label="At a glance" />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Tile
          dot={c.card.tones.pray.dot}
          label="Carrying"
          value={String(carrying.count)}
          caption={carrying.count === 1 ? 'open prayer' : 'open prayers'}
          detail={carrying.detail}
          onPress={onOpenPrayers}
        />
        <Tile
          dot={c.card.tones.note.dot}
          label="Next gathering"
          value={next ? next.when : '—'}
          caption={next ? next.title : 'nothing this week'}
          detail={next ? next.detail : 'Nothing on the calendar.'}
          onPress={onOpenGatherings}
        />
      </View>
    </View>
  );
}
