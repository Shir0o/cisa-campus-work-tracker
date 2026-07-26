// Mobile v2 — the queue ENDS. All-clear, then the one-off dates worth knowing,
// then a look back at the week. No metrics: this screen is about being finished,
// not about how much got done.
import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Interaction, QueueDate } from '@cisa/core';
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
  week,
  onReset,
}: {
  firstName: string;
  handledCount: number;
  dates: QueueDate[];
  week: Interaction[];
  onReset: () => void;
}) {
  const { c, font, radius } = useV2Theme();
  const [showWeek, setShowWeek] = React.useState(false);

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
        That's everyone, {firstName}.
      </Text>
      <Text style={{ fontFamily: font.medium, fontSize: 15.5, lineHeight: 23, color: c.roomInk2, marginTop: 12 }}>
        {handledCount > 0
          ? `You worked through ${handledCount} ${handledCount === 1 ? 'thing' : 'things'} today. Nothing else is waiting on you.`
          : 'Nothing is waiting on you right now. Come back when something lands.'}
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

      <Pressable onPress={() => setShowWeek((v) => !v)} style={{ minHeight: 44, justifyContent: 'center', marginTop: 12 }}>
        <Text style={{ fontFamily: font.bold, fontSize: 14, color: c.roomInk2 }}>
          {showWeek ? 'Hide your week' : 'Look back at your week'}
        </Text>
      </Pressable>

      {showWeek &&
        (week.length === 0 ? (
          <Text style={{ fontFamily: font.medium, fontSize: 14.5, lineHeight: 21, color: c.roomInk3 }}>
            You haven't logged a conversation this week yet.
          </Text>
        ) : (
          week.map((i) => (
            <View
              key={i.id}
              style={{
                backgroundColor: c.card,
                borderRadius: radius.tile,
                paddingVertical: 16,
                paddingHorizontal: 18,
                marginTop: 10,
              }}
            >
              <Text
                style={{
                  fontFamily: font.bold,
                  fontSize: 10.5,
                  letterSpacing: 1.26,
                  textTransform: 'uppercase',
                  color: c.cardInk3,
                }}
              >
                {new Date(i.dateTime).toLocaleDateString(undefined, { weekday: 'long' })}
              </Text>
              <Text
                style={{
                  fontFamily: font.extra,
                  fontSize: 15.5,
                  lineHeight: 20,
                  letterSpacing: -0.31,
                  color: c.cardInk,
                  marginTop: 10,
                }}
              >
                {i.contactName || 'A conversation'}
              </Text>
              <Text style={{ fontFamily: font.medium, fontSize: 14, lineHeight: 21, color: c.cardInk2, marginTop: 6 }}>
                {i.content}
              </Text>
            </View>
          ))
        ))}

      <Pressable onPress={onReset} style={{ minHeight: 44, justifyContent: 'center', marginTop: 4 }}>
        <Text style={{ fontFamily: font.bold, fontSize: 13, color: c.roomInk3 }}>Bring back today's queue</Text>
      </Pressable>
    </ScrollView>
  );
}
