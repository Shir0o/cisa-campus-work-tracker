import { describe, it, expect } from 'vitest';
import { calApp, calDb, calAuth, calGoogleProvider, CAL_MEMBER_EMAIL, CAL_OWNER_EMAIL } from '../lib/calendar/firebase';

describe('Calendar Firebase Configuration', () => {
  it('initializes secondary calendar Firebase app and auth/firestore instances', () => {
    expect(calApp).toBeDefined();
    expect(calDb).toBeDefined();
    expect(calAuth).toBeDefined();
    expect(calGoogleProvider).toBeDefined();
  });

  it('exports valid email constants', () => {
    expect(CAL_MEMBER_EMAIL).toBeDefined();
    expect(CAL_OWNER_EMAIL).toBe('yilongwang05@gmail.com');
  });
});
