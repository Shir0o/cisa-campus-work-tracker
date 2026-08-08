// Mobile v2 — the on-campus window strip. Logging gets promoted hard during the
// window (default Tue & Wed, 12–3); the strip is the first block inside the card
// body and does not scroll away.
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { ON_CAMPUS_SUB, onCampusHeadline, type OnCampusWindow } from '@cisa/core';
import { useV2Theme } from '../../theme/v2';

export function OnCampusStrip({ window: w, onPress }: { window: OnCampusWindow; onPress: () => void }) {
  const { c, font, radius, fs } = useV2Theme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        marginBottom: 18,
        backgroundColor: c.card.window,
        borderRadius: radius.note,
        paddingVertical: 12,
        paddingHorizontal: 15,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        minHeight: 44,
        opacity: pressed ? 0.9 : 1,
      })}
    >
      <View
        style={{
          width: 10,
          height: 10,
          borderRadius: 5,
          backgroundColor: c.card.windowDot,
          borderWidth: 5,
          borderColor: 'rgba(255,255,255,0.16)',
        }}
      />
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: font.extra, fontSize: fs(13.5), color: c.card.onWindow }}>{onCampusHeadline(w)}</Text>
        <Text style={{ fontFamily: font.semi, fontSize: fs(12.5), lineHeight: fs(16), color: c.card.onWindowSub, marginTop: 3 }}>
          {ON_CAMPUS_SUB}
        </Text>
      </View>
    </Pressable>
  );
}
