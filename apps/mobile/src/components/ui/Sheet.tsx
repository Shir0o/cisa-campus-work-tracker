// Shared bottom-sheet chrome — replaces the hand-rolled Modal+scrim+panel
// pattern every sheet file used to copy-paste. Keeps the same declarative
// `visible`/`onClose` API every caller already used with plain Modal, so no
// caller needed to change.
import { useCallback, useEffect, useMemo, useRef, type ElementRef } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BottomSheetBackdrop,
  BottomSheetFooter,
  BottomSheetModal,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
  type BottomSheetFooterProps,
} from '@gorhom/bottom-sheet';
import { useTheme } from '../../theme/ThemeProvider';

export function Sheet({
  visible,
  onClose,
  children,
  maxHeightRatio,
  footer,
}: {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Sheet height as a ratio of window height, e.g. 0.85 for the old `maxHeight: '85%'`. Defaults to 0.5. */
  maxHeightRatio?: number;
  /** Rendered pinned to the bottom, above the keyboard — for an action row that used to sit outside the old ScrollView. */
  footer?: React.ReactNode;
}) {
  const { colors, radius } = useTheme();
  const insets = useSafeAreaInsets();
  // enableDynamicSizing (the library default) has a widely-reported bug where
  // the sheet mounts with real content/height but never animates open —
  // https://github.com/gorhom/react-native-bottom-sheet/issues/1751. Explicit
  // snapPoints + enableDynamicSizing={false} is the confirmed-working fix.
  const snapPoints = useMemo(() => [`${Math.round((maxHeightRatio ?? 0.5) * 100)}%`], [maxHeightRatio]);
  const ref = useRef<ElementRef<typeof BottomSheetModal>>(null);
  const everPresented = useRef(false);

  useEffect(() => {
    if (visible) {
      everPresented.current = true;
      ref.current?.present();
    } else if (everPresented.current) {
      ref.current?.dismiss();
    }
  }, [visible]);

  // Stable identities so the backdrop/footer only remount when what they
  // actually depend on changes, not on every unrelated Sheet re-render.
  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.35} pressBehavior="close" />
    ),
    [],
  );
  const renderFooter = useCallback(
    (props: BottomSheetFooterProps) => (
      <BottomSheetFooter {...props} bottomInset={insets.bottom}>
        {footer}
      </BottomSheetFooter>
    ),
    [footer, insets.bottom],
  );

  return (
    <BottomSheetModal
      ref={ref}
      onDismiss={onClose}
      snapPoints={snapPoints}
      enableDynamicSizing={false}
      backgroundStyle={{
        backgroundColor: colors.surface,
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
        contentContainerStyle={footer ? { paddingBottom: 90 } : undefined}
      >
        {children}
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}
