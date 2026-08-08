// Mobile v2 — the queue ENDS. All-clear, then the one-off dates worth knowing,
// then a way into the week just gone (WeekLookBack, a pushed screen — this one
// is about being finished, and a list unfolding underneath undoes that).
// No metrics anywhere.
import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { allClearLine, type QueueDate } from '@cisa/core';
import { useV2Theme } from '../../theme/v2';
import { V2DateBox } from '../v2/DateBox';

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
  const { c, font, fs } = useV2Theme();

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
          backgroundColor: c.room.mark,
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: 40,
        }}
      >
        {/* Drawn, not a glyph — text marks render unreliably in tinted blocks. */}
        <Ionicons name="checkmark" size={30} color={c.room.onMark} />
      </View>

      <Text style={{ fontFamily: font.serif, fontSize: fs(37), lineHeight: fs(41), color: c.room.ink, marginTop: 20 }}>
        {"That's everything,\n"}
        {firstName}.
      </Text>
      <Text style={{ fontFamily: font.medium, fontSize: fs(15.5), lineHeight: fs(23), color: c.room.ink2, marginTop: 12 }}>
        {allClearLine(handledCount)}
      </Text>

      <View style={{ marginTop: 24 }}>
        <V2DateBox label="Dates worth knowing" dates={dates} />
      </View>

      <Pressable onPress={onLookBack} style={{ minHeight: 44, justifyContent: 'center', marginTop: 12 }}>
        <Text style={{ fontFamily: font.bold, fontSize: fs(14), color: c.room.ink2 }}>Look back at your week  →</Text>
      </Pressable>

      {handledCount > 0 && (
        <Pressable onPress={onReset} style={{ minHeight: 44, justifyContent: 'center', marginTop: 4 }}>
          <Text style={{ fontFamily: font.bold, fontSize: fs(13), color: c.room.ink3 }}>Bring back today's queue</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}
