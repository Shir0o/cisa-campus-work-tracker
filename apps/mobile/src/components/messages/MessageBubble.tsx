import { Text, View } from 'react-native';
import { relTime, type ChatMessage } from '@cisa/core';
import { Avatar } from '../ui';
import { useTheme } from '../../theme/ThemeProvider';

// One chat message — a speech bubble (mine vs. theirs), or a centered system
// pill for room-genesis/invite/leave events. Design oracle: web's
// src/views/Messages.tsx message stream.
export function MessageBubble({
  message,
  isMe,
  senderPhoto,
}: {
  message: ChatMessage;
  isMe: boolean;
  senderPhoto?: string;
}) {
  const { colors, radius } = useTheme();

  if (message.type === 'system') {
    return (
      <View style={{ alignItems: 'center', marginVertical: 6 }}>
        <View style={{ backgroundColor: colors.surfaceVariant, borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 4 }}>
          <Text style={{ fontSize: 11, fontWeight: '600', color: colors.onSurfaceVariant }}>{message.text}</Text>
        </View>
      </View>
    );
  }

  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: isMe ? 'flex-end' : 'flex-start',
        alignItems: 'flex-end',
        gap: 8,
        marginVertical: 3,
      }}
    >
      {!isMe ? <Avatar name={message.senderName} size={26} photoURL={senderPhoto} /> : null}
      <View style={{ maxWidth: '75%', gap: 3 }}>
        {!isMe ? (
          <Text style={{ fontSize: 10, fontWeight: '700', color: colors.onSurfaceVariant, marginLeft: 4 }}>
            {message.senderName}
          </Text>
        ) : null}
        <View
          style={{
            backgroundColor: isMe ? colors.primary : colors.surface,
            borderWidth: isMe ? 0 : 1,
            borderColor: colors.outlineVariant,
            borderRadius: radius.lg,
            borderBottomRightRadius: isMe ? 4 : radius.lg,
            borderBottomLeftRadius: isMe ? radius.lg : 4,
            paddingHorizontal: 13,
            paddingVertical: 9,
          }}
        >
          <Text style={{ fontSize: 14, color: isMe ? colors.onPrimary : colors.onSurface }}>{message.text}</Text>
        </View>
        {typeof message.timestamp === 'string' ? (
          <Text
            style={{
              fontSize: 9.5,
              color: colors.onSurfaceVariant,
              alignSelf: isMe ? 'flex-end' : 'flex-start',
              marginHorizontal: 4,
            }}
          >
            {relTime(message.timestamp)}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
