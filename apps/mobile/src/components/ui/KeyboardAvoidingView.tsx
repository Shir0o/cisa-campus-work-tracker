// Shared keyboard-avoiding wrapper. Use this instead of React Native's
// KeyboardAvoidingView so the Android behavior is consistent across screens.
//
// Under Android edge-to-edge (Expo SDK 54 / RN 0.81 / API 36) the Activity no
// longer resizes its window for the soft keyboard, so the `undefined` behavior
// the mobile screens used to pass on Android is now a no-op: bottom-pinned
// inputs stay put and the keyboard covers them. RN's `padding` behavior reads
// the keyboard's on-screen position from the native keyboard events and offsets
// the view, which still works under edge-to-edge.
import {
  KeyboardAvoidingView as RNKeyboardAvoidingView,
  Platform,
  type KeyboardAvoidingViewProps,
} from 'react-native';

export type KeyboardAvoidingBehavior = KeyboardAvoidingViewProps['behavior'];

/** Android always gets a real `padding` behavior; iOS keeps what its caller
 *  passed (already `padding`) and react-native-web ignores `behavior` entirely,
 *  so it stays a plain view there — matching the previous behavior. */
export function resolveKeyboardAvoidingBehavior(
  platformOS: string,
  callerBehavior: KeyboardAvoidingBehavior,
): KeyboardAvoidingBehavior {
  return platformOS === 'android' ? 'padding' : callerBehavior;
}

export function KeyboardAvoidingView({ behavior, ...props }: KeyboardAvoidingViewProps) {
  return (
    <RNKeyboardAvoidingView
      {...props}
      behavior={resolveKeyboardAvoidingBehavior(Platform.OS, behavior)}
    />
  );
}
