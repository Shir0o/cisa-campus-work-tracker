import { describe, expect, it, jest } from '@jest/globals';
import { render, fireEvent } from '@testing-library/react-native';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { M2WhatsNew } from './M2WhatsNew';

jest.mock('../../lib/AuthProvider', () => ({
  useAuth: () => ({ uid: 'user1', user: null, role: 'admin' }),
}));

describe('M2WhatsNew', () => {
  it('shows the current announcement record and closes on demand', () => {
    let closed = 0;
    const tree = render(
      <ThemeProvider>
        <M2WhatsNew visible onClose={() => { closed += 1; }} />
      </ThemeProvider>,
    );
    expect(tree.getByTestId('m2-whats-new')).toBeTruthy();
    fireEvent.press(tree.getByText('Got it'));
    expect(closed).toBe(1);
  });

  it('renders nothing when hidden', () => {
    const tree = render(
      <ThemeProvider>
        <M2WhatsNew visible={false} onClose={() => {}} />
      </ThemeProvider>,
    );
    expect(tree.queryByTestId('m2-whats-new')).toBeNull();
  });
});
