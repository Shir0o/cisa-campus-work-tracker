import { Redirect } from 'expo-router';

// The separate phone prayer log is cut (cut-or-keep §21). The route stays as a
// redirect so an old deep link lands on My Day instead of a blank screen.
export default function PrayerLog() {
  return <Redirect href="/" />;
}
