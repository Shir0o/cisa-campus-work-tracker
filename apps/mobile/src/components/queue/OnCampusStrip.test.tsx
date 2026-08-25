// OnCampusStrip tests — the on-campus window strip, and the day-goal ring (#544)
// it wears during the window: a plain dot when there's no goal (or it's met),
// a filling ring while the day's still short.
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { OnCampusStrip, type OnCampusStripGoal } from './OnCampusStrip';

jest.mock('../../lib/AuthProvider', () => ({
  useAuth: () => ({ uid: 'u1', user: null, role: null }),
}));

const renderV2 = (el: React.ReactElement) => render(<ThemeProvider>{el}</ThemeProvider>);

const window = { days: [2, 3], from: 12, to: 15 };
const goal: OnCampusStripGoal = {
  fill: 0.6,
  label: "You've spoken with 3 of 5 new people today.",
};

describe('OnCampusStrip', () => {
  it('renders the headline and sub line, and fires onPress', () => {
    const onPress = jest.fn();
    const { getByText } = renderV2(<OnCampusStrip window={window} onPress={onPress} />);
    expect(getByText('Log it while you remember — 20 seconds.')).toBeTruthy();
    fireEvent.press(getByText('Log it while you remember — 20 seconds.'));
    expect(onPress).toHaveBeenCalled();
  });

  it('shows the plain dot when there is no goal', () => {
    const { queryByTestId } = renderV2(<OnCampusStrip window={window} onPress={jest.fn()} />);
    expect(queryByTestId('goal-ring')).toBeNull();
  });

  it('shows the filling ring when the day has a goal, with a spoken label', () => {
    const { getByTestId } = renderV2(
      <OnCampusStrip window={window} onPress={jest.fn()} goal={goal} />,
    );
    expect(getByTestId('goal-ring')).toBeTruthy();
  });

  it('wears the goal’s screen-reader label, and no label without a goal', () => {
    const withGoal = renderV2(<OnCampusStrip window={window} onPress={jest.fn()} goal={goal} />);
    expect(withGoal.getByLabelText(goal.label)).toBeTruthy();

    const without = renderV2(<OnCampusStrip window={window} onPress={jest.fn()} />);
    expect(without.queryByLabelText(goal.label)).toBeNull();
  });
});