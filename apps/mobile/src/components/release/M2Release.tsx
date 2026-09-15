// THE RELEASE NUDGE (issue #1021) - the phone's automatic surface.
//
// It appears ONCE per release, for a role the release speaks to, and is held
// back while the on-campus window is open: a sheet that interrupts the two
// hours you are actually on campus is worse than a sheet you never see. The
// record and the gate live in @cisa/core (whatsNew.ts); lib/releases.ts is the
// phone store. The on-demand record is the separate M2WhatsNew sheet.
import React from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { releaseDateWords, type AppRole } from '@cisa/core';
import { markReleaseSeen, useReleaseNudge } from '../../lib/releases';
import { useV2Theme } from '../../theme/v2';

const TITLE = 'A few things are different';
const SUB = 'Since you last opened this. Everything else is where you left it.';
const CTA = 'Carry on';

export function M2Release({
  role,
  inWindow,
}: {
  role: AppRole | null | undefined;
  inWindow?: boolean;
}) {
  const { c, font, fs } = useV2Theme();
  const insets = useSafeAreaInsets();
  const rel = useReleaseNudge(role, inWindow);
  const [gone, setGone] = React.useState(false);

  const close = () => {
    if (rel) void markReleaseSeen(rel.id);
    setGone(true);
  };

  if (rel === null || gone) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={close}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(26,33,43,0.5)' }} onPress={close} />
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: c.card.sheet,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          paddingTop: 10,
          paddingBottom: 18 + insets.bottom,
          paddingHorizontal: 18,
        }}
      >
        <View
          style={{
            alignSelf: 'center',
            width: 40,
            height: 5,
            borderRadius: 3,
            backgroundColor: c.card.grab,
            marginBottom: 14,
          }}
        />
        <Text style={{ fontFamily: font.semi, fontSize: fs(20), lineHeight: fs(24), color: c.card.ink }}>
          {TITLE}
        </Text>
        <Text style={{ fontFamily: font.medium, fontSize: fs(13), lineHeight: fs(19), color: c.card.ink3, marginTop: 4 }}>
          {SUB}
        </Text>

        <View style={{ marginVertical: 12 }}>
          {rel.lines?.map((l, i) => (
            <View
              key={i}
              style={{
                paddingVertical: 14,
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: c.card.line,
              }}
            >
              <Text style={{ fontFamily: font.medium, fontSize: fs(14.5), lineHeight: fs(22), color: c.card.ink }}>
                {l}
              </Text>
            </View>
          ))}
        </View>

        <Pressable
          onPress={close}
          style={({ pressed }) => ({
            width: '100%',
            paddingVertical: 14,
            borderRadius: 16,
            backgroundColor: c.card.primary,
            alignItems: 'center',
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Text style={{ fontFamily: font.semi, fontSize: fs(14), color: c.card.onPrimary }}>{CTA}</Text>
        </Pressable>

        <Text style={{ fontFamily: font.medium, fontSize: fs(12), color: c.card.ink3, marginTop: 12, textAlign: 'center' }}>
          Version {rel.version} ({releaseDateWords(rel.date)})
        </Text>
      </View>
    </Modal>
  );
}
