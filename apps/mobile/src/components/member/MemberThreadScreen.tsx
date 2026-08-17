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
import { SafeAreaView } from '../ui/SafeArea';
import { useRouter } from 'expo-router';
import { canPostToRoom, getRoomName, memberSenderName } from '@cisa/core';
import { useAuth } from '../../lib/AuthProvider';
import { useChatThreadData } from '../../lib/useChatThreadData';
import { useV2Theme } from '../../theme/v2';
import { MemberRoom } from './MemberScreen';
import { ThreadSkeleton } from '../messages/ThreadSkeleton';

export function MemberThreadScreen({ roomId }: { roomId: string }) {
  return (
    <MemberRoom>
      <MemberThread roomId={roomId} />
    </MemberRoom>
  );
}

function MemberThread({ roomId }: { roomId: string }) {
  const { c, font, radius, fs } = useV2Theme();
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
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.room.bg }}>
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
          <Text style={{ fontFamily: font.bold, fontSize: fs(14), color: c.room.ink2 }}>← Back</Text>
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            numberOfLines={1}
            style={{ fontFamily: font.extra, fontSize: fs(17), letterSpacing: -0.4, color: c.room.ink }}
          >
            {name || 'Loading…'}
          </Text>
          {isGroupish && (
            <Text style={{ fontFamily: font.medium, fontSize: fs(12), color: c.room.ink3 }}>
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
            <Text style={{ fontFamily: font.semi, fontSize: fs(13), color: c.card.tones.follow.text }}>
              {data.error}
            </Text>
          ) : data.loading ? (
            <ThreadSkeleton />
          ) : data.dayGroups.length === 0 ? (
            <Text
              style={{
                fontFamily: font.medium,
                fontSize: fs(14.5),
                lineHeight: fs(21),
                color: c.room.ink2,
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
                    fontSize: fs(10.5),
                    
                    
                    color: c.room.ink3,
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
                        // `.mbr-bub` / `.mbr-bub.mine` — the widget layer's own
                        // pair, not the room's primary button
                        backgroundColor: mine ? c.widget.mine : c.widget.bg,
                        borderRadius: radius.note,
                        paddingHorizontal: 14,
                        paddingVertical: 11,
                      }}
                    >
                      {isGroupish && !mine && (
                        <Text
                          style={{
                            fontFamily: font.bold,
                            fontSize: fs(11.5),
                            color: c.widget.ink3,
                            marginBottom: 3,
                          }}
                        >
                          {memberSenderName(m, uid)}
                        </Text>
                      )}
                      <Text
                        style={{
                          fontFamily: font.medium,
                          fontSize: fs(15),
                          lineHeight: fs(21),
                          color: mine ? c.widget.onMine : c.widget.ink,
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
              placeholderTextColor={c.card.ink3}
              multiline
              style={{
                flex: 1,
                maxHeight: 110,
                minHeight: 48,
                backgroundColor: c.card.bg,
                borderRadius: radius.note,
                paddingHorizontal: 14,
                paddingVertical: 12,
                fontFamily: font.medium,
                fontSize: fs(15),
                lineHeight: fs(21),
                color: c.card.ink,
              }}
            />
            <Pressable
              onPress={send}
              disabled={!text.trim()}
              style={({ pressed }) => ({
                height: 48,
                paddingHorizontal: 20,
                borderRadius: radius.button,
                backgroundColor: c.card.primary,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: !text.trim() ? 0.45 : pressed ? 0.85 : 1,
              })}
            >
              <Text style={{ fontFamily: font.bold, fontSize: fs(15), color: c.card.onPrimary }}>Send</Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ paddingHorizontal: 20, paddingVertical: 18 }}>
            <Text
              style={{
                fontFamily: font.medium,
                fontSize: fs(13.5),
                lineHeight: fs(20),
                color: c.room.ink3,
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
