// Photo downscaling. A phone photo is several megabytes of detail nobody needs
// on a card, so everything is downscaled to a JPEG before it leaves the browser;
// the Storage rules cap the upload at 8 MB as a backstop, not as the expected
// size. Visit photos used to be the only caller; prayer answer photos
// (prayerPhotos.ts) are the one now, which is why the file keeps its name.

/** Longest edge, in pixels, that a stored photo is scaled down to. */
export const MAX_PHOTO_EDGE = 1600;
const JPEG_QUALITY = 0.8;

/** Scale an image file down to a JPEG blob. Falls back to the original file if
 *  the browser can't decode it — better a big upload than a lost photo. */
export async function downscale(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_PHOTO_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
    );
    return blob || file;
  } catch {
    return file;
  }
}
