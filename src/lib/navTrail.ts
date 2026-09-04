/**
 * Where a route sits in the navigation — the data behind the shell's trail and
 * behind its selected state (#803).
 *
 * The rail and the top bar both used to answer "where am I" by matching the
 * pathname against `NAV_ITEMS` directly. That works for a destination and fails
 * for anything under one: `/people/:contactId` is neither `/directory` nor a
 * child of it, so the rail lit nothing and the top bar lit *More* with a
 * fallback glyph. One map fixes both, and the same map is what the trail reads.
 *
 * Design: docs/design/chrome-strip/ (`Main.dc.html`, `TopBar.dc.html`).
 */
import { NAV_ITEMS, type AppRole } from './permissions';

export interface Trail {
  /**
   * Set only when the route sits *under* a destination: the crumb to draw, and
   * where the back chevron goes. `null` on a destination that is its own root.
   */
  section: { label: string; href: string } | null;
  /**
   * The place you are. `null` on a leaf route whose record name has not
   * resolved yet — the section crumb alone is still a useful way back, and a
   * placeholder would be worse than nothing.
   */
  current: string | null;
  /**
   * Whether `current` is one of the app's own labels (translatable) or a record
   * name typed by a user (never translated, never guessed at).
   */
  currentIsLabel: boolean;
}

/**
 * Routes that sit under a destination rather than being one. `leaf` is a fixed
 * label for the ones whose last crumb is not a record name; a record's name is
 * passed in by the caller, which is the only part of a trail this module cannot
 * know on its own.
 */
const LEAF_ROUTES: readonly { pattern: RegExp; section: string; leaf?: string }[] = [
  { pattern: /^\/people\/[^/]+$/, section: '/directory' },
  { pattern: /^\/messages\/[^/]+$/, section: '/messages' },
  { pattern: /^\/coordination\/trash$/, section: '/coordination', leaf: 'Trash' },
  { pattern: /^\/admin\/feedback$/, section: '/settings', leaf: 'Feedback' },
];

/**
 * In-shell destinations that are deliberately not in `NAV_ITEMS` — reachable by
 * link rather than by navigating, so they have no rail item and no tab, but
 * they still have a name.
 */
const STANDALONE: Record<string, string> = {
  '/feedback': 'Send feedback',
};

/** Trailing slashes only ever come from hand-typed URLs; `/` keeps its own. */
function normalize(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith('/')) return pathname.slice(0, -1);
  return pathname;
}

/**
 * Home is "My Day" for a full-timer and "Home" for everyone else. The rail and
 * the top bar each carried their own copy of this; the trail reads it from here
 * so a fourth copy doesn't appear.
 */
function labelFor(href: string, role: AppRole | string | null): string | null {
  if (href === '/' && role === 'admin') return 'My Day';
  const item = NAV_ITEMS.find((i) => i.href === href);
  if (item) return item.label;
  return STANDALONE[href] ?? null;
}

/**
 * The destination a path belongs to: itself when it is one, its section when it
 * sits under one, `null` when it is neither. This is what the shells select on.
 */
export function sectionHrefFor(pathname: string): string | null {
  const path = normalize(pathname);

  const leaf = LEAF_ROUTES.find((r) => r.pattern.test(path));
  if (leaf) return leaf.section;

  // A destination, or one of the in-shell routes that deliberately isn't one.
  if (NAV_ITEMS.some((i) => i.href === path) || path in STANDALONE) return path;

  // A child route nobody declared above. Fall back to the deepest destination
  // it sits under, which is the behaviour the shells had before this module —
  // `startsWith(item.href + '/')`, minus the ambiguity when two would match.
  const parents = NAV_ITEMS.filter((i) => i.href !== '/' && path.startsWith(i.href + '/'));
  if (parents.length === 0) return null;
  return parents.sort((a, b) => b.href.length - a.href.length)[0].href;
}

/** True when the route sits under a destination — i.e. when there is a way back. */
export function isLeafRoute(pathname: string): boolean {
  const path = normalize(pathname);
  const section = sectionHrefFor(path);
  return section !== null && section !== path;
}

/**
 * The trail for a route. `leafName` is the record's name where the route names
 * a record (a contact, a room); pass `null` when it hasn't loaded.
 */
export function navTrailFor(
  pathname: string,
  role: AppRole | string | null,
  leafName?: string | null,
): Trail {
  const path = normalize(pathname);
  const sectionHref = sectionHrefFor(path);

  if (sectionHref === null) return { section: null, current: null, currentIsLabel: false };

  if (sectionHref === path) {
    return { section: null, current: labelFor(path, role), currentIsLabel: true };
  }

  const sectionLabel = labelFor(sectionHref, role);
  if (sectionLabel === null) return { section: null, current: null, currentIsLabel: false };

  const declared = LEAF_ROUTES.find((r) => r.pattern.test(path));
  return {
    section: { label: sectionLabel, href: sectionHref },
    current: declared?.leaf ?? leafName ?? null,
    currentIsLabel: declared?.leaf !== undefined,
  };
}
