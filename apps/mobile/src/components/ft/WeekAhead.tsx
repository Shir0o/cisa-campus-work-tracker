// Mobile v2 — "The week ahead". A horizontal swipe strip, which the design's
// Jul 26 revision put in place of the trainee queue's stacked date boxes.
import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import type { FtWeekChip } from '@cisa/core';
import { useV2Theme } from '../../theme/v2';
import { Sech } from '../v2/Widget';

export function WeekAhead({ chips }: { chips: FtWeekChip[] }) {
  const { c, font, radius, fs } = useV2Theme();
  if (chips.length === 0) return null;
  return (
    <View>
      <Sech label="The week ahead" />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 10, paddingRight: 18 }}
      >
        {chips.map((d) => (
          <View
            key={d.id}
            style={{
              width: 168,
              // `.ft-chip` is a widget card, not the trainee's translucent
              // `.m2-datebox` cut-out — so it carries the widget's own paper
              // and the soft shadow, and needs no border to separate it.
              backgroundColor: c.widget.bg,
              borderRadius: radius.note,
              paddingVertical: 13,
              paddingHorizontal: 14,
              ...c.widget.shadow,
            }}
          >
            <Text
              style={{
                fontFamily: font.bold,
                fontSize: fs(10.5),
                letterSpacing: 1.26,
                textTransform: 'uppercase',
                color: c.widget.ink3,
              }}
            >
              {d.when}
            </Text>
            <Text
              style={{
                fontFamily: font.extra,
                fontSize: fs(16),
                lineHeight: fs(21),
                color: c.widget.ink,
                marginTop: 6,
              }}
              numberOfLines={2}
            >
              {d.title}
            </Text>
            {!!d.sub && (
              <Text
                style={{
                  fontFamily: font.medium,
                  fontSize: fs(12.5),
                  color: c.widget.ink2,
                  marginTop: 4,
                }}
                numberOfLines={1}
              >
                {d.sub}
              </Text>
            )}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
