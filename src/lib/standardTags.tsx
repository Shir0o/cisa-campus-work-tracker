// Standard tags (#1437, ADR 0039) — the web app's live view of the team-wide
// `settings/standard_tags` list. One Full-timer-edited list drives both the
// suggestion chips (new contact, contact edit, contact overview) and the
// combine-tags guess targets. Season tags are standard by pattern and never
// stored; removing a standard tag only edits this list, never a contact.
//
// The web app deliberately has no @cisa/core dependency, so the pure
// resolution logic mirrors packages/core/src/tags.ts (STANDARD_TAG_SEED,
// resolveStandardTags) and the Firestore read/write mirrors
// packages/core/src/data/standardTags.ts. A provider keeps one subscription
// for the whole signed-in app; the hook falls back to the seed when no
// provider is mounted, so the chips render the seed before the doc loads.
import React, { createContext, useContext, useEffect, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { resolveStandardTags, STANDARD_TAG_SEED } from './tags';

interface StandardTagsView {
  tags: string[];
}

const StandardTagsContext = createContext<StandardTagsView>({ tags: [...STANDARD_TAG_SEED] });

/** Live standard tags for the signed-in app. Seeds with the six former
 *  constants until the document loads (#1437). */
export function StandardTagsProvider({ children }: { children: React.ReactNode }) {
  const [tags, setTags] = useState<string[]>(() => [...STANDARD_TAG_SEED]);

  useEffect(
    () =>
      onSnapshot(
        doc(db, 'settings', 'standard_tags'),
        (snap) => {
          const data = typeof snap?.data === 'function' ? snap.data() : undefined;
          setTags(resolveStandardTags((data as { tags?: string[] } | undefined)?.tags));
        },
        (e) => console.error('standard tags subscription error', e),
      ),
    [],
  );

  return (
    <StandardTagsContext.Provider value={{ tags }}>{children}</StandardTagsContext.Provider>
  );
}

/** The current standard tags; the seed list when no provider has mounted. */
export function useStandardTags(): string[] {
  return useContext(StandardTagsContext).tags;
}

/** Merge-write the standard tags list. Rules gate it to Full-timers. */
export async function saveStandardTags(tags: string[]): Promise<void> {
  try {
    await setDoc(doc(db, 'settings', 'standard_tags'), { tags });
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, 'settings/standard_tags');
  }
}
