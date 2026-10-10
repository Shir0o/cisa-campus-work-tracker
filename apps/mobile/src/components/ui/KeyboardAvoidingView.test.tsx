// Pins the platform seam this wrapper exists for: under Android edge-to-edge
// (Expo SDK 54 / RN 0.81 / API 36) the window no longer resizes for the soft
// keyboard, so a no-op `behavior` leaves bottom-pinned inputs covered. The
// wrapper must hand RN's KeyboardAvoidingView a real Android behavior; iOS and
// react-native-web keep their existing behavior (web ignores it entirely).
import React from 'react';
import { Text } from 'react-native';
import { render } from '@testing-library/react-native';
import { KeyboardAvoidingView, resolveKeyboardAvoidingBehavior } from './KeyboardAvoidingView';

describe('resolveKeyboardAvoidingBehavior', () => {
  it('passes a non-no-op Android behavior so the keyboard offsets the content', () => {
    expect(resolveKeyboardAvoidingBehavior('android', undefined)).toBe('padding');
    expect(resolveKeyboardAvoidingBehavior('android', 'padding')).toBe('padding');
  });

  it('keeps iOS on the padding behavior it already used', () => {
    expect(resolveKeyboardAvoidingBehavior('ios', 'padding')).toBe('padding');
  });

  it('does not add a behavior on web, where KeyboardAvoidingView is inert', () => {
    expect(resolveKeyboardAvoidingBehavior('web', undefined)).toBeUndefined();
  });
});

describe('KeyboardAvoidingView', () => {
  it('renders its children', async () => {
    const { getByText } = await render(
      <KeyboardAvoidingView style={{ flex: 1 }}>
        <Text>Composer</Text>
      </KeyboardAvoidingView>,
    );
    expect(getByText('Composer')).toBeTruthy();
  });
});
