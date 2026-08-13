// Native push dispatch — mirrors the web app's src/lib/push.ts. The server's
// /api/send-push endpoint resolves the recipient's registered Expo push token
// and forwards to Expo's push service. Best-effort: a failure only means the
// phone doesn't buzz; the in-app notification bell still shows the message.
export async function sendPushNotification(input: {
  userId: string;
  title: string;
  body?: string;
  data?: Record<string, unknown>;
}): Promise<void> {
  const baseUrl = process.env.EXPO_PUBLIC_API_URL;
  if (!baseUrl) {
    console.warn('EXPO_PUBLIC_API_URL unset — skipping native push dispatch.');
    return;
  }
  try {
    await fetch(baseUrl.replace(/\/$/, '') + '/api/send-push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
  } catch (error) {
    console.error('Failed to dispatch push notification:', error);
  }
}
