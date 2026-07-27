// Shared bottom-sheet chrome — replaces the hand-rolled Modal+scrim+panel
// pattern every sheet file used to copy-paste. Keeps the same declarative
// `visible`/`onClose` API every caller already used with plain Modal, so no
// caller needed to change.
import { useCallback, useEffect, useMemo, useRef, useState, type ElementRef } from 'react';
import { Platform, Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Extrapolation, interpolate, useAnimatedStyle } from 'react-native-reanimated';
import {
  BottomSheetFooter,
  BottomSheetModal,
  BottomSheetScrollView,
  useBottomSheetTimingConfigs,
  type BottomSheetBackdropProps,
  type BottomSheetFooterProps,
} from '@gorhom/bottom-sheet';
import { useTheme } from '../../theme/ThemeProvider';

// The library's own BottomSheetBackdrop only flips pointer-events to 'none' once its
// Reanimated-driven close animation crosses a threshold index — on web that animation is
// driven entirely by requestAnimationFrame, which can stall indefinitely (a backgrounded
// tab, a slow device) and never complete. When that happens the backdrop is left mid-fade
// with pointer-events stuck 'auto': a full-viewport, barely-visible layer that silently
// swallows every click behind it. This backdrop instead gates hit-testing on the `visible`
// prop directly — a plain React state flip that never depends on an animation finishing.
// The animated fade is purely decorative (`pointerEvents="none"`), so it's harmless if it
// never settles.
function SheetBackdrop({
  animatedIndex,
  visible,
  onClose,
}: BottomSheetBackdropProps & { visible: boolean; onClose: () => void }) {
  const fadeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(animatedIndex.value, [-1, 0], [0, 0.35], Extrapolation.CLAMP),
  }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={visible ? 'auto' : 'none'}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }, fadeStyle]} pointerEvents="none" />
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Bottom sheet backdrop"
        accessibilityHint="Tap to close the bottom sheet"
      />
    </View>
  );
}

export function Sheet({
  visible,
  onClose,
  children,
  maxHeightRatio,
  footer,
  backgroundColor,
}: {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Sheet height as a ratio of window height, e.g. 0.85 for the old `maxHeight: '85%'`. Defaults to 0.85. */
  maxHeightRatio?: number;
  /** Rendered pinned to the bottom, above the keyboard — for an action row that used to sit outside the old ScrollView. */
  footer?: React.ReactNode;
  /** Overrides the sheet's surface. Mobile v2 screens are on their own palette
   * (src/theme/v2.ts) and would otherwise show a Material surface behind their
   * rounded top. Defaults to the theme's `surface`. */
  backgroundColor?: string;
}) {
  const { colors, radius } = useTheme();
  const insets = useSafeAreaInsets();
  // enableDynamicSizing (the library default) has a widely-reported bug where
  // the sheet mounts with real content/height but never animates open —
  // https://github.com/gorhom/react-native-bottom-sheet/issues/1751. Explicit
  // snapPoints + enableDynamicSizing={false} is the confirmed-working fix.
  const snapPoints = useMemo(() => [`${Math.round((maxHeightRatio ?? 0.85) * 100)}%`], [maxHeightRatio]);
  // The library's default open/close animation is a spring, driven on web by Reanimated's
  // requestAnimationFrame-based driver. That driver can stall before reaching its rest
  // threshold (e.g. while the tab is backgrounded) and never fires again, leaving the sheet's
  // index — and the backdrop's pointer-events, which only flip to 'none' once the index
  // crosses -1 — stuck mid-close forever, blocking clicks under a barely-visible backdrop.
  // A duration-bound timing animation always reaches its end value, so force it on web only;
  // native (already reliable — the animation runs on the UI thread) keeps the spring feel.
  const timingConfigs = useBottomSheetTimingConfigs({});
  const animationConfigs = Platform.OS === 'web' ? timingConfigs : undefined;
  const ref = useRef<ElementRef<typeof BottomSheetModal>>(null);
  const everPresented = useRef(false);
  // Measured so the scroll content's bottom padding always clears the footer,
  // instead of a hardcoded guess that drifts if a footer's content changes.
  const [footerHeight, setFooterHeight] = useState(0);
  const onFooterLayout = useCallback((e: LayoutChangeEvent) => setFooterHeight(e.nativeEvent.layout.height), []);

  // `present()` is silently DROPPED when it lands in the same commit the modal
  // mounted in — the ref is already live, but BottomSheetModal has not finished
  // registering itself with the root provider, so the call goes nowhere and, as
  // `visible` never transitions again, nothing retries. That happens whenever a
  // sheet is keyed by the person it's about (the queue's and the full-timer
  // home's log/note sheets all are): changing that person REMOUNTS the sheet in
  // the same render that opens it, and it never appears. One macrotask later
  // the registration is done and the call takes. setTimeout, not
  // requestAnimationFrame — rAF never fires while the tab is backgrounded,
  // which is the same stall the backdrop above is written to survive.
  useEffect(() => {
    if (visible) {
      const t = setTimeout(() => {
        everPresented.current = true;
        ref.current?.present();
      }, 0);
      return () => clearTimeout(t);
    }
    if (everPresented.current) ref.current?.dismiss();
    return undefined;
  }, [visible]);

  // Stable identities so the backdrop/footer only remount when what they
  // actually depend on changes, not on every unrelated Sheet re-render.
  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => <SheetBackdrop {...props} visible={visible} onClose={onClose} />,
    [visible, onClose],
  );
  const renderFooter = useCallback(
    (props: BottomSheetFooterProps) => (
      <BottomSheetFooter {...props} bottomInset={insets.bottom}>
        <View onLayout={onFooterLayout}>{footer}</View>
      </BottomSheetFooter>
    ),
    [footer, insets.bottom, onFooterLayout],
  );

  return (
    <BottomSheetModal
      ref={ref}
      onDismiss={onClose}
      snapPoints={snapPoints}
      enableDynamicSizing={false}
      animationConfigs={animationConfigs}
      backgroundStyle={{
        backgroundColor: backgroundColor ?? colors.surface,
        borderTopLeftRadius: radius.lg,
        borderTopRightRadius: radius.lg,
      }}
      handleIndicatorStyle={{ width: 40, height: 4, backgroundColor: colors.outline, opacity: 0.4 }}
      backdropComponent={renderBackdrop}
      footerComponent={footer ? renderFooter : undefined}
    >
      {/*
        Plain BottomSheetScrollView + regular TextInput/InlineInput for fields
        (not BottomSheetTextInput) — BottomSheetTextInput calls RN's native-only
        TextInput.State.currentlyFocusedInput() on blur, which react-native-web
        doesn't implement and throws. Regular TextInput works fine here on both
        web and native.
      */}
      <BottomSheetScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={footer ? { paddingBottom: footerHeight + 24 } : undefined}
      >
        {children}
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}
