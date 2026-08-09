import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { deleteVisitPhoto, downscale, MAX_PHOTO_EDGE, uploadVisitPhotos } from '../lib/visitPhotos';

vi.mock('firebase/storage', () => ({
  ref: vi.fn((_storage, path) => ({ path })),
  uploadBytes: vi.fn(() => Promise.resolve()),
  getDownloadURL: vi.fn(() => Promise.resolve('https://example.test/photo.jpg')),
  deleteObject: vi.fn(() => Promise.resolve()),
}));

vi.mock('../lib/firebase', () => ({ storage: {} }));

const mock = (fn: unknown) => fn as unknown as ReturnType<typeof vi.fn>;
const file = (name = 'room.jpg') => new File(['x'], name, { type: 'image/jpeg' });

const stubCanvas = (blob: Blob | null) => {
  const ctx = { drawImage: vi.fn() };
  vi.spyOn(document, 'createElement').mockReturnValue({
    width: 0,
    height: 0,
    getContext: () => ctx,
    toBlob: (cb: (b: Blob | null) => void) => cb(blob),
  } as unknown as HTMLCanvasElement);
  return ctx;
};

beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('downscale', () => {
  it('shrinks the long edge and re-encodes as a JPEG', async () => {
    const close = vi.fn();
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(() => Promise.resolve({ width: 4000, height: 3000, close })),
    );
    const jpeg = new Blob(['jpeg'], { type: 'image/jpeg' });
    const ctx = stubCanvas(jpeg);

    const out = await downscale(file());
    expect(out).toBe(jpeg);
    // 4000 → 1600 wide, height scaled to match.
    expect(ctx.drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, MAX_PHOTO_EDGE, 1200);
    expect(close).toHaveBeenCalled();
  });

  it('leaves an image alone when it is already small enough', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(() => Promise.resolve({ width: 800, height: 600 })),
    );
    const jpeg = new Blob(['jpeg'], { type: 'image/jpeg' });
    const ctx = stubCanvas(jpeg);

    await downscale(file());
    expect(ctx.drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 800, 600);
  });

  it('falls back to the original rather than losing a photo the browser cannot read', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(() => Promise.reject(new Error('unsupported'))),
    );
    const original = file();
    expect(await downscale(original)).toBe(original);
  });

  it('falls back to the original when the canvas produces nothing', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(() => Promise.resolve({ width: 100, height: 100 })),
    );
    stubCanvas(null);
    const original = file();
    expect(await downscale(original)).toBe(original);
  });
});

describe('uploadVisitPhotos', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(() => Promise.reject(new Error('jsdom cannot decode'))),
    );
  });

  it('files each photo under its visit and returns what to store on the doc', async () => {
    const photos = await uploadVisitPhotos('v1', [file('room.jpg')]);
    expect(mock(ref).mock.calls[0][1]).toMatch(/^visits\/v1\/\d+-0\.jpg$/);
    expect(uploadBytes).toHaveBeenCalledWith(expect.anything(), expect.anything(), {
      contentType: 'image/jpeg',
    });
    expect(getDownloadURL).toHaveBeenCalled();
    expect(photos).toEqual([
      { path: expect.stringMatching(/^visits\/v1\//), url: 'https://example.test/photo.jpg', name: 'room.jpg' },
    ]);
  });

  it('caps how many photos one visit can carry', async () => {
    const many = Array.from({ length: 20 }, (_, i) => file(`p${i}.jpg`));
    expect(await uploadVisitPhotos('v1', many)).toHaveLength(12);
  });
});

describe('deleteVisitPhoto', () => {
  it('removes the stored object', async () => {
    await deleteVisitPhoto('visits/v1/1.jpg');
    expect(deleteObject).toHaveBeenCalledWith({ path: 'visits/v1/1.jpg' });
  });

  it('shrugs off a photo that has already gone', async () => {
    mock(deleteObject).mockRejectedValueOnce(new Error('object-not-found'));
    await expect(deleteVisitPhoto('visits/v1/1.jpg')).resolves.toBeUndefined();
  });
});
