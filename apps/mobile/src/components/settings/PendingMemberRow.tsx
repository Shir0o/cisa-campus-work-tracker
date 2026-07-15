import { View } from 'react-native';
import { roleLabel, type AppUser } from '@cisa/core';
import { AppText, Avatar, Button, Card } from '../ui';
import { useTheme } from '../../theme/ThemeProvider';

// "Asking to join" row — a pending (unapproved) user, with a single Approve
// action. Mirrors web's pending-users block above the main roster.
export function PendingMemberRow({
  user,
  busy,
  onApprove,
}: {
  user: AppUser;
  busy: boolean;
  onApprove: () => void;
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
        <Button title={busy ? '…' : 'Approve'} variant="secondary" disabled={busy} onPress={onApprove} />
      </View>
    </Card>
  );
}
