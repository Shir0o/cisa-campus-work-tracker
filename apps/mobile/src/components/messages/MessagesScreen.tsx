// Mobile v2 — Messages, staff-side. The design's `M2Messages`
// (views/mobile/screens2.jsx): the conversations you're already part of, newest
// first, three lines a row.
//
// No create affordance and no search — the design's list is what you're part
// of, not a place you go looking. Starting a conversation is desktop work.
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from '../ui/SafeArea';
import {
  chatKindNote,
  chatRowPreview,
  getRoomName,
  isPushedScreen,
  memberAgo,
  messagesScreenNote,
  type ChatRoom,
} from '@cisa/core';
import { useAuth } from '../../lib/AuthProvider';
import { useMessagesData } from '../../lib/useMessagesData';
import { roomForRole, useV2Theme } from '../../theme/v2';
import { PersonMark } from '../queue/atoms';
import { Room, V2Empty, V2Screen } from '../v2/Widget';

export function MessagesScreen() {
  const { role } = useAuth();
  return (
    <Room room={roomForRole(role)}>
      <Messages />
    </Room>
  );
}

function ConversationRow({
  room,
  name,
  preview,
  unread,
}: {
  room: ChatRoom;
  name: string;
  preview: string;
  unread: boolean;
}) {
  const { c, font, radius, fs } = useV2Theme();
  const router = useRouter();
  const kind = chatKindNote(room);
  // A DM wears the person's own stable colour; the two kinds of room-for-many
  // get one colour each, so the list reads by shape before you read a word.
  const tint =
    room.type === 'announcement' ? c.card.tones.follow.dot : room.type === 'group' ? c.card.link : undefined;

  return (
    <Pressable
      onPress={() => router.push(`/messages/${room.id}`)}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        minHeight: 68,
        paddingHorizontal: 14,
        paddingVertical: 12,
        marginTop: 9,
        borderRadius: radius.row,
        backgroundColor: c.card.bg,
        opacity: pressed ? 0.75 : 1,
      })}
    >
      {tint ? (
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 13,
            backgroundColor: tint,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontFamily: font.extra, fontSize: fs(14), color: c.card.onPrimary }}>
            {name.slice(0, 1).toUpperCase()}
          </Text>
        </View>
      ) : (
        <PersonMark name={name} id={room.id} size={40} radius={13} fontSize={14} />
      )}

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontFamily: font.extra, fontSize: fs(15), color: c.card.ink }}>
          {name}
        </Text>
        <Text
          numberOfLines={1}
          style={{ fontFamily: font.medium, fontSize: fs(13), color: c.card.ink2, marginTop: 2 }}
        >
          {preview || 'No messages yet'}
        </Text>
        {!!kind && (
          <Text style={{ fontFamily: font.semi, fontSize: fs(11.5), color: c.card.ink3, marginTop: 3 }}>{kind}</Text>
        )}
      </View>

      <View style={{ alignItems: 'flex-end', gap: 5 }}>
        <Text style={{ fontFamily: font.medium, fontSize: fs(11.5), color: c.card.ink3 }}>
          {room.lastMessage ? memberAgo(room.lastMessage.timestamp as string | null) : ''}
        </Text>
        {unread && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.card.tones.follow.dot }} />}
      </View>
    </Pressable>
  );
}

function Messages() {
  const { c, font, fs } = useV2Theme();
  const router = useRouter();
  const { uid, role } = useAuth();
  const data = useMessagesData();

  // A tab for the full-timer, a drawer row for the trainee — only the one that
  // pushed here has somewhere to go back to.
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.room.bg }}>
      <V2Screen
        title="Messages"
        note={messagesScreenNote(data.rooms.length, data.unreadCount)}
        onBack={isPushedScreen(role, 'messages') ? back : undefined}
      >
        <Text
          style={{ fontFamily: font.medium, fontSize: fs(13.5), lineHeight: fs(19), color: c.room.ink3, marginBottom: 6 }}
        >
          The conversations you're part of — students, the team, and what gets announced.
        </Text>

        {data.loading ? (
          <ActivityIndicator color={c.room.ink2} style={{ marginTop: 28 }} />
        ) : data.error ? (
          <V2Empty>{data.error}</V2Empty>
        ) : data.rooms.length === 0 ? (
          <V2Empty>No conversations yet.</V2Empty>
        ) : (
          data.rooms.map((room) => (
            <ConversationRow
              key={room.id}
              room={room}
              name={getRoomName(room, uid, data.usersCache)}
              preview={chatRowPreview(room, uid)}
              unread={data.isUnread(room)}
            />
          ))
        )}
      </V2Screen>
    </SafeAreaView>
  );
}
