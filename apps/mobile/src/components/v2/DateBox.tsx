// Mobile v2 — the design's `.m2-datebox`: a translucent block on the room (a
// white widget in the full-timer's paper room) holding a few dated rows, each
// a day/month stack beside a title and one line about it.
//
// Two screens show dates this way — the end of the trainee's queue ("Dates
// worth knowing") and Gatherings ("Coming up") — so the block lives here rather
// than in either of them.
import { Text, View } from 'react-native';
import type { QueueDate } from '@cisa/core';
import { useV2Theme } from '../../theme/v2';
import { Kicker } from '../queue/atoms';

const dayOf = (iso: string) => {
  const d = new Date(iso);
  return {
    num: String(d.getDate()),
    mon: d.toLocaleDateString(undefined, { month: 'short' }).toUpperCase(),
    weekday: d.toLocaleDateString(undefined, { weekday: 'long' }),
  };
};

export function V2DateBox({ label, dates }: { label: string; dates: QueueDate[] }) {
  const { c, font, fs } = useV2Theme();
  if (dates.length === 0) return null;

  return (
    <View style={{ backgroundColor: c.room.datebox, borderRadius: 24, padding: 18 }}>
      <Kicker onRoom>{label}</Kicker>
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
              borderTopColor: c.room.dateboxLine,
            }}
          >
            <View style={{ width: 48, alignItems: 'center' }}>
              <Text style={{ fontFamily: font.extra, fontSize: fs(17), letterSpacing: -0.5, color: c.room.ink }}>
                {day.num}
              </Text>
              <Text
                style={{ fontFamily: font.bold, fontSize: fs(9.5), letterSpacing: 0.95, color: c.room.ink3, marginTop: 5 }}
              >
                {day.mon}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: font.bold, fontSize: fs(15), lineHeight: fs(19), color: c.room.ink }}>{d.title}</Text>
              <Text
                style={{ fontFamily: font.semi, fontSize: fs(12.5), lineHeight: fs(17), color: c.room.ink3, marginTop: 4 }}
              >
                {[day.weekday, d.sub].filter(Boolean).join(' · ')}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}
