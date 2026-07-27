// Mobile v2 — "Prayers to carry". The violet widget at the bottom of the home.
//
// "I prayed just now" is device-local and one-way for the day, exactly as it is
// on the trainee's queue: there is no `prayedBy` on a prayer and no shared "who
// prayed today" anywhere in Firestore. See useFtHomeData's note.
import React from 'react';
import { Pressable, Text } from 'react-native';
import { FT_WIDGET_ROWS, firstName, ftWeighsHeavy, type Contact, type PrayerRecord } from '@cisa/core';
import { useV2Theme } from '../../theme/v2';
import { FtEmpty, FtRow, FtWidget } from './FtWidget';

export function PrayersToCarry({
  prayers,
  contacts,
  prayedToday,
  onPray,
  onOpenPrayers,
}: {
  prayers: PrayerRecord[];
  contacts: Contact[];
  prayedToday: (prayerId: string) => boolean;
  onPray: (prayer: PrayerRecord) => void;
  onOpenPrayers: () => void;
}) {
  const { c, font, radius } = useV2Theme();
  const shown = prayers.slice(0, FT_WIDGET_ROWS);
  return (
    <FtWidget
      label="Prayers to carry"
      count={prayers.length}
      tone="deep"
      link="The whole prayer log →"
      onLink={onOpenPrayers}
    >
      {shown.length === 0 && <FtEmpty>Nothing open right now.</FtEmpty>}
      {shown.map((p, i) => {
        const who = contacts.find((x) => x.id === p.contactId);
        const prayed = prayedToday(p.id);
        return (
          <FtRow key={p.id} first={i === 0}>
            <Text
              style={{
                fontFamily: font.bold,
                fontSize: 15.5,
                lineHeight: 21,
                color: c.tones.pray.text,
              }}
            >
              {p.burden}
            </Text>
            <Text
              style={{
                fontFamily: font.medium,
                fontSize: 13,
                color: c.tones.pray.text,
                opacity: 0.75,
                marginTop: 3,
              }}
            >
              {[who ? `For ${firstName(who.name)}` : null, ftWeighsHeavy(p) ? 'weighs heavy' : null]
                .filter(Boolean)
                .join(' · ')}
            </Text>
            <Pressable
              onPress={() => !prayed && onPray(p)}
              disabled={prayed}
              style={({ pressed }) => ({
                alignSelf: 'flex-start',
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
                  fontSize: 13.5,
                  color: prayed ? c.cardInk3 : c.deep,
                }}
              >
                {prayed ? 'Prayed today ✓' : 'I prayed just now'}
              </Text>
            </Pressable>
          </FtRow>
        );
      })}
    </FtWidget>
  );
}
