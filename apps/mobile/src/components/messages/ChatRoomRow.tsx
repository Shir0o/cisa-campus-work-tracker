import { Text, View } from 'react-native';
import { getRoomName, getRoomPhoto, relTime, type ChatRoom, type ChatUserSummary } from '@cisa/core';
import { Avatar, Card } from '../ui';
import { useTheme } from '../../theme/ThemeProvider';

// One row in the Messages room list — avatar (+ unread dot), name, last
// message preview. Design oracle: web's src/views/Messages.tsx room list item.
export function ChatRoomRow({
  room,
  currentUid,
  usersCache,
  unread,
  onPress,
}: {
  room: ChatRoom;
  currentUid: string | null;
  usersCache: Record<string, ChatUserSummary>;
  unread: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const name = getRoomName(room, currentUid, usersCache);
  const photo = getRoomPhoto(room, currentUid, usersCache) ?? undefined;
  const lastMessageMs = room.lastMessage?.timestamp;

  return (
    <Card onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 13 }}>
      <View>
        <Avatar name={name} photoURL={photo} />
        {unread ? (
          <View
            style={{
              position: 'absolute',
              top: -1,
              right: -1,
              width: 11,
              height: 11,
              borderRadius: 6,
              backgroundColor: colors.error,
              borderWidth: 2,
              borderColor: colors.surface,
            }}
          />
        ) : null}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
          <Text
            numberOfLines={1}
            style={{ flex: 1, fontSize: 15, fontWeight: unread ? '700' : '600', color: colors.onSurface }}
          >
            {name}
          </Text>
          {typeof lastMessageMs === 'string' ? (
            <Text style={{ fontSize: 11, color: colors.onSurfaceVariant }}>{relTime(lastMessageMs)}</Text>
          ) : null}
        </View>
        <Text
          numberOfLines={1}
          style={{
            fontSize: 13,
            color: unread ? colors.onSurface : colors.onSurfaceVariant,
            fontWeight: unread ? '600' : '400',
          }}
        >
          {room.lastMessage ? `${room.lastMessage.senderName}: ${room.lastMessage.text}` : 'No messages yet'}
        </Text>
      </View>
    </Card>
  );
}
