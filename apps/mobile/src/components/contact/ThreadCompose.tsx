// Mobile v2 — the person screen's compose box. The design's `M2Compose`
// (views/mobile/contact.jsx `.m2c-comp`): the kinds you can write in as pills,
// then the words, then Post.
//
// It appears twice — under an expanded conversation in Story, and at the foot
// of Alongside — and holds its own draft in both, since posting clears it.
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { THREAD_KINDS, type ThreadKind } from '@cisa/core';
import { useV2Theme } from '../../theme/v2';
import { V2TextArea } from '../v2/Widget';

export function ThreadCompose({
  kinds,
  onPost,
  minHeight = 88,
  onRoom,
}: {
  kinds: ThreadKind[];
  onPost: (input: { kind: ThreadKind; body: string }) => void;
  minHeight?: number;
  /** Alongside's composer sits on the ROOM, not inside a card.
   *
   * The design's chosen chip is near-black (`.m2.deck .m2-chip.on`) because its
   * person screen stands on paper. Ours stands in the role's room, and in the
   * trainee's green one a dark-green chip vanishes — so on the room the pair
   * inverts, exactly as `V2Seg` above it does. */
  onRoom?: boolean;
}) {
  const { c, font, radius, fs } = useV2Theme();
  const [kind, setKind] = useState<ThreadKind>(kinds[0]);
  const [body, setBody] = useState('');

  const chip = onRoom
    ? { on: c.card.inverse, onInk: c.card.onInverse, off: c.room.chip, offInk: c.room.ink2, edge: 'transparent' }
    : { on: c.card.primary, onInk: c.card.onPrimary, off: c.card.field, offInk: c.card.ink2, edge: c.card.border };

  const send = () => {
    const said = body.trim();
    if (!said) return;
    setBody('');
    onPost({ kind, body: said });
  };

  return (
    <View style={{ marginTop: 4, gap: 10 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {kinds.map((k) => {
          const on = k === kind;
          return (
            <Pressable
              key={k}
              onPress={() => setKind(k)}
              style={({ pressed }) => ({
                minHeight: 44,
                justifyContent: 'center',
                paddingHorizontal: 15,
                borderRadius: radius.chip,
                borderWidth: 1.5,
                borderColor: on ? chip.on : chip.edge,
                backgroundColor: on ? chip.on : chip.off,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text style={{ fontFamily: font.bold, fontSize: fs(13.5), color: on ? chip.onInk : chip.offInk }}>
                {THREAD_KINDS[k].v2Label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <V2TextArea
        value={body}
        onChangeText={setBody}
        placeholder="Say it how you'd say it out loud."
        minHeight={minHeight}
      />

      <Pressable
        onPress={send}
        disabled={!body.trim()}
        style={({ pressed }) => ({
          height: 52,
          borderRadius: radius.button,
          backgroundColor: chip.on,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: !body.trim() ? 0.45 : pressed ? 0.85 : 1,
        })}
      >
        <Text style={{ fontFamily: font.bold, fontSize: fs(15.5), color: chip.onInk }}>Post</Text>
      </Pressable>
    </View>
  );
}
