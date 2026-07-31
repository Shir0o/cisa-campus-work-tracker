import { useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { hasMinRole, memberRoleOf, pickLandingForRole, type AppRole, type AppUser } from '@cisa/core';
import { Screen, AppText, Button, Card, InlineInput } from '../src/components/ui';
import { useTheme } from '../src/theme/ThemeProvider';
import { useAuth } from '../src/lib/AuthProvider';
import { useTeamData } from '../src/lib/useTeamData';
import { ProfileHeader } from '../src/components/settings/ProfileHeader';
import { RolesReference } from '../src/components/settings/RolesReference';
import { AppearancePicker } from '../src/components/settings/AppearancePicker';
import { NotificationsSettings } from '../src/components/settings/NotificationsSettings';
import { MemberRow } from '../src/components/settings/MemberRow';
import { PendingMemberRow } from '../src/components/settings/PendingMemberRow';
import { InviteRow } from '../src/components/settings/InviteRow';
import { EditRoleSheet } from '../src/components/settings/EditRoleSheet';
import { RemoveAccessSheet } from '../src/components/settings/RemoveAccessSheet';
import { InviteSheet } from '../src/components/settings/InviteSheet';
import { MemberYouScreen } from '../src/components/member/MemberYouScreen';

// Settings — ported in full from src/views/Settings.tsx: profile, a static
// roles reference, appearance, and (Trainee+) full team management. Deferred
// (see MIGRATION.md): the Quick Add/Integrations playground + webhook
// console (server-side dev tooling) and the embedded feedback list (mobile
// already has this as its own /feedback-admin route).
//
// Members land on the v2 "You" screen instead — none of the team management
// below is theirs, and the design gives them a much shorter page.
export default function SettingsScreen() {
  const { role } = useAuth();
  const memberRole = memberRoleOf(role);
  if (memberRole) return <MemberYouScreen role={memberRole} showBack />;
  return <StaffSettings />;
}

function StaffSettings() {
  const router = useRouter();
  const { colors, spacing } = useTheme();
  const { user, uid, role, isApproved } = useAuth();
  const isAdmin = role === 'admin';
  const canManage = hasMinRole(role, 'manager');
  const team = useTeamData(role);

  const [editTarget, setEditTarget] = useState<AppUser | null>(null);
  const [removeTarget, setRemoveTarget] = useState<AppUser | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [inviting, setInviting] = useState(false);

  const handleInvite = async (email: string, inviteRole: AppRole) => {
    if (!uid || inviting) return;
    setInviting(true);
    try {
      const result = await team.invite(email, inviteRole, uid);
      if (!result.ok) {
        Alert.alert('Could not add', result.reason);
        return;
      }
      setShowInvite(false);
    } finally {
      setInviting(false);
    }
  };

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingTop: spacing.sm }}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={{ padding: 6 }}>
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing.sm, paddingBottom: 40, gap: spacing.xl }}>
        <AppText variant="title">Settings</AppText>

        <ProfileHeader
          displayName={user?.displayName}
          email={user?.email}
          photoURL={user?.photoURL}
          role={role}
          isApproved={isApproved}
        />

        <RolesReference currentRole={role} />

        <AppearancePicker />

        {/* Mobile v2 lives on its own screen, in its own language — this is
            just the way in for someone who came looking here first. */}
        {pickLandingForRole(role) === 'trainee' && (
          <Card onPress={() => router.push('/queue-settings')}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <View style={{ flex: 1 }}>
                <AppText variant="heading">Your queue</AppText>
                <AppText variant="caption" color={colors.onSurfaceVariant}>
                  When you're on campus, and how much a day holds.
                </AppText>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.onSurfaceVariant} />
            </View>
          </Card>
        )}

        <NotificationsSettings />

        {canManage && (
          <View style={{ gap: spacing.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <AppText variant="heading">Your team</AppText>
              <Button title="Add someone" variant="secondary" onPress={() => setShowInvite(true)} />
            </View>

            <InlineInput placeholder="Search your team…" value={team.search} onChangeText={team.setSearch} />

            {team.loading ? (
              <AppText variant="body" color={colors.onSurfaceVariant} style={{ textAlign: 'center', paddingVertical: 16 }}>
                Gathering your team…
              </AppText>
            ) : (
              <>
                {team.roster.pending.length > 0 && (
                  <View style={{ gap: spacing.xs }}>
                    <AppText variant="label" color={colors.onSurfaceVariant}>
                      ASKING TO JOIN
                    </AppText>
                    {team.roster.pending.map((u) => (
                      <PendingMemberRow
                        key={u.uid}
                        user={u}
                        busy={team.updatingId === u.uid}
                        onApprove={() => team.approve(u.uid)}
                      />
                    ))}
                  </View>
                )}

                <View style={{ gap: spacing.xs }}>
                  {team.roster.approved.map((u) => (
                    <MemberRow
                      key={u.uid}
                      user={u}
                      canEditRole={isAdmin && u.uid !== uid}
                      canRemove={u.uid !== uid}
                      busy={team.updatingId === u.uid}
                      onEdit={() => setEditTarget(u)}
                      onRemove={() => setRemoveTarget(u)}
                    />
                  ))}
                  {team.roster.invites.map((invite) => (
                    <InviteRow key={invite.email} invite={invite} onCancel={() => team.revoke(invite.email)} />
                  ))}
                  {team.roster.approved.length === 0 && team.roster.invites.length === 0 && (
                    <AppText variant="body" color={colors.onSurfaceVariant} style={{ textAlign: 'center', paddingVertical: 16 }}>
                      No one matches that just yet.
                    </AppText>
                  )}
                </View>

                <Card>
                  <AppText variant="caption" color={colors.onSurfaceVariant}>
                    A note on access: you can't edit or remove your own access — ask another Trainee or Full-timer if
                    you need a change.
                  </AppText>
                </Card>
              </>
            )}
          </View>
        )}
      </ScrollView>

      <EditRoleSheet
        visible={!!editTarget}
        user={editTarget}
        isAdmin={isAdmin}
        onSave={(uid, newRole) => {
          team.changeRole(uid, newRole);
          setEditTarget(null);
        }}
        onClose={() => setEditTarget(null)}
      />
      <RemoveAccessSheet
        visible={!!removeTarget}
        user={removeTarget}
        onConfirm={(uid) => {
          team.removeAccess(uid);
          setRemoveTarget(null);
        }}
        onClose={() => setRemoveTarget(null)}
      />
      <InviteSheet
        visible={showInvite}
        isAdmin={isAdmin}
        submitting={inviting}
        onSubmit={handleInvite}
        onClose={() => setShowInvite(false)}
      />
    </Screen>
  );
}
