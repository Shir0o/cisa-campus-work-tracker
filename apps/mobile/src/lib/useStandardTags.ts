// Standard tags (#1437, ADR 0039) — mobile live view of the team-wide
// `settings/standard_tags` list, mirroring the web app's useStandardTags. The
// edit-contact sheet shows these as suggestion chips; season tags are standard
// by pattern and arrive from the guesser's side, not here. Falls back to the
// seed list until the document loads.
import { useEffect, useState } from 'react';
import { STANDARD_TAG_SEED } from '@cisa/core';
import { subscribeStandardTags } from './data/standardTags';

export function useStandardTags(): string[] {
  const [tags, setTags] = useState<string[]>(() => [...STANDARD_TAG_SEED]);
  useEffect(
    () =>
      subscribeStandardTags(setTags, (e) => console.warn('Could not read standard tags', e)),
    [],
  );
  return tags;
}
