// ui primitives tests — the themed building blocks in components/ui/index.tsx.
// All read colors/type from ThemeProvider context, so every render sits inside
// the real ThemeProvider (with useAuth stubbed, the way the app mounts it).
// Assertions stay behavioral: what renders, what fires on press/type/focus —
// not style values, which would just restate the component.
import React from 'react';
import { Text } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { AppText, Button, Card, Chip, InlineInput, Screen } from './index';

jest.mock('../../lib/AuthProvider', () => ({
  useAuth: () => ({ uid: undefined, user: null, role: null }),
}));

const renderUI = (el: React.ReactElement) => render(<ThemeProvider>{el}</ThemeProvider>);

describe('Screen', () => {
  it('renders its children', () => {
    const { getByText } = renderUI(
      <Screen>
        <Text>Hello screen</Text>
      </Screen>,
    );
    expect(getByText('Hello screen')).toBeTruthy();
  });
});

describe('AppText', () => {
  it('renders its children with the default body variant', () => {
    const { getByText } = renderUI(<AppText>Some words</AppText>);
    expect(getByText('Some words')).toBeTruthy();
  });

  it('passes numberOfLines through and honours a custom color', () => {
    const { getByText } = renderUI(
      <AppText numberOfLines={2} color="#ff0000">
        Truncated
      </AppText>,
    );
    expect(getByText('Truncated').props.numberOfLines).toBe(2);
    expect(getByText('Truncated').props.style).toContainEqual(expect.objectContaining({ color: '#ff0000' }));
  });
});

describe('Button', () => {
  it('renders the title and fires onPress', () => {
    const onPress = jest.fn();
    const { getByText } = renderUI(<Button title="Save" onPress={onPress} />);

    fireEvent.press(getByText('Save'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not fire onPress while disabled', () => {
    const onPress = jest.fn();
    const { getByText } = renderUI(<Button title="Save" onPress={onPress} disabled />);

    fireEvent.press(getByText('Save'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('renders without an onPress handler', () => {
    const { getByText } = renderUI(<Button title="Inert" />);
    expect(getByText('Inert')).toBeTruthy();
  });
});

describe('Card', () => {
  it('renders children as a plain view when there is no onPress', () => {
    const { getByText } = renderUI(
      <Card>
        <Text>Body</Text>
      </Card>,
    );
    expect(getByText('Body')).toBeTruthy();
  });

  it('fires onPress when one is given', () => {
    const onPress = jest.fn();
    const { getByText } = renderUI(
      <Card onPress={onPress}>
        <Text>Tappable</Text>
      </Card>,
    );

    fireEvent.press(getByText('Tappable'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('Chip', () => {
  it('renders its label', () => {
    const { getByText } = renderUI(<Chip label="Follow up" />);
    expect(getByText('Follow up')).toBeTruthy();
  });
});

describe('InlineInput', () => {
  it('renders a text input and forwards typed text', () => {
    const onChangeText = jest.fn();
    const { getByPlaceholderText } = renderUI(
      <InlineInput placeholder="Add a task" onChangeText={onChangeText} />,
    );

    fireEvent.changeText(getByPlaceholderText('Add a task'), 'Call Dana');
    expect(onChangeText).toHaveBeenCalledWith('Call Dana');
  });

  it('still calls the caller’s onFocus/onBlur alongside its focus styling', () => {
    const onFocus = jest.fn();
    const onBlur = jest.fn();
    const { getByPlaceholderText } = renderUI(
      <InlineInput placeholder="Notes" onFocus={onFocus} onBlur={onBlur} />,
    );
    const input = getByPlaceholderText('Notes');

    fireEvent(input, 'focus');
    expect(onFocus).toHaveBeenCalledTimes(1);

    fireEvent(input, 'blur');
    expect(onBlur).toHaveBeenCalledTimes(1);
  });
});
