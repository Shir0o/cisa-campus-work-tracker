// Mobile v2 — one message in a person's thread. The design's `M2ThreadMsg`
// (views/mobile/contact.jsx `.m2c-msg`): who · what kind · how long ago, the
// words, then the four reactions.
//
// A `nudge` keeps its own tint, as it does everywhere else in the app — it's a
// follow-up someone is waiting on, not a remark.
import { Pressable, Text, View } from 'react-native';
import {
  THREAD_KINDS,
  THREAD_REACTIONS,
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
  canReact,
  onToggleReaction,
}: {
  message: ThreadMessage;
  meUid: string;
  /** The conversation this message hangs off, named — Alongside shows every
   * message on the person, so it says which one each is about. */
  about?: string | null;
  /** Inside an expanded Story conversation, where the card is already white. */
  nested?: boolean;
  canReact: boolean;
  onToggleReaction: (messageId: string, emoji: string) => void;
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
            letterSpacing: 1,
            textTransform: 'uppercase',
            color: c.card.ink3,
          }}
        >
          {THREAD_KINDS[message.kind].v2Label}
        </Text>
        <Text style={{ marginLeft: 'auto', fontFamily: font.semi, fontSize: fs(11.5), color: c.card.ink3 }}>
          {relTime(message.at)}
        </Text>
      </View>

      {!!about && (
        <Text style={{ fontFamily: font.semi, fontSize: fs(12), lineHeight: fs(16), color: c.card.ink3, marginTop: 9 }}>
          on “{about}”
        </Text>
      )}

      <Text style={{ fontFamily: font.medium, fontSize: fs(15), lineHeight: fs(22.5), color: c.card.said, marginTop: 11 }}>
        {message.body}
      </Text>

      <View style={{ flexDirection: 'row', gap: 7, marginTop: 14 }}>
        {THREAD_REACTIONS.map((emoji) => {
          const on = (message.reactions ?? []).some((r) => r.by === meUid && r.emoji === emoji);
          const count = (message.reactions ?? []).filter((r) => r.emoji === emoji).length;
          return (
            <Pressable
              key={emoji}
              onPress={() => canReact && onToggleReaction(message.id, emoji)}
              disabled={!canReact}
              style={({ pressed }) => ({
                minWidth: 44,
                height: 38,
                paddingHorizontal: 8,
                borderRadius: 12,
                borderWidth: 1.5,
                borderColor: on ? c.card.reactOnBorder : c.card.line,
                backgroundColor: on ? c.card.reactOnBg : c.card.react,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text style={{ fontSize: fs(15) }}>{emoji}</Text>
              {count > 1 && (
                <Text style={{ fontFamily: font.bold, fontSize: fs(11), color: c.card.ink2 }}>{count}</Text>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
