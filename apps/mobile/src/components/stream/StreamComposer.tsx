// The one composer box (ADR 0033, C1–C3), phone edition: the audience line
// above it, then one box holding — on a Conversation only — the kind chips,
// the words, and send. A selected Follow-up ask chip takes the amber and its
// own placeholder, and the audience line says the ask's reach. It holds its
// own draft; sending clears it.
//
// No @ tool and no shortcut hint on the phone yet: mention candidates are
// unchanged from ADR 0007 but the phone has never offered them, and a keyboard
// hint means nothing on a touch screen (see DRIFT.md).
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLanguage } from '../../lib/LanguageProvider';
import { useV2Theme } from '../../theme/v2';

/** Comment · Question · Ask a follow-up (#813); `nudge` is a Follow-up ask. */
export type StreamComposeKind = 'comment' | 'question' | 'nudge';
const KINDS: { kind: StreamComposeKind; label: string; placeholder: string }[] = [
  { kind: 'comment', label: 'mobile.stream.kind_comment', placeholder: 'mobile.stream.placeholder_comment' },
  { kind: 'question', label: 'mobile.stream.kind_question', placeholder: 'mobile.stream.placeholder_question' },
  { kind: 'nudge', label: 'mobile.stream.kind_follow_up', placeholder: 'mobile.stream.placeholder_follow_up' },
];

export function StreamComposer({
  audience,
  askAudience,
  locked,
  kinds,
  placeholder,
  label,
  onSend,
}: {
  /** Whose eyes a message reaches (C3). */
  audience?: string;
  /** The same while a Follow-up ask is being written. */
  askAudience?: string;
  /** A lock before the audience line — the Full-timers stream. */
  locked?: boolean;
  /** Kind chips inside the box — a Conversation only. */
  kinds?: boolean;
  /** Without kinds; with kinds each kind has its own. */
  placeholder?: string;
  /** The field's accessible name. */
  label: string;
  onSend: (input: { body: string; kind: StreamComposeKind }) => void;
}) {
  const { c, font, radius, fs } = useV2Theme();
  const { t } = useLanguage();
  const [kind, setKind] = useState<StreamComposeKind>('comment');
  const [body, setBody] = useState('');
  const ask = kinds && kind === 'nudge';
  const line = ask && askAudience ? askAudience : audience;
  const hint = kinds ? t(KINDS.find((k) => k.kind === kind)!.placeholder) : placeholder;

  const send = () => {
    const said = body.trim();
    if (!said) return;
    setBody('');
    onSend({ body: said, kind: kinds ? kind : 'comment' });
  };

  return (
    <View style={{ paddingHorizontal: 12, paddingTop: 6, paddingBottom: 10, backgroundColor: c.room.bg }}>
      {!!line && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6, marginLeft: 4 }}>
          {locked && <Ionicons name="lock-closed" size={12} color={c.room.ink2} />}
          <Text style={{ fontFamily: font.medium, fontSize: fs(12), color: c.room.ink2 }}>{line}</Text>
        </View>
      )}
      <View
        style={{
          borderRadius: radius.tile,
          borderWidth: 1,
          borderColor: c.card.border,
          backgroundColor: c.card.bg,
          paddingHorizontal: 10,
          paddingTop: kinds ? 4 : 8,
          paddingBottom: 4,
        }}
      >
        {kinds && (
          <View accessibilityRole="radiogroup" accessibilityLabel={t('mobile.stream.kind_group')} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
            {KINDS.map((k) => {
              const on = k.kind === kind;
              const tone = k.kind === 'nudge' ? c.card.tones.due : null;
              return (
                <Pressable
                  key={k.kind}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  onPress={() => setKind(k.kind)}
                  style={({ pressed }) => ({
                    minHeight: 44,
                    justifyContent: 'center',
                    paddingHorizontal: 12,
                    borderRadius: 999,
                    backgroundColor: on ? (tone ? tone.band : c.card.bg2) : 'transparent',
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <Text style={{ fontFamily: on ? font.bold : font.medium, fontSize: fs(12.5), color: on ? (tone ? tone.text : c.card.ink) : c.card.ink2 }}>
                    {t(k.label)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6 }}>
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder={hint}
            placeholderTextColor={c.card.ink3}
            accessibilityLabel={label}
            multiline
            style={{
              flex: 1,
              minHeight: 44,
              maxHeight: 140,
              paddingVertical: 10,
              paddingHorizontal: 4,
              fontFamily: font.medium,
              fontSize: fs(15),
              color: c.card.ink,
              textAlignVertical: 'top',
            }}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('mobile.stream.send')}
            accessibilityState={{ disabled: !body.trim() }}
            disabled={!body.trim()}
            onPress={send}
            style={({ pressed }) => ({
              width: 44,
              height: 44,
              borderRadius: 22,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: c.card.inverse,
              opacity: !body.trim() ? 0.35 : pressed ? 0.8 : 1,
            })}
          >
            <Ionicons name="arrow-up" size={20} color={c.card.onInverse} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}
