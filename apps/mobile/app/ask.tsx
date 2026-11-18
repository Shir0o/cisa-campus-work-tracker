import { Redirect } from 'expo-router';

// Ask the team (person-less questions) is cut (cut-or-keep §5); @mentions
// replace it. This route stays so an old deep link lands on My Day instead of a
// dead end. The To ask notepad is a different screen, at /to-ask.
export default function Ask() {
  return <Redirect href="/" />;
}
