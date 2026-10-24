// LogSheet tests — the follow-up's "Pick a date" calendar (#1709). Behavioral
// seams: which days can be picked, what a pick hands back, and month paging.
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { ReminderCalendar, WhenPicker } from './LogSheet';

jest.mock('../../lib/AuthProvider', () => ({
  useAuth: () => ({ uid: undefined, user: null, role: null }),
}));
jest.mock('../../lib/data/contacts', () => ({}));
jest.mock('../../lib/data/interactions', () => ({}));
jest.mock('../../lib/data/prayers', () => ({}));
jest.mock('../../lib/data/todos', () => ({}));
jest.mock('../../lib/notifications', () => ({}));
jest.mock('../../lib/useActiveSeason', () => ({}));
jest.mock('../../lib/useLogSheetData', () => ({}));

// Mon Jul 20 2026, midday local.
const NOW = new Date(2026, 6, 20, 12).getTime();

const renderCal = async (onPick = jest.fn(), selected: string | null = null) =>
  await render(
    <ThemeProvider>
      <ReminderCalendar selected={selected} onPick={onPick} now={NOW} />
    </ThemeProvider>,
  );

describe('ReminderCalendar (#1709)', () => {
  it('hands back the picked day as a bare yyyy-MM-dd', async () => {
    const onPick = jest.fn();
    const { getByLabelText } = await renderCal(onPick);
    await fireEvent.press(getByLabelText('Fri, Jul 31'));
    expect(onPick).toHaveBeenCalledWith('2026-07-31');
  });

  it('starts at tomorrow: today and earlier cannot be picked', async () => {
    const onPick = jest.fn();
    const { getByLabelText } = await renderCal(onPick);
    await fireEvent.press(getByLabelText('Mon, Jul 20'));
    await fireEvent.press(getByLabelText('Wed, Jul 1'));
    expect(onPick).not.toHaveBeenCalled();
    await fireEvent.press(getByLabelText('Tue, Jul 21'));
    expect(onPick).toHaveBeenCalledWith('2026-07-21');
  });

  it('pages forward a month, and not back past the current one', async () => {
    const { getByLabelText, getByText } = await renderCal();
    expect(getByText('July 2026')).toBeTruthy();
    await fireEvent.press(getByLabelText('Previous month'));
    expect(getByText('July 2026')).toBeTruthy();
    await fireEvent.press(getByLabelText('Next month'));
    expect(getByText('August 2026')).toBeTruthy();
  });

  it('opens on the month of an already-picked day', async () => {
    const { getByText } = await renderCal(jest.fn(), '2026-09-03');
    expect(getByText('September 2026')).toBeTruthy();
  });
});

describe('ReminderCalendar past mode', () => {
  const renderPast = async (onPick = jest.fn()) =>
    await render(
      <ThemeProvider>
        <ReminderCalendar past selected={null} onPick={onPick} now={NOW} />
      </ThemeProvider>,
    );

  it('picks today and earlier, never a later day', async () => {
    const onPick = jest.fn();
    const { getByLabelText } = await renderPast(onPick);
    await fireEvent.press(getByLabelText('Tue, Jul 21'));
    expect(onPick).not.toHaveBeenCalled();
    await fireEvent.press(getByLabelText('Mon, Jul 20'));
    expect(onPick).toHaveBeenLastCalledWith('2026-07-20');
    await fireEvent.press(getByLabelText('Wed, Jul 1'));
    expect(onPick).toHaveBeenLastCalledWith('2026-07-01');
  });

  it('pages back freely, and not forward past the current month', async () => {
    const { getByLabelText, getByText } = await renderPast();
    await fireEvent.press(getByLabelText('Next month'));
    expect(getByText('July 2026')).toBeTruthy();
    await fireEvent.press(getByLabelText('Previous month'));
    expect(getByText('June 2026')).toBeTruthy();
  });
});

describe('WhenPicker', () => {
  const renderPicker = async (onChange = jest.fn()) =>
    await render(
      <ThemeProvider>
        <WhenPicker now={NOW} onChange={onChange} />
      </ThemeProvider>,
    );

  it('starts at now and reports the picked day at the shown time', async () => {
    const onChange = jest.fn();
    const { getByLabelText, getByText } = await renderPicker(onChange);
    expect(getByText('12:00 PM')).toBeTruthy();
    await fireEvent.press(getByLabelText('Fri, Jul 10'));
    expect(onChange).toHaveBeenLastCalledWith(new Date(2026, 6, 10, 12, 0).toISOString());
  });

  it('steps hours and 5-minute marks', async () => {
    const onChange = jest.fn();
    const { getByLabelText, getByText } = await renderPicker(onChange);
    await fireEvent.press(getByLabelText('Earlier hour'));
    await fireEvent.press(getByLabelText('Later minute'));
    expect(getByText('11:05 AM')).toBeTruthy();
    expect(onChange).toHaveBeenLastCalledWith(new Date(2026, 6, 20, 11, 5).toISOString());
  });

  it('flips AM/PM', async () => {
    const onChange = jest.fn();
    const { getByLabelText, getByText } = await renderPicker(onChange);
    await fireEvent.press(getByLabelText('Switch to AM'));
    expect(getByText('12:00 AM')).toBeTruthy();
    expect(onChange).toHaveBeenLastCalledWith(new Date(2026, 6, 20, 0, 0).toISOString());
  });
});
