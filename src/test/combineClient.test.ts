import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fill, formatWhen, postCombineApi, requestContactUndo } from '../lib/combineClient';

const getIdToken = vi.fn();
vi.mock('../lib/firebase', () => ({
  auth: { get currentUser() { return getIdToken.getMockImplementation() ? { getIdToken } : null; } },
}));

describe('combineClient', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    getIdToken.mockReset();
    getIdToken.mockResolvedValue('tok');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('formatWhen formats an ISO date, passes junk through and blanks a gap', () => {
    expect(formatWhen('2026-10-01T10:00:00.000Z')).toBe(new Date('2026-10-01T10:00:00.000Z').toLocaleDateString());
    expect(formatWhen('not a date')).toBe('not a date');
    expect(formatWhen(undefined)).toBe('');
  });

  it('formatWhen formats Firestore Timestamp-like objects and Date instances', () => {
    const d = new Date('2026-10-01T10:00:00.000Z');
    expect(formatWhen({ toDate: () => d })).toBe(d.toLocaleDateString());
    expect(formatWhen({ seconds: Math.floor(d.getTime() / 1000) })).toBe(
      new Date(Math.floor(d.getTime() / 1000) * 1000).toLocaleDateString(),
    );
    expect(formatWhen(d)).toBe(d.toLocaleDateString());
  });

  it('fill replaces placeholders and blanks unknown ones', () => {
    expect(fill('{a} into {b} {c}', { a: 'X', b: 'Y' })).toBe('X into Y ');
  });

  it('postCombineApi posts JSON with the bearer token and returns the body', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
    await expect(postCombineApi('/api/x', { a: 1 }, 'failed')).resolves.toEqual({ success: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/x');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json', Authorization: 'Bearer tok' });
    expect(JSON.parse(init.body)).toEqual({ a: 1 });
  });

  it('postCombineApi throws the server error, else the fallback', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'Forbidden' }) });
    await expect(postCombineApi('/api/x', {}, 'failed')).rejects.toThrow('Forbidden');
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => { throw new Error('bad json'); } });
    await expect(postCombineApi('/api/x', {}, 'failed')).rejects.toThrow('failed');
  });

  it('postCombineApi sends no Authorization header when signed out', async () => {
    getIdToken.mockReset();
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
    await postCombineApi('/api/x', {}, 'failed');
    expect(fetchMock.mock.calls[0][1].headers).toEqual({ 'Content-Type': 'application/json' });
  });

  it('requestContactUndo posts the record id and dry-run flag to the undo endpoint', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
    await requestContactUndo('rec-1', true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/combine-contacts/undo');
    expect(JSON.parse(init.body)).toEqual({ combineRecordId: 'rec-1', dryRun: true });
  });
});
