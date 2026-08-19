import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { addDoc, updateDoc, deleteDoc, setDoc, onSnapshot } from 'firebase/firestore';

// ── Firestore + firebase mocks shared by all lib tests ──────────────────
vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, ...parts: string[]) => ({ path: parts.join('/') })),
  doc: vi.fn((_db: unknown, ...parts: string[]) => ({ path: parts.join('/') })),
  addDoc: vi.fn(() => Promise.resolve()),
  updateDoc: vi.fn(() => Promise.resolve()),
  deleteDoc: vi.fn(() => Promise.resolve()),
  setDoc: vi.fn(() => Promise.resolve()),
  onSnapshot: vi.fn(() => vi.fn()),
  query: vi.fn((ref: unknown) => ref),
  orderBy: vi.fn(),
}));

const handleFirestoreError = vi.fn();
vi.mock('../lib/firebase', () => ({
  db: {},
  handleFirestoreError: (...a: any[]) => handleFirestoreError(...a),
  OperationType: { CREATE: 'CREATE', UPDATE: 'UPDATE', DELETE: 'DELETE', WRITE: 'WRITE', LIST: 'LIST' },
}));

import {
  subscribePersonalPrayers,
  addPersonalPrayer,
  updatePersonalPrayer,
  deletePersonalPrayer,
} from '../lib/personalPrayers';
import { subscribeUserPreferences, saveUserPreferences } from '../lib/userPreferences';
import { updatePrayerStatus } from '../lib/prayers';
import { openMessage } from '../lib/messaging';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('personalPrayers', () => {
  it('adds with a trimmed title and defaults', async () => {
    await addPersonalPrayer('u1', { title: '  pray  ' });
    expect(addDoc).toHaveBeenCalledWith(
      { path: 'users/u1/personalPrayers' },
      expect.objectContaining({ title: 'pray', contactId: null, status: 'open' }),
    );
  });

  it('updates only the provided fields (trimming title)', async () => {
    await updatePersonalPrayer('u1', 'p1', { title: '  new  ', contactId: 'c1', status: 'answered' });
    expect(updateDoc).toHaveBeenCalledWith(
      { path: 'users/u1/personalPrayers/p1' },
      { title: 'new', contactId: 'c1', status: 'answered' },
    );
  });

  it('deletes a personal prayer', async () => {
    await deletePersonalPrayer('u1', 'p1');
    expect(deleteDoc).toHaveBeenCalledWith({ path: 'users/u1/personalPrayers/p1' });
  });

  it('maps snapshot docs and survives errors', () => {
    let success: any;
    let fail: any;
    vi.mocked(onSnapshot).mockImplementation((_q: any, ok: any, err: any) => {
      success = ok;
      fail = err;
      return vi.fn();
    });
    const cb = vi.fn();
    subscribePersonalPrayers('u1', cb);
    success({ docs: [{ id: 'p1', data: () => ({ title: 't', date: 'd', status: 'open' }) }] });
    expect(cb).toHaveBeenCalledWith([{ id: 'p1', title: 't', contactId: null, date: 'd', status: 'open', answeredAt: null, answeredBody: null }]);
    // A malformed doc with no fields gets safe defaults rather than an incomplete object.
    cb.mockClear();
    success({ docs: [{ id: 'p2', data: () => ({}) }] });
    expect(cb).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'p2', title: '', contactId: null, status: 'open', answeredAt: null, answeredBody: null }),
    ]);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    fail(new Error('boom'));
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('routes write failures through handleFirestoreError', async () => {
    vi.mocked(addDoc).mockRejectedValueOnce(new Error('denied'));
    await addPersonalPrayer('u1', { title: 'x' });
    expect(handleFirestoreError).toHaveBeenCalled();
  });
});

describe('userPreferences', () => {
  it('defaults to {} when the doc has no data', () => {
    let success: any;
    vi.mocked(onSnapshot).mockImplementation((_q: any, ok: any) => {
      success = ok;
      return vi.fn();
    });
    const cb = vi.fn();
    subscribeUserPreferences('u1', cb);
    success({ data: () => undefined });
    expect(cb).toHaveBeenCalledWith({});
  });

  it('merge-writes preference patches', async () => {
    await saveUserPreferences('u1', { personalContactIds: ['a', 'b'] });
    expect(setDoc).toHaveBeenCalledWith(
      { path: 'userPreferences/u1' },
      { personalContactIds: ['a', 'b'] },
      { merge: true },
    );
  });

  it('routes save failures through handleFirestoreError', async () => {
    vi.mocked(setDoc).mockRejectedValueOnce(new Error('denied'));
    await saveUserPreferences('u1', {});
    expect(handleFirestoreError).toHaveBeenCalled();
  });
});

