// Mobile v2 — "Pray for {First}". The design's `M2PrayerSheet`
// (views/mobile/contact.jsx): what we're asking for, anything else to
// remember, and a deep-violet Start praying.
//
// The design also offers "Part of life" tag chips (family · faith · health …).
// A `PrayerRecord` carries no tags, so they're dropped rather than faked — the
// two fields are concatenated into `burden`, which is what `addPrayer` already
// does on this screen.
import { useState } from 'react';
import { Text, View } from 'react-native';
import { firstName } from '@cisa/core';
import { Sheet } from '../ui';
import { useV2Theme, type V2Room } from '../../theme/v2';
import { Kicker, PrimaryButton, SecondaryButton } from '../queue/atoms';
import { Room, V2Input, V2TextArea } from '../v2/Widget';

interface ContactPrayerSheetProps {
  visible: boolean;
  contactName: string;
  room: V2Room;
  onSave: (input: { burden: string; context?: string }) => void;
  onClose: () => void;
}

/** Bottom sheets portal to the app root, outside the screen's provider, so this
 * one carries the room itself (see `Room` in components/v2/Widget). */
export function ContactPrayerSheet(props: ContactPrayerSheetProps) {
  return (
    <Room room={props.room}>
      <ContactPrayerSheetBody {...props} />
    </Room>
  );
}

function ContactPrayerSheetBody({ visible, contactName, room, onSave, onClose }: ContactPrayerSheetProps) {
  const { c, font } = useV2Theme();
  const [burden, setBurden] = useState('');
  const [context, setContext] = useState('');

  const save = () => {
    const asked = burden.trim();
    if (!asked) return;
    setBurden('');
    setContext('');
    onSave({ burden: asked, context: context.trim() || undefined });
  };

  return (
    <Sheet visible={visible} onClose={onClose} maxHeightRatio={0.85} backgroundColor={c.card}>
      <Room room={room}>
        <View style={{ paddingHorizontal: 18, paddingTop: 4, paddingBottom: 24 }}>
          <Text style={{ fontFamily: font.extra, fontSize: 20, letterSpacing: -0.5, color: c.cardInk }}>
            Pray for {firstName(contactName)}
          </Text>
          <Text style={{ fontFamily: font.semi, fontSize: 13, lineHeight: 18, color: c.cardInk3, marginTop: 7 }}>
            Short is fine. You're the one who'll read it back.
          </Text>

          <View style={{ marginTop: 16, gap: 9 }}>
            <Kicker>What are we asking for</Kicker>
            <V2Input value={burden} onChangeText={setBurden} placeholder="In a few words" />
          </View>

          <View style={{ marginTop: 14, gap: 9 }}>
            <Kicker>Anything else to remember</Kicker>
            <V2TextArea
              value={context}
              onChangeText={setContext}
              placeholder="Context, in your own words."
            />
          </View>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
            <View style={{ flex: 1 }}>
              <PrimaryButton title="Start praying" tone="deep" onPress={save} />
            </View>
            <View style={{ width: 110 }}>
              <SecondaryButton title="Cancel" onPress={onClose} />
            </View>
          </View>
        </View>
      </Room>
    </Sheet>
  );
}
