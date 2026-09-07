/**
 * The origin QR codes and staff links point at (ADR 0011). Never derived from
 * `window.location.origin`: a dev or preview build would render an unreachable
 * `localhost` code in front of a room. The default is the production domain,
 * following the `VITE_FIREBASE_AUTH_DOMAIN` pattern that handles the same
 * prod/QA domain split — see .env.example.
 */
const configured = import.meta.env.VITE_PUBLIC_APP_URL;

export const PUBLIC_APP_URL =
  typeof configured === 'string' && configured ? configured.replace(/\/+$/, '') : 'https://cisa-campus-work-tracker.pages.dev';
