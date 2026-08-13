// Prayer answer photos — the "how was it answered" picture input (#267). The
// same downscale-and-upload dance as visit photos: a phone photo carries more
// detail than a testimony needs, so it's scaled to a JPEG before it leaves the
// browser.
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { storage } from './firebase';
import { downscale } from './visitPhotos';
import type { VisitPhoto } from '../types';

/** At most four photos accompany an answer — a snapshot, not an album. */
export const MAX_ANSWER_PHOTOS = 4;

const objectPath = (prayerId: string, index: number) =>
  `prayers/${prayerId}/${Date.now()}-${index}.jpg`;

/** Upload photos for a prayer that already exists, so they have somewhere to
 *  belong. Returns the metadata to store on the prayer doc. */
export async function uploadPrayerAnswerPhotos(prayerId: string, files: File[]): Promise<VisitPhoto[]> {
  return Promise.all(
    files.slice(0, MAX_ANSWER_PHOTOS).map(async (file, i) => {
      const blob = await downscale(file);
      const path = objectPath(prayerId, i);
      const objectRef = ref(storage, path);
      await uploadBytes(objectRef, blob, { contentType: 'image/jpeg' });
      return { path, url: await getDownloadURL(objectRef), name: file.name };
    }),
  );
}
