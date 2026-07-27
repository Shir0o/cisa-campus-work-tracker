import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { canAccessRoute } from '@cisa/core';
import { Screen, AppText, IconButton, InlineInput } from '../../src/components/ui';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useAuth } from '../../src/lib/AuthProvider';
import { useMessagesData } from '../../src/lib/useMessagesData';
import { ChatRoomRow } from '../../src/components/messages/ChatRoomRow';
import { CreateChatSheet } from '../../src/components/messages/CreateChatSheet';

// Messages — the private direct/group chat room list (design oracle: web's
// src/views/Messages.tsx sidebar). No bottom-tab slot (the 6-tab bar is
// full), so this is a pushed route reached from "More", following
// Notifications/Search's back-nav pattern.
export default function Messages() {
  const router = useRouter();
  const { colors, spacing } = useTheme();
  const { uid, role } = useAuth();
  const data = useMessagesData();
  const [showCreateSheet, setShowCreateSheet] = useState(false);

  // The tab bar has no entry for '/messages' at all today (see "More"), so
  // this guard can never actually trigger — 'viewer' is NAV_ITEMS' floor role
  // — but it's kept for consistency with every other pushed route's
  // direct-URL/deep-link protection (journey.tsx, history.tsx, people.tsx).
  if (!canAccessRoute(role, '/messages')) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: 8 }}>
          <Ionicons name="lock-closed-outline" size={32} color={colors.onSurfaceVariant} />
          <AppText variant="heading">Not available</AppText>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingTop: spacing.sm }}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={{ padding: 6 }}>
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <View style={{ gap: 4, flex: 1 }}>
            <AppText variant="label" color={colors.primary}>
              MESSAGES
            </AppText>
            <AppText variant="title">Fellowship Chat</AppText>
            <AppText variant="body" color={colors.onSurfaceVariant}>
              Private team messaging.
            </AppText>
          </View>
          <IconButton name="add" onPress={() => setShowCreateSheet(true)} tone="accent" />
        </View>

        <InlineInput placeholder="Search chats..." value={data.search} onChangeText={data.setSearch} />

        {data.error ? (
          <AppText variant="body" color={colors.onSurfaceVariant} style={{ textAlign: 'center', paddingVertical: 24 }}>
            {data.error}
          </AppText>
        ) : data.loading ? (
          <AppText variant="body" color={colors.onSurfaceVariant} style={{ textAlign: 'center', paddingVertical: 24 }}>
            Loading chat channels…
          </AppText>
        ) : data.rooms.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 40, gap: 12 }}>
            <Ionicons name="chatbubbles-outline" size={40} color={colors.onSurfaceVariant} style={{ opacity: 0.4 }} />
            <AppText variant="heading" style={{ textAlign: 'center' }}>
              No conversations yet
            </AppText>
            <AppText variant="body" color={colors.onSurfaceVariant} style={{ textAlign: 'center' }}>
              Start a direct message or a group chat with the team.
            </AppText>
            <Pressable onPress={() => setShowCreateSheet(true)} hitSlop={8}>
              <AppText variant="label" color={colors.primary} style={{ fontWeight: '700' }}>
                New Conversation
              </AppText>
            </Pressable>
          </View>
        ) : (
          <View style={{ gap: 8 }}>
            {data.rooms.map((room) => (
              <ChatRoomRow
                key={room.id}
                room={room}
                currentUid={uid}
                usersCache={data.usersCache}
                unread={data.isUnread(room)}
                onPress={() => router.push(`/messages/${room.id}`)}
              />
            ))}
          </View>
        )}
      </ScrollView>

      <CreateChatSheet
        visible={showCreateSheet}
        users={data.candidateUsers}
        canAnnounce={data.canAnnounce}
        onCreateAnnouncement={async (name, uids) => {
          const roomId = await data.createAnnouncement(name, uids);
          setShowCreateSheet(false);
          router.push(`/messages/${roomId}`);
        }}
        onStartDirectChat={async (targetUser) => {
          const roomId = await data.startDirectChat(targetUser);
          setShowCreateSheet(false);
          router.push(`/messages/${roomId}`);
        }}
        onCreateGroup={async (name, uids) => {
          const roomId = await data.createGroup(name, uids);
          setShowCreateSheet(false);
          router.push(`/messages/${roomId}`);
        }}
        onClose={() => setShowCreateSheet(false)}
      />
    </Screen>
  );
}
