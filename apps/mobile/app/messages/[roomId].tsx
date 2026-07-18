import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getRoomName, getRoomPhoto } from '@cisa/core';
import { Screen, AppText, Avatar, IconButton, InlineInput } from '../../src/components/ui';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useAuth } from '../../src/lib/AuthProvider';
import { useChatThreadData } from '../../src/lib/useChatThreadData';
import { MessageBubble } from '../../src/components/messages/MessageBubble';
import { ChatDetailsSheet } from '../../src/components/messages/ChatDetailsSheet';

// A single Messages thread — header, day-grouped message stream, composer.
// Design oracle: web's src/views/Messages.tsx active-chat pane. No @-mention
// autocomplete and no attachment picker in this first pass (see MIGRATION.md).
export default function ChatThread() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const router = useRouter();
  const { colors, spacing } = useTheme();
  const { uid } = useAuth();
  const data = useChatThreadData(roomId);
  const [text, setText] = useState('');
  const [showDetails, setShowDetails] = useState(false);

  const name = data.room ? getRoomName(data.room, uid, data.usersCache) : '';
  const photo = data.room ? getRoomPhoto(data.room, uid, data.usersCache) : null;

  const handleSend = async () => {
    if (!text.trim()) return;
    const toSend = text;
    setText('');
    await data.send(toSend);
  };

  return (
    <Screen>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingHorizontal: spacing.md,
          paddingTop: spacing.sm,
          paddingBottom: spacing.sm,
          borderBottomWidth: 1,
          borderBottomColor: colors.outlineVariant,
        }}
      >
        <Pressable onPress={() => router.back()} hitSlop={8} style={{ padding: 6 }}>
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>
        {data.room ? <Avatar name={name} size={34} photoURL={photo ?? undefined} /> : null}
        <View style={{ flex: 1, minWidth: 0 }}>
          <AppText variant="heading" numberOfLines={1}>
            {name || 'Loading…'}
          </AppText>
          {data.room?.type === 'group' ? (
            <AppText variant="caption" color={colors.onSurfaceVariant}>
              {data.room.memberIds.length} members
            </AppText>
          ) : null}
        </View>
        {data.room ? <IconButton name="information-circle-outline" onPress={() => setShowDetails(true)} /> : null}
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
      >
        <ScrollView contentContainerStyle={{ padding: spacing.lg, flexGrow: 1 }}>
          {data.error ? (
            <AppText variant="body" color={colors.onSurfaceVariant} style={{ textAlign: 'center', paddingVertical: 24 }}>
              {data.error}
            </AppText>
          ) : data.loading ? (
            <AppText variant="body" color={colors.onSurfaceVariant} style={{ textAlign: 'center', paddingVertical: 24 }}>
              Loading messages…
            </AppText>
          ) : data.dayGroups.length === 0 ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <Ionicons name="chatbubble-outline" size={32} color={colors.onSurfaceVariant} style={{ opacity: 0.4 }} />
              <AppText variant="body" color={colors.onSurfaceVariant} style={{ textAlign: 'center' }}>
                No messages yet. Send one to start the conversation.
              </AppText>
            </View>
          ) : (
            data.dayGroups.map((group) => (
              <View key={group.key} style={{ gap: 2 }}>
                <View style={{ alignItems: 'center', marginVertical: 10 }}>
                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: '700',
                      color: colors.onSurfaceVariant,
                      textTransform: 'uppercase',
                      letterSpacing: 0.4,
                    }}
                  >
                    {group.label}
                  </Text>
                </View>
                {group.messages.map((m) => (
                  <MessageBubble key={m.id} message={m} isMe={m.senderId === uid} senderPhoto={data.usersCache[m.senderId]?.photoURL} />
                ))}
              </View>
            ))
          )}
        </ScrollView>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-end',
            gap: 10,
            padding: spacing.md,
            borderTopWidth: 1,
            borderTopColor: colors.outlineVariant,
          }}
        >
          <View style={{ flex: 1 }}>
            <InlineInput value={text} onChangeText={setText} placeholder="Type a message..." multiline style={{ maxHeight: 100 }} />
          </View>
          <IconButton name="send" onPress={handleSend} tone="accent" />
        </View>
      </KeyboardAvoidingView>

      {data.room ? (
        <ChatDetailsSheet
          visible={showDetails}
          room={data.room}
          users={data.users}
          currentUid={uid}
          onInvite={data.invite}
          onLeave={async () => {
            await data.leave();
            setShowDetails(false);
            router.back();
          }}
          onClose={() => setShowDetails(false)}
        />
      ) : null}
    </Screen>
  );
}
