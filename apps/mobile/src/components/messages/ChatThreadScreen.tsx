// Mobile v2 — one conversation, staff-side. A DM, a group or an announcement
// read as the shared written stream (ADR 0033): left-aligned rows, day dividers,
// a New line, Threads as pushed screens. This screen owns the header and, in a
// DM, the way into the person's page; ChatStreamPane draws the stream.
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from '../ui/SafeArea';
import { chatKindNote, getRoomName } from '@cisa/core';
import { useAuth } from '../../lib/AuthProvider';
import { useLanguage } from '../../lib/LanguageProvider';
import { useChatThreadData } from '../../lib/useChatThreadData';
import { useV2Theme } from '../../theme/v2';
import { PersonMark } from '../queue/atoms';
import { ChatStreamPane } from './ChatStreamPane';

export function ChatThreadScreen({ roomId: propRoomId }: { roomId?: string } = {}) {
  const params = useLocalSearchParams<{ id?: string; roomId?: string }>();
  const roomId = propRoomId ?? params.id ?? params.roomId ?? '';
  const { c, font, radius, fs } = useV2Theme();
  const router = useRouter();
  const { uid } = useAuth();
  const { t } = useLanguage();
  const data = useChatThreadData(roomId);

  const name = data.room ? getRoomName(data.room, uid, data.usersCache) : '';

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
          <Text style={{ fontFamily: font.bold, fontSize: fs(14), color: c.room.ink2 }}>{t('mobile.common.back')}</Text>
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            numberOfLines={1}
            style={{ fontFamily: font.extra, fontSize: fs(17), letterSpacing: -0.4, color: c.room.ink }}
          >
            {name || t('mobile.common.loading')}
          </Text>
          {!!data.room && !!chatKindNote(data.room) && (
            <Text style={{ fontFamily: font.medium, fontSize: fs(12), color: c.room.ink3 }}>
              {chatKindNote(data.room)}
            </Text>
          )}
        </View>
      </View>

      <ChatStreamPane
        roomId={roomId}
        data={data}
        top={
          !!data.partnerContactId && (
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
                  {t('mobile.messages.tap_to_view_profile')}
                </Text>
              </View>
            </Pressable>
          )
        }
      />
    </SafeAreaView>
  );
}
