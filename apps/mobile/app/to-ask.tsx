import { Redirect } from 'expo-router';
import { useAuth } from '../src/lib/AuthProvider';
import { ToAskScreen } from '../src/components/ft/ToAskScreen';

// To ask (#1649) — a Full-timer's private notepad, reached from More. Nobody
// else has a route to it, so anyone who lands here by URL goes home — the same
// gate the web page (/ask) holds.
export default function ToAsk() {
  const { role } = useAuth();
  if (role !== 'admin') return <Redirect href="/" />;
  return <ToAskScreen />;
}
