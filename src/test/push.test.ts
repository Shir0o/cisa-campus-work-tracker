import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendPushNotification } from '../lib/push';

describe('sendPushNotification', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('POSTs the payload to /api/send-push', async () => {
    await sendPushNotification({ userId: 'u1', title: 'New message', body: 'Alice: hi', data: { targetId: 'r1' } });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/send-push');
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      userId: 'u1',
      title: 'New message',
      body: 'Alice: hi',
      data: { targetId: 'r1' },
    });
  });

  it('swallows fetch failures (best-effort)', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    await expect(sendPushNotification({ userId: 'u1', title: 'Hi' })).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });
});
