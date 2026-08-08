// Mobile v2 — the full-timer's prayer log. The design's `FtPrayerLog`
// (views/mobile/ft.jsx): everything the team is carrying, in one list, with the
// same one action the home widget offers.
//
// It reads the SAME `carryRows` the "Prayers to carry" widget and the glance
// tile read — uncapped here, capped there — so the number on the tile and the
// length of this list can never disagree. "I prayed just now" is device-local
// for the day, exactly as it is everywhere else in v2 (see useFtHomeData).
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ActivityIndicator } from 'react-native';
import { SafeAreaView } from '../ui/SafeArea';
import type { FtCarryRow } from '@cisa/core';
import { useAuth } from '../../lib/AuthProvider';
import { useFtHomeData } from '../../lib/useFtHomeData';
import { useV2Theme } from '../../theme/v2';
import { Room, V2PersonRow, V2Screen } from '../v2/Widget';

export function FtPrayerLogScreen() {
  return (
    <Room room="ft">
      <FtPrayerLog />
    </Room>
  );
}

function PrayedPill({ prayed, onPress }: { prayed: boolean; onPress: () => void }) {
  const { c, font, radius, fs } = useV2Theme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => ({
        minHeight: 44,
        justifyContent: 'center',
        paddingHorizontal: 14,
        borderRadius: radius.chip,
        backgroundColor: prayed ? c.tones.pray.band : 'transparent',
        borderWidth: prayed ? 0 : 1,
        borderColor: c.border,
        opacity: pressed ? 0.65 : 1,
      })}
    >
      <Text style={{ fontFamily: font.bold, fontSize: fs(12.5), color: prayed ? c.tones.pray.text : c.cardInk2 }}>
        {prayed ? 'Prayed ✓' : 'I prayed'}
      </Text>
    </Pressable>
  );
}

function FtPrayerLog() {
  const { c, font, fs } = useV2Theme();
  const { uid, user } = useAuth();
  const router = useRouter();
  const data = useFtHomeData(uid, user?.displayName ?? null);
  // `prayedToday` reads a store outside React, so nudge a render on tap.
  const [, bump] = React.useReducer((n: number) => n + 1, 0);

  const rows = data.carryRows;
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  if (data.loading) {
    return (
      <SafeAreaView
        edges={['top']}
        style={{ flex: 1, backgroundColor: c.room, alignItems: 'center', justifyContent: 'center' }}
      >
        <ActivityIndicator color={c.roomInk2} />
      </SafeAreaView>
    );
  }

  const open = (row: FtCarryRow) => row.contactId && router.push(`/contact/${row.contactId}`);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.room }}>
      <V2Screen
        title="Prayer log"
        note={`${rows.length} ${rows.length === 1 ? 'prayer' : 'prayers'} we're carrying`}
        onBack={back}
      >
        {rows.length === 0 && (
          <Text style={{ fontFamily: font.semi, fontSize: fs(14), color: c.roomInk3, paddingVertical: 20 }}>
            Nothing open right now.
          </Text>
        )}
        {rows.map((row) => (
          <V2PersonRow
            key={row.id}
            name={row.who ?? 'Someone'}
            colorSeed={row.contactId ?? row.id}
            sub={row.burden}
            note={[row.asked ? 'They asked the team' : null, row.heavy ? 'Weighs heavy' : null]
              .filter(Boolean)
              .join(' · ')}
            onPress={row.contactId ? () => open(row) : undefined}
            right={
              <PrayedPill
                prayed={data.prayedToday(row.id)}
                onPress={() => {
                  data.markPrayed(row.id);
                  bump();
                }}
              />
            }
          />
        ))}
      </V2Screen>
    </SafeAreaView>
  );
}
