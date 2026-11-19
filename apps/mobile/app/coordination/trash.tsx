import { Redirect } from 'expo-router';

// The phone Board is cut (cut-or-keep §19), and Trash went with it. The route
// stays so an old link lands home.
export default function CoordinationTrash() {
  return <Redirect href="/" />;
}
