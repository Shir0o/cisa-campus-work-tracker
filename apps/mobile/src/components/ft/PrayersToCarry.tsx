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
import { useLanguage } from '../../lib/LanguageProvider';
import { useV2Theme } from '../../theme/v2';
import { WidgetEmpty, WidgetRow, Widget } from '../v2/Widget';
import { Translate } from '../Translate';

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
  const { t } = useLanguage();
  const shown = rows.slice(0, FT_WIDGET_ROWS);
  return (
    // Everything below sits on `.ftw.deep`'s violet, so it wears that block's
    // own ink (#f2eef8) rather than the `pray` tone pill's — which is a dark
    // violet meant for a pale band and disappears here.
    <Widget
      label={t('mobile.prayer.prayers_to_carry')}
      count={rows.length}
      tone="deep"
      link={t('mobile.prayer.whole_prayer_log')}
      onLink={onOpenPrayers}
    >
      {shown.length === 0 && <WidgetEmpty>{t('mobile.prayer.nothing_open')}</WidgetEmpty>}
      {shown.map((row, i) => {
        const prayed = prayedToday(row.id);
        return (
          <WidgetRow key={row.id} first={i === 0}>
            <Translate
              style={{
                fontFamily: font.bold,
                fontSize: fs(15.5),
                lineHeight: fs(21),
                color: c.widget.onDeep,
              }}
              text={row.burden}
            />
            <Text
              style={{
                fontFamily: font.medium,
                fontSize: fs(13),
                color: c.widget.onDeep,
                opacity: 0.75,
                marginTop: 3,
              }}
            >
              {[
                row.who ? (row.asked ? `${row.who} ${t('mobile.prayer.asked')}` : t('mobile.prayer.for_name').replace('{name}', row.who)) : null,
                row.heavy ? t('mobile.prayer.weighs_heavy') : null,
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
                  // `.ftw-carry` / `.ftw-carry.on` — a hairline of the widget's
                  // own ink on the violet, going to the semantic green once it's
                  // been prayed.
                  borderColor: prayed ? c.card.green : 'rgba(242,238,248,0.28)',
                  backgroundColor: prayed ? c.card.green : 'transparent',
                  opacity: pressed ? 0.6 : 1,
                })}
              >
                <Text
                  style={{
                    fontFamily: font.bold,
                    fontSize: fs(13.5),
                    color: prayed ? c.card.onGreen : c.widget.onDeep,
                  }}
                >
                  {prayed ? t('mobile.prayer.prayed_today') : t('mobile.prayer.i_prayed_just_now')}
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
                  <Text style={{ fontFamily: font.bold, fontSize: fs(13), color: c.widget.onDeep }}>
                    {t('mobile.prayer.god_answered_this')}
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
