// Cut-or-keep §2: the monthly park outing log is gone from the phone, but its
// route stays so an old deep link lands on My Day instead of a dead end.
import React from 'react';
import { render } from '@testing-library/react-native';
import Outreach from '../../../app/outreach';

const mockRedirect = jest.fn((_props: { href: string }) => null);
jest.mock('expo-router', () => ({
  Redirect: (props: { href: string }) => mockRedirect(props),
}));

describe('the /outreach route', () => {
  it('redirects to My Day', async () => {
    await render(<Outreach />);
    expect(mockRedirect).toHaveBeenCalledWith({ href: '/' });
  });
});
