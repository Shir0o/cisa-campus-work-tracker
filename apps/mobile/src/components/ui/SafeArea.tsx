// A screen's SafeAreaView. Use this one — not the library's — for anything
// rendered by a route, so app chrome above the router can hold the top inset.
//
// This has to be a prop swap, not a context override: on iOS the library's
// SafeAreaView is a NATIVE view (RNCSafeAreaShadowView) that adds the
// PROVIDER's insets as padding, ignoring both its own position on screen and
// SafeAreaInsetsContext. Only `SafeAreaView.web` reads the JS context. So the
// only way to stop a screen re-claiming the status-bar inset on device is to
// take 'top' out of its `edges`.
//
// Without this, the "Seeing as X" strip and the screen beneath it both pad by
// insets.top and a ~59pt empty band opens up between them on a notched phone.
// It does not reproduce in the Expo web preview, where insets.top is 0.
import React from 'react';
import {
  SafeAreaView as LibSafeAreaView,
  type Edge,
  type Edges,
  type SafeAreaViewProps,
} from 'react-native-safe-area-context';
import { useTopInsetOwned } from '../../lib/screenChrome';

/** Drops 'top' from `edges` while chrome above the router already owns that
 *  inset. Screens that never asked for a top edge are untouched. */
export function SafeAreaView({ edges, ...props }: SafeAreaViewProps) {
  const topOwned = useTopInsetOwned();

  const resolved = React.useMemo((): Edges | undefined => {
    if (!topOwned || edges == null) return edges;
    // `edges` is either a list of Edge or a per-edge record of EdgeMode.
    if (Array.isArray(edges)) return (edges as readonly Edge[]).filter((e) => e !== 'top');
    const { top: _dropped, ...rest } = edges as Exclude<Edges, readonly Edge[]>;
    return rest;
  }, [edges, topOwned]);

  return <LibSafeAreaView edges={resolved} {...props} />;
}
