import { useEffect, useState } from 'react';
import { Linking, Platform, View } from 'react-native';
import { AppText, Button, Card } from '../ui';
import { useTheme } from '../../theme/ThemeProvider';
import { useAuth } from '../../lib/AuthProvider';
import {
  ensureNotificationPermission,
  getNotificationPermissionStatus,
  registerForPushToken,
  scheduleReminderNotification,
} from '../../lib/notifications';
import { setPushToken } from '../../lib/data/users';

type Status = 'granted' | 'denied' | 'undetermined' | 'unsupported';

const STATUS_LABEL: Record<Status, string> = {
  granted: 'Enabled',
  denied: 'Off — denied',
  undetermined: 'Not set up yet',
  unsupported: 'Not available on web',
};

// Notifications status/enable row — structured like AppearancePicker.tsx.
// Local reminder notifications (Quick Capture's "set a reminder" step) work
// regardless of this card; this is specifically about permission status and
// (best-effort) remote push token registration — see
// apps/mobile/src/lib/notifications.ts for why remote push stays a no-op
// until Phase 5's `eas init` step (MIGRATION.md).
export function NotificationsSettings() {
  const { colors, radius, spacing } = useTheme();
  const { uid } = useAuth();
  const [status, setStatus] = useState<Status>('unsupported');

  useEffect(() => {
    getNotificationPermissionStatus().then(setStatus);
  }, []);

  const handleEnable = async () => {
    const granted = await ensureNotificationPermission();
    setStatus(granted ? 'granted' : 'denied');
    if (granted && uid) {
      const token = await registerForPushToken();
      if (token) void setPushToken(uid, token);
    }
  };

  return (
    <View style={{ gap: spacing.sm }}>
      <AppText variant="heading">Notifications</AppText>
      <Card>
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <AppText variant="body">{STATUS_LABEL[status]}</AppText>
          </View>
          {status === 'undetermined' && <Button title="Enable notifications" onPress={handleEnable} />}
          {status === 'denied' && (
            <Button title="Open Settings" variant="secondary" onPress={() => Linking.openSettings()} />
          )}
          {__DEV__ && status === 'granted' && (
            <Button
              title="Send test notification in 5s"
              variant="ghost"
              onPress={() =>
                void scheduleReminderNotification({
                  title: 'Test',
                  body: 'Debug notification',
                  trigger: new Date(Date.now() + 5000),
                })
              }
            />
          )}
        </View>
      </Card>
      {Platform.OS !== 'web' && status !== 'granted' && (
        <AppText variant="caption" color={colors.onSurfaceVariant}>
          You'll also be asked the first time you set a Log reminder — no need to enable it here first.
        </AppText>
      )}
    </View>
  );
}
