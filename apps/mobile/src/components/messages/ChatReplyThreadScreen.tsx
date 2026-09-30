// A Thread in a chat room, on the phone (ADR 0033, T2–T3): replies to one
// message, one level deep, as a pushed screen with a back control to the room.
// Header: "Thread" over the room's name. Staff and members share it; in an
// announcement any member can say Got it on the post and reply here.
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getRoomName, memberRoleOf } from '@cisa/core';
import { useAuth } from '../../lib/AuthProvider';
import { useLanguage } from '../../lib/LanguageProvider';
import { useChatThreadData } from '../../lib/useChatThreadData';
import { useV2Theme } from '../../theme/v2';
import { SafeAreaView } from '../ui/SafeArea';
import { MemberRoom } from '../member/MemberScreen';
import { ChatStreamPane } from './ChatStreamPane';

export function ChatReplyThreadScreen(props: { roomId: string; parentId: string }) {
  const { role } = useAuth();
  return memberRoleOf(role) ? (
    <MemberRoom>
      <ThreadBody {...props} />
    </MemberRoom>
  ) : (
    <ThreadBody {...props} />
  );
}

function ThreadBody({ roomId, parentId }: { roomId: string; parentId: string }) {
  const { c, font, fs } = useV2Theme();
  const router = useRouter();
  const { uid } = useAuth();
  const { t } = useLanguage();
  const data = useChatThreadData(roomId);
  const name = data.room ? getRoomName(data.room, uid, data.usersCache) : '';

  const back = () => (router.canGoBack() ? router.back() : router.replace(`/messages/${roomId}` as never));

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.room.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, minHeight: 56 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('mobile.stream.back_to').replace('{name}', name || t('mobile.messages.title'))}
          onPress={back}
          style={({ pressed }) => ({
            minHeight: 44,
            minWidth: 44,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 6,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Ionicons name="chevron-back" size={22} color={c.room.ink} />
          <Text numberOfLines={1} style={{ maxWidth: 140, fontFamily: font.semi, fontSize: fs(15), color: c.room.ink }}>
            {name || t('mobile.messages.title')}
          </Text>
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center', marginRight: 44 }}>
          <Text style={{ fontFamily: font.extra, fontSize: fs(16), color: c.room.ink }}>{t('mobile.stream.thread_title')}</Text>
          {!!name && <Text style={{ fontFamily: font.medium, fontSize: fs(12), color: c.room.ink2 }}>{name}</Text>}
        </View>
      </View>

      <ChatStreamPane roomId={roomId} data={data} parentId={parentId} />
    </SafeAreaView>
  );
}
