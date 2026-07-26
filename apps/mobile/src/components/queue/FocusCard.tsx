/* eslint-disable react-hooks/immutability -- Assigning to a Reanimated shared
   value's `.value` IS its API; the React Compiler rule reads it as mutating a
   hook result. This is the only file in the app that uses useSharedValue. */
// Mobile v2 — the focus card shell. Direction 02 ("One at a Time"): one clean
// white sheet that ALWAYS fills the room between the meta row and the floor, so
// a short card spans the height instead of floating as a stub and its actions
// rest on the floor. A tone pill instead of a header band, a scrolling body, and
// a foot that never scrolls — card content must never slide under the chrome.
import React from 'react';
import { AccessibilityInfo, Platform, ScrollView, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useV2Theme, type V2ToneKey } from '../../theme/v2';
import { ToneBadge } from './atoms';

/** Past this much horizontal travel, releasing advances the queue. */
const SWIPE_THRESHOLD = 90;

export function FocusCard({
  tone,
  label,
  ago,
  children,
  foot,
  header,
  onSwipeAway,
}: {
  tone: V2ToneKey;
  label: string;
  ago?: string;
  children: React.ReactNode;
  foot: React.ReactNode;
  /** The on-campus strip — rides above the scrolling body, and stays put. */
  header?: React.ReactNode;
  onSwipeAway?: () => void;
}) {
  const { c, radius, shadow } = useV2Theme();
  const x = useSharedValue(0);
  const [reduceMotion, setReduceMotion] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((on) => alive && setReduceMotion(on))
      .catch(() => {
        /* not available on every platform */
      });
    return () => {
      alive = false;
    };
  }, []);

  // Reset when the card underneath changes.
  React.useEffect(() => {
    x.value = 0;
  }, [label, ago, x]);

  const away = React.useCallback(() => {
    x.value = 0;
    onSwipeAway?.();
  }, [onSwipeAway, x]);

  const pan = Gesture.Pan()
    .enabled(!!onSwipeAway && !reduceMotion)
    // Let a vertical drag scroll the body instead of dragging the card.
    .activeOffsetX([-14, 14])
    .failOffsetY([-12, 12])
    .onUpdate((e) => {
      x.value = e.translationX;
    })
    .onEnd((e) => {
      if (Math.abs(e.translationX) > SWIPE_THRESHOLD) {
        x.value = withTiming(Math.sign(e.translationX) * 600, { duration: 180 }, (done) => {
          if (done) runOnJS(away)();
        });
      } else {
        x.value = withSpring(0, { damping: 18, stiffness: 200 });
      }
    });

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { rotateZ: `${interpolate(x.value, [-300, 300], [-7, 7])}deg` }],
    opacity: interpolate(Math.abs(x.value), [0, 260], [1, 0.35], 'clamp'),
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        style={[
          {
            flex: 1,
            backgroundColor: c.card,
            borderRadius: radius.card,
            overflow: 'hidden',
          },
          shadow.card,
          cardStyle,
        ]}
      >
        <View style={{ flex: 1, minHeight: 0, paddingTop: 24, paddingHorizontal: 24, paddingBottom: 2 }}>
          {header}
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 4 }}
            // On web the card is short enough to fit; bouncing reads as a bug.
            bounces={Platform.OS !== 'web'}
          >
            <ToneBadge tone={tone} label={label} ago={ago} />
            {children}
          </ScrollView>
        </View>
        <View style={{ paddingTop: 20, paddingHorizontal: 24, paddingBottom: 18, gap: 9 }}>{foot}</View>
      </Animated.View>
    </GestureDetector>
  );
}

/** The all-clear / empty variants borrow the card's ink but not its geometry. */
export function CardText({ children }: { children: React.ReactNode }) {
  const { c, font } = useV2Theme();
  return <Text style={{ fontFamily: font.medium, fontSize: 15.5, lineHeight: 23, color: c.cardInk2 }}>{children}</Text>;
}
