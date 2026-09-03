import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useV2Theme } from '../../theme/v2';
import {
  getMobileNotificationPlatformName,
  getNotificationPromptDismissed,
  setNotificationPromptDismissed,
  shouldShowMobileNotificationPrompt,
} from '../../lib/notificationPrompt';
import { ensureNotificationPermission } from '../../lib/notifications';

export function MobileNotificationPermissionBanner() {
  const { c, font, fs } = useV2Theme();
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

  const platformName = getMobileNotificationPlatformName();

  const handleDismiss = async () => {
    await setNotificationPromptDismissed(true);
    setVisible(false);
  };

  const handleEnable = async () => {
    if (requesting) return;
    setRequesting(true);
    try {
      await ensureNotificationPermission();
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
          CISA Campus Work Tracker is requesting notification permission for your {platformName}.
        </Text>
      </View>

      <View style={[styles.actions, { borderTopColor: c.room.dateboxLine }]}>
        <TouchableOpacity
          onPress={handleDismiss}
          style={styles.button}
          accessibilityRole="button"
          accessibilityLabel="Later"
        >
          <Text style={[styles.dismissText, { color: c.room.ink3, fontFamily: font.medium }]}>
            Later
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleEnable}
          disabled={requesting}
          style={[styles.button, styles.enableButton, { backgroundColor: c.card.ask }]}
          accessibilityRole="button"
          accessibilityLabel="Enable"
        >
          <Text style={[styles.enableText, { fontFamily: font.semi }]}>
            {requesting ? 'Enabling…' : 'Enable'}
          </Text>
        </TouchableOpacity>
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
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
