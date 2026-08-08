// A bottom-anchored, auto-dismissing toast with an optional action (e.g.
// "Undo") — the design's `.m2-toast`. Fully controlled: mount it when there's
// something to say, unmount it when there isn't. Owns its own dismiss timer so
// callers never need to run a duplicate one alongside it.
//
// Reads the v2 room from context rather than the Material tokens it started
// on: every screen that shows a toast is a v2 screen standing inside a <Room>,
// so a Material pill floating over the green room (or the navy one, or the
// night layer) was the one piece that never followed the rest.
import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useV2Theme } from '../../theme/v2';

export function Snackbar({
  message,
  actionLabel,
  onAction,
  onDismiss,
  duration = 4000,
}: {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss: () => void;
  duration?: number;
}) {
  const { c, font, radius, shadow, fs } = useV2Theme();

  // Deliberately only depends on `duration`, not `onDismiss`/`onAction`: those
  // props are recreated as new closures on every parent re-render (e.g. any
  // of useContactDetailData's live Firestore listeners firing), and this
  // effect re-running on every one of those would keep resetting the
  // countdown — the toast could end up never auto-dismissing.
  useEffect(() => {
    const timer = setTimeout(onDismiss, duration);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duration]);

  return (
    <Animated.View
      entering={FadeInDown}
      exiting={FadeOutDown}
      style={[
        {
          position: 'absolute',
          left: 16,
          right: 16,
          bottom: 24,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          backgroundColor: c.inverse,
          borderRadius: radius.note,
          paddingVertical: 12,
          paddingHorizontal: 16,
        },
        shadow.fab,
      ]}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: font.semi, fontSize: fs(13.5), color: c.onInverse }}>{message}</Text>
      </View>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={{ fontFamily: font.bold, fontSize: fs(13), color: c.onInverse }}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </Animated.View>
  );
}
