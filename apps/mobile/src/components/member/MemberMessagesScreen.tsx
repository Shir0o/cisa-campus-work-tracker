// Mobile v2 — the member's Messages list. Ported from the design's
// `MbrMessages` list view.
//
// No new data path: this is `useMessagesData` in v2 clothes, so the member and
// staff room lists can never drift. Members can't start a conversation from
// here — the team opens those — so there is no create affordance.
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { canRemoveConvForEveryone, memberAgo, firstName, getRoomName, type ChatRoom, type MemberRole } from '@cisa/core';
import { useAuth } from '../../lib/AuthProvider';
import { useLanguage } from '../../lib/LanguageProvider';
import { deleteChatRoom, hideChatRoomForUser } from '../../lib/data/chat';
import { useMessagesData } from '../../lib/useMessagesData';
import { useV2Theme } from '../../theme/v2';
import { PersonMark } from '../queue/atoms';
import { SwipeToDelete } from '../messages/SwipeToDelete';
import { MemberFoot, MemberHead, MemberRoom, MemberScreen } from './MemberScreen';

export function MemberMessagesScreen({ role }: { role: MemberRole }) {
  return (
    <MemberRoom>
      <MemberMessages role={role} />
    </MemberRoom>
  );
}

function MemberMessages({ role }: { role: MemberRole }) {
  const { c, font, radius, fs } = useV2Theme();
  const { uid } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const data = useMessagesData();

  const kindLine = (room: ChatRoom) =>
    room.type === 'announcement'
      ? t('mobile.messages.announcement')
      : room.type === 'group'
        ? `${room.memberIds.length} ${room.memberIds.length === 1 ? t('mobile.messages.person') : t('mobile.messages.people')}`
        : '';

  return (
    <MemberScreen loading={data.loading} error={data.error}>
      <MemberHead
        greeting={t('mobile.messages.title')}
        intro={
          role === 'student'
            ? t('mobile.messages.member_student_intro')
            : t('mobile.messages.member_community_intro')
        }
        showDate={false}
      />

      <View style={{ gap: 10 }}>
        {data.rooms.length === 0 && (
          <Text style={{ fontFamily: font.medium, fontSize: fs(14.5), lineHeight: fs(21), color: c.room.ink2 }}>
            {t('mobile.member.nothing_yet')}
          </Text>
        )}
        {data.rooms.map((room) => {
          const name = getRoomName(room, uid, data.usersCache);
          const unread = data.isUnread(room);
          const kind = kindLine(room);
          const last = room.lastMessage;
          const canDeleteForEveryone = canRemoveConvForEveryone(room, uid, false);
          return (
            <SwipeToDelete
              key={room.id}
              onHide={() => {
                if (uid) void hideChatRoomForUser(room.id, uid);
              }}
              onDeleteForEveryone={
                canDeleteForEveryone
                  ? () => {
                      void deleteChatRoom(room.id);
                    }
                  : undefined
              }
            >
              <Pressable
                onPress={() => router.push(`/messages/${room.id}`)}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  backgroundColor: c.widget.bg,
                  borderRadius: radius.tile,
                  padding: 14,
                  opacity: pressed ? 0.85 : 1,
                  ...c.widget.shadow,
                })}
              >
                <PersonMark name={name} id={room.id} size={40} radius={13} fontSize={14} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    numberOfLines={1}
                    style={{ fontFamily: font.extra, fontSize: fs(15), color: c.widget.ink }}
                  >
                    {name}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={{ fontFamily: font.medium, fontSize: fs(13), color: c.widget.ink2, marginTop: 2 }}
                  >
                    {last
                      ? `${last.senderId === uid ? 'You' : firstName(last.senderName)}: ${last.text}`
                      : kind || 'No messages yet'}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 5 }}>
                  <Text style={{ fontFamily: font.medium, fontSize: fs(11.5), color: c.widget.ink3 }}>
                    {last ? memberAgo(last.timestamp as string | null) : ''}
                  </Text>
                  {unread && (
                    <View
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 4,
                        backgroundColor: c.card.tones.follow.dot,
                      }}
                    />
                  )}
                </View>
              </Pressable>
            </SwipeToDelete>
          );
        })}
      </View>

      <MemberFoot>If something’s urgent, a text is always fine too.</MemberFoot>
    </MemberScreen>
  );
}
