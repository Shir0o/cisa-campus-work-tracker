// Mobile v2 — the on-campus window strip. Logging gets promoted hard during the
// window (default Tue & Wed, 12–3); the strip is the first block inside the card
// body and does not scroll away. When the day has a goal (#544) the small mark
// becomes a 20px ring that fills as the trainee adds new people, and goes back
// to being the plain dot the moment the number is reached — no number on it,
// the count is spoken for a screen reader and nowhere else.
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { ON_CAMPUS_SUB, onCampusHeadline, type OnCampusWindow } from '@cisa/core';
import { useV2Theme } from '../../theme/v2';

/** The goal ring the strip wears during the on-campus window (#544). */
export interface OnCampusStripGoal {
  /** How full the ring is, 0..1. */
  fill: number;
  /** What a screen reader says instead of a number. */
  label: string;
}

const R = 8.5;
const CIRCUMFERENCE = 2 * Math.PI * R;

export function OnCampusStrip({
  window: w,
  onPress,
  goal,
}: {
  window: OnCampusWindow;
  onPress: () => void;
  goal?: OnCampusStripGoal;
}) {
  const { c, font, radius, fs } = useV2Theme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={goal ? goal.label : undefined}
      style={({ pressed }) => ({
        marginBottom: 18,
        backgroundColor: c.card.window,
        borderRadius: radius.note,
        paddingVertical: 12,
        paddingHorizontal: 15,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        minHeight: 44,
        opacity: pressed ? 0.9 : 1,
      })}
    >
      {goal ? (
        <Svg width={20} height={20} style={{ transform: [{ rotate: '-90deg' }] }} testID="goal-ring">
          <Circle cx={10} cy={10} r={R} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth={3} />
          <Circle
            cx={10}
            cy={10}
            r={R}
            fill="none"
            stroke={c.card.windowDot}
            strokeWidth={3}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - goal.fill)}
          />
        </Svg>
      ) : (
        <View
          style={{
            width: 10,
            height: 10,
            borderRadius: 5,
            backgroundColor: c.card.windowDot,
            borderWidth: 5,
            borderColor: 'rgba(255,255,255,0.16)',
          }}
        />
      )}
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: font.extra, fontSize: fs(13.5), color: c.card.onWindow }}>{onCampusHeadline(w)}</Text>
        <Text style={{ fontFamily: font.semi, fontSize: fs(12.5), lineHeight: fs(16), color: c.card.onWindowSub, marginTop: 3 }}>
          {ON_CAMPUS_SUB}
        </Text>
      </View>
    </Pressable>
  );
}
