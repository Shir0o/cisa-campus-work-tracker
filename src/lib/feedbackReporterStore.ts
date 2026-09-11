import { reporterLabelFromName } from './feedbackReporter';

function reporterLabelFromSnapshot(snapshot: any): string | null {
  if (snapshot === null || snapshot === undefined || snapshot.exists === false) return null;
  const data = typeof snapshot.data === 'function' ? snapshot.data() : null;
  const label = data?.reporterLabel;
  return typeof label === 'string' && label.length > 0 ? label : null;
}

export async function ensureReporterLabel(
  db: any,
  uid: string | null | undefined,
  userName: string | null | undefined,
): Promise<string | null> {
  const baseLabel = reporterLabelFromName(userName);
  if (baseLabel === null) return null;
  if (uid === null || uid === undefined || uid.length === 0) return baseLabel;

  const userRef = db.collection('users').doc(uid);
  const userSnapshot = await userRef.get();
  const existingLabel = reporterLabelFromSnapshot(userSnapshot);
  if (existingLabel !== null) return existingLabel;

  let candidate = baseLabel;
  let suffix = 2;

  while (true) {
    const claimed = await db.collection('users').where('reporterLabel', '==', candidate).get();
    const docs = Array.isArray(claimed?.docs) ? claimed.docs : [];
    const claimedByAnotherUser = docs.some((doc: any) => doc.id !== uid);
    const hasUnreadableClaim = docs.length === 0 && (claimed?.size ?? 0) > 0;

    if (claimedByAnotherUser || hasUnreadableClaim) {
      candidate = baseLabel + '-' + String(suffix);
      suffix += 1;
      continue;
    }

    break;
  }

  await userRef.set({ reporterLabel: candidate }, { merge: true });
  return candidate;
}
