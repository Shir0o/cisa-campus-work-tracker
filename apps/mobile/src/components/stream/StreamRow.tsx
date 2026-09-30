// One message in a phone stream (ADR 0033, direction A): no bubble — a 36px
// avatar, the name, its kind tag and the time on one line, the body beneath.
// A continuation drops the avatar and the name line. Everyone is left-aligned,
// the viewer included, under their own name (G1–G3). Long-press stands in for
// the web's hover toolbar (G7); an ask carries its state and, while open, the
// buttons this viewer may press (K1–K4).
//
// Source-agnostic: it draws a core `StreamRow` and hands events back, so the
// person screen, a Thread and the phone's chat all use it.
import { useState } from 'react';
import { Image, Pressable, Text, View, type TextStyle } from 'react-native';
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
  // What a source adds to its rows. Each is optional, so a stream that has none
  // of them (the person screen) draws as before.
  /** The sender's profile photo, where they have one; initials otherwise. */
  avatarUrl?: (m: M) => string | null | undefined;
  /** Reports a row's laid-out box — read-on-view needs each post's position. */
  onRowLayout?: (id: string, box: { top: number; height: number }) => void;
  /** A neutral badge beside the name — a Full-timer's post in an announcement. */
  badge?: (m: M) => string | null;
  /** A taken-back message: this label stands where the body was. */
  goneLabel?: (m: M) => string | null;
  /** A system notice, drawn centred and plain. */
  notice?: (m: M) => boolean;
  /** The body, where the source draws it itself (translation, attachments). */
  renderBody?: (row: StreamRowModel<M>, style: TextStyle) => React.ReactNode;
  /** Under the body in place of the Thread chip (an announcement's Got it). */
  renderFooter?: (row: StreamRowModel<M>) => React.ReactNode;
}

export function StreamRowView<M extends StreamMessage>({
  row,
  now,
  readOnly,
  onLongPress,
  onOpenThread,
  onCloseAsk,
  avatarUrl,
  badge,
  goneLabel,
  notice,
  renderBody,
  renderFooter,
  onRowLayout,
}: StreamRowProps<M>) {
  const { c, font, fs } = useV2Theme();
  const { t, language } = useLanguage();
  const { message: m, continuation, tag, ask, thread } = row;
  const actions = readOnly ? [] : row.askActions;
  const withdrawn = ask?.status === 'withdrawn';
  const tone = tag === 'question' ? c.card.tones.ask : c.card.tones.due;
  const gone = goneLabel?.(m) ?? null;
  const badgeText = badge?.(m) ?? null;
  const bodyStyle: TextStyle = { fontFamily: font.medium, fontSize: fs(14.5), lineHeight: fs(21.5), color: c.card.ink, marginTop: 1 };

  if (notice?.(m)) {
    return (
      <Text
        accessibilityRole="text"
        style={{ fontFamily: font.medium, fontSize: fs(12.5), color: c.card.ink3, textAlign: 'center', marginVertical: 8 }}
      >
        {m.body}
      </Text>
    );
  }

  return (
    <Pressable
      onLongPress={onLongPress && !gone ? () => onLongPress(row) : undefined}
      delayLongPress={350}
      onLayout={onRowLayout ? (e) => onRowLayout(m.id, { top: e.nativeEvent.layout.y, height: e.nativeEvent.layout.height }) : undefined}
      accessibilityHint={onLongPress && !gone ? t('mobile.stream.message_actions') : undefined}
      style={({ pressed }) => ({
        flexDirection: 'row',
        gap: GAP,
        paddingVertical: continuation ? 2 : 6,
        paddingHorizontal: 8,
        marginHorizontal: -8,
        borderRadius: 12,
        backgroundColor: pressed && onLongPress && !gone ? c.card.bg2 : 'transparent',
      })}
    >
      <View style={{ width: AVATAR }}>
        {!continuation && <Avatar name={m.fromName} id={m.from} photoURL={avatarUrl?.(m)} />}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        {!continuation && (
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, minHeight: 20 }}>
            <Text style={{ fontFamily: font.bold, fontSize: fs(14), color: c.card.ink }}>{m.fromName}</Text>
            {!!badgeText && (
              <View style={{ height: 20, paddingHorizontal: 8, borderRadius: 999, justifyContent: 'center', backgroundColor: c.card.bg2 }}>
                <Text style={{ fontFamily: font.bold, fontSize: fs(11), color: c.card.ink2 }}>{badgeText}</Text>
              </View>
            )}
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
        {gone ? (
          <Text style={{ ...bodyStyle, fontFamily: font.medium, fontStyle: 'italic', color: c.card.ink3 }}>{gone}</Text>
        ) : renderBody ? (
          renderBody(row, bodyStyle)
        ) : (
          <Text style={bodyStyle}>{m.body}</Text>
        )}

        {!gone && !!ask && (
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

        {gone || !renderFooter
          ? !!thread && onOpenThread && <ThreadChip thread={thread} now={now} onPress={() => onOpenThread(row)} />
          : renderFooter(row)}
      </View>
    </Pressable>
  );
}

/** A person's mark: their photo where they have one, initials otherwise — and
 *  initials again if the photo will not load. */
function Avatar({ name, id, photoURL }: { name: string; id: string; photoURL?: string | null }) {
  const [failed, setFailed] = useState(false);
  if (!photoURL || failed) return <PersonMark name={name} id={id} size={AVATAR} radius={AVATAR / 2} fontSize={12} />;
  return (
    <Image
      accessibilityLabel={`${name} photo`}
      source={{ uri: photoURL }}
      onError={() => setFailed(true)}
      style={{ width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2 }}
    />
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
