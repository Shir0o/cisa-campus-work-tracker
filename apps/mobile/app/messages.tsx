import { Redirect } from 'expo-router';

// Chats and the Messages tab are cut (cut-or-keep §20). This route stays so an
// old deep link lands on My Day instead of a dead end.
export default function Messages() {
  return <Redirect href="/" />;
}
