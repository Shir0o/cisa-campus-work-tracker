import { Redirect } from 'expo-router';

// "How this works" is cut (cut-or-keep §16). The route stays as a stub so an
// old deep link lands on home instead of a dead page.
export default function Tutorial() {
  return <Redirect href="/" />;
}
