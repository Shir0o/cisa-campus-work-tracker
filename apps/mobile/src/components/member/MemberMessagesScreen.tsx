// Mobile v2 — the member's Messages list. Ported from the design's
// `MbrMessages` list view.
//
// No new data path: this is `useMessagesData` in v2 clothes, so the member and
// staff room lists can never drift. Members can't start a conversation from
// here — the team opens those — so there is no create affordance.
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { memberAgo, firstName, getRoomName, type ChatRoom, type MemberRole } from '@cisa/core';
import { useAuth } from '../../lib/AuthProvider';
import { useMessagesData } from '../../lib/useMessagesData';
import { useV2Theme } from '../../theme/v2';
import { PersonMark } from '../queue/atoms';
import { MemberFoot, MemberHead, MemberRoom, MemberScreen } from './MemberScreen';

export function MemberMessagesScreen({ role }: { role: MemberRole }) {
  return (
    <MemberRoom>
      <MemberMessages role={role} />
    </MemberRoom>
  );
}

function MemberMessages({ role }: { role: MemberRole }) {
  const { c, font, radius, shadow, fs } = useV2Theme();
  const { uid } = useAuth();
  const router = useRouter();
  const data = useMessagesData();

  const kindLine = (room: ChatRoom) =>
    room.type === 'announcement'
      ? 'Announcement'
      : room.type === 'group'
        ? `${room.memberIds.length} people`
        : '';

  return (
    <MemberScreen loading={data.loading} error={data.error}>
      <MemberHead
        greeting="Messages"
        intro={
          role === 'student'
            ? 'The team, your group, and what’s announced.'
            : 'The team, and what’s announced to everyone.'
        }
        showDate={false}
      />

      <View style={{ gap: 10 }}>
        {data.rooms.length === 0 && (
          <Text style={{ fontFamily: font.medium, fontSize: fs(14.5), lineHeight: fs(21), color: c.roomInk2 }}>
            Nothing yet.
          </Text>
        )}
        {data.rooms.map((room) => {
          const name = getRoomName(room, uid, data.usersCache);
          const unread = data.isUnread(room);
          const kind = kindLine(room);
          const last = room.lastMessage;
          return (
            <Pressable
              key={room.id}
              onPress={() => router.push(`/messages/${room.id}`)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                backgroundColor: c.card,
                borderRadius: radius.tile,
                padding: 14,
                opacity: pressed ? 0.85 : 1,
                ...shadow.soft,
              })}
            >
              <PersonMark name={name} id={room.id} size={40} radius={13} fontSize={14} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  numberOfLines={1}
                  style={{ fontFamily: font.extra, fontSize: fs(15), color: c.cardInk }}
                >
                  {name}
                </Text>
                <Text
                  numberOfLines={1}
                  style={{ fontFamily: font.medium, fontSize: fs(13), color: c.cardInk2, marginTop: 2 }}
                >
                  {last
                    ? `${last.senderId === uid ? 'You' : firstName(last.senderName)}: ${last.text}`
                    : kind || 'No messages yet'}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 5 }}>
                <Text style={{ fontFamily: font.medium, fontSize: fs(11.5), color: c.cardInk3 }}>
                  {last ? memberAgo(last.timestamp as string | null) : ''}
                </Text>
                {unread && (
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: c.tones.follow.dot,
                    }}
                  />
                )}
              </View>
            </Pressable>
          );
        })}
      </View>

      <MemberFoot>If something’s urgent, a text is always fine too.</MemberFoot>
    </MemberScreen>
  );
}
