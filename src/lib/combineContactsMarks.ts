import { deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { contactPairKey } from './combineContactsPlan';

// Not the same person marks (#1432, ADR 0038).
//
// A Full-timer's remembered judgement that two records the duplicate detector
// paired are different people. The mark is stored on the unordered pair of
// contact IDs, so it is the same document whichever order the pair is read in.
// Detection excludes marked pairs. Full-timers write them from the browser; the
// rules allow only admins to create or delete.

export const NOT_SAME_PERSON_MARKS = 'notSamePersonMarks';

export interface NotSamePersonMark {
  id: string;
  /** The two contact IDs, sorted. */
  contactIds: string[];
  markedBy: string;
  markedByName: string;
  markedAt?: unknown;
}

export interface MarkNotSamePersonInput {
  contactA: string;
  contactB: string;
  uid: string;
  name: string;
}

/** Remembers that two detected records are different people. */
export async function markNotSamePerson(input: MarkNotSamePersonInput): Promise<void> {
  const { contactA, contactB, uid, name } = input;
  try {
    await setDoc(doc(db, NOT_SAME_PERSON_MARKS, contactPairKey(contactA, contactB)), {
      contactIds: [contactA, contactB].sort(),
      markedBy: uid,
      markedByName: name,
      markedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, NOT_SAME_PERSON_MARKS);
    throw error;
  }
}

/** Removes the mark, so the pair is suggested again. */
export async function unmarkNotSamePerson(contactA: string, contactB: string): Promise<void> {
  try {
    await deleteDoc(doc(db, NOT_SAME_PERSON_MARKS, contactPairKey(contactA, contactB)));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, NOT_SAME_PERSON_MARKS);
    throw error;
  }
}
