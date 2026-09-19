// Mobile v2 — one message in a person's thread. The design's `M2ThreadMsg`
// (views/mobile/contact.jsx `.m2c-msg`): who · what kind · how long ago, the
// words.
//
// A `nudge` keeps its own tint, as it does everywhere else in the app — it's a
// follow-up someone is waiting on, not a remark.
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  THREAD_KINDS,
  firstName,
  relTime,
  type ThreadMessage,
} from '@cisa/core';
import { useV2Theme } from '../../theme/v2';
import { PersonMark } from '../queue/atoms';

export function ThreadMessageRow({
  message,
  meUid,
  about,
  nested,
  canDelete,
  onDelete,
}: {
  message: ThreadMessage;
  meUid: string;
  /** The conversation this message hangs off, named — Alongside shows every
   * message on the person, so it says which one each is about. */
  about?: string | null;
  /** Inside an expanded Story conversation, where the card is already white. */
  nested?: boolean;
  /** #1126 — a viewer may delete their own message; an admin may delete any. */
  canDelete: boolean;
  onDelete: (message: ThreadMessage) => void;
}) {
  const { c, font, fs } = useV2Theme();
  const mine = message.from === meUid;
  const isNudge = message.kind === 'nudge';

  return (
    <View
      style={{
        backgroundColor: isNudge ? c.card.tones.follow.band : nested ? c.card.bg2 : c.card.bg,
        borderRadius: 20,
        paddingHorizontal: 17,
        paddingVertical: 15,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
        <PersonMark name={message.fromName} id={message.from} size={28} radius={9} fontSize={10.5} />
        <Text style={{ fontFamily: font.extra, fontSize: fs(14), letterSpacing: -0.28, color: c.card.ink }}>
          {mine ? 'You' : firstName(message.fromName)}
        </Text>
        <Text
          style={{
            fontFamily: font.bold,
            fontSize: fs(10),
            
            
            color: c.card.ink3,
          }}
        >
          {THREAD_KINDS[message.kind].v2Label}
        </Text>
        <Text style={{ marginLeft: 'auto', fontFamily: font.semi, fontSize: fs(11.5), color: c.card.ink3 }}>
          {relTime(message.at)}
        </Text>
        {canDelete && (
          <Pressable
            onPress={() => onDelete(message)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Delete message"
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, padding: 2 })}
          >
            <Ionicons name="trash-outline" size={16} color={c.card.ink3} />
          </Pressable>
        )}
      </View>

      {!!about && (
        <Text style={{ fontFamily: font.semi, fontSize: fs(12), lineHeight: fs(16), color: c.card.ink3, marginTop: 9 }}>
          on “{about}”
        </Text>
      )}

      <Text style={{ fontFamily: font.medium, fontSize: fs(15), lineHeight: fs(22.5), color: c.card.said, marginTop: 11 }}>
        {message.body}
      </Text>
    </View>
  );
}
