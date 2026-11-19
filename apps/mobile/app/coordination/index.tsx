import { Redirect } from 'expo-router';

// The phone Board is cut (cut-or-keep §19): pages are desktop work now, and a
// Trainee never read them. The route stays so an old deep link lands home.
export default function CoordinationList() {
  return <Redirect href="/" />;
}
