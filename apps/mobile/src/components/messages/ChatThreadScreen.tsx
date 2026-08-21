// Mobile v2 — one conversation, staff-side. The design's `M2Thread`
// (views/mobile/screens2.jsx): bubbles, mine on the right, a sender chip where
// more than two people are talking, and a way into the person's page from a DM.
//
// Reactions and the "kept" pin exist in the shared schema now
// (`packages/core` — `ChatMessage.reactions`/`pinned`, with `firestore.rules`
// allowing those field-level updates), and the desktop web app ports them, but
// this screen deliberately stays as the design's core thread: the design's
// per-message reactions and pin strip live on the desktop messages page, and
// the mobile port keeps M2Thread minimal. When the mobile app grows them, they
// can read `message.reactions`/`message.pinned` off the same docs.
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from '../ui/SafeArea';
import { canPostToRoom, chatKindNote, getRoomName, memberSenderName } from '@cisa/core';
import { useAuth } from '../../lib/AuthProvider';
import { deleteChatMessage } from '../../lib/data/chat';
import { useChatThreadData } from '../../lib/useChatThreadData';
import { useTheme } from '../../theme/ThemeProvider';
import { useV2Theme } from '../../theme/v2';
import { PersonMark } from '../queue/atoms';
import { Translate } from '../Translate';
import { ThreadSkeleton } from './ThreadSkeleton';

