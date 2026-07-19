import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { roleLabel, type AppUser } from '@cisa/core';
import { AppText, Avatar, Button, Sheet } from '../ui';
import { useTheme } from '../../theme/ThemeProvider';

// "Remove access?" confirm sheet — ported from web's RemoveConfirmModal.
// This is a soft-remove (approved: false), not a delete — their contacts,
// notes, and history stay with the work.
export function RemoveAccessSheet({
  visible,
  user,
  onConfirm,
  onClose,
}: {
  visible: boolean;
  user: AppUser | null;
  onConfirm: (uid: string) => void;
  onClose: () => void;
}) {
  const { colors, spacing, typography } = useTheme();
  // Keep the last-known user rendered while the sheet animates closed, so
  // content doesn't blank out mid-slide when the caller clears `user`.
  const [shown, setShown] = useState(user);
  useEffect(() => {
    if (user) setShown(user);
  }, [user]);

  if (!shown) return null;
  const firstName = (shown.displayName || shown.email).split(' ')[0];

  return (
    <Sheet visible={visible} onClose={onClose}>
      <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, gap: spacing.md }}>
        <Text style={{ fontFamily: typography.fontSerif, fontSize: 18, fontWeight: '500', color: colors.onSurface }}>
          Remove access?
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Avatar name={shown.displayName || shown.email} photoURL={shown.photoURL || undefined} size={40} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <AppText variant="label" style={{ fontWeight: '700' }} numberOfLines={1}>
              {shown.displayName || 'Unnamed'}
            </AppText>
            <AppText variant="caption" color={colors.onSurfaceVariant}>
              {roleLabel(shown.role)}
            </AppText>
          </View>
        </View>
        <AppText variant="body" color={colors.onSurfaceVariant}>
          {firstName} will lose access to CISA. Their contacts, notes, and history stay with the work — you can
          approve them again anytime.
        </AppText>
        <View style={{ flexDirection: 'row', gap: 12, marginTop: 4 }}>
          <Button title="Cancel" variant="ghost" onPress={onClose} style={{ flex: 1 }} />
          <Button title="Remove" onPress={() => onConfirm(shown.uid)} style={{ flex: 1, backgroundColor: colors.error }} />
        </View>
      </View>
    </Sheet>
  );
}
