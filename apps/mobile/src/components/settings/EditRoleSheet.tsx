import { useEffect, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { roleOptionsFor, type AppRole, type AppUser } from '@cisa/core';
import { AppText, Avatar, Button } from '../ui';
import { useTheme } from '../../theme/ThemeProvider';

// "Edit role" bottom sheet — ported from web's EditRoleModal. The Full-timer
// (admin) option is only offered when the acting user is themselves admin.
export function EditRoleSheet({
  visible,
  user,
  isAdmin,
  onSave,
  onClose,
}: {
  visible: boolean;
  user: AppUser | null;
  isAdmin: boolean;
  onSave: (uid: string, role: AppRole) => void;
  onClose: () => void;
}) {
  const { colors, radius, spacing, typography } = useTheme();
  const [role, setRole] = useState<AppRole>(user?.role || 'viewer');

  useEffect(() => {
    if (user) setRole(user.role || 'viewer');
  }, [user]);

  if (!user) return null;
  const options = roleOptionsFor(isAdmin);

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
              Edit role
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <Avatar name={user.displayName || user.email} photoURL={user.photoURL || undefined} size={40} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <AppText variant="label" style={{ fontWeight: '700' }} numberOfLines={1}>
                  {user.displayName || 'Unnamed'}
                </AppText>
                <AppText variant="caption" color={colors.onSurfaceVariant} numberOfLines={1}>
                  {user.email}
                </AppText>
              </View>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {options.map((o) => {
                const on = role === o.value;
                return (
                  <Pressable
                    key={o.value}
                    onPress={() => setRole(o.value)}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: radius.full,
                      borderWidth: 1,
                      borderColor: on ? colors.primary : colors.outlineVariant,
                      backgroundColor: on ? colors.primary : 'transparent',
                    }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: '600', color: on ? colors.onPrimary : colors.onSurface }}>
                      {o.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 4 }}>
              <Button title="Cancel" variant="ghost" onPress={onClose} style={{ flex: 1 }} />
              <Button title="Save" onPress={() => onSave(user.uid, role)} style={{ flex: 1 }} />
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
