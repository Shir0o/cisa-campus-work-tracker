// Mobile v2 — "Everything today". The queue as a compact list, so nothing feels
// hidden behind the one card on screen.
import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import type { QueueCard } from '@cisa/core';
import { useV2Theme } from '../../theme/v2';

const GROUP_LABEL: Record<number, string> = {
  0: 'Due',
  1: 'From the full-timer who cares for you',
  2: 'People to reach',
  3: 'Prayers to carry',
};

export function AllTodayList({
  cards,
  currentId,
  held,
  onPick,
  onBack,
  onOpenSettings,
}: {
  cards: QueueCard[];
  currentId?: string;
  held: number;
  onPick: (index: number) => void;
  onBack: () => void;
  /** "How today is built" — the queue's own settings. */
  onOpenSettings: () => void;
}) {
  const { c, font, radius, fs } = useV2Theme();

  return (
    <View style={{ flex: 1, backgroundColor: c.room }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10 }}>
        <Pressable
          onPress={onBack}
          style={{
            height: 44,
            paddingHorizontal: 15,
            borderRadius: 15,
            backgroundColor: c.roomChip,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontFamily: font.bold, fontSize: fs(13), color: c.roomInk2 }}>← Back</Text>
        </Pressable>
        <Text style={{ fontFamily: font.extra, fontSize: fs(18), letterSpacing: -0.45, color: c.roomInk }}>
          Everything today
        </Text>
        <Text style={{ fontFamily: font.semi, fontSize: fs(12), color: c.roomInk3, marginLeft: 'auto' }}>
          {cards.length}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 24, gap: 9 }}
        showsVerticalScrollIndicator={false}
      >
        {cards.map((card, i) => {
          const showKicker = i === 0 || cards[i - 1].group !== card.group;
          const tone = c.tones[card.tone];
          return (
            <View key={card.id}>
              {showKicker && (
                <Text
                  style={{
                    fontFamily: font.bold,
                    fontSize: fs(10.5),
                    letterSpacing: 1.26,
                    textTransform: 'uppercase',
                    color: c.roomInk3,
                    marginTop: 14,
                    marginBottom: 2,
                    marginHorizontal: 4,
                  }}
                >
                  {GROUP_LABEL[card.group]}
                </Text>
              )}
              <Pressable
                onPress={() => onPick(i)}
                style={{
                  flexDirection: 'row',
                  gap: 12,
                  alignItems: 'flex-start',
                  backgroundColor: c.card,
                  borderRadius: radius.row,
                  paddingVertical: 15,
                  paddingHorizontal: 17,
                  borderWidth: 2,
                  borderColor: card.id === currentId ? c.reactOnBorder : 'transparent',
                  minHeight: 60,
                }}
              >
                <View style={{ width: 10, height: 10, borderRadius: 3, marginTop: 5, backgroundColor: tone.dot }} />
                <View style={{ flex: 1 }}>
                  <Text
                    style={{ fontFamily: font.extra, fontSize: fs(15), lineHeight: fs(20), letterSpacing: -0.3, color: c.cardInk }}
                  >
                    {card.title}
                  </Text>
                  <Text style={{ fontFamily: font.semi, fontSize: fs(12.5), lineHeight: fs(17), color: c.cardInk3, marginTop: 4 }}>
                    {[card.label, card.ago].filter(Boolean).join(' · ')}
                  </Text>
                </View>
              </Pressable>
            </View>
          );
        })}

        {held > 0 && (
          <Text
            style={{
              fontFamily: font.semi,
              fontSize: fs(12.5),
              lineHeight: fs(18),
              color: c.roomFaint,
              marginTop: 14,
              marginHorizontal: 4,
              paddingTop: 12,
              borderTopWidth: 1,
              borderTopColor: c.roomChip,
            }}
          >
            {held} more {held === 1 ? 'is' : 'are'} waiting for tomorrow — a day only holds so much.
          </Text>
        )}

        {/* How much a day holds, and when someone counts as quiet, are the
            trainee's own call — this is where they'd wonder. */}
        <Pressable
          onPress={onOpenSettings}
          style={{ minHeight: 44, justifyContent: 'center', marginTop: held > 0 ? 2 : 16, marginHorizontal: 4 }}
        >
          <Text style={{ fontFamily: font.bold, fontSize: fs(13), color: c.roomInk3 }}>How today is built  →</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}
