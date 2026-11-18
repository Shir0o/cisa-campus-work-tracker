import { Redirect } from 'expo-router';

// The monthly park outing log is cut (cut-or-keep §2). This route stays so an
// old deep link lands on My Day instead of a dead end.
export default function Outreach() {
  return <Redirect href="/" />;
}
