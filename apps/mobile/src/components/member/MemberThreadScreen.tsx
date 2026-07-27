// Mobile v2 — one conversation, member-side. Ported from the design's
// `MbrMessages` thread view: bubbles, mine on the right in the room's ink.
//
// Same data path as the staff thread (`useChatThreadData`), so read state,
// day grouping and sending behave identically. The one difference is the foot:
// in an announcement room only Full-timers post, so a member gets the reason
// instead of a composer whose write firestore.rules would deny.
import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { canPostToRoom, getRoomName, memberSenderName } from '@cisa/core';
import { useAuth } from '../../lib/AuthProvider';
import { useChatThreadData } from '../../lib/useChatThreadData';
import { useV2Theme } from '../../theme/v2';
import { MemberRoom } from './MemberScreen';

export function MemberThreadScreen({ roomId }: { roomId: string }) {
  return (
    <MemberRoom>
      <MemberThread roomId={roomId} />
    </MemberRoom>
  );
}

function MemberThread({ roomId }: { roomId: string }) {
  const { c, font, radius } = useV2Theme();
  const { uid, role } = useAuth();
  const router = useRouter();
  const data = useChatThreadData(roomId);
  const [text, setText] = React.useState('');

  const name = data.room ? getRoomName(data.room, uid, data.usersCache) : '';
  // A member is never an admin, so this resolves to "not an announcement".
  const canPost = !data.room || canPostToRoom(data.room, uid, role === 'admin');
  const isGroupish = data.room && data.room.type !== 'direct';

  const send = async () => {
    if (!text.trim()) return;
    const toSend = text;
    setText('');
    await data.send(toSend);
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.room }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingHorizontal: 16,
          paddingVertical: 10,
        }}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          style={({ pressed }) => ({ minHeight: 44, justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}
        >
          <Text style={{ fontFamily: font.bold, fontSize: 14, color: c.roomInk2 }}>← Back</Text>
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            numberOfLines={1}
            style={{ fontFamily: font.extra, fontSize: 17, letterSpacing: -0.4, color: c.roomInk }}
          >
            {name || 'Loading…'}
          </Text>
          {isGroupish && (
            <Text style={{ fontFamily: font.medium, fontSize: 12, color: c.roomInk3 }}>
              {data.room!.type === 'announcement'
                ? 'Announcement'
                : `${data.room!.memberIds.length} people`}
            </Text>
          )}
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
      >
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12, gap: 8, flexGrow: 1 }}
          showsVerticalScrollIndicator={false}
        >
          {data.error ? (
            <Text style={{ fontFamily: font.semi, fontSize: 13, color: c.tones.follow.text }}>
              {data.error}
            </Text>
          ) : data.dayGroups.length === 0 && !data.loading ? (
            <Text
              style={{
                fontFamily: font.medium,
                fontSize: 14.5,
                lineHeight: 21,
                color: c.roomInk2,
                textAlign: 'center',
                paddingVertical: 24,
              }}
            >
              Nothing here yet.
            </Text>
          ) : (
            data.dayGroups.map((group) => (
              <View key={group.key} style={{ gap: 8 }}>
                <Text
                  style={{
                    fontFamily: font.bold,
                    fontSize: 10.5,
                    letterSpacing: 1.26,
                    textTransform: 'uppercase',
                    color: c.roomInk3,
                    textAlign: 'center',
                    marginVertical: 8,
                  }}
                >
                  {group.label}
                </Text>
                {group.messages.map((m) => {
                  const mine = m.senderId === uid;
                  return (
                    <View
                      key={m.id}
                      style={{
                        alignSelf: mine ? 'flex-end' : 'flex-start',
                        maxWidth: '82%',
                        backgroundColor: mine ? c.primary : c.card,
                        borderRadius: radius.note,
                        paddingHorizontal: 14,
                        paddingVertical: 11,
                      }}
                    >
                      {isGroupish && !mine && (
                        <Text
                          style={{
                            fontFamily: font.bold,
                            fontSize: 11.5,
                            color: c.cardInk3,
                            marginBottom: 3,
                          }}
                        >
                          {memberSenderName(m, uid)}
                        </Text>
                      )}
                      <Text
                        style={{
                          fontFamily: font.medium,
                          fontSize: 15,
                          lineHeight: 21,
                          color: mine ? c.onPrimary : c.said,
                        }}
                      >
                        {m.text}
                      </Text>
                    </View>
                  );
                })}
              </View>
            ))
          )}
        </ScrollView>

        {canPost ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'flex-end',
              gap: 10,
              paddingHorizontal: 16,
              paddingVertical: 12,
            }}
          >
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Say it how you'd say it out loud."
              placeholderTextColor={c.cardInk3}
              multiline
              style={{
                flex: 1,
                maxHeight: 110,
                minHeight: 48,
                backgroundColor: c.card,
                borderRadius: radius.note,
                paddingHorizontal: 14,
                paddingVertical: 12,
                fontFamily: font.medium,
                fontSize: 15,
                lineHeight: 21,
                color: c.cardInk,
              }}
            />
            <Pressable
              onPress={send}
              disabled={!text.trim()}
              style={({ pressed }) => ({
                height: 48,
                paddingHorizontal: 20,
                borderRadius: radius.button,
                backgroundColor: c.primary,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: !text.trim() ? 0.45 : pressed ? 0.85 : 1,
              })}
            >
              <Text style={{ fontFamily: font.bold, fontSize: 15, color: c.onPrimary }}>Send</Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ paddingHorizontal: 20, paddingVertical: 18 }}>
            <Text
              style={{
                fontFamily: font.medium,
                fontSize: 13.5,
                lineHeight: 20,
                color: c.roomInk3,
                textAlign: 'center',
              }}
            >
              This one's an announcement — you can read it, and replies go to the team directly.
            </Text>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
