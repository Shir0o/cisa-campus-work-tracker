// Mobile v2 — the queue ENDS. All-clear, then the one-off dates worth knowing,
// then a way into the week just gone (WeekLookBack, a pushed screen — this one
// is about being finished, and a list unfolding underneath undoes that).
// No metrics anywhere.
import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { allClearLine, type QueueDate } from '@cisa/core';
import { useV2Theme } from '../../theme/v2';
import { Kicker } from './atoms';

const dayOf = (iso: string) => {
  const d = new Date(iso);
  return {
    num: String(d.getDate()),
    mon: d.toLocaleDateString(undefined, { month: 'short' }).toUpperCase(),
    weekday: d.toLocaleDateString(undefined, { weekday: 'long' }),
  };
};

export function EndOfQueue({
  firstName,
  handledCount,
  dates,
  onLookBack,
  onReset,
}: {
  firstName: string;
  handledCount: number;
  dates: QueueDate[];
  /** Pushes "Your week" — the design keeps it off this screen (WeekLookBack). */
  onLookBack: () => void;
  onReset: () => void;
}) {
  const { c, font } = useV2Theme();

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 20, paddingBottom: 24 }}
      showsVerticalScrollIndicator={false}
    >
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: 22,
          backgroundColor: c.mark,
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: 40,
        }}
      >
        {/* Drawn, not a glyph — text marks render unreliably in tinted blocks. */}
        <Ionicons name="checkmark" size={30} color={c.onMark} />
      </View>

      <Text style={{ fontFamily: font.serif, fontSize: 37, lineHeight: 41, color: c.roomInk, marginTop: 20 }}>
        {"That's everything,\n"}
        {firstName}.
      </Text>
      <Text style={{ fontFamily: font.medium, fontSize: 15.5, lineHeight: 23, color: c.roomInk2, marginTop: 12 }}>
        {allClearLine(handledCount)}
      </Text>

      {dates.length > 0 && (
        <View
          style={{
            backgroundColor: c.datebox,
            borderRadius: 24,
            padding: 18,
            marginTop: 24,
          }}
        >
          <Kicker onRoom>Dates worth knowing</Kicker>
          {dates.map((d, i) => {
            const day = dayOf(d.date);
            return (
              <View
                key={d.id}
                style={{
                  flexDirection: 'row',
                  gap: 14,
                  marginTop: i === 0 ? 16 : 14,
                  paddingTop: i === 0 ? 0 : 14,
                  borderTopWidth: i === 0 ? 0 : 1,
                  borderTopColor: c.dateboxLine,
                }}
              >
                <View style={{ width: 48, alignItems: 'center' }}>
                  <Text style={{ fontFamily: font.extra, fontSize: 17, letterSpacing: -0.5, color: c.roomInk }}>
                    {day.num}
                  </Text>
                  <Text
                    style={{
                      fontFamily: font.bold,
                      fontSize: 9.5,
                      letterSpacing: 0.95,
                      color: c.roomInk3,
                      marginTop: 5,
                    }}
                  >
                    {day.mon}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: font.bold, fontSize: 15, lineHeight: 19, color: c.roomInk }}>
                    {d.title}
                  </Text>
                  <Text style={{ fontFamily: font.semi, fontSize: 12.5, lineHeight: 17, color: c.roomInk3, marginTop: 4 }}>
                    {[day.weekday, d.sub].filter(Boolean).join(' · ')}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      )}

      <Pressable onPress={onLookBack} style={{ minHeight: 44, justifyContent: 'center', marginTop: 12 }}>
        <Text style={{ fontFamily: font.bold, fontSize: 14, color: c.roomInk2 }}>Look back at your week  →</Text>
      </Pressable>

      <Pressable onPress={onReset} style={{ minHeight: 44, justifyContent: 'center', marginTop: 4 }}>
        <Text style={{ fontFamily: font.bold, fontSize: 13, color: c.roomInk3 }}>Bring back today's queue</Text>
      </Pressable>
    </ScrollView>
  );
}
