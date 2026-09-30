// Mobile v2 — one conversation, member-side. The same written stream as the
// staff thread (ADR 0033: left-aligned rows, Threads as pushed screens), over
// the same data path (`useChatThreadData`), so read state and sending behave
// identically. The difference is the foot: in an announcement only Full-timers
// post, so a member gets the reason in place of a composer whose write
// firestore.rules would deny — and anyone can say Got it and reply in a post's
// Thread.
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from '../ui/SafeArea';
import { useRouter } from 'expo-router';
import { getRoomName } from '@cisa/core';
import { useAuth } from '../../lib/AuthProvider';
import { useLanguage } from '../../lib/LanguageProvider';
import { useChatThreadData } from '../../lib/useChatThreadData';
import { useV2Theme } from '../../theme/v2';
import { MemberRoom } from './MemberScreen';
import { ChatStreamPane } from '../messages/ChatStreamPane';

export function MemberThreadScreen({ roomId }: { roomId: string }) {
  return (
    <MemberRoom>
      <MemberThread roomId={roomId} />
    </MemberRoom>
  );
}

function MemberThread({ roomId }: { roomId: string }) {
  const { c, font, fs } = useV2Theme();
  const { uid } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const data = useChatThreadData(roomId);

  const name = data.room ? getRoomName(data.room, uid, data.usersCache) : '';
  const isGroupish = data.room && data.room.type !== 'direct';

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
          <Text style={{ fontFamily: font.bold, fontSize: fs(14), color: c.room.ink2 }}>{t('mobile.common.back')}</Text>
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            numberOfLines={1}
            style={{ fontFamily: font.extra, fontSize: fs(17), letterSpacing: -0.4, color: c.room.ink }}
          >
            {name || t('mobile.common.loading')}
          </Text>
          {isGroupish && (
            <Text style={{ fontFamily: font.medium, fontSize: fs(12), color: c.room.ink3 }}>
              {data.room!.type === 'announcement'
                ? t('mobile.messages.announcement')
                : `${data.room!.memberIds.length} ${data.room!.memberIds.length === 1 ? t('mobile.messages.person') : t('mobile.messages.people')}`}
            </Text>
          )}
        </View>
      </View>

      <ChatStreamPane roomId={roomId} data={data} />
    </SafeAreaView>
  );
}
