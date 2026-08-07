// Mobile v2 — the full-timer's "More" tab. The design's `FtMore`
// (views/mobile/ft.jsx): the screens you sometimes want on the move, as a plain
// list. People and Messages aren't here — they're tabs of their own.
//
// The list is exactly FT_MORE from @cisa/core and nothing else. The heavier
// work (Board pages, gatherings, kinds) is read-mostly on the phone, which the
// foot line says out loud.
import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FT_MORE, FT_MORE_FOOT, FT_MORE_INTRO, roleLabel } from '@cisa/core';
import { useAuth } from '../../lib/AuthProvider';
import { useV2Theme } from '../../theme/v2';
import { Room } from '../v2/Widget';
import { useImpersonateSheet } from '../impersonate/ImpersonateLayer';

export function FtMoreScreen() {
  return (
    <Room room="ft">
      <FtMore />
    </Room>
  );
}

function FtMore() {
  const { c, font, radius, shadow, fs } = useV2Theme();
  const { user, role, isOwner } = useAuth();
  const router = useRouter();
  const { open: openImpersonateSheet } = useImpersonateSheet();

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.room }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 32 }}>
        <View style={{ paddingTop: 14, paddingBottom: 22 }}>
          <Text
            style={{
              fontFamily: font.bold,
              fontSize: fs(10.5),
              letterSpacing: 1.26,
              textTransform: 'uppercase',
              color: c.roomInk3,
            }}
          >
            {roleLabel(role)}
          </Text>
          <Text
            style={{
              fontFamily: font.extra,
              fontSize: fs(28),
              lineHeight: fs(32),
              letterSpacing: -0.9,
              color: c.roomInk,
              marginTop: 6,
            }}
          >
            {user?.displayName ?? 'You'}
          </Text>
          <Text
            style={{
              fontFamily: font.medium,
              fontSize: fs(14.5),
              lineHeight: fs(21),
              color: c.roomInk2,
              marginTop: 8,
            }}
          >
            {FT_MORE_INTRO}
          </Text>
        </View>

        <View style={{ backgroundColor: c.card, borderRadius: radius.tile, ...shadow.soft }}>
          {FT_MORE.map((item, i) => (
            <Pressable
              key={item.key}
              onPress={() => router.push(item.href as never)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                minHeight: 58,
                paddingHorizontal: 18,
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: c.line,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text style={{ fontFamily: font.bold, fontSize: fs(15.5), color: c.cardInk, flex: 1 }}>
                {item.label}
              </Text>
              {/* Drawn, not a glyph — v2's rule about text marks in tinted blocks. */}
              <View
                style={{
                  width: 9,
                  height: 9,
                  borderRightWidth: 2,
                  borderTopWidth: 2,
                  borderColor: c.cardInk3,
                  transform: [{ rotate: '45deg' }],
                }}
              />
            </Pressable>
          ))}
          {isOwner && (
            <Pressable
              onPress={openImpersonateSheet}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                minHeight: 58,
                paddingHorizontal: 18,
                borderTopWidth: 1,
                borderTopColor: c.line,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text style={{ fontFamily: font.bold, fontSize: fs(15.5), color: c.cardInk, flex: 1 }}>
                See it as they do
              </Text>
              <View
                style={{
                  width: 9,
                  height: 9,
                  borderRightWidth: 2,
                  borderTopWidth: 2,
                  borderColor: c.cardInk3,
                  transform: [{ rotate: '45deg' }],
                }}
              />
            </Pressable>
          )}
        </View>

        <Text
          style={{
            fontFamily: font.medium,
            fontSize: fs(13),
            lineHeight: fs(19),
            color: c.roomFaint,
            marginTop: 22,
          }}
        >
          {FT_MORE_FOOT}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
