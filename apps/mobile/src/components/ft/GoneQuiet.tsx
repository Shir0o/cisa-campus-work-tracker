// Mobile v2 — "Gone quiet in your care". The people you haven't heard from.
//
// The line reads `ftLastHeard(days)`, a NUMBER-shaped helper: the prototype fed
// a day count to a date formatter and printed "20661 days ago". `Contact.stage`
// already holds the stage's label, so it renders straight through — no lookup.
import React from 'react';
import { Text, View } from 'react-native';
import { FT_WIDGET_ROWS, ftLastHeard, type Contact, type Leader } from '@cisa/core';
import { useV2Theme } from '../../theme/v2';
import { PersonMark } from '../queue/atoms';
import { WidgetAction, WidgetEmpty, WidgetRow, Widget } from '../v2/Widget';

export function GoneQuiet({
  quiet,
  onLog,
  onSetTodo,
  onOpen,
  onOpenPeople,
}: {
  quiet: Leader[];
  onLog: (contact: Contact) => void;
  onSetTodo: (contact: Contact) => void;
  onOpen: (contactId: string) => void;
  onOpenPeople: () => void;
}) {
  const { c, font } = useV2Theme();
  const shown = quiet.slice(0, FT_WIDGET_ROWS);
  return (
    <Widget
      label="Gone quiet in your care"
      count={quiet.length}
      link="All your people →"
      onLink={onOpenPeople}
    >
      {shown.length === 0 && <WidgetEmpty>Everyone&apos;s been heard from lately.</WidgetEmpty>}
      {shown.map((l, i) => (
        <WidgetRow key={l.contact.id} first={i === 0}>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <PersonMark name={l.contact.name} id={l.contact.id} size={34} radius={11} fontSize={12} />
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontFamily: font.bold,
                  fontSize: 15.5,
                  lineHeight: 20,
                  color: c.cardInk,
                }}
              >
                {l.contact.name}
              </Text>
              <Text
                style={{
                  fontFamily: font.medium,
                  fontSize: 13,
                  color: c.cardInk2,
                  marginTop: 3,
                }}
              >
                {[`Last heard ${ftLastHeard(l.days)}`, l.contact.stage].filter(Boolean).join(' · ')}
              </Text>
              <View style={{ flexDirection: 'row', gap: 18, marginTop: 2 }}>
                <WidgetAction label="Log a moment" onPress={() => onLog(l.contact)} />
                <WidgetAction label="Set a to-do" onPress={() => onSetTodo(l.contact)} />
                <WidgetAction label="Open" onPress={() => onOpen(l.contact.id)} />
              </View>
            </View>
          </View>
        </WidgetRow>
      ))}
    </Widget>
  );
}
