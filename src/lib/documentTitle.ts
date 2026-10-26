/**
 * Who owns `document.title` (#1838).
 *
 * `LanguageProvider` names the app on mount and on every language change.
 * Effects run from the leaves up, so its write lands *after* a route's: a
 * route that names its own page would be reverted to the internal app name the
 * moment someone switched language. The provider therefore asks here first
 * instead of overwriting a claim.
 */
let routeTitle: string | null = null;

/** The page's own name while a route owns it, or null when the app name stands. */
export function claimedDocumentTitle(): string | null {
  return routeTitle;
}

export function claimDocumentTitle(title: string | null): void {
  routeTitle = title;
}
