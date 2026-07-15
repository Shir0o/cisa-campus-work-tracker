import { View } from 'react-native';
import { roleLabel, type AppUser } from '@cisa/core';
import { AppText, Avatar, Card, IconButton } from '../ui';
import { useTheme } from '../../theme/ThemeProvider';

// An approved teammate row — RN has no hover, so web's MemberCard "..." menu
// becomes two always-visible IconButtons, shown per canEditRole/canRemove
// (mirrors web's isAdmin/isManager/isYou gating).
export function MemberRow({
  user,
  canEditRole,
  canRemove,
  busy,
  onEdit,
  onRemove,
}: {
  user: AppUser;
  canEditRole: boolean;
  canRemove: boolean;
  busy: boolean;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const { colors, spacing } = useTheme();
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Avatar name={user.displayName || user.email} photoURL={user.photoURL || undefined} size={40} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <AppText variant="label" style={{ fontWeight: '700' }} numberOfLines={1}>
            {user.displayName || 'Unnamed'}
          </AppText>
          <AppText variant="caption" color={colors.onSurfaceVariant} numberOfLines={1}>
            {user.email} · {roleLabel(user.role)}
          </AppText>
        </View>
        {(canEditRole || canRemove) && (
          <View style={{ flexDirection: 'row', gap: 6, opacity: busy ? 0.5 : 1 }}>
            {canEditRole && <IconButton name="pencil-outline" size={34} tone="neutral" onPress={busy ? undefined : onEdit} />}
            {canRemove && <IconButton name="trash-outline" size={34} tone="neutral" onPress={busy ? undefined : onRemove} />}
          </View>
        )}
      </View>
    </Card>
  );
}
