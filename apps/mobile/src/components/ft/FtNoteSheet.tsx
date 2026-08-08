// Mobile v2 — writing to a teammate. Encourage them, remind them, or answer the
// question they asked. Ported from the design's `FtNoteSheet`.
import React from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { firstName, type ThreadKind } from '@cisa/core';
import { Sheet } from '../ui';
import { useV2Theme, v2SheetChrome } from '../../theme/v2';
import { PrimaryButton, SecondaryButton } from '../queue/atoms';
import { Room } from '../v2/Widget';

/** Three lines a full-timer can send with one tap. Verbatim from the design. */
const CANNED = [
  'This is good work — thank you for showing up for them.',
  'Love how you listened here. Keep going.',
  'Noticed this. Praying for you both today.',
];

export interface FtNoteTarget {
  kind: ThreadKind;
  /** The teammate being written to. */
  who: string;
  /** The person the thread hangs on. */
  contactName: string;
}

interface FtNoteSheetProps {
  visible: boolean;
  target: FtNoteTarget | null;
  onClose: () => void;
  onSend: (body: string) => void;
}

/** Bottom sheets portal to the app root, outside the home screen's provider, so
 * this one carries the room itself. */
export function FtNoteSheet(props: FtNoteSheetProps) {
  return (
    <Room room="ft">
      <NoteSheetBody {...props} />
    </Room>
  );
}

function NoteSheetBody({ visible, target, onClose, onSend }: FtNoteSheetProps) {
  // Remounted per target by the caller's `key`, so the draft starts empty.
  const { c, font, radius, fs } = useV2Theme();
  const [body, setBody] = React.useState('');

  const who = target ? firstName(target.who) : '';
  const title =
    target?.kind === 'encouragement'
      ? `Encourage ${who}`
      : target?.kind === 'nudge'
        ? `Remind ${who}`
        : `Write back to ${who}`;

  const send = (text?: string) => {
    const t = (text ?? body).trim();
    if (!t) return;
    onSend(t);
  };

  return (
    <Sheet visible={visible} onClose={onClose} maxHeightRatio={0.8} {...v2SheetChrome(c)}>
      <Room room="ft">
        <View style={{ paddingHorizontal: 18, paddingTop: 4, paddingBottom: 24 }}>
          <Text
            style={{
              fontFamily: font.extra,
              fontSize: fs(20),
              letterSpacing: -0.5,
              color: c.card.ink,
            }}
          >
            {title}
          </Text>
          {!!target?.contactName && (
            <Text
              style={{
                fontFamily: font.semi,
                fontSize: fs(13),
                color: c.card.ink3,
                marginTop: 7,
              }}
            >
              About {target.contactName}
            </Text>
          )}

          {target?.kind === 'encouragement' && (
            <View style={{ gap: 8, marginTop: 16 }}>
              {CANNED.map((t) => (
                <Pressable
                  key={t}
                  onPress={() => send(t)}
                  style={({ pressed }) => ({
                    minHeight: 44,
                    justifyContent: 'center',
                    backgroundColor: c.card.bg2,
                    borderRadius: radius.note,
                    paddingVertical: 12,
                    paddingHorizontal: 14,
                    opacity: pressed ? 0.65 : 1,
                  })}
                >
                  <Text
                    style={{
                      fontFamily: font.semi,
                      fontSize: fs(14),
                      lineHeight: fs(19),
                      color: c.card.ink2,
                    }}
                  >
                    {t}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}

          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder={
              target?.kind === 'nudge' ? 'A gentle reminder, in your own words…' : 'Say it in your own words…'
            }
            placeholderTextColor={c.card.ink3}
            multiline
            style={{
              marginTop: 14,
              minHeight: 96,
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

          <View style={{ gap: 9, marginTop: 16 }}>
            <PrimaryButton title="Send" onPress={() => send()} />
            <SecondaryButton title="Not now" onPress={onClose} />
          </View>

          {!!target?.contactName && (
            <Text
              style={{
                fontFamily: font.medium,
                fontSize: fs(12),
                lineHeight: fs(17),
                color: c.card.ink3,
                marginTop: 14,
              }}
            >
              It lands in {who}&apos;s app, on {firstName(target.contactName)}
              &apos;s thread.
            </Text>
          )}
        </View>
      </Room>
    </Sheet>
  );
}
