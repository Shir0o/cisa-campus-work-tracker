import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { openMessage } from '../lib/messaging';

describe('messaging lib', () => {
  let openSpy: any;

  beforeEach(() => {
    openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
  });

  afterEach(() => {
    openSpy.mockRestore();
  });

  it('opens Google Messages web on desktop Windows without pref', () => {
    Object.defineProperty(navigator, 'userAgent', { value: 'Windows NT 10.0', configurable: true });
    Object.defineProperty(navigator, 'platform', { value: 'Win32', configurable: true });

    openMessage('123-456-7890');
    expect(openSpy).toHaveBeenCalledWith('https://messages.google.com/web/', '_blank', 'noopener');
  });

  it('opens sms: link on mobile user agent', () => {
    Object.defineProperty(navigator, 'userAgent', { value: 'iPhone OS 14_0', configurable: true });
    Object.defineProperty(navigator, 'platform', { value: 'iPhone', configurable: true });

    openMessage('123-456-7890');
    expect(openSpy).toHaveBeenCalledWith('sms:1234567890');
  });

  it('opens sms: link on Mac user agent', () => {
    Object.defineProperty(navigator, 'userAgent', { value: 'Macintosh; Intel Mac OS X 10_15_7', configurable: true });
    Object.defineProperty(navigator, 'platform', { value: 'MacIntel', configurable: true });

    openMessage('123-456-7890');
    expect(openSpy).toHaveBeenCalledWith('sms:1234567890');
  });

  it('opens Google Messages web when pref is google', () => {
    Object.defineProperty(navigator, 'userAgent', { value: 'iPhone OS 14_0', configurable: true });

    openMessage('123-456-7890', 'google');
    expect(openSpy).toHaveBeenCalledWith('https://messages.google.com/web/', '_blank', 'noopener');
  });

  it('opens Google Messages web when phone is empty or null', () => {
    openMessage(null);
    expect(openSpy).toHaveBeenCalledWith('https://messages.google.com/web/', '_blank', 'noopener');
  });
});
