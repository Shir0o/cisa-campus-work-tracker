// Visit photos — the only files this app stores. A phone photo is several
// megabytes of detail nobody needs on a card, so everything is downscaled to a
// JPEG before it leaves the browser; the Storage rules cap the upload at 8 MB
// as a backstop, not as the expected size.
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { storage } from './firebase';
import type { VisitPhoto } from '../types';

/** Longest edge, in pixels, that a stored visit photo is scaled down to. */
export const MAX_PHOTO_EDGE = 1600;
const JPEG_QUALITY = 0.8;
/** Enough to remember a room by; more than that is an album, not a record. */
export const MAX_PHOTOS_PER_VISIT = 12;

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

const objectPath = (visitId: string, index: number) =>
  `visits/${visitId}/${Date.now()}-${index}.jpg`;

/** Upload photos for a visit that already exists, so they have somewhere to
 *  belong. Returns the metadata to store on the visit doc. */
export async function uploadVisitPhotos(visitId: string, files: File[]): Promise<VisitPhoto[]> {
  const capped = files.slice(0, MAX_PHOTOS_PER_VISIT);
  return Promise.all(
    capped.map(async (file, i) => {
      const blob = await downscale(file);
      const path = objectPath(visitId, i);
      const objectRef = ref(storage, path);
      await uploadBytes(objectRef, blob, { contentType: 'image/jpeg' });
      return { path, url: await getDownloadURL(objectRef), name: file.name };
    }),
  );
}

/** Remove a stored photo. A photo that outlives its visit is an orphan blob
 *  nobody can reach, so a failure here isn't worth failing the save over. */
export async function deleteVisitPhoto(path: string): Promise<void> {
  await deleteObject(ref(storage, path)).catch(() => {
    /* already gone */
  });
}
