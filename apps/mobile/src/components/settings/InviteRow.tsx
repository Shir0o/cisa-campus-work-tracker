import { StyleSheet, View } from 'react-native';
import { roleLabel, type Invitation } from '@cisa/core';
import { AppText, IconButton } from '../ui';
import { useTheme } from '../../theme/ThemeProvider';

// A pending "pre-added by email" invitation — dashed border distinguishes it
// from an actual member row, matching web's InviteRow.
export function InviteRow({ invite, onCancel }: { invite: Invitation; onCancel: () => void }) {
  const { colors, radius, spacing } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        padding: spacing.md,
        borderRadius: radius.lg,
        borderWidth: StyleSheet.hairlineWidth * 2,
        borderStyle: 'dashed',
        borderColor: colors.outlineVariant,
      }}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <AppText variant="label" style={{ fontWeight: '700' }} numberOfLines={1}>
          {invite.email}
        </AppText>
        <AppText variant="caption" color={colors.onSurfaceVariant}>
          {roleLabel(invite.role)} · waiting to sign up
        </AppText>
      </View>
      <IconButton name="trash-outline" size={34} tone="neutral" onPress={onCancel} />
    </View>
  );
}
