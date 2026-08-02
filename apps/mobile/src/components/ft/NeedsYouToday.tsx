// Mobile v2 — "Needs you today". The to-dos owed today, checkable in place.
// Ported from the design's `.ftw-todo` rows.
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { dueChip, type FtTodoSplit, type Task } from '@cisa/core';
import { useV2Theme } from '../../theme/v2';
import { WidgetEmpty, WidgetRow, Widget } from '../v2/Widget';

export function NeedsYouToday({
  todos,
  onDone,
  onOpenBoard,
}: {
  todos: FtTodoSplit;
  onDone: (task: Task) => void;
  onOpenBoard: () => void;
}) {
  const { c, font, fs } = useV2Theme();
  const later = todos.laterThisWeek.length;
  return (
    <Widget
      label="Needs you today"
      count={todos.today.length}
      link={later ? `${later} more later this week →` : null}
      onLink={onOpenBoard}
    >
      {todos.today.length === 0 && <WidgetEmpty>Nothing due today.</WidgetEmpty>}
      {todos.today.map((t, i) => {
        const chip = dueChip(t.dueDate);
        return (
          <WidgetRow key={t.id} first={i === 0}>
            <Pressable
              onPress={() => onDone(t)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'flex-start',
                gap: 12,
                minHeight: 44,
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 7,
                  borderWidth: 1.5,
                  borderColor: c.border,
                  marginTop: 1,
                }}
              />
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontFamily: font.bold,
                    fontSize: fs(15.5),
                    lineHeight: fs(21),
                    color: c.cardInk,
                  }}
                >
                  {t.title}
                </Text>
                {!!chip && (
                  <Text
                    style={{
                      fontFamily: font.semi,
                      fontSize: fs(12),
                      color: chip.tone === 'overdue' ? c.tones.follow.text : c.cardInk3,
                      marginTop: 4,
                    }}
                  >
                    {chip.label}
                  </Text>
                )}
              </View>
            </Pressable>
          </WidgetRow>
        );
      })}
    </Widget>
  );
}
