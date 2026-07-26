// Mobile v2 — "Write back". A short reply to the full-timer who cares for you,
// posted onto the same Alongside thread the message came from.
import React from 'react';
import { Text, TextInput, View } from 'react-native';
import { firstName, type ThreadMessageWithContact } from '@cisa/core';
import { Sheet } from '../ui';
import { useV2Theme } from '../../theme/v2';
import { PrimaryButton, SecondaryButton } from './atoms';

export function ReplySheet({
  message,
  onClose,
  onSend,
}: {
  message: ThreadMessageWithContact | null;
  onClose: () => void;
  onSend: (body: string) => void;
}) {
  // Remounted per message by the caller's `key`, so the draft starts empty
  // without an effect.
  const { c, font, radius } = useV2Theme();
  const [body, setBody] = React.useState('');

  const who = message ? firstName(message.fromName) : '';
  const send = () => {
    const text = body.trim();
    if (!text) return;
    onSend(text);
  };

  return (
    <Sheet visible={!!message} onClose={onClose} maxHeightRatio={0.7} backgroundColor={c.card}>
      <View style={{ paddingHorizontal: 18, paddingTop: 4, paddingBottom: 24 }}>
        <Text style={{ fontFamily: font.extra, fontSize: 20, letterSpacing: -0.5, color: c.cardInk }}>
          Write back to {who}
        </Text>
        {!!message && (
          <Text style={{ fontFamily: font.semi, fontSize: 13, lineHeight: 18, color: c.cardInk3, marginTop: 7 }}>
            “{message.body}”
          </Text>
        )}

        <TextInput
          value={body}
          onChangeText={setBody}
          placeholder="A sentence is plenty."
          placeholderTextColor={c.cardInk3}
          multiline
          style={{
            marginTop: 16,
            minHeight: 104,
            backgroundColor: c.field,
            borderWidth: 1.5,
            borderColor: c.line,
            borderRadius: radius.note,
            paddingVertical: 14,
            paddingHorizontal: 15,
            fontFamily: font.semi,
            fontSize: 15,
            color: c.cardInk,
            textAlignVertical: 'top',
          }}
        />

        <View style={{ gap: 9, marginTop: 18 }}>
          <PrimaryButton title="Send it" onPress={send} />
          <SecondaryButton title="Not now" onPress={onClose} />
        </View>
      </View>
    </Sheet>
  );
}
