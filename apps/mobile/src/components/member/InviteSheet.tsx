// Mobile v2 — "Bring someone with you". The design copies an invitation to the
// clipboard; RN's own Share sheet is better on a phone (it hands the line
// straight to Messages), and it needs no new dependency — expo-clipboard isn't
// installed and doesn't need to be.
import React from 'react';
import { Pressable, Share, Text, View } from 'react-native';
import { inviteMessage, type Event } from '@cisa/core';
import { Sheet } from '../ui';
import { useV2Theme } from '../../theme/v2';
import { Room } from '../v2/Widget';

export function InviteSheet({
  visible,
  event,
  onClose,
  onShared,
}: {
  visible: boolean;
  event: Event | null;
  onClose: () => void;
  onShared: () => void;
}) {
  const { c, fs } = useV2Theme();
  return (
    <Sheet visible={visible} onClose={onClose} backgroundColor={c.card}>
      {/* The provider again inside: BottomSheetModal re-parents its children to
          the app root, so the outer one doesn't travel with them. */}
      <Room room="queue">
        <InviteBody event={event} onClose={onClose} onShared={onShared} />
      </Room>
    </Sheet>
  );
}

function InviteBody({
  event,
  onClose,
  onShared,
}: {
  event: Event | null;
  onClose: () => void;
  onShared: () => void;
}) {
  const { c, font, radius, fs } = useV2Theme();
  const message = inviteMessage(event);
  return (
    <View style={{ paddingHorizontal: 20, paddingBottom: 24, gap: 14 }}>
      <Text style={{ fontFamily: font.extra, fontSize: fs(21), letterSpacing: -0.6, color: c.cardInk }}>
        Bring someone with you
      </Text>
      <Text style={{ fontFamily: font.medium, fontSize: fs(14.5), lineHeight: fs(21), color: c.cardInk2 }}>
        The easiest invitation is “come with me”.
      </Text>
      <Text
        style={{
          fontFamily: font.medium,
          fontSize: fs(15),
          lineHeight: fs(22),
          color: c.noteInk,
          backgroundColor: c.note,
          borderRadius: radius.note,
          padding: 14,
        }}
      >
        {message}
      </Text>
      <Pressable
        // Close only once the OS share sheet has resolved. Dismissing this
        // bottom sheet in the same tick races the native modal presentation on
        // iOS — two modals transitioning at once, and the share sheet can fail
        // to appear at all. `finally` so a share the OS refuses to present
        // still closes, rather than leaving a sheet that no longer does
        // anything.
        onPress={() => {
          void Share.share({ message })
            .then((result) => {
              if (result.action === Share.sharedAction) onShared();
            })
            .catch(() => {
              /* nothing to say — the invitation is still on screen behind it */
            })
            .finally(onClose);
        }}
        style={({ pressed }) => ({
          height: 54,
          borderRadius: radius.button,
          backgroundColor: c.warm,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <Text style={{ fontFamily: font.bold, fontSize: fs(16.5), color: c.onWarm }}>
          Send the invitation
        </Text>
      </Pressable>
      <Text style={{ fontFamily: font.medium, fontSize: fs(12.5), lineHeight: fs(18), color: c.cardInk3 }}>
        Whoever you bring, someone on the team will look out for them.
      </Text>
    </View>
  );
}
