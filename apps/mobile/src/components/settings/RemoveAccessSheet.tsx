import { Modal, Pressable, Text, View } from 'react-native';
import { roleLabel, type AppUser } from '@cisa/core';
import { AppText, Avatar, Button } from '../ui';
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
  const { colors, radius, spacing, typography } = useTheme();
  if (!user) return null;
  const firstName = (user.displayName || user.email).split(' ')[0];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }} onPress={onClose}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{ backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg }}
        >
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.outline, opacity: 0.4, alignSelf: 'center', marginVertical: 12 }} />
          <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, gap: spacing.md }}>
            <Text style={{ fontFamily: typography.fontSerif, fontSize: 18, fontWeight: '500', color: colors.onSurface }}>
              Remove access?
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <Avatar name={user.displayName || user.email} photoURL={user.photoURL || undefined} size={40} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <AppText variant="label" style={{ fontWeight: '700' }} numberOfLines={1}>
                  {user.displayName || 'Unnamed'}
                </AppText>
                <AppText variant="caption" color={colors.onSurfaceVariant}>
                  {roleLabel(user.role)}
                </AppText>
              </View>
            </View>
            <AppText variant="body" color={colors.onSurfaceVariant}>
              {firstName} will lose access to CISA. Their contacts, notes, and history stay with the work — you can
              approve them again anytime.
            </AppText>
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 4 }}>
              <Button title="Cancel" variant="ghost" onPress={onClose} style={{ flex: 1 }} />
              <Button title="Remove" onPress={() => onConfirm(user.uid)} style={{ flex: 1, backgroundColor: colors.error }} />
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
