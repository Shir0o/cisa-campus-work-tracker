// The impersonation-flash guard, shared: drop a screen's data the moment the
// identity it was loaded for changes, synchronously (a render-phase state
// adjustment), so the first frame after the change is already the loading
// skeleton instead of the previous viewer's content.
import { useState } from 'react';

/**
 * @param identity the key the current data was loaded for (typically the uid,
 *   or `uid:param` when the hook also reads a route param)
 * @param reset clears the hook's state and sets `loading` back to true — must
 *   reference only stable setters, since it runs during render.
 */
export function useIdentityReset(identity: string | null, reset: () => void) {
  const [seen, setSeen] = useState(identity);
  if (seen !== identity) {
    setSeen(identity);
    reset();
  }
}
