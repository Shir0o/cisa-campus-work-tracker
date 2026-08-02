// Mobile v2 — one conversation, staff-side. The design's `M2Thread`
// (views/mobile/screens2.jsx): bubbles, mine on the right, a sender chip where
// more than two people are talking, and a way into the person's page from a DM.
//
// Two of the design's affordances are not here, and it isn't fidelity slipping:
// per-message reactions and the "kept" pin need fields `ChatMessage` doesn't
// carry, and firestore.rules makes a sent message immutable
// (`chatRooms/{id}/messages` → `allow update, delete: if false`). Both would
// need a schema change and a rules deploy.
import React from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { canPostToRoom, chatKindNote, firstName, getRoomName, memberSenderName } from '@cisa/core';
import { useAuth } from '../../lib/AuthProvider';
import { useChatThreadData } from '../../lib/useChatThreadData';
import { roomForRole, useV2Theme } from '../../theme/v2';
import { Room } from '../v2/Widget';

export function ChatThreadScreen({ roomId }: { roomId: string }) {
  const { role } = useAuth();
  return (
    <Room room={roomForRole(role)}>
      <ChatThread roomId={roomId} />
    </Room>
  );
}

function ChatThread({ roomId }: { roomId: string }) {
  const { c, font, radius, fs } = useV2Theme();
  const router = useRouter();
  const { uid, role } = useAuth();
  const data = useChatThreadData(roomId);
  const [text, setText] = React.useState('');

  const name = data.room ? getRoomName(data.room, uid, data.usersCache) : '';
  const canPost = !data.room || canPostToRoom(data.room, uid, role === 'admin');
  const isGroupish = !!data.room && data.room.type !== 'direct';

  const send = async () => {
    if (!text.trim()) return;
    const toSend = text;
    setText('');
    await data.send(toSend);
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.room }}>
      <View
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10 }}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          style={({ pressed }) => ({ minHeight: 44, justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}
        >
          <Text style={{ fontFamily: font.bold, fontSize: fs(14), color: c.roomInk2 }}>← Back</Text>
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            numberOfLines={1}
            style={{ fontFamily: font.extra, fontSize: fs(17), letterSpacing: -0.4, color: c.roomInk }}
          >
            {name || 'Loading…'}
          </Text>
          {!!data.room && !!chatKindNote(data.room) && (
            <Text style={{ fontFamily: font.medium, fontSize: fs(12), color: c.roomInk3 }}>
              {chatKindNote(data.room)}
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
          {/* The person you're messaging is also someone we're walking with. */}
          {!!data.partnerContactId && (
            <Pressable
              onPress={() => router.push(`/contact/${data.partnerContactId}`)}
              style={({ pressed }) => ({
                minHeight: 46,
                justifyContent: 'center',
                paddingHorizontal: 16,
                marginBottom: 4,
                borderRadius: radius.note,
                backgroundColor: c.card,
                opacity: pressed ? 0.75 : 1,
              })}
            >
              <Text style={{ fontFamily: font.bold, fontSize: fs(13.5), color: c.link }}>
                {`Open ${firstName(name)}'s page →`}
              </Text>
            </Pressable>
          )}

          {data.error ? (
            <Text style={{ fontFamily: font.semi, fontSize: fs(13), color: c.tones.follow.text }}>{data.error}</Text>
          ) : data.loading ? (
            <ActivityIndicator color={c.roomInk2} style={{ marginTop: 28 }} />
          ) : data.dayGroups.length === 0 ? (
            <Text
              style={{
                fontFamily: font.medium,
                fontSize: fs(14.5),
                lineHeight: fs(21),
                color: c.roomInk2,
                textAlign: 'center',
                paddingVertical: 24,
              }}
            >
              Nothing here yet. Send one to start it off.
            </Text>
          ) : (
            data.dayGroups.map((group) => (
              <View key={group.key} style={{ gap: 8 }}>
                <Text
                  style={{
                    fontFamily: font.bold,
                    fontSize: fs(10.5),
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
                          style={{ fontFamily: font.bold, fontSize: fs(11.5), color: c.cardInk3, marginBottom: 3 }}
                        >
                          {memberSenderName(m, uid)}
                        </Text>
                      )}
                      <Text
                        style={{
                          fontFamily: font.medium,
                          fontSize: fs(15),
                          lineHeight: fs(21),
                          color: mine ? c.onPrimary : c.said,
                        }}
                      >
                        {m.text}
                      </Text>
                      {/* Attachments are read-only here — there is no picker on
                          the phone, so a chip only ever names what came in. */}
                      {(m.attachments ?? []).map((a) => (
                        <View
                          key={`${a.type}:${a.id}`}
                          style={{
                            alignSelf: 'flex-start',
                            marginTop: 7,
                            paddingHorizontal: 10,
                            paddingVertical: 5,
                            borderRadius: radius.chip,
                            backgroundColor: mine ? c.roomChip : c.card2,
                          }}
                        >
                          <Text
                            style={{ fontFamily: font.semi, fontSize: fs(11.5), color: mine ? c.onPrimary : c.cardInk2 }}
                          >
                            {a.name}
                          </Text>
                        </View>
                      ))}
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
              placeholder={
                isGroupish ? 'Write to the group…' : `Write to ${firstName(name || 'them')}…`
              }
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
                fontSize: fs(15),
                lineHeight: fs(21),
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
              <Text style={{ fontFamily: font.bold, fontSize: fs(15), color: c.onPrimary }}>Send</Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ paddingHorizontal: 20, paddingVertical: 18 }}>
            <Text
              style={{
                fontFamily: font.medium,
                fontSize: fs(13.5),
                lineHeight: fs(20),
                color: c.roomInk3,
                textAlign: 'center',
              }}
            >
              Announcements only — the team posts here, and you'll see it.
            </Text>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
