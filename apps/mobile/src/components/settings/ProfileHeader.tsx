import { View } from 'react-native';
import { roleLabel, type AppRole } from '@cisa/core';
import { AppText, Avatar, StatusPill } from '../ui';
import { useTheme } from '../../theme/ThemeProvider';

// Profile header — avatar, display name, email, approved/pending badge, role
// chip. Ported from web's Settings.tsx profile-header block; sourced from
// useAuth() (the /users/{uid} doc) rather than a separate profile fetch.
export function ProfileHeader({
  displayName,
  email,
  photoURL,
  role,
  isApproved,
}: {
  displayName?: string | null;
  email?: string | null;
  photoURL?: string | null;
  role: AppRole | null;
  isApproved: boolean;
}) {
  const { colors, spacing } = useTheme();
  const name = displayName || email || 'You';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
      <Avatar name={name} photoURL={photoURL || undefined} size={56} />
      <View style={{ flex: 1, gap: 4 }}>
        <AppText variant="heading" numberOfLines={1}>
          {name}
        </AppText>
        {email ? (
          <AppText variant="body" color={colors.onSurfaceVariant} numberOfLines={1}>
            {email}
          </AppText>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 2 }}>
          <StatusPill label={roleLabel(role)} tone="accent" />
          <StatusPill label={isApproved ? 'Approved' : 'Pending'} tone={isApproved ? 'teal' : 'amber'} />
        </View>
      </View>
    </View>
  );
}
