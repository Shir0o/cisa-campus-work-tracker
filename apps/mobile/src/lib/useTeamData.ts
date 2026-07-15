// Live data for Settings' "Your team" roster (Trainee+ only). Mirrors web's
// Settings.tsx team-management state: live users+invitations subscriptions,
// search, and the pending/approved/invites split via the shared,
// unit-tested splitTeamRoster.
import { useEffect, useMemo, useState } from 'react';
import {
  emailAlreadyRegistered,
  hasMinRole,
  splitTeamRoster,
  type AppRole,
  type AppUser,
  type Invitation,
} from '@cisa/core';
import { handleFirestoreError, OperationType } from './firebase';
import {
  subscribeUsers,
  subscribeInvitations,
  toggleUserApproval,
  changeUserRole,
  sendInvitation,
  revokeInvitation,
} from './data/users';

export function useTeamData(role: AppRole | null) {
  const canManage = hasMinRole(role, 'manager');

  const [users, setUsers] = useState<AppUser[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    if (!canManage) return;
    const onLoadError = (e: unknown, path: string) =>
      handleFirestoreError(e, OperationType.LIST, path, { rethrow: false });
    const unsubUsers = subscribeUsers(
      (list) => {
        setUsers(list);
        setLoading(false);
      },
      (e) => onLoadError(e, 'users'),
    );
    const unsubInvites = subscribeInvitations(setInvitations, (e) => onLoadError(e, 'invitations'));
    return () => {
      unsubUsers();
      unsubInvites();
    };
  }, [canManage]);

  const roster = useMemo(() => splitTeamRoster(users, invitations, search), [users, invitations, search]);

  const approve = async (uid: string) => {
    setUpdatingId(uid);
    try {
      await toggleUserApproval(uid, false);
    } finally {
      setUpdatingId(null);
    }
  };

  const removeAccess = async (uid: string) => {
    setUpdatingId(uid);
    try {
      await toggleUserApproval(uid, true);
    } finally {
      setUpdatingId(null);
    }
  };

  const changeRole = async (uid: string, newRole: AppRole) => {
    setUpdatingId(uid);
    try {
      await changeUserRole(uid, newRole);
    } finally {
      setUpdatingId(null);
    }
  };

  const invite = async (
    email: string,
    inviteRole: AppRole,
    invitedBy: string,
  ): Promise<{ ok: boolean; reason?: string }> => {
    const emailLower = email.trim().toLowerCase();
    if (emailAlreadyRegistered(users, emailLower)) {
      return { ok: false, reason: 'A user with this email already exists.' };
    }
    await sendInvitation({ email: emailLower, role: inviteRole, invitedBy });
    return { ok: true };
  };

  const revoke = (email: string) => revokeInvitation(email);

  return { canManage, loading, roster, search, setSearch, updatingId, approve, removeAccess, changeRole, invite, revoke };
}
