// A bottom-anchored, auto-dismissing toast with an optional action (e.g.
// "Undo") — the app's first Snackbar; no prior component to mirror. Fully
// controlled: mount it when there's something to say, unmount it when
// there isn't. Owns its own dismiss timer so callers never need to run a
// duplicate one alongside it.
import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useTheme } from '../../theme/ThemeProvider';

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
  const { colors, radius, spacing } = useTheme();

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
      style={{
        position: 'absolute',
        left: spacing.md,
        right: spacing.md,
        bottom: spacing.lg,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.md,
        backgroundColor: colors.onSurface,
        borderRadius: radius.md,
        paddingVertical: 12,
        paddingHorizontal: 16,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 13.5, color: colors.surface }}>{message}</Text>
      </View>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: colors.surface }}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </Animated.View>
  );
}
