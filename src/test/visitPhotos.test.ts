import { describe, it, expect, vi, beforeEach } from 'vitest';
import { downscale, MAX_PHOTO_EDGE } from '../lib/visitPhotos';

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
