// Mobile v2 — the member app's two writing sheets: asking the team to pray,
// and adding someone to your own heart. Same shape, opposite privacy, and the
// copy says which is which every time.
import React from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Sheet } from '../ui';
import { useV2Theme } from '../../theme/v2';
import { Room } from '../v2/Widget';

function Body({
  title,
  sub,
  placeholder,
  cta,
  multiline,
  onSubmit,
  onClose,
}: {
  title: string;
  sub: string;
  placeholder: string;
  cta: string;
  multiline: boolean;
  onSubmit: (body: string) => void;
  onClose: () => void;
}) {
  const { c, font, radius, fs } = useV2Theme();
  const [body, setBody] = React.useState('');
  return (
    <View style={{ paddingHorizontal: 20, paddingBottom: 24, gap: 14 }}>
      <Text style={{ fontFamily: font.extra, fontSize: fs(21), letterSpacing: -0.6, color: c.cardInk }}>
        {title}
      </Text>
      <Text style={{ fontFamily: font.medium, fontSize: fs(14.5), lineHeight: fs(21), color: c.cardInk2 }}>
        {sub}
      </Text>
      <TextInput
        value={body}
        onChangeText={setBody}
        placeholder={placeholder}
        placeholderTextColor={c.cardInk3}
        multiline={multiline}
        autoFocus
        style={{
          borderWidth: 1.5,
          borderColor: c.border,
          borderRadius: radius.note,
          backgroundColor: c.field,
          paddingHorizontal: 14,
          paddingVertical: 12,
          minHeight: multiline ? 110 : 52,
          textAlignVertical: multiline ? 'top' : 'center',
          fontFamily: font.medium,
          fontSize: fs(15),
          lineHeight: fs(22),
          color: c.cardInk,
        }}
      />
      <Pressable
        onPress={() => {
          const trimmed = body.trim();
          if (!trimmed) return;
          onSubmit(trimmed);
        }}
        disabled={!body.trim()}
        style={({ pressed }) => ({
          height: 54,
          borderRadius: radius.button,
          backgroundColor: c.deep,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: !body.trim() ? 0.45 : pressed ? 0.85 : 1,
        })}
      >
        <Text style={{ fontFamily: font.bold, fontSize: fs(16.5), color: c.onDeep }}>{cta}</Text>
      </Pressable>
      <Pressable
        onPress={onClose}
        style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
      >
        <Text style={{ fontFamily: font.bold, fontSize: fs(13.5), color: c.cardInk3 }}>Not now</Text>
      </Pressable>
    </View>
  );
}

/** "Ask the team to pray" — a real write to prayerRequests, which staff read on
 * the full-timer home. The sub-line promises exactly that and nothing more. */
export function AskSheet({
  visible,
  onClose,
  onSend,
}: {
  visible: boolean;
  onClose: () => void;
  onSend: (body: string) => void;
}) {
  const { c, fs } = useV2Theme();
  return (
    <Sheet visible={visible} onClose={onClose} backgroundColor={c.card}>
      <Room room="queue">
        <Body
          title="Ask the team to pray"
          sub="However much you want to say. It goes to the people who care for you — not on any wall."
          placeholder="What's going on?"
          cta="Send it"
          multiline
          onSubmit={onSend}
          onClose={onClose}
        />
      </Room>
    </Sheet>
  );
}

/** "Who's on your heart?" — writes to users/{uid}/personalPrayers, which the
 * rules make owner-only. Nobody on the team can read this list. */
export function OnYourHeartSheet({
  visible,
  onClose,
  onAdd,
}: {
  visible: boolean;
  onClose: () => void;
  onAdd: (title: string) => void;
}) {
  const { c, fs } = useV2Theme();
  return (
    <Sheet visible={visible} onClose={onClose} backgroundColor={c.card}>
      <Room room="queue">
        <Body
          title="Who's on your heart?"
          sub="Just between you and God — nobody on the team sees this list."
          placeholder="Daniel — midterms are wrecking him"
          cta="Add them"
          multiline={false}
          onSubmit={onAdd}
          onClose={onClose}
        />
      </Room>
    </Sheet>
  );
}
