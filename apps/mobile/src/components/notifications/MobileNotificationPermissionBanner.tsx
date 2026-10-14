import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useV2Theme } from '../../theme/v2';
import {
  getNotificationPromptDismissed,
  setNotificationPromptDismissed,
  shouldShowMobileNotificationPrompt,
} from '../../lib/notificationPrompt';
import { ensureNotificationPermission } from '../../lib/notifications';
import { syncPushToken } from '../../lib/pushRegistration';
import { useAuth } from '../../lib/AuthProvider';

export function MobileNotificationPermissionBanner() {
  const { c, font, fs } = useV2Theme();
  // The real signed-in account, not the effective (possibly impersonated) uid —
  // a push token is a device-level registration for the actual auth user.
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const current = await Notifications.getPermissionsAsync();
        const dismissed = await getNotificationPromptDismissed();
        if (
          !cancelled &&
          shouldShowMobileNotificationPrompt({
            status: current.status,
            canAskAgain: current.canAskAgain,
            dismissed,
          })
        ) {
          setVisible(true);
        }
      } catch {
        // Non-fatal if permissions check fails
      }
    }

    void check();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!visible) return null;

  const handleDismiss = async () => {
    await setNotificationPromptDismissed(true);
    setVisible(false);
  };

  const handleEnable = async () => {
    if (requesting) return;
    setRequesting(true);
    try {
      const granted = await ensureNotificationPermission();
      // Register the device the moment permission lands. usePushRegistration
      // otherwise only syncs on mount and on AppState -> active, so a grant
      // made while the app stays in the foreground left the device without a
      // token — the user said yes and nothing arrived in the background until
      // they happened to background and reopen the app (#977).
      if (granted) await syncPushToken(user?.uid ?? null);
    } finally {
      await setNotificationPromptDismissed(true);
      setVisible(false);
      setRequesting(false);
    }
  };

  return (
    <View
      style={[
        styles.banner,
        {
          backgroundColor: c.card.sheet,
          borderColor: c.card.line,
          bottom: Math.max(insets.bottom, 16) + 12,
        },
      ]}
      accessibilityRole="alert"
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: c.room.ink, fontFamily: font.semi }]}>
          Enable notifications
        </Text>
        <Text style={[styles.body, { color: c.room.ink3, fontFamily: font.medium }]}>
          Turn on nudges to get notified when follow-ups are due or team messages arrive.
        </Text>
      </View>

      <View style={[styles.actions, { borderTopColor: c.room.dateboxLine }]}>
        <Pressable
          onPress={handleDismiss}
          style={({ pressed }) => [
            styles.button,
            {
              opacity: pressed ? 0.75 : 1,
              transform: [{ scale: pressed ? 0.97 : 1 }],
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Later"
        >
          <Text style={[styles.dismissText, { color: c.room.ink3, fontFamily: font.medium }]}>
            Later
          </Text>
        </Pressable>

        <Pressable
          onPress={handleEnable}
          disabled={requesting}
          style={({ pressed }) => [
            styles.button,
            styles.enableButton,
            {
              backgroundColor: c.card.ask,
              opacity: requesting ? 0.6 : pressed ? 0.85 : 1,
              transform: [{ scale: pressed && !requesting ? 0.97 : 1 }],
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Enable"
        >
          <Text style={[styles.enableText, { fontFamily: font.semi }]}>
            {requesting ? 'Enabling…' : 'Enable'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 99,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  header: {
    marginBottom: 12,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  body: {
    fontSize: 13,
    lineHeight: 18,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
  },
  button: {
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  enableButton: {
    paddingHorizontal: 16,
  },
  dismissText: {
    fontSize: 13,
    fontWeight: '500',
  },
  enableText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
});
