import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { roleOptionsFor, type AppRole, type AppUser } from '@cisa/core';
import { AppText, Avatar, Button, Sheet } from '../ui';
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
  // Keep the last-known user rendered while the sheet animates closed, so
  // content doesn't blank out mid-slide when the caller clears `user`.
  const [shown, setShown] = useState(user);

  useEffect(() => {
    if (user) {
      setRole(user.role || 'viewer');
      setShown(user);
    }
  }, [user]);

  if (!shown) return null;
  const options = roleOptionsFor(isAdmin);

  return (
    <Sheet visible={visible} onClose={onClose}>
      <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, gap: spacing.md }}>
        <Text style={{ fontFamily: typography.fontSerif, fontSize: 18, fontWeight: '500', color: colors.onSurface }}>
          Edit role
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Avatar name={shown.displayName || shown.email} photoURL={shown.photoURL || undefined} size={40} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <AppText variant="label" style={{ fontWeight: '700' }} numberOfLines={1}>
              {shown.displayName || 'Unnamed'}
            </AppText>
            <AppText variant="caption" color={colors.onSurfaceVariant} numberOfLines={1}>
              {shown.email}
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
          <Button title="Save" onPress={() => onSave(shown.uid, role)} style={{ flex: 1 }} />
        </View>
      </View>
    </Sheet>
  );
}
