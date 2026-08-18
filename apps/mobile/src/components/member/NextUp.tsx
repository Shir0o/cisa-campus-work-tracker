// Mobile v2 — the member home's one hero: the next thing on, and the single
// question that matters about it ("will you be there?").
//
// The design's `.mbr-next`. Not a list and not a card in a grid — a member
// opens the app to find out what's next, so it gets the whole top of the room.
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { memberEventSub, memberWhenWords, type Event, type MemberRole } from '@cisa/core';
import { useV2Theme } from '../../theme/v2';

export function NextUp({
  event,
  role,
  going,
  onToggle,
  onInvite,
}: {
  event: Event;
  role: MemberRole;
  going: boolean;
  onToggle: () => void;
  onInvite: () => void;
}) {
  const { c, font, radius, fs } = useV2Theme();
  const sub = memberEventSub(event);
  return (
    <View
      style={{
        backgroundColor: c.widget.bg,
        borderRadius: radius.hero,
        padding: 20,
        ...c.widget.shadow,
      }}
    >
      <Text
        style={{
          fontFamily: font.bold,
          fontSize: fs(10.5),
          
          
          // `.mbr-tag{color:var(--mb-warm)}` — the widget layer's terracotta,
          // which unlike `card.warm` does not shift at night.
          color: c.widget.warm,
        }}
      >
        {role === 'student' ? 'Next up' : 'Nearest'} · {memberWhenWords(event.date)}
      </Text>
      <Text
        style={{
          fontFamily: font.extra,
          fontSize: fs(25),
          lineHeight: fs(30),
          letterSpacing: -0.7,
          color: c.widget.ink,
          marginTop: 8,
        }}
      >
        {event.name}
      </Text>
      {!!sub && (
        <Text
          style={{
            fontFamily: font.medium,
            fontSize: fs(14),
            lineHeight: fs(20),
            color: c.widget.ink2,
            marginTop: 4,
          }}
        >
          {sub}
        </Text>
      )}
      <View style={{ gap: 10, marginTop: 16 }}>
        <Pressable
          onPress={onToggle}
          style={({ pressed }) => ({
            height: 54,
            borderRadius: radius.button,
            backgroundColor: going ? c.card.green : c.card.primary,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Text
            style={{
              fontFamily: font.bold,
              fontSize: fs(16.5),
              color: going ? c.card.onGreen : c.card.onPrimary,
            }}
          >
            {going
              ? "You're going ✓"
              : role === 'community'
                ? "We'll be there"
                : "I'll be there"}
          </Text>
        </Pressable>
        {role === 'student' && (
          <Pressable
            onPress={onInvite}
            style={({ pressed }) => ({
              height: 52,
              borderRadius: radius.button,
              borderWidth: 1.5,
              borderColor: c.card.border,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Text style={{ fontFamily: font.bold, fontSize: fs(15), color: c.widget.ink2 }}>
              Bring a friend
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}
