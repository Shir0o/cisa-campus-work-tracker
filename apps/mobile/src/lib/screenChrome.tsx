// Whether app chrome above the routes is already holding the top safe-area
// inset. Today that is exactly one thing: the "Seeing as X" impersonation
// strip (components/impersonate/ImpersonateLayer), which sits in flow above
// every route and pads itself past the status bar.
//
// It lives in its own module so `components/ui/SafeArea` can read it without
// importing the impersonation layer, which imports `ui` back.
import { createContext, useContext } from 'react';

/** True while something above the router already owns `insets.top`. */
export const TopInsetOwnedContext = createContext(false);

export function useTopInsetOwned(): boolean {
  return useContext(TopInsetOwnedContext);
}
