import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { AppUser } from '@cisa/core';
import { AppText, Avatar, Sheet } from '../ui';
import { useTheme } from '../../theme/ThemeProvider';

type Tab = 'direct' | 'group' | 'announcement';

// "Start Conversation" bottom sheet — tabbed Direct Message / New Group /
// Announcement, mirroring web's CreateChatModal.tsx. `users` is already the
// approved, non-test, non-self candidate pool (see useMessagesData's
// candidateUsers); this sheet only adds its own search box on top, same
// local-filter pattern as prayer/HoldPrayerSheet.tsx.
//
// An announcement takes the same two inputs as a group — it IS a group room
// everyone reads and only Full-timers post to — so the two share a form and
// differ only in which create call runs. `canAnnounce` mirrors the
// firestore.rules gate; without it the tab isn't offered.
export function CreateChatSheet({
  visible,
  users,
  canAnnounce = false,
  onStartDirectChat,
  onCreateGroup,
  onCreateAnnouncement,
  onClose,
}: {
  visible: boolean;
  users: AppUser[];
  canAnnounce?: boolean;
  onStartDirectChat: (targetUser: AppUser) => Promise<void>;
  onCreateGroup: (groupName: string, memberUids: string[]) => Promise<void>;
  onCreateAnnouncement?: (name: string, memberUids: string[]) => Promise<void>;
  onClose: () => void;
}) {
  const { colors, radius, spacing, typography } = useTheme();
  const [tab, setTab] = useState<Tab>('direct');
  const [search, setSearch] = useState('');
  const [groupName, setGroupName] = useState('');
  const [selectedUids, setSelectedUids] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const reset = () => {
    setTab('direct');
    setSearch('');
    setGroupName('');
    setSelectedUids([]);
    setLoading(false);
  };

  const close = () => {
    reset();
    onClose();
  };

  const query = search.trim().toLowerCase();
  const filteredUsers = users.filter(
    (u) => query === '' || u.displayName.toLowerCase().includes(query) || u.email.toLowerCase().includes(query),
  );

  const toggleUid = (uid: string) => {
    setSelectedUids((prev) => (prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]));
  };

  const handleStartDirectChat = async (targetUser: AppUser) => {
    setLoading(true);
    try {
      await onStartDirectChat(targetUser);
      reset();
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRoom = async () => {
    if (!groupName.trim() || selectedUids.length === 0) return;
    const create = tab === 'announcement' ? onCreateAnnouncement : onCreateGroup;
    if (!create) return;
    setLoading(true);
    try {
      await create(groupName.trim(), selectedUids);
      reset();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={close}
      maxHeightRatio={0.85}
      footer={
        tab !== 'direct' ? (
          <View style={{ padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.outlineVariant, backgroundColor: colors.surface }}>
            <Pressable
              onPress={handleCreateRoom}
              disabled={loading || !groupName.trim() || selectedUids.length === 0}
              style={{
                paddingVertical: 12,
                borderRadius: radius.full,
                alignItems: 'center',
                backgroundColor: colors.primary,
                opacity: loading || !groupName.trim() || selectedUids.length === 0 ? 0.5 : 1,
              }}
            >
              <Text style={{ color: colors.onPrimary, fontWeight: '700', fontSize: 15 }}>
                {loading
                  ? tab === 'announcement'
                    ? 'Creating announcement…'
                    : 'Creating group…'
                  : tab === 'announcement'
                    ? `Create Announcement (${selectedUids.length})`
                    : `Create Group (${selectedUids.length})`}
              </Text>
            </Pressable>
          </View>
        ) : undefined
      }
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg }}>
        <Text style={{ fontFamily: typography.fontSerif, fontSize: 18, fontWeight: '500', color: colors.onSurface }}>
          Start Conversation
        </Text>
        <Pressable onPress={close} hitSlop={8} style={{ padding: 6 }}>
          <Ionicons name="close" size={18} color={colors.onSurfaceVariant} />
        </Pressable>
      </View>

      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: spacing.lg, marginTop: 12 }}>
        {((canAnnounce && onCreateAnnouncement
          ? ['direct', 'group', 'announcement']
          : ['direct', 'group']) as Tab[]).map((t) => {
          const on = tab === t;
          return (
            <Pressable
              key={t}
              onPress={() => {
                setTab(t);
                setSearch('');
              }}
              style={{
                flex: 1,
                paddingVertical: 8,
                borderRadius: radius.md,
                alignItems: 'center',
                backgroundColor: on ? colors.primary : colors.surfaceVariant,
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '600', color: on ? colors.onPrimary : colors.onSurface }}>
                {t === 'direct' ? 'Direct Message' : t === 'group' ? 'New Group' : 'Announcement'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={{ paddingHorizontal: spacing.lg, marginTop: 12, marginBottom: 8 }}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search users by name or email..."
          placeholderTextColor={colors.onSurfaceVariant}
          style={{
            borderWidth: 1,
            borderColor: colors.outlineVariant,
            borderRadius: radius.md,
            paddingHorizontal: 12,
            paddingVertical: 10,
            fontSize: 14.5,
            color: colors.onSurface,
            backgroundColor: colors.surfaceContainer,
          }}
        />
      </View>

      {tab !== 'direct' ? (
        <View style={{ paddingHorizontal: spacing.lg, marginBottom: 8, gap: 8 }}>
          {tab === 'announcement' && (
            <AppText variant="caption" color={colors.onSurfaceVariant}>
              Everyone here reads it; only Full-timers can post.
            </AppText>
          )}
          <TextInput
            value={groupName}
            onChangeText={setGroupName}
            placeholder={
              tab === 'announcement'
                ? 'Announcement name (e.g. Weekly notes)'
                : 'Group name (e.g. Outreach Team)'
            }
            placeholderTextColor={colors.onSurfaceVariant}
            style={{
              borderWidth: 1,
              borderColor: colors.outlineVariant,
              borderRadius: radius.md,
              paddingHorizontal: 12,
              paddingVertical: 10,
              fontSize: 14.5,
              color: colors.onSurface,
              backgroundColor: colors.surfaceContainer,
            }}
          />
        </View>
      ) : null}

      <View style={{ paddingHorizontal: spacing.md, paddingBottom: 16, gap: 2 }}>
        {filteredUsers.length === 0 ? (
          <AppText variant="body" color={colors.onSurfaceVariant} style={{ textAlign: 'center', padding: 20 }}>
            No approved users found.
          </AppText>
        ) : (
          filteredUsers.map((u) => {
            const checked = selectedUids.includes(u.uid);
            return (
              <Pressable
                key={u.uid}
                disabled={loading}
                onPress={() => (tab === 'direct' ? handleStartDirectChat(u) : toggleUid(u.uid))}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  padding: 10,
                  borderRadius: radius.md,
                  backgroundColor:
                    tab !== 'direct' && checked
                      ? colors.primaryContainer
                      : pressed
                        ? colors.surfaceVariant
                        : 'transparent',
                  opacity: loading ? 0.6 : 1,
                })}
              >
                <Avatar name={u.displayName} size={36} photoURL={u.photoURL} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ fontSize: 14.5, fontWeight: '600', color: colors.onSurface }}>
                    {u.displayName}
                  </Text>
                  <Text numberOfLines={1} style={{ fontSize: 12, color: colors.onSurfaceVariant }}>
                    {u.email}
                  </Text>
                </View>
                {tab !== 'direct' ? (
                  <Ionicons
                    name={checked ? 'checkmark-circle' : 'ellipse-outline'}
                    size={20}
                    color={checked ? colors.primary : colors.outline}
                  />
                ) : (
                  <Ionicons name="chevron-forward" size={16} color={colors.onSurfaceVariant} />
                )}
              </Pressable>
            );
          })
        )}
      </View>
    </Sheet>
  );
}