export function ChatThreadScreen({ roomId: propRoomId }: { roomId?: string } = {}) {
  const params = useLocalSearchParams<{ id?: string; roomId?: string }>();
  const roomId = propRoomId ?? params.id ?? params.roomId;
  const { c, font, radius, fs } = useV2Theme();
  const { colors } = useTheme();
  const router = useRouter();
  const { uid, role } = useAuth();
  const data = useChatThreadData(roomId ?? '');
  const [text, setText] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; text: string } | null>(null);

  const name = data.room ? getRoomName(data.room, uid, data.usersCache) : '';
  const canPost = !data.room || canPostToRoom(data.room, uid, role === 'admin');
  const isGroupish = !!data.room && (data.room.type === 'group' || data.room.type === 'announcement');

  const send = async () => {
    if (!text.trim()) return;
    const toSend = text;
    setText('');
    await data.send(toSend);
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.room.bg }}>
      <View
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 }}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          style={({ pressed }) => ({ minHeight: 44, justifyContent: 'center', marginRight: 4, opacity: pressed ? 0.6 : 1 })}
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
          {!!data.room && !!chatKindNote(data.room) && (
            <Text style={{ fontFamily: font.medium, fontSize: fs(12), color: c.room.ink3 }}>
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
          {!!data.partnerContactId && (
            <Pressable
              onPress={() => router.push(`/contact/${data.partnerContactId}`)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                backgroundColor: c.card.bg,
                borderRadius: radius.tile,
                padding: 12,
                opacity: pressed ? 0.85 : 1,
                ...c.widget.shadow,
              })}
            >
              <PersonMark name={name} id={data.partnerContactId} size={36} radius={11} fontSize={13} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontFamily: font.bold, fontSize: fs(14), color: c.room.ink }}>{name}</Text>
                <Text style={{ fontFamily: font.medium, fontSize: fs(12), color: c.room.ink3 }}>
                  Tap to view profile →
                </Text>
              </View>
            </Pressable>
          )}

          {data.error ? (
            <Text style={{ fontFamily: font.semi, fontSize: fs(13), color: c.card.tones.follow.text }}>{data.error}</Text>
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
              Nothing here yet. Send one to start it off.
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
                  const canDeleteMsg = mine || role === 'admin';
                  return (
                    <Pressable
                      key={m.id}
                      onLongPress={canDeleteMsg ? () => setDeleteTarget({ id: m.id, text: m.text }) : undefined}
                      style={{
                        alignSelf: mine ? 'flex-end' : 'flex-start',
                        maxWidth: '82%',
                        backgroundColor: mine ? c.card.primary : c.card.bg,
                        borderRadius: radius.note,
                        paddingHorizontal: 14,
                        paddingVertical: 11,
                      }}
                    >
                      {isGroupish && !mine && (
                        <Text
                          style={{ fontFamily: font.bold, fontSize: fs(11.5), color: c.card.ink3, marginBottom: 3 }}
                        >
                          {memberSenderName(m, uid)}
                        </Text>
                      )}
                      <Translate
                        style={{
                          fontFamily: font.medium,
                          fontSize: fs(15),
                          lineHeight: fs(21),
                          color: mine ? c.card.onPrimary : c.card.said,
                        }}
                        text={m.text}
                      />
                      {(m.attachments ?? []).map((a) => {
                        const isContact = a.type === 'contact';
                        return (
                          <Pressable
                            key={`${a.type}:${a.id}`}
                            onPress={isContact ? () => router.push(`/contact/${a.id}`) : undefined}
                            style={({ pressed }) => ({
                              alignSelf: 'flex-start',
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 6,
                              marginTop: 7,
                              paddingHorizontal: 10,
                              paddingVertical: 5,
                              borderRadius: radius.chip,
                              backgroundColor: mine ? c.room.chip : c.card.bg2,
                              opacity: pressed && isContact ? 0.75 : 1,
                            })}
                          >
                            <Text
                              style={{ fontFamily: font.semi, fontSize: fs(11.5), color: mine ? c.card.onPrimary : c.card.ink2 }}
                            >
                              {a.name}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </Pressable>
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
              alignItems: 'center',
              gap: 8,
              paddingHorizontal: 14,
              paddingVertical: 10,
              backgroundColor: c.room.bg,
            }}
          >
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Write a message…"
              placeholderTextColor={c.room.ink3}
              multiline
              style={{
                flex: 1,
                minHeight: 44,
                maxHeight: 110,
                backgroundColor: c.card.bg,
                borderRadius: radius.row,
                paddingHorizontal: 16,
                paddingVertical: 10,
                fontFamily: font.medium,
                fontSize: fs(15),
                lineHeight: fs(21),
                color: c.room.ink,
              }}
              onSubmitEditing={() => void send()}
            />
            <Pressable
              onPress={() => void send()}
              disabled={!text.trim()}
              style={({ pressed }) => ({
                height: 44,
                paddingHorizontal: 18,
                borderRadius: radius.row,
                backgroundColor: text.trim() ? c.card.primary : c.room.chip,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed ? 0.75 : 1,
              })}
            >
              <Text
                style={{
                  fontFamily: font.bold,
                  fontSize: fs(14),
                  color: text.trim() ? c.card.onPrimary : c.room.ink3,
                }}
              >
                Send
              </Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
            <Text style={{ fontFamily: font.medium, fontSize: fs(12.5), color: c.room.ink3, textAlign: 'center' }}>
              Only full-timers post into announcements.
            </Text>
          </View>
        )}
      </KeyboardAvoidingView>

      {deleteTarget && (
        <View
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.45)',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 20,
          }}
        >
          <View
            style={{
              backgroundColor: c.card.bg,
              borderRadius: radius.tile,
              padding: 20,
              width: '100%',
              gap: 12,
            }}
          >
            <Text style={{ fontFamily: font.extra, fontSize: fs(16), color: c.room.ink }}>Delete message?</Text>
            <Text style={{ fontFamily: font.medium, fontSize: fs(14), color: c.room.ink2 }} numberOfLines={2}>
              "{deleteTarget.text}"
            </Text>
            <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
              <Pressable
                onPress={() => setDeleteTarget(null)}
                style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, backgroundColor: c.room.chip }}
              >
                <Text style={{ fontFamily: font.bold, fontSize: fs(13), color: c.room.ink2 }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  const targetId = deleteTarget.id;
                  setDeleteTarget(null);
                  if (roomId) void deleteChatMessage(roomId, targetId);
                }}
                style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, backgroundColor: colors.error }}
              >
                <Text style={{ fontFamily: font.extra, fontSize: fs(13), color: '#fff' }}>Delete</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}
