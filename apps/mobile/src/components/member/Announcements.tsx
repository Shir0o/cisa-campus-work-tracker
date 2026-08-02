// Mobile v2 — the member home's announcements. Rooms the whole audience reads
// and only Full-timers post to (firestore.rules enforces it; ChatRoom.type
// 'announcement'). Tapping one opens the thread, where the composer is
// replaced by "replies go to the team directly".
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { memberAgo, type MemberAnnouncement } from '@cisa/core';
import { useV2Theme } from '../../theme/v2';
import { Sech } from '../v2/Widget';

export function Announcements({
  rows,
  label,
  onOpen,
}: {
  rows: MemberAnnouncement[];
  label: string;
  onOpen: (roomId: string) => void;
}) {
  const { c, font, radius, shadow, fs } = useV2Theme();
  return (
    <View>
      <Sech label={label} count={rows.filter((r) => r.unread).length} />
      <View style={{ gap: 10 }}>
        {rows.map((row) => (
          <Pressable
            key={row.roomId}
            onPress={() => onOpen(row.roomId)}
            style={({ pressed }) => ({
              backgroundColor: c.card,
              borderRadius: radius.tile,
              padding: 16,
              opacity: pressed ? 0.85 : 1,
              ...shadow.soft,
            })}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {row.unread && (
                <View
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: 4,
                    backgroundColor: c.tones.follow.dot,
                  }}
                />
              )}
              <Text style={{ fontFamily: font.extra, fontSize: fs(15), color: c.cardInk, flex: 1 }}>
                {row.name}
              </Text>
              <Text style={{ fontFamily: font.medium, fontSize: fs(12), color: c.cardInk3 }}>
                {memberAgo(row.at)}
              </Text>
            </View>
            <Text
              numberOfLines={3}
              style={{
                fontFamily: font.medium,
                fontSize: fs(14),
                lineHeight: fs(20),
                color: c.cardInk2,
                marginTop: 6,
              }}
            >
              {row.body}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
