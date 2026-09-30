// One message in a phone stream (ADR 0033, direction A): no bubble — a 36px
// avatar, the name, its kind tag and the time on one line, the body beneath.
// A continuation drops the avatar and the name line. Everyone is left-aligned,
// the viewer included, under their own name (G1–G3). Long-press stands in for
// the web's hover toolbar (G7); an ask carries its state and, while open, the
// buttons this viewer may press (K1–K4).
//
// Source-agnostic: it draws a core `StreamRow` and hands events back, so the
// person screen, a Thread and the phone's chat all use it.
import { Pressable, Text, View } from 'react-native';
import type { AskAction, StreamMessage, StreamRow as StreamRowModel, ThreadSummary } from '@cisa/core';
import { useLanguage } from '../../lib/LanguageProvider';
import { useV2Theme } from '../../theme/v2';
import { PersonMark } from '../queue/atoms';
import { askLine, repliesLabel, timeOf, whenOf } from './format';

export const AVATAR = 36;
const GAP = 10;

export interface StreamRowProps<M extends StreamMessage> {
  row: StreamRowModel<M>;
  now: number;
  /** Hides ask actions — a viewer who cannot write, or "See it as they do". */
  readOnly?: boolean;
  onLongPress?: (row: StreamRowModel<M>) => void;
  /** Present where the stream has Threads; the chip opens it. */
  onOpenThread?: (row: StreamRowModel<M>) => void;
  onCloseAsk?: (row: StreamRowModel<M>, how: AskAction) => void;
}

export function StreamRowView<M extends StreamMessage>({
  row,
  now,
  readOnly,
  onLongPress,
  onOpenThread,
  onCloseAsk,
}: StreamRowProps<M>) {
  const { c, font, fs } = useV2Theme();
  const { t, language } = useLanguage();
  const { message: m, continuation, tag, ask, thread } = row;
  const actions = readOnly ? [] : row.askActions;
  const withdrawn = ask?.status === 'withdrawn';
  const tone = tag === 'question' ? c.card.tones.ask : c.card.tones.due;

  return (
    <Pressable
      onLongPress={onLongPress ? () => onLongPress(row) : undefined}
      delayLongPress={350}
      accessibilityHint={onLongPress ? t('mobile.stream.message_actions') : undefined}
      style={({ pressed }) => ({
        flexDirection: 'row',
        gap: GAP,
        paddingVertical: continuation ? 2 : 6,
        paddingHorizontal: 8,
        marginHorizontal: -8,
        borderRadius: 12,
        backgroundColor: pressed && onLongPress ? c.card.bg2 : 'transparent',
      })}
    >
      <View style={{ width: AVATAR }}>
        {!continuation && <PersonMark name={m.fromName} id={m.from} size={AVATAR} radius={AVATAR / 2} fontSize={12} />}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        {!continuation && (
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, minHeight: 20 }}>
            <Text style={{ fontFamily: font.bold, fontSize: fs(14), color: c.card.ink }}>{m.fromName}</Text>
            {!!tag && (
              <View
                style={{
                  height: 20,
                  paddingHorizontal: 8,
                  borderRadius: 999,
                  justifyContent: 'center',
                  backgroundColor: withdrawn ? c.card.bg2 : tone.band,
                }}
              >
                <Text style={{ fontFamily: font.bold, fontSize: fs(11), color: withdrawn ? c.card.ink3 : tone.text }}>
                  {tag === 'question' ? t('mobile.stream.tag_question') : t('mobile.stream.tag_ask')}
                </Text>
              </View>
            )}
            <Text style={{ fontFamily: font.medium, fontSize: fs(11.5), color: c.card.ink3 }}>{timeOf(m.at, language)}</Text>
          </View>
        )}
        <Text style={{ fontFamily: font.medium, fontSize: fs(14.5), lineHeight: fs(21.5), color: c.card.ink, marginTop: 1 }}>
          {m.body}
        </Text>

        {!!ask && (
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
            <Text
              style={{
                fontFamily: font.semi,
                fontSize: fs(12),
                color: ask.status === 'open' ? c.card.tones.due.text : ask.status === 'followedUp' ? c.card.green : c.card.ink3,
              }}
            >
              {askLine(ask, now, t, language)}
            </Text>
            {actions.includes('followedUp') && (
              <AskButton label={t('mobile.stream.ask_followed_up')} primary onPress={() => onCloseAsk?.(row, 'followedUp')} />
            )}
            {actions.includes('neverMind') && (
              <AskButton label={t('mobile.stream.ask_never_mind')} onPress={() => onCloseAsk?.(row, 'neverMind')} />
            )}
          </View>
        )}

        {!!thread && onOpenThread && <ThreadChip thread={thread} now={now} onPress={() => onOpenThread(row)} />}
      </View>
    </Pressable>
  );
}

function AskButton({ label, primary, onPress }: { label: string; primary?: boolean; onPress: () => void }) {
  const { c, font, fs } = useV2Theme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 44,
        paddingHorizontal: 16,
        borderRadius: 999,
        justifyContent: 'center',
        backgroundColor: primary ? c.card.inverse : 'transparent',
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Text style={{ fontFamily: font.bold, fontSize: fs(13), color: primary ? c.card.onInverse : c.card.ink2 }}>{label}</Text>
    </Pressable>
  );
}

/** A parent's Thread chip (T1): up to three repliers, "N replies", when last. */
export function ThreadChip({ thread, now, onPress }: { thread: ThreadSummary; now: number; onPress: () => void }) {
  const { c, font, fs } = useV2Theme();
  const { t, language } = useLanguage();
  const count = repliesLabel(thread.count, t);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={count}
      onPress={onPress}
      style={({ pressed }) => ({
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        minHeight: 44,
        marginTop: 4,
        paddingLeft: 6,
        paddingRight: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: c.card.border,
        backgroundColor: c.card.bg,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View style={{ flexDirection: 'row' }}>
        {thread.repliers.map((r, i) => (
          <View key={r.uid} style={{ marginLeft: i === 0 ? 0 : -6 }}>
            <PersonMark name={r.name} id={r.uid} size={20} radius={10} fontSize={8} />
          </View>
        ))}
      </View>
      <Text style={{ fontFamily: font.bold, fontSize: fs(12.5), color: c.card.link }}>{count}</Text>
      <Text style={{ fontFamily: font.medium, fontSize: fs(12), color: c.card.ink3 }}>
        {t('mobile.stream.last_reply').replace('{when}', whenOf(thread.lastReplyAt, now, t, language))}
      </Text>
    </Pressable>
  );
}
