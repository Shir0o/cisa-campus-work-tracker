// DateBox tests — the v2 `.m2-datebox` block. Two behaviors worth pinning: an
// empty list renders nothing (the caller mounts it unconditionally), and a
// non-empty list renders the label plus one row per date. The weekday/month
// strings come from locale formatting, so only the date's day number, title and
// sub are asserted (locale-independent literals).
import React from 'react';
import { render } from '@testing-library/react-native';
import type { QueueDate } from '@cisa/core';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { V2DateBox } from './DateBox';

jest.mock('../../lib/AuthProvider', () => ({
  useAuth: () => ({ uid: undefined, user: null, role: null }),
}));

const renderV2 = (el: React.ReactElement) => render(<ThemeProvider>{el}</ThemeProvider>);

const date = (id: string, day: number, title: string, sub: string): QueueDate => ({
  id,
  date: `2026-08-${String(day).padStart(2, '0')}T12:00:00`,
  title,
  sub,
});

describe('V2DateBox', () => {
  it('renders nothing for an empty list', () => {
    const { queryByText } = renderV2(<V2DateBox label="Coming up" dates={[]} />);
    expect(queryByText('Coming up')).toBeNull();
  });

  it('renders the label and one row per date', () => {
    const { getByText } = renderV2(
      <V2DateBox
        label="Dates worth knowing"
        dates={[date('d1', 15, 'Kickoff', 'First night'), date('d2', 22, 'Serve day', 'Campus cleanup')]}
      />,
    );

    expect(getByText('Dates worth knowing')).toBeTruthy();
    expect(getByText('15')).toBeTruthy();
    expect(getByText('Kickoff')).toBeTruthy();
    expect(getByText(/First night/)).toBeTruthy();
    expect(getByText('22')).toBeTruthy();
    expect(getByText('Serve day')).toBeTruthy();
    expect(getByText(/Campus cleanup/)).toBeTruthy();
  });
});
