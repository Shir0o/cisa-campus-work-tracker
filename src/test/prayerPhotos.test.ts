import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { MAX_ANSWER_PHOTOS, uploadPrayerAnswerPhotos } from '../lib/prayerPhotos';

vi.mock('firebase/storage', () => ({
  ref: vi.fn((_storage, path) => ({ path })),
  uploadBytes: vi.fn(() => Promise.resolve()),
  getDownloadURL: vi.fn(() => Promise.resolve('https://example.test/photo.jpg')),
}));

vi.mock('../lib/firebase', () => ({ storage: {} }));

const mock = (fn: unknown) => fn as unknown as ReturnType<typeof vi.fn>;
const file = (name = 'answer.jpg') => new File(['x'], name, { type: 'image/jpeg' });

beforeEach(() => {
  vi.clearAllMocks();
  // downscale falls back to the original when the browser can't decode it.
  vi.stubGlobal('createImageBitmap', vi.fn(() => Promise.reject(new Error('jsdom cannot decode'))));
});

describe('uploadPrayerAnswerPhotos', () => {
  it('files each photo under its prayer and returns what to store on the doc', async () => {
    const photos = await uploadPrayerAnswerPhotos('p1', [file()]);
    const objectPath = mock(ref).mock.calls[0][1] as string;
    expect(objectPath.startsWith('prayers/p1/')).toBe(true);
    expect(objectPath.endsWith('-0.jpg')).toBe(true);
    expect(uploadBytes).toHaveBeenCalledWith(expect.anything(), expect.anything(), {
      contentType: 'image/jpeg',
    });
    expect(getDownloadURL).toHaveBeenCalled();
    expect(photos).toEqual([
      { path: expect.stringContaining('prayers/p1/'), url: 'https://example.test/photo.jpg', name: 'answer.jpg' },
    ]);
  });

  it('caps an answer at four photos', async () => {
    const many = Array.from({ length: 8 }, (_, i) => file('p' + i + '.jpg'));
    const photos = await uploadPrayerAnswerPhotos('p1', many);
    expect(photos).toHaveLength(4);
    expect(MAX_ANSWER_PHOTOS).toBe(4);
  });
});
