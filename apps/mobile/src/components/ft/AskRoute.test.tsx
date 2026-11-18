// Cut-or-keep §5: "Ask the team" is gone from the phone, but its route stays so
// an old deep link lands on My Day instead of a dead end. (The To ask notepad
// lives at /to-ask and is unaffected.)
import React from 'react';
import { render } from '@testing-library/react-native';
import Ask from '../../../app/ask';

const mockRedirect = jest.fn((_props: { href: string }) => null);
jest.mock('expo-router', () => ({
  Redirect: (props: { href: string }) => mockRedirect(props),
}));

describe('the /ask route', () => {
  it('redirects to My Day', async () => {
    await render(<Ask />);
    expect(mockRedirect).toHaveBeenCalledWith({ href: '/' });
  });
});
