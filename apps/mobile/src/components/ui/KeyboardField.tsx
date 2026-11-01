// One rule for every field on a phone: the keyboard never covers the field you
// are typing in, and a growing field stops growing once it stops fitting.
//
// Android gives us neither for free under edge-to-edge (Expo SDK 54 / RN 0.81 /
// API 36), so this file holds both halves:
//
//   1. A ceiling — `MULTILINE_FIELD_MAX_HEIGHT` — so a paragraph scrolls inside
//      the field instead of pushing the caret (and the Save row under it) below
//      the keyboard. A bounded native input keeps its own caret visible; an
//      unbounded one has nowhere to scroll to.
//   2. A reveal — when a field takes focus, or when the keyboard opens over one,
//      the scroll view that owns it scrolls just far enough to leave the whole
//      field and a little air above the keyboard.
//
// The reveal lives in the shells that own a scroll view (`Sheet`, `MemberScreen`,
// the contact and chat screens) rather than in each screen, so a screen can't
// quietly opt out. A field that uses `BufferedTextInput` also asks for a reveal
// itself on focus, which covers moving between fields while the keyboard is
// already up — no `keyboardDidShow` fires then.
import { createContext, forwardRef, useCallback, useContext, useEffect, useRef } from 'react';
import {
  Dimensions,
  Keyboard,
  Platform,
  ScrollView,
  TextInput,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewProps,
} from 'react-native';

/** The tallest a growing field may get before it scrolls its own text instead.
 *  One number for the whole app: the Log sheet's account of a conversation, a
 *  Thread reply and a feedback note all stop at the same place. */
export const MULTILINE_FIELD_MAX_HEIGHT = 160;

/** The air left between a revealed field and the keyboard. */
export const FIELD_REVEAL_MARGIN = 12;

/** The part of a native view the reveal needs. Structural, so a `TextInput`
 *  ref, a `ScrollView` ref and a test double all satisfy it. */
export interface Revealable {
  measureInWindow?: (callback: (x: number, y: number, width: number, height: number) => void) => void;
}

export interface ScrollHandle extends Revealable {
  scrollTo?: (options: { y?: number; animated?: boolean }) => void;
}

export type FieldReveal = (field?: Revealable | null) => void;

/**
 * How far the container must scroll so the field clears the keyboard.
 *
 * The visible bottom is whichever comes first: the scroll view's own bottom
 * edge (already shortened by the keyboard-avoiding wrapper) or the keyboard's
 * top edge. Taking the lower of the two means the answer is right in the frame
 * before the wrapper has applied its padding as well as after it, so the
 * reveal does not depend on which one lands first.
 */
export function revealOverflow({
  fieldTop,
  fieldHeight,
  viewportTop,
  viewportHeight,
  keyboardTop,
  margin = FIELD_REVEAL_MARGIN,
}: {
  fieldTop: number;
  fieldHeight: number;
  viewportTop: number;
  viewportHeight: number;
  keyboardTop: number;
  margin?: number;
}): number {
  const visibleBottom = Math.min(viewportTop + viewportHeight, keyboardTop);
  return Math.max(0, Math.round(fieldTop + fieldHeight + margin - visibleBottom));
}

const FieldRevealContext = createContext<FieldReveal | null>(null);

/** The reveal a shell handed down, or null outside one (web, plain views). */
export function useFieldReveal(): FieldReveal | null {
  return useContext(FieldRevealContext);
}

export const FieldRevealProvider = FieldRevealContext.Provider;

/** The input the OS is typing into, when the platform can say. */
function focusedField(): Revealable | null {
  if (Platform.OS === 'web') return null;
  return (TextInput.State.currentlyFocusedInput() as unknown as Revealable | null) ?? null;
}

/**
 * Wires a scroll view to the rule: returns the `reveal` a shell provides to its
 * fields, and an `onScroll` the shell must attach so the next reveal knows where
 * the scroll view already is (the scroll delta is relative, not absolute).
 */
export function useFieldRevealScroll(scrollRef: React.RefObject<unknown>): {
  reveal: FieldReveal;
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
} {
  const offset = useRef(0);

  const reveal = useCallback<FieldReveal>(
    (field) => {
      // The browser scrolls a focused field into view itself; there is no
      // soft keyboard here to measure.
      if (Platform.OS === 'web') return;
      const target = field ?? focusedField();
      const scroll = scrollRef.current as ScrollHandle | null;
      if (!target?.measureInWindow || !scroll?.scrollTo) return;

      target.measureInWindow((_x, fieldTop, _width, fieldHeight) => {
        const revealIn = (viewportTop: number, viewportHeight: number) => {
          const metrics = Keyboard.metrics();
          const keyboardTop = metrics
            ? Dimensions.get('window').height - metrics.height
            : viewportTop + viewportHeight;
          const overflow = revealOverflow({ fieldTop, fieldHeight, viewportTop, viewportHeight, keyboardTop });
          if (overflow > 0) scroll.scrollTo!({ y: offset.current + overflow, animated: true });
        };

        // A sheet's scroll view is a library ref, so measure it when it can be
        // measured and otherwise let the keyboard alone decide — the container's
        // own bottom rarely matters inside a sheet.
        if (scroll.measureInWindow) scroll.measureInWindow((_scrollX, top, _scrollWidth, height) => revealIn(top, height));
        else revealIn(0, Dimensions.get('window').height);
      });
    },
    [scrollRef],
  );

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    offset.current = event.nativeEvent.contentOffset.y;
  }, []);

  // Opening the keyboard moves the ground under whatever has focus; the field
  // itself can't know, and on Android nothing scrolls on its own.
  useEffect(() => {
    if (Platform.OS === 'web') return undefined;
    const subscription = Keyboard.addListener('keyboardDidShow', () => reveal());
    return () => subscription.remove();
  }, [reveal]);

  return { reveal, onScroll };
}

/**
 * A `ScrollView` that follows the rule, for screens that own their own scroll.
 * The shell provides the reveal to everything inside it, so fields need no
 * knowledge of the screen they sit in.
 */
export const KeyboardScrollView = forwardRef<ScrollView, ScrollViewProps>(function KeyboardScrollView(
  { onScroll, scrollEventThrottle, children, ...rest },
  ref,
) {
  const inner = useRef<unknown>(null);
  const { reveal, onScroll: trackOffset } = useFieldRevealScroll(inner);

  const assignRef = useCallback(
    (node: ScrollView | null) => {
      inner.current = node;
      if (typeof ref === 'function') ref(node);
      else if (ref) (ref as { current: ScrollView | null }).current = node;
    },
    [ref],
  );

  return (
    <FieldRevealProvider value={reveal}>
      <ScrollView
        {...rest}
        ref={assignRef}
        scrollEventThrottle={scrollEventThrottle ?? 16}
        onScroll={(event) => {
          trackOffset(event);
          onScroll?.(event);
        }}
      >
        {children}
      </ScrollView>
    </FieldRevealProvider>
  );
});
