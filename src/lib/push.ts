// Native push dispatch — calls the server's /api/send-push endpoint, which
// looks up the recipient's registered Expo push token and forwards to Expo's
// push service. Best-effort: a failure here only means the phone doesn't buzz;
// the in-app notification bell still shows the message.
export interface PushPayload {
  userId: string;
  title: string;
  body?: string;
  data?: Record<string, unknown>;
}

export async function sendPushNotification(input: PushPayload): Promise<void> {
  try {
    await fetch('/api/send-push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
  } catch (error) {
    console.error('Failed to dispatch push notification:', error);
  }
}
