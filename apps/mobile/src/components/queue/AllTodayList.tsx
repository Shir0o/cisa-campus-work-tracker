// Mobile v2 — "Everything today". The queue as a compact flat list, so nothing
// feels hidden behind the one card on screen — matches the design's M2AllList.
import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { allTodayCount, heldForTomorrowLine, lookedAfterLine, type QueueCard } from '@cisa/core';
import { useV2Theme } from '../../theme/v2';

export function AllTodayList({
  cards,
  currentId,
  held,
  handledCount,
  onPick,
  onBack,
}: {
  cards: QueueCard[];
  currentId?: string;
  held: number;
  /** How many were already looked after today, for the line under the rows. */
  handledCount: number;
  onPick: (index: number) => void;
  onBack: () => void;
}) {
  const { c, font, radius, fs } = useV2Theme();

  return (
    <View style={{ flex: 1, backgroundColor: c.room.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10 }}>
        <Pressable
          onPress={onBack}
          style={{
            height: 44,
            paddingHorizontal: 15,
            borderRadius: 15,
            backgroundColor: c.room.chip,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontFamily: font.bold, fontSize: fs(13), color: c.room.ink2 }}>← Back</Text>
        </Pressable>
        <Text style={{ fontFamily: font.extra, fontSize: fs(18), letterSpacing: -0.45, color: c.room.ink }}>
          Everything today
        </Text>
        <Text style={{ fontFamily: font.semi, fontSize: fs(12), color: c.room.ink3, marginLeft: 'auto' }}>
          {allTodayCount(cards.length)}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 24, gap: 9 }}
        showsVerticalScrollIndicator={false}
      >
        {cards.map((card, i) => {
          const tone = c.card.tones[card.tone];
          return (
            <Pressable
              key={card.id}
              onPress={() => onPick(i)}
              style={{
                flexDirection: 'row',
                gap: 12,
                alignItems: 'flex-start',
                backgroundColor: c.card.bg,
                borderRadius: radius.row,
                paddingVertical: 15,
                paddingHorizontal: 17,
                borderWidth: 2,
                borderColor: card.id === currentId ? c.card.reactOnBorder : 'transparent',
                minHeight: 60,
              }}
            >
              <View style={{ width: 10, height: 10, borderRadius: 3, marginTop: 5, backgroundColor: tone.dot }} />
              <View style={{ flex: 1 }}>
                <Text
                  style={{ fontFamily: font.extra, fontSize: fs(15), lineHeight: fs(20), letterSpacing: -0.3, color: c.card.ink }}
                >
                  {card.title}
                </Text>
                <Text style={{ fontFamily: font.semi, fontSize: fs(12.5), lineHeight: fs(17), color: c.card.ink3, marginTop: 4 }}>
                  {[card.label, card.ago].filter(Boolean).join(' · ')}
                </Text>
              </View>
            </Pressable>
          );
        })}

        {handledCount > 0 && (
          <Text
            style={{
              fontFamily: font.semi,
              fontSize: fs(12.5),
              color: c.room.faint,
              marginTop: 14,
              marginHorizontal: 4,
            }}
          >
            {lookedAfterLine(handledCount)}
          </Text>
        )}

        {held > 0 && (
          <Text
            style={{
              fontFamily: font.semi,
              fontSize: fs(12.5),
              lineHeight: fs(18),
              color: c.room.faint,
              marginTop: 14,
              marginHorizontal: 4,
              paddingTop: 12,
              borderTopWidth: 1,
              borderTopColor: c.room.chip,
            }}
          >
            {heldForTomorrowLine(held)}
          </Text>
        )}
      </ScrollView>
    </View>
  );
}
