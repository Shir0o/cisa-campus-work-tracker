// Mobile counterpart of web's src/components/ui/Skeleton.tsx — a pulsing
// placeholder block. Callers own the shape and the colour: each skeleton
// layout stands on a specific layer (room, card, widget), and the caller
// knows which token reads right on that ground, so the colour is part of the
// style prop rather than a token decision made here.
import React, { useEffect } from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

export function Skeleton({ style }: { style?: StyleProp<ViewStyle> }) {
  const pulse = useSharedValue(0.45);

  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 700, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [pulse]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return <Animated.View testID="skeleton" style={[animatedStyle, style]} />;
}
