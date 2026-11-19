import { Redirect } from 'expo-router';

// The phone Board is cut (cut-or-keep §19): a page opens on the web, and the
// phone keeps no read-only copy. The route stays so an old link lands home.
export default function CoordinationDoc() {
  return <Redirect href="/" />;
}
