// "Message" a contact from My Day — native counterpart to the web app's
// src/lib/messaging.ts. Contacts aren't app users, so this opens a real SMS
// conversation via the OS `sms:` URI rather than an in-app DM.
import { Linking } from 'react-native';

export function openMessage(phone?: string | null): void {
  const digits = (phone || '').replace(/[^\d+]/g, '');
  if (!digits) return;
  Linking.openURL(`sms:${digits}`).catch(() => {
    /* no SMS-capable app available (e.g. simulator/web) */
  });
}

export function openCall(phone?: string | null): void {
  const digits = (phone || '').replace(/[^\d+]/g, '');
  if (!digits) return;
  Linking.openURL(`tel:${digits}`).catch(() => {
    /* no dialer available (e.g. simulator/web) */
  });
}

export function openEmail(email?: string | null): void {
  if (!email) return;
  Linking.openURL(`mailto:${email}`).catch(() => {
    /* no mail app available (e.g. simulator/web) */
  });
}
