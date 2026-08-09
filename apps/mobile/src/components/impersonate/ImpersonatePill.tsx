// The strip that stays put while an owner is borrowing someone's view — the
// design's `imp-pill` (mobile.css; views/mobile/app.jsx's `impUI`): a near-black
// navy bar with "Seeing as <name>" and two pill buttons. Room-agnostic on
// purpose: it sits above the trainee's green room, the full-timer's navy paper,
// and the member app alike, so it wears its own dark ground rather than any
// one of theirs.
//
// It takes real space at the top of the screen rather than floating over it.
// The design never has to make this call — its `.imp-pill` renders in the OUTER
// preview shell, over the phone FRAME, and the app inside the frame carries no
// banner at all (views/mobile/app.jsx passes the borrowed role in on the iframe
// URL). On a real device there is no "outside the phone", so the strip is
// in-flow. ImpersonateLayer owns the layout; this strip owns the top safe-area
// inset while it is showing.
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { roleLabel, type AppRole } from '@cisa/core';
import { v2Font } from '../../theme/v2';

export function ImpersonatePill({
  name,
  role,
  onSwitch,
  onExit,
}: {
  name?: string;
  role: AppRole;
  onSwitch: () => void;
  onExit: () => void;
}) {
  const insets = useSafeAreaInsets();
  const label = name || roleLabel(role);

  // `.imp-pill` (mobile.css): 46px over the top inset, `#171d27` ground, white
  // ink, "Seeing as <b>name</b>" at 12.5px, and two 99px-radius pills — the
  // quiet one at `rgba(255,255,255,.13)`, the primary one inverted.
  return (
    <View
      style={{
        backgroundColor: '#171d27',
        height: 46 + insets.top,
        paddingTop: insets.top,
        paddingHorizontal: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <Text
        style={{
          flex: 1,
          fontFamily: v2Font.medium,
          fontSize: 12.5,
          color: 'rgba(255,255,255,0.66)',
        }}
        numberOfLines={1}
      >
        Seeing as <Text style={{ fontFamily: v2Font.semi, color: '#fff' }}>{label}</Text>
      </Text>
      <Pressable
        onPress={onSwitch}
        hitSlop={4}
        style={({ pressed }) => ({
          paddingVertical: 6,
          paddingHorizontal: 11,
          borderRadius: 99,
          backgroundColor: 'rgba(255,255,255,0.13)',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.75 : 1,
        })}
      >
        <Text style={{ fontFamily: v2Font.semi, fontSize: 12.5, color: '#fff' }}>Switch</Text>
      </Pressable>
      <Pressable
        onPress={onExit}
        hitSlop={4}
        style={({ pressed }) => ({
          paddingVertical: 6,
          paddingHorizontal: 11,
          borderRadius: 99,
          backgroundColor: '#fff',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.8 : 1,
        })}
      >
        <Text style={{ fontFamily: v2Font.semi, fontSize: 12.5, color: '#171d27' }}>Back to me</Text>
      </Pressable>
    </View>
  );
}
