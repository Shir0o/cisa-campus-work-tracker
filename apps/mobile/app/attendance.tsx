import { Redirect } from 'expo-router';

// The phone Gatherings screen is cut (cut-or-keep §8): Gatherings is a desktop
// page, and this route stays only so an old deep link lands on My Day instead
// of a dead screen. The web /attendance page is unchanged.
export default function Attendance() {
  return <Redirect href="/" />;
}
