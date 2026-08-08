// Mobile v2 — "Write back". A short reply to the full-timer who cares for you,
// posted onto the same Alongside thread the message came from.
import React from 'react';
import { Text, TextInput, View } from 'react-native';
import { firstName, replyDestinationLine, type ThreadMessageWithContact } from '@cisa/core';
import { Sheet } from '../ui';
import { useV2Theme, v2SheetChrome } from '../../theme/v2';
import { PrimaryButton, SecondaryButton } from './atoms';

export function ReplySheet({
  message,
  contactName,
  onClose,
  onSend,
}: {
  message: ThreadMessageWithContact | null;
  /** Whose thread the reply lands on, for the "This stays on {first}'s
   *  thread." subtitle. */
  contactName?: string | null;
  onClose: () => void;
  onSend: (body: string) => void;
}) {
  // Remounted per message by the caller's `key`, so the draft starts empty
  // without an effect.
  const { c, font, radius, fs } = useV2Theme();
  const [body, setBody] = React.useState('');

  const who = message ? firstName(message.fromName) : '';
  const send = () => {
    const text = body.trim();
    if (!text) return;
    onSend(text);
  };

  return (
    <Sheet visible={!!message} onClose={onClose} maxHeightRatio={0.7} {...v2SheetChrome(c)}>
      <View style={{ paddingHorizontal: 18, paddingTop: 4, paddingBottom: 24 }}>
        <Text style={{ fontFamily: font.extra, fontSize: fs(20), letterSpacing: -0.5, color: c.card.ink }}>
          Write back to {who}
        </Text>
        <Text style={{ fontFamily: font.semi, fontSize: fs(13), lineHeight: fs(18), color: c.card.ink3, marginTop: 7 }}>
          {replyDestinationLine(contactName)}
        </Text>

        <TextInput
          value={body}
          onChangeText={setBody}
          placeholder="Say it how you'd say it out loud."
          placeholderTextColor={c.card.ink3}
          multiline
          style={{
            marginTop: 16,
            minHeight: 104,
            backgroundColor: c.card.field,
            borderWidth: 1.5,
            borderColor: c.card.line,
            borderRadius: radius.note,
            paddingVertical: 14,
            paddingHorizontal: 15,
            fontFamily: font.semi,
            fontSize: fs(15),
            color: c.card.ink,
            textAlignVertical: 'top',
          }}
        />

        <View style={{ gap: 9, marginTop: 18 }}>
          <PrimaryButton title="Send" onPress={send} />
          <SecondaryButton title="Not now" onPress={onClose} />
        </View>
      </View>
    </Sheet>
  );
}
