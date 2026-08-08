// Mobile v2 — "Also coming up". The handful under the hero, each with the one
// action a member has on it: count me in.
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { format } from 'date-fns';
import { memberEventSub, toLocalDate, type Event } from '@cisa/core';
import { useV2Theme } from '../../theme/v2';
import { Sech } from '../v2/Widget';

/** The date block on the left — the design's `.m2-wh`. Reads through
 * `toLocalDate`: a bare yyyy-MM-dd through `new Date()` is UTC midnight, a day
 * early everywhere behind UTC. */
function DateBlock({ date }: { date: string }) {
  const { c, font, fs } = useV2Theme();
  const d = toLocalDate(date);
  return (
    <View style={{ width: 46, alignItems: 'center' }}>
      <Text style={{ fontFamily: font.extra, fontSize: fs(17), color: c.card.ink }}>
        {d ? format(d, 'd') : '—'}
      </Text>
      <Text
        style={{
          fontFamily: font.bold,
          fontSize: fs(10.5),
          letterSpacing: 0.8,
          textTransform: 'uppercase',
          color: c.card.ink3,
          marginTop: 1,
        }}
      >
        {d ? format(d, 'EEE') : ''}
      </Text>
    </View>
  );
}

export function AlsoComingUp({
  events,
  isGoing,
  onToggle,
}: {
  events: Event[];
  isGoing: (eventId: string) => boolean;
  onToggle: (ev: Event, going: boolean) => void;
}) {
  const { c, font, radius, shadow, fs } = useV2Theme();
  return (
    <View>
      <Sech label="Also coming up" />
      <View
        style={{
          backgroundColor: c.room.datebox,
          borderRadius: radius.tile,
          paddingHorizontal: 14,
          ...shadow.soft,
        }}
      >
        {events.map((ev, i) => {
          const going = isGoing(ev.id);
          const sub = memberEventSub(ev);
          return (
            <View
              key={ev.id}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingVertical: 13,
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: c.room.dateboxLine,
              }}
            >
              <DateBlock date={ev.date} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: font.bold, fontSize: fs(14.5), color: c.card.ink }}>
                  {ev.name}
                </Text>
                {!!sub && (
                  <Text
                    style={{ fontFamily: font.medium, fontSize: fs(12.5), color: c.card.ink3, marginTop: 2 }}
                  >
                    {sub}
                  </Text>
                )}
              </View>
              <Pressable
                onPress={() => onToggle(ev, !going)}
                style={({ pressed }) => ({
                  minHeight: 44,
                  justifyContent: 'center',
                  paddingHorizontal: 13,
                  borderRadius: radius.chip,
                  borderWidth: 1.5,
                  borderColor: going ? 'transparent' : c.card.border,
                  backgroundColor: going ? c.card.green : 'transparent',
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Text
                  style={{
                    fontFamily: font.bold,
                    fontSize: fs(12.5),
                    color: going ? c.card.onGreen : c.card.ink2,
                  }}
                >
                  {going ? 'Going' : 'Count me in'}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}
