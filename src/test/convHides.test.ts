import { describe, it, expect, beforeEach } from 'vitest';
import { ConvHides } from '../lib/convHides';

describe('ConvHides manager', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('hides and checks hidden state per user ID', () => {
    expect(ConvHides.has('u1', 'room1')).toBe(false);
    ConvHides.hide('u1', 'room1');
    expect(ConvHides.has('u1', 'room1')).toBe(true);
    expect(ConvHides.has('u2', 'room1')).toBe(false);
  });

  it('unhides specific room for a user', () => {
    ConvHides.hide('u1', 'room1');
    ConvHides.hide('u1', 'room2');
    expect(ConvHides.has('u1', 'room1')).toBe(true);

    ConvHides.unhide('u1', 'room1');
    expect(ConvHides.has('u1', 'room1')).toBe(false);
    expect(ConvHides.has('u1', 'room2')).toBe(true);
  });

  it('unhides all or specified list of rooms for a user', () => {
    ConvHides.hide('u1', 'room1');
    ConvHides.hide('u1', 'room2');
    ConvHides.hide('u1', 'room3');

    ConvHides.unhideAll('u1', ['room1', 'room2']);
    expect(ConvHides.has('u1', 'room1')).toBe(false);
    expect(ConvHides.has('u1', 'room2')).toBe(false);
    expect(ConvHides.has('u1', 'room3')).toBe(true);

    ConvHides.unhideAll('u1');
    expect(ConvHides.has('u1', 'room3')).toBe(false);
  });

  it('notifies subscribers when hidden state changes', () => {
    let callCount = 0;
    const unsub = ConvHides.subscribe(() => {
      callCount += 1;
    });

    ConvHides.hide('u1', 'room1');
    expect(callCount).toBe(1);

    ConvHides.unhide('u1', 'room1');
    expect(callCount).toBe(2);

    unsub();
    ConvHides.hide('u1', 'room2');
    expect(callCount).toBe(2);
  });
});
