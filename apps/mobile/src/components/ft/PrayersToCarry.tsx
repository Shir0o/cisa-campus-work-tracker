// Mobile v2 — "Prayers to carry". The violet widget at the bottom of the home.
//
// Two kinds of row land here, because they are the same act: a prayer staff
// logged against a contact, and a member's own "Ask the team to pray"
// (MOBILE-V2.md). @cisa/core's `ftCarryRows` flattens both into one list, asks
// first, so this component never has to know which collection a row came from.
//
// "I prayed just now" is device-local and one-way for the day, exactly as it is
// on the trainee's queue: there is no `prayedBy` on a prayer and no shared "who
// prayed today" anywhere in Firestore. See useFtHomeData's note. Marking a
// member's ask ANSWERED is the opposite — that one is shared, and the person
// who asked sees it.
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { FT_WIDGET_ROWS, type FtCarryRow } from '@cisa/core';
import { useV2Theme } from '../../theme/v2';
import { WidgetEmpty, WidgetRow, Widget } from '../v2/Widget';

export function PrayersToCarry({
  rows,
  prayedToday,
  onPray,
  onAnswered,
  onOpenPrayers,
}: {
  rows: FtCarryRow[];
  prayedToday: (rowId: string) => boolean;
  onPray: (row: FtCarryRow) => void;
  onAnswered: (row: FtCarryRow) => void;
  onOpenPrayers: () => void;
}) {
  const { c, font, radius, fs } = useV2Theme();
  const shown = rows.slice(0, FT_WIDGET_ROWS);
  return (
    <Widget
      label="Prayers to carry"
      count={rows.length}
      tone="deep"
      link="The whole prayer log →"
      onLink={onOpenPrayers}
    >
      {shown.length === 0 && <WidgetEmpty>Nothing open right now.</WidgetEmpty>}
      {shown.map((row, i) => {
        const prayed = prayedToday(row.id);
        return (
          <WidgetRow key={row.id} first={i === 0}>
            <Text
              style={{
                fontFamily: font.bold,
                fontSize: fs(15.5),
                lineHeight: fs(21),
                color: c.tones.pray.text,
              }}
            >
              {row.burden}
            </Text>
            <Text
              style={{
                fontFamily: font.medium,
                fontSize: fs(13),
                color: c.tones.pray.text,
                opacity: 0.75,
                marginTop: 3,
              }}
            >
              {[
                row.who ? (row.asked ? `${row.who} asked` : `For ${row.who}`) : null,
                row.heavy ? 'weighs heavy' : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <Pressable
                onPress={() => !prayed && onPray(row)}
                disabled={prayed}
                style={({ pressed }) => ({
                  minHeight: 44,
                  justifyContent: 'center',
                  paddingHorizontal: 16,
                  marginTop: 10,
                  borderRadius: radius.chip,
                  borderWidth: 1.5,
                  borderColor: prayed ? 'transparent' : c.deep,
                  backgroundColor: prayed ? c.card : 'transparent',
                  opacity: pressed ? 0.6 : 1,
                })}
              >
                <Text
                  style={{
                    fontFamily: font.bold,
                    fontSize: fs(13.5),
                    color: prayed ? c.cardInk3 : c.deep,
                  }}
                >
                  {prayed ? 'Prayed today ✓' : 'I prayed just now'}
                </Text>
              </Pressable>
              {row.asked && (
                <Pressable
                  onPress={() => onAnswered(row)}
                  hitSlop={8}
                  style={({ pressed }) => ({
                    minHeight: 44,
                    justifyContent: 'center',
                    marginTop: 10,
                    opacity: pressed ? 0.55 : 1,
                  })}
                >
                  <Text style={{ fontFamily: font.bold, fontSize: fs(13), color: c.tones.pray.text }}>
                    God answered this
                  </Text>
                </Pressable>
              )}
            </View>
          </WidgetRow>
        );
      })}
    </Widget>
  );
}
