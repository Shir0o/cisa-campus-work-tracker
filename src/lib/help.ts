import type { HelpManifest, HelpPage } from '../scripts/compile-help';
import type { AppRole } from './permissions';

/**
 * The Help pages a viewer may see. An unset `audience` applies to everyone;
 * otherwise the viewer's role must be listed. There is no admin super-power
 * over the corpus (ADR 0035): an admin is filtered exactly like any other role.
 */
export function visibleHelpPages(
  manifest: HelpManifest,
  role: AppRole | string | null,
): HelpPage[] {
  return manifest.pages.filter(
    (page) => !page.audience || (role != null && page.audience.includes(role as AppRole)),
  );
}

/**
 * The page at `slug` for a viewer, or `undefined` when the page does not exist
 * or its audience omits the viewer's role — either way the route resolves as
 * not-found.
 */
export function helpPageForRole(
  manifest: HelpManifest,
  role: AppRole | string | null,
  slug: string,
): HelpPage | undefined {
  return visibleHelpPages(manifest, role).find((page) => page.slug === slug);
}
