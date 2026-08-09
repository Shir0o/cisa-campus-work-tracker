// atoms tests — the small pieces every v2 focus card is built from
// (components/queue/atoms.tsx). Behavioral seams: what renders, what fires on
// press, and the optional bits that change what shows (ago on a ToneBadge, sub
// on a WhoBlock, detail on an AboutChip, a mine-highlighted reaction).
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider } from '../../theme/ThemeProvider';
import {
  AboutChip,
  Ask,
  Kicker,
  LaterButton,
  Lead,
  NoteBlock,
  PersonMark,
  PrimaryButton,
  Quote,
  Reactions,
  Said,
  SecondaryButton,
  ToneBadge,
  WhoBlock,
  Why,
} from './atoms';

jest.mock('../../lib/AuthProvider', () => ({
  useAuth: () => ({ uid: undefined, user: null, role: null }),
}));

const renderV2 = (el: React.ReactElement) => render(<ThemeProvider>{el}</ThemeProvider>);

describe('ToneBadge', () => {
  it('renders the label, and the ago line only when given', () => {
    const { getByText, queryByText, rerender } = renderV2(
      <ToneBadge tone="follow" label="Follow up" ago="due tomorrow" />,
    );
    expect(getByText('Follow up')).toBeTruthy();
    expect(getByText('due tomorrow')).toBeTruthy();

    rerender(
      <ThemeProvider>
        <ToneBadge tone="follow" label="Follow up" />
      </ThemeProvider>,
    );
    expect(queryByText('due tomorrow')).toBeNull();
  });
});

describe('PersonMark', () => {
  it('shows the person’s initials', () => {
    const { getByText } = renderV2(<PersonMark name="Rio Alvarez" />);
    expect(getByText('RA')).toBeTruthy();
  });
});

describe('WhoBlock', () => {
  it('renders the name, and the sub line only when given', () => {
    const { getByText, queryByText, rerender } = renderV2(
      <WhoBlock name="Rio Alvarez" sub="Sophomore · Biology" />,
    );
    expect(getByText('Rio Alvarez')).toBeTruthy();
    expect(getByText('Sophomore · Biology')).toBeTruthy();

    rerender(
      <ThemeProvider>
        <WhoBlock name="Rio Alvarez" />
      </ThemeProvider>,
    );
    expect(queryByText('Sophomore · Biology')).toBeNull();
  });
});

describe('NoteBlock', () => {
  it('renders the label and the note', () => {
    const { getByText } = renderV2(<NoteBlock label="What you wrote down">Call Dana re: Thursday</NoteBlock>);
    expect(getByText('What you wrote down')).toBeTruthy();
    expect(getByText('Call Dana re: Thursday')).toBeTruthy();
  });
});

describe('prose pieces', () => {
  it('Ask, Lead, Said, Why and Quote render their children', () => {
    const { getByText } = renderV2(
      <>
        <Ask>Will you text Rio?</Ask>
        <Lead>Check in with Rio</Lead>
        <Said>“It’s been a hard week.”</Said>
        <Why>Because today matters</Why>
        <Quote>“Encouragement from the team.”</Quote>
      </>,
    );
    expect(getByText('Will you text Rio?')).toBeTruthy();
    expect(getByText('Check in with Rio')).toBeTruthy();
    expect(getByText('“It’s been a hard week.”')).toBeTruthy();
    expect(getByText('Because today matters')).toBeTruthy();
    expect(getByText('“Encouragement from the team.”')).toBeTruthy();
  });
});

describe('buttons', () => {
  it('PrimaryButton fires onPress', () => {
    const onPress = jest.fn();
    const { getByText } = renderV2(<PrimaryButton title="Text Rio" onPress={onPress} />);
    fireEvent.press(getByText('Text Rio'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('SecondaryButton fires onPress', () => {
    const onPress = jest.fn();
    const { getByText } = renderV2(<SecondaryButton title="Cancel" onPress={onPress} />);
    fireEvent.press(getByText('Cancel'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('LaterButton renders its label (customisable) and fires onPress', () => {
    const onPress = jest.fn();
    const { getByText } = renderV2(<LaterButton label="Not now" onPress={onPress} />);
    fireEvent.press(getByText('Not now  →'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('AboutChip', () => {
  it('renders name and detail, and fires onPress', () => {
    const onPress = jest.fn();
    const { getByText, queryByText, rerender } = renderV2(
      <AboutChip name="Rio Alvarez" id="c1" detail="Sophomore" onPress={onPress} />,
    );
    expect(getByText('Rio Alvarez')).toBeTruthy();
    expect(getByText('· Sophomore')).toBeTruthy();

    fireEvent.press(getByText('Rio Alvarez'));
    expect(onPress).toHaveBeenCalledTimes(1);

    rerender(
      <ThemeProvider>
        <AboutChip name="Rio Alvarez" id="c1" onPress={onPress} />
      </ThemeProvider>,
    );
    expect(queryByText('· Sophomore')).toBeNull();
  });
});

describe('Reactions', () => {
  it('renders every option and reports the picked emoji', () => {
    const onPick = jest.fn();
    const { getByText } = renderV2(<Reactions options={['🙏', '❤️']} mine={['🙏']} onPick={onPick} />);

    expect(getByText('🙏')).toBeTruthy();
    expect(getByText('❤️')).toBeTruthy();

    fireEvent.press(getByText('❤️'));
    expect(onPick).toHaveBeenCalledWith('❤️');
  });
});

describe('Kicker', () => {
  it('renders its label', () => {
    const { getByText } = renderV2(<Kicker>Dates worth knowing</Kicker>);
    expect(getByText('Dates worth knowing')).toBeTruthy();
  });
});
