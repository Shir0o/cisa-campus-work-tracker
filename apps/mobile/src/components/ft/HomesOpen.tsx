// Mobile v2 — "Homes open to students". Where a Community member's "Open your
// home" offer (MOBILE-V2.md) actually lands.
//
// Read-only on purpose, like every other FT widget: the power here is to
// message the person, not to edit their offer. Matching a student to a table is
// a conversation, not a button.
import React from 'react';
import { Text, View } from 'react-native';
import { FT_WIDGET_ROWS, hospitalitySummary, type HospitalityOffer } from '@cisa/core';
import { useV2Theme } from '../../theme/v2';
import { PersonMark } from '../queue/atoms';
import { WidgetAction, WidgetEmpty, WidgetRow, Widget } from '../v2/Widget';

export function HomesOpen({
  offers,
  onMessage,
}: {
  offers: HospitalityOffer[];
  onMessage: (offer: HospitalityOffer) => void;
}) {
  const { c, font, fs } = useV2Theme();
  const shown = offers.slice(0, FT_WIDGET_ROWS);
  return (
    <Widget label="Homes open to students" count={offers.length}>
      {shown.length === 0 && <WidgetEmpty>No one has offered a table yet.</WidgetEmpty>}
      {shown.map((o, i) => (
        <WidgetRow key={o.uid} first={i === 0}>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <PersonMark name={o.name} id={o.uid} size={34} radius={11} fontSize={12} />
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontFamily: font.bold,
                  fontSize: fs(15.5),
                  lineHeight: fs(20),
                  color: c.widget.ink,
                }}
              >
                {o.name}
              </Text>
              <Text
                style={{
                  fontFamily: font.medium,
                  fontSize: fs(13),
                  lineHeight: fs(19),
                  color: c.widget.ink2,
                  marginTop: 3,
                }}
              >
                {hospitalitySummary(o)}
              </Text>
              {!!o.note && (
                <Text
                  style={{
                    fontFamily: font.medium,
                    fontSize: fs(13),
                    lineHeight: fs(19),
                    color: c.widget.ink3,
                    marginTop: 4,
                  }}
                >
                  “{o.note}”
                </Text>
              )}
              <WidgetAction label="Message them" onPress={() => onMessage(o)} />
            </View>
          </View>
        </WidgetRow>
      ))}
    </Widget>
  );
}
