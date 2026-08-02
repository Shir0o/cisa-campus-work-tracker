// Mobile v2 — "Your week" (the design's `M2Week` cover in views/mobile/m2.jsx).
//
// Reached from the end of the queue. It's a pushed screen rather than a block
// that unfolds under the all-clear: the point of the all-clear is being
// finished, and a list growing underneath it undoes that.
import React from 'react';
import { Text, View } from 'react-native';
import { daysAgoWords, type Interaction } from '@cisa/core';
import { useV2Theme } from '../../theme/v2';
import { V2Screen } from '../v2/Widget';

export function WeekLookBack({ week, onBack }: { week: Interaction[]; onBack: () => void }) {
  const { c, font, radius, fs } = useV2Theme();

  return (
    <V2Screen
      title="Your week"
      note={`${week.length} ${week.length === 1 ? 'conversation' : 'conversations'}`}
      onBack={onBack}
    >
      {week.length === 0 && (
        <Text
          style={{
            fontFamily: font.medium,
            fontSize: fs(14.5),
            lineHeight: fs(21),
            color: c.roomInk3,
            paddingVertical: 18,
          }}
        >
          Nothing logged in the last seven days. It happens — start with one text.
        </Text>
      )}
      {week.map((i) => (
        <View
          key={i.id}
          style={{
            backgroundColor: c.card,
            borderRadius: radius.tile,
            paddingVertical: 16,
            paddingHorizontal: 18,
            marginTop: 10,
          }}
        >
          <Text
            style={{
              fontFamily: font.bold,
              fontSize: fs(10.5),
              letterSpacing: 1.26,
              textTransform: 'uppercase',
              color: c.cardInk3,
            }}
          >
            {[daysAgoWords(i.dateTime), i.type].filter(Boolean).join(' · ')}
          </Text>
          <Text
            style={{
              fontFamily: font.extra,
              fontSize: fs(15.5),
              lineHeight: fs(20),
              letterSpacing: -0.31,
              color: c.cardInk,
              marginTop: 10,
            }}
          >
            {i.contactName || 'A conversation'}
          </Text>
          {!!i.content && (
            <Text style={{ fontFamily: font.medium, fontSize: fs(14), lineHeight: fs(21), color: c.cardInk2, marginTop: 6 }}>
              {i.content}
            </Text>
          )}
        </View>
      ))}
    </V2Screen>
  );
}
