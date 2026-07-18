import { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { filterChatUsers, type AppUser, type ChatRoom } from '@cisa/core';
import { AppText, Avatar } from '../ui';
import { useTheme } from '../../theme/ThemeProvider';

// Room info sheet — direct chats show the other member's profile (a
// "View Directory Contact Profile" placeholder, matching People/Journey's
// deferred contact-detail navigation); group chats show the member roster,
// an invite flow, and Leave Group. Design oracle: web's ChatDetailsModal.tsx.
export function ChatDetailsSheet({
  visible,
  room,
  users,
  currentUid,
  onInvite,
  onLeave,
  onClose,
}: {
  visible: boolean;
  room: ChatRoom;
  users: AppUser[];
  currentUid: string | null;
  onInvite: (uids: string[], names: string[]) => Promise<void>;
  onLeave: () => Promise<void>;
  onClose: () => void;
}) {
  const { colors, radius, spacing, typography } = useTheme();
  const [showInvite, setShowInvite] = useState(false);
  const [selectedUids, setSelectedUids] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const members = room.memberIds.map((id) => users.find((u) => u.uid === id)).filter((u): u is AppUser => !!u);
  const nonMembers = filterChatUsers(users, currentUid, '').filter((u) => !room.memberIds.includes(u.uid));
  const otherMember = room.type === 'direct' ? members.find((m) => m.uid !== currentUid) : null;

  const close = () => {
    setShowInvite(false);
    setSelectedUids([]);
    onClose();
  };

  const toggleUid = (uid: string) =>
    setSelectedUids((prev) => (prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]));

  const handleInvite = async () => {
    if (selectedUids.length === 0) return;
    setLoading(true);
    try {
      const invited = nonMembers.filter((u) => selectedUids.includes(u.uid));
      await onInvite(selectedUids, invited.map((u) => u.displayName));
      setSelectedUids([]);
      setShowInvite(false);
    } finally {
      setLoading(false);
    }
  };

  const handleLeave = () => {
    Alert.alert('Leave group?', 'You can be invited back in later.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: () => void onLeave() },
    ]);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }} onPress={close}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{ backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, maxHeight: '85%' }}
        >
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.outline, opacity: 0.4, alignSelf: 'center', marginVertical: 12 }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg }}>
            <Text style={{ fontFamily: typography.fontSerif, fontSize: 18, fontWeight: '500', color: colors.onSurface }}>
              {room.type === 'group' ? 'Group Details' : 'Conversation Details'}
            </Text>
            <Pressable onPress={close} hitSlop={8} style={{ padding: 6 }}>
              <Ionicons name="close" size={18} color={colors.onSurfaceVariant} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: 16 }}>
            {room.type === 'direct' && otherMember ? (
              <View style={{ alignItems: 'center', gap: 8 }}>
                <Avatar name={otherMember.displayName} size={72} photoURL={otherMember.photoURL} />
                <AppText variant="heading">{otherMember.displayName}</AppText>
                <AppText variant="caption" color={colors.onSurfaceVariant}>
                  {otherMember.email}
                </AppText>
                <Pressable
                  onPress={() =>
                    Alert.alert(otherMember.displayName, "Contact details aren't wired up yet — coming in a later pass.")
                  }
                  hitSlop={8}
                >
                  <AppText variant="label" color={colors.primary} style={{ fontWeight: '700' }}>
                    View Directory Contact Profile
                  </AppText>
                </Pressable>
              </View>
            ) : (
              <View style={{ gap: 16 }}>
                <View style={{ gap: 2 }}>
                  <AppText variant="label" color={colors.onSurfaceVariant}>
                    GROUP NAME
                  </AppText>
                  <AppText variant="heading">{room.name}</AppText>
                  <AppText variant="caption" color={colors.onSurfaceVariant}>
                    Created by {room.createdByName}
                  </AppText>
                </View>

                <View style={{ gap: 8 }}>
                  <AppText variant="label" color={colors.onSurfaceVariant}>
                    MEMBERS ({members.length})
                  </AppText>
                  {members.map((m) => (
                    <View key={m.uid} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Avatar name={m.displayName} size={30} photoURL={m.photoURL} />
                      <Text numberOfLines={1} style={{ flex: 1, fontSize: 13.5, fontWeight: '600', color: colors.onSurface }}>
                        {m.displayName}
                      </Text>
                    </View>
                  ))}
                </View>

                {!showInvite ? (
                  <Pressable
                    onPress={() => setShowInvite(true)}
                    style={{ paddingVertical: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.outlineVariant, alignItems: 'center' }}
                  >
                    <AppText variant="label" color={colors.primary} style={{ fontWeight: '700' }}>
                      Invite new members
                    </AppText>
                  </Pressable>
                ) : (
                  <View style={{ gap: 8 }}>
                    {nonMembers.length === 0 ? (
                      <AppText variant="caption" color={colors.onSurfaceVariant}>
                        Everyone approved is already in this group.
                      </AppText>
                    ) : (
                      nonMembers.map((u) => {
                        const checked = selectedUids.includes(u.uid);
                        return (
                          <Pressable key={u.uid} onPress={() => toggleUid(u.uid)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                            <Ionicons
                              name={checked ? 'checkmark-circle' : 'ellipse-outline'}
                              size={18}
                              color={checked ? colors.primary : colors.outline}
                            />
                            <Avatar name={u.displayName} size={26} photoURL={u.photoURL} />
                            <Text style={{ fontSize: 13, color: colors.onSurface }}>{u.displayName}</Text>
                          </Pressable>
                        );
                      })
                    )}
                    {nonMembers.length > 0 ? (
                      <Pressable
                        onPress={handleInvite}
                        disabled={loading || selectedUids.length === 0}
                        style={{
                          paddingVertical: 10,
                          borderRadius: radius.full,
                          backgroundColor: colors.primary,
                          alignItems: 'center',
                          opacity: loading || selectedUids.length === 0 ? 0.5 : 1,
                        }}
                      >
                        <Text style={{ color: colors.onPrimary, fontWeight: '700' }}>{loading ? 'Adding…' : 'Add Selected'}</Text>
                      </Pressable>
                    ) : null}
                  </View>
                )}
              </View>
            )}
          </ScrollView>

          {room.type === 'group' ? (
            <View style={{ padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.outlineVariant }}>
              <Pressable
                onPress={handleLeave}
                style={{ paddingVertical: 12, borderRadius: radius.full, borderWidth: 1, borderColor: colors.error, alignItems: 'center' }}
              >
                <Text style={{ color: colors.error, fontWeight: '700' }}>Leave Group</Text>
              </Pressable>
            </View>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
