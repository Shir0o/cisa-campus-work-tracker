// ui primitives tests — the themed building blocks in components/ui/index.tsx.
// All read colors/type from ThemeProvider context, so every render sits inside
// the real ThemeProvider (with useAuth stubbed, the way the app mounts it).
// Assertions stay behavioral: what renders, what fires on press/type/focus —
// not style values, which would just restate the component.
import React from 'react';
import { Text } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { AppText, Button, Card, Chip, InlineInput, Screen } from './index';

jest.mock('../../lib/AuthProvider', () => ({
  useAuth: () => ({ uid: undefined, user: null, role: null }),
}));

const renderUI = async (el: React.ReactElement) => await render(<ThemeProvider>{el}</ThemeProvider>);

describe('Screen', () => {
  it('renders its children', async () => {
    const { getByText } = await renderUI(
      <Screen>
        <Text>Hello screen</Text>
      </Screen>,
    );
    expect(getByText('Hello screen')).toBeTruthy();
  });

  // Regression: under Android edge-to-edge the system navigation bar draws
  // over the bottom of the screen, so a screen that omits the bottom safe-area
  // edge lets its bottom content (e.g. the sign-up "Send it" button) sit
  // behind the nav bar and become barely tappable. The library default is ALL
  // edges; Screen must not drop 'bottom' the way it deliberately drops 'top'
  // for the impersonation strip (see SafeArea.tsx).
  it('keeps the bottom safe-area edge by default', async () => {
    const tree = await render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 320, height: 640 },
          insets: { top: 0, right: 0, bottom: 48, left: 0 },
        }}
      >
        <ThemeProvider>
          <Screen>
            <Text>Edge</Text>
          </Screen>
        </ThemeProvider>
      </SafeAreaProvider>,
    );

    const safeArea = tree.toJSON();
    // RNCSafeAreaView resolves `edges` to per-edge modes; bottom must be
    // additive so the nav-bar inset pads the screen.
    expect((safeArea as { props: { edges: Record<string, string> } }).props.edges.bottom).not.toBe('off');
  });
});

describe('AppText', () => {
  it('renders its children with the default body variant', async () => {
    const { getByText } = await renderUI(<AppText>Some words</AppText>);
    expect(getByText('Some words')).toBeTruthy();
  });

  it('passes numberOfLines through and honours a custom color', async () => {
    const { getByText } = await renderUI(
      <AppText numberOfLines={2} color="#ff0000">
        Truncated
      </AppText>,
    );
    expect(getByText('Truncated').props.numberOfLines).toBe(2);
    expect(getByText('Truncated').props.style).toContainEqual(expect.objectContaining({ color: '#ff0000' }));
  });
});

describe('Button', () => {
  it('renders the title and fires onPress', async () => {
    const onPress = jest.fn();
    const { getByText } = await renderUI(<Button title="Save" onPress={onPress} />);

    await fireEvent.press(getByText('Save'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not fire onPress while disabled', async () => {
    const onPress = jest.fn();
    const { getByText } = await renderUI(<Button title="Save" onPress={onPress} disabled />);

    await fireEvent.press(getByText('Save'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('renders without an onPress handler', async () => {
    const { getByText } = await renderUI(<Button title="Inert" />);
    expect(getByText('Inert')).toBeTruthy();
  });
});

describe('Card', () => {
  it('renders children as a plain view when there is no onPress', async () => {
    const { getByText } = await renderUI(
      <Card>
        <Text>Body</Text>
      </Card>,
    );
    expect(getByText('Body')).toBeTruthy();
  });

  it('fires onPress when one is given', async () => {
    const onPress = jest.fn();
    const { getByText } = await renderUI(
      <Card onPress={onPress}>
        <Text>Tappable</Text>
      </Card>,
    );

    await fireEvent.press(getByText('Tappable'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('Chip', () => {
  it('renders its label', async () => {
    const { getByText } = await renderUI(<Chip label="Follow up" />);
    expect(getByText('Follow up')).toBeTruthy();
  });
});

describe('InlineInput', () => {
  it('renders a text input and forwards typed text', async () => {
    const onChangeText = jest.fn();
    const { getByPlaceholderText } = await renderUI(
      <InlineInput placeholder="Add a task" onChangeText={onChangeText} />,
    );

    await fireEvent.changeText(getByPlaceholderText('Add a task'), 'Call Dana');
    expect(onChangeText).toHaveBeenCalledWith('Call Dana');
  });

  it('still calls the caller’s onFocus/onBlur alongside its focus styling', async () => {
    const onFocus = jest.fn();
    const onBlur = jest.fn();
    const { getByPlaceholderText } = await renderUI(
      <InlineInput placeholder="Notes" onFocus={onFocus} onBlur={onBlur} />,
    );
    const input = getByPlaceholderText('Notes');

    await fireEvent(input, 'focus');
    expect(onFocus).toHaveBeenCalledTimes(1);

    await fireEvent(input, 'blur');
    expect(onBlur).toHaveBeenCalledTimes(1);
  });
});