describe('prayers.updatePrayerStatus', () => {
  it('writes the status plus a bookkeeping stamp', async () => {
    await updatePrayerStatus('p1', 'answered', { uid: 'u1', name: 'Tony' });
    expect(updateDoc).toHaveBeenCalledWith(
      { path: 'prayers/p1' },
      expect.objectContaining({ status: 'answered', updatedBy: 'u1', updatedByName: 'Tony' }),
    );
  });

  it('routes failures through handleFirestoreError', async () => {
    vi.mocked(updateDoc).mockRejectedValueOnce(new Error('denied'));
    await updatePrayerStatus('p1', 'ongoing', {});
    expect(handleFirestoreError).toHaveBeenCalled();
  });

  it('includes answer and answeredAt when provided', async () => {
    await updatePrayerStatus('p1', 'answered', { uid: 'u1', name: 'Tony' }, 'God answered!', '2026-07-15');
    expect(updateDoc).toHaveBeenCalledWith(
      { path: 'prayers/p1' },
      expect.objectContaining({ status: 'answered', answer: 'God answered!', answeredAt: '2026-07-15' }),
    );
  });
});

describe('messaging.openMessage', () => {
  const setPlatform = (ua: string, platform = '') => {
    Object.defineProperty(window.navigator, 'userAgent', { value: ua, configurable: true });
    Object.defineProperty(window.navigator, 'platform', { value: platform, configurable: true });
  };
  let openSpy: any;
  beforeEach(() => {
    openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
  });
  afterEach(() => openSpy.mockRestore());

  it('uses sms: on mobile', () => {
    setPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS)');
    openMessage('(555) 123-4567');
    expect(openSpy).toHaveBeenCalledWith('sms:5551234567');
  });

  it('uses sms: on macOS desktop', () => {
    setPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X)', 'MacIntel');
    openMessage('5551234567');
    expect(openSpy).toHaveBeenCalledWith('sms:5551234567');
  });

  it('falls back to Google Messages on other desktops', () => {
    setPlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Win32');
    openMessage('5551234567');
    expect(openSpy).toHaveBeenCalledWith('https://messages.google.com/web/', '_blank', 'noopener');
  });

  it('honors an explicit google preference even on mac', () => {
    setPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X)', 'MacIntel');
    openMessage('5551234567', 'google');
    expect(openSpy).toHaveBeenCalledWith('https://messages.google.com/web/', '_blank', 'noopener');
  });

  it('honors an explicit apple preference on a windows desktop', () => {
    setPlatform('Mozilla/5.0 (Windows NT 10.0)', 'Win32');
    openMessage('5551234567', 'apple');
    expect(openSpy).toHaveBeenCalledWith('sms:5551234567');
  });

  it('falls back to Google Messages when there is no phone number', () => {
    setPlatform('Mozilla/5.0 (iPhone)');
    openMessage('');
    expect(openSpy).toHaveBeenCalledWith('https://messages.google.com/web/', '_blank', 'noopener');
  });
});

import { parseMs, daysSince, connectedLabel } from '../components/landing/helpers';

describe('landing helpers', () => {
  it('parses ISO strings, Timestamps, and numbers in parseMs', () => {
    expect(parseMs(null)).toBeNull();
    expect(parseMs(undefined)).toBeNull();
    expect(parseMs('')).toBeNull();
    expect(parseMs('invalid')).toBeNull();

    const iso = '2026-08-19T10:00:00.000Z';
    const expected = new Date(iso).getTime();
    expect(parseMs(iso)).toBe(expected);

    // Number timestamp
    expect(parseMs(expected)).toBe(expected);

    // Firestore Timestamp with toMillis
    expect(parseMs({ toMillis: () => 123456789 })).toBe(123456789);

    // Firestore Timestamp with toDate
    expect(parseMs({ toDate: () => new Date(iso) })).toBe(expected);

    // Timestamp with seconds
    expect(parseMs({ seconds: 1700000000 })).toBe(1700000000000);
  });

  it('formats connectedLabel accurately', () => {
    expect(connectedLabel(0)).toBe('Connected today');
    expect(connectedLabel(1)).toBe('Last connected yesterday');
    expect(connectedLabel(5)).toBe('Last connected 5 days ago');
  });
});
