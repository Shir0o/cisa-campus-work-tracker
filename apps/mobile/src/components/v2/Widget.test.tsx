// Widget tests — the v2 shell and its pieces (Widget.tsx), through their public
// seams: what renders, and what fires on press/type. Everything reads the v2
// palette from context, so renders sit inside the real ThemeProvider (room and
// tint default to the trainee's green room, which is all these pieces need).
import React from 'react';
import { Text } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider } from '../../theme/ThemeProvider';
import {
  Sech,
  V2Empty,
  V2Hint,
  V2Input,
  V2PersonRow,
  V2RowCard,
  V2Screen,
  V2Seg,
  V2TextArea,
  Widget,
  WidgetAction,
  WidgetEmpty,
  WidgetRow,
} from './Widget';

jest.mock('../../lib/AuthProvider', () => ({
  useAuth: () => ({ uid: undefined, user: null, role: null }),
}));

const renderV2 = (el: React.ReactElement) => render(<ThemeProvider>{el}</ThemeProvider>);

describe('Sech', () => {
  it('renders the label, the count only when positive, and fires the link', () => {
    const onLink = jest.fn();
    const { getByText, queryByText, rerender } = renderV2(
      <Sech label="Prayers" count={3} link="See all" onLink={onLink} />,
    );
    expect(getByText('Prayers')).toBeTruthy();
    expect(getByText('3')).toBeTruthy();

    fireEvent.press(getByText('See all'));
    expect(onLink).toHaveBeenCalledTimes(1);

    rerender(
      <ThemeProvider>
        <Sech label="Prayers" count={0} />
      </ThemeProvider>,
    );
    expect(queryByText('0')).toBeNull();
  });
});

describe('Widget / WidgetRow / WidgetAction', () => {
  it('renders its label and children', () => {
    const { getByText } = renderV2(
      <Widget label="Notes">
        <Text>row content</Text>
      </Widget>,
    );
    expect(getByText('Notes')).toBeTruthy();
    expect(getByText('row content')).toBeTruthy();
  });

  it('WidgetRow renders its children', () => {
    const { getByText } = renderV2(
      <WidgetRow first>
        <Text>inside a row</Text>
      </WidgetRow>,
    );
    expect(getByText('inside a row')).toBeTruthy();
  });

  it('WidgetAction fires onPress', () => {
    const onPress = jest.fn();
    const { getByText } = renderV2(<WidgetAction label="Log it" onPress={onPress} />);
    fireEvent.press(getByText('Log it'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('V2Screen', () => {
  it('renders the title, the back button, and fires onBack', () => {
    const onBack = jest.fn();
    const { getByText } = renderV2(
      <V2Screen title="Prayer log" onBack={onBack}>
        <Text>body</Text>
      </V2Screen>,
    );

    expect(getByText('Prayer log')).toBeTruthy();
    expect(getByText('body')).toBeTruthy();
    fireEvent.press(getByText('← Back'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('renders no back button without onBack, and an action instead of a note', () => {
    const onAction = jest.fn();
    const { getByText, queryByText } = renderV2(
      <V2Screen title="People" action={{ label: 'Add', onPress: onAction }} note="hidden">
        <Text>body</Text>
      </V2Screen>,
    );

    expect(queryByText('← Back')).toBeNull();
    expect(queryByText('hidden')).toBeNull();
    fireEvent.press(getByText('Add'));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('shows a note when there is no action', () => {
    const { getByText } = renderV2(
      <V2Screen title="People" note="quiet note">
        <Text>body</Text>
      </V2Screen>,
    );
    expect(getByText('quiet note')).toBeTruthy();
  });
});

describe('V2RowCard', () => {
  it('renders children and fires the action when given', () => {
    const onAction = jest.fn();
    const { getByText, queryByText } = renderV2(
      <V2RowCard action="Move a step" onAction={onAction}>
        <Text>row</Text>
      </V2RowCard>,
    );

    expect(getByText('row')).toBeTruthy();
    fireEvent.press(getByText('Move a step'));
    expect(onAction).toHaveBeenCalledTimes(1);

    const noAction = renderV2(
      <V2RowCard>
        <Text>row</Text>
      </V2RowCard>,
    );
    expect(noAction.queryByText('Move a step')).toBeNull();
  });
});

describe('V2Input / V2TextArea', () => {
  it('forwards typed text and the placeholder', () => {
    const onChangeText = jest.fn();
    const { getByPlaceholderText } = renderV2(
      <V2Input value="Alex" onChangeText={onChangeText} placeholder="Your name" />,
    );

    fireEvent.changeText(getByPlaceholderText('Your name'), 'Rio');
    expect(onChangeText).toHaveBeenCalledWith('Rio');
    expect(getByPlaceholderText('Your name').props.value).toBe('Alex');
  });

  it('V2TextArea forwards typed text', () => {
    const onChangeText = jest.fn();
    const { getByPlaceholderText } = renderV2(
      <V2TextArea value="" onChangeText={onChangeText} placeholder="What's on your heart?" />,
    );

    fireEvent.changeText(getByPlaceholderText("What's on your heart?"), 'words');
    expect(onChangeText).toHaveBeenCalledWith('words');
  });
});

describe('V2Seg', () => {
  it('renders each item, marks the selected one, and fires onChange', () => {
    const onChange = jest.fn();
    const { getByText } = renderV2(
      <V2Seg
        value="prayers"
        onChange={onChange}
        items={[
          { id: 'story', label: 'Story' },
          { id: 'prayers', label: 'Prayers', count: 2 },
          { id: 'alongside', label: 'Alongside' },
        ]}
      />,
    );

    fireEvent.press(getByText('Prayers'));
    expect(onChange).toHaveBeenCalledWith('prayers');
    expect(getByText('2')).toBeTruthy();
  });
});

describe('V2PersonRow', () => {
  it('renders name, initials, sub and rightText, and fires onPress', () => {
    const onPress = jest.fn();
    const { getByText } = renderV2(
      <V2PersonRow name="Rio Alvarez" colorSeed="c1" sub="Sophomore" rightText="Alongside" onPress={onPress} />,
    );

    expect(getByText('Rio Alvarez')).toBeTruthy();
    expect(getByText('RA')).toBeTruthy();
    expect(getByText('Sophomore')).toBeTruthy();
    expect(getByText('Alongside')).toBeTruthy();

    fireEvent.press(getByText('Rio Alvarez'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('stays quiet when there is no onPress', () => {
    const onPress = jest.fn();
    const { getByText } = renderV2(<V2PersonRow name="Rio Alvarez" colorSeed="c1" onPress={undefined} />);

    fireEvent.press(getByText('Rio Alvarez'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('renders a note and right element alongside the name', () => {
    const { getByText } = renderV2(
      <V2PersonRow name="Rio Alvarez" colorSeed="c1" note="Follow up this week" rightText="Fri" />,
    );
    expect(getByText('Follow up this week')).toBeTruthy();
    expect(getByText('Fri')).toBeTruthy();
  });
});

describe('empty states and hints', () => {
  it('V2Empty, V2Hint and WidgetEmpty render their text', () => {
    const { getByText } = renderV2(
      <>
        <V2Empty>Nothing here</V2Empty>
        <V2Hint>a hint</V2Hint>
        <WidgetEmpty>Nothing due today.</WidgetEmpty>
      </>,
    );
    expect(getByText('Nothing here')).toBeTruthy();
    expect(getByText('a hint')).toBeTruthy();
    expect(getByText('Nothing due today.')).toBeTruthy();
  });
});
