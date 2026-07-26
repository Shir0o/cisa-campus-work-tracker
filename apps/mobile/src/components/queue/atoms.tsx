// Mobile v2 — the small pieces every focus card is built from. Ported from the
// design project's views/mobile/cards.jsx + the `.m2-*` block in mobile.css.
//
// These deliberately do NOT reuse components/ui: v2 has its own type, palette
// and geometry (see src/theme/v2.ts). Every target here is ≥44px.
import React from 'react';
import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { getUserInitials, personColor } from '@cisa/core';
import { useV2Theme, type V2ToneKey } from '../../theme/v2';

// ── the tone pill ("YOU SAID YOU'D FOLLOW UP · due tomorrow") ───────────────
// Wraps rather than overflows: the longest label is 312px against a 292px inner
// width at 360, so a single non-wrapping row would clip.
export function ToneBadge({ tone, label, ago }: { tone: V2ToneKey; label: string; ago?: string }) {
  const { c, font, radius } = useV2Theme();
  const t = c.tones[tone];
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        maxWidth: '100%',
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 8,
        rowGap: 4,
        paddingVertical: 9,
        paddingHorizontal: 14,
        borderRadius: radius.badge,
        backgroundColor: t.band,
      }}
    >
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: t.dot }} />
      <Text
        style={{
          fontFamily: font.extra,
          fontSize: 10.5,
          lineHeight: 14,
          letterSpacing: 1.26,
          color: t.text,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </Text>
      {!!ago && (
        <Text
          style={{
            fontFamily: font.semi,
            fontSize: 11,
            lineHeight: 14,
            letterSpacing: 0.22,
            color: t.text,
            opacity: 0.78,
          }}
        >
          {ago}
        </Text>
      )}
    </View>
  );
}

// ── a person's round mark, in their own stable colour ──────────────────────
export function PersonMark({
  name,
  id,
  size = 62,
  radius: r,
  fontSize,
}: {
  name: string;
  id?: string | null;
  size?: number;
  radius?: number;
  fontSize?: number;
}) {
  const { font } = useV2Theme();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: r ?? size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: personColor(id || name),
      }}
    >
      <Text style={{ fontFamily: font.extra, fontSize: fontSize ?? size * 0.31, color: '#fff' }}>
        {getUserInitials(name)}
      </Text>
    </View>
  );
}

// ── the card's subject: mark over a big name, then who they are ────────────
// The person's name is ALWAYS the card title. Never a rival headline.
export function WhoBlock({ name, sub, id }: { name: string; sub?: string; id?: string | null }) {
  const { c, font } = useV2Theme();
  return (
    <View style={{ marginTop: 22, gap: 16, alignItems: 'flex-start' }}>
      <PersonMark name={name} id={id} />
      <View>
        <Text style={{ fontFamily: font.extra, fontSize: 31, lineHeight: 33, letterSpacing: -1, color: c.cardInk }}>
          {name}
        </Text>
        {!!sub && (
          <Text style={{ fontFamily: font.semi, fontSize: 13, lineHeight: 18, color: c.cardInk3, marginTop: 8 }}>
            {sub}
          </Text>
        )}
      </View>
    </View>
  );
}

// ── "What you wrote down" — a quiet inset note ─────────────────────────────
export function NoteBlock({ label, children }: { label: string; children: string }) {
  const { c, font, radius } = useV2Theme();
  return (
    <View
      style={{
        marginTop: 18,
        backgroundColor: c.note,
        borderRadius: radius.note,
        paddingVertical: 14,
        paddingHorizontal: 16,
      }}
    >
      <Text
        style={{
          fontFamily: font.bold,
          fontSize: 10.5,
          letterSpacing: 1.26,
          color: c.noteLabel,
          textTransform: 'uppercase',
          marginBottom: 7,
        }}
      >
        {label}
      </Text>
      <Text style={{ fontFamily: font.semi, fontSize: 14, lineHeight: 20, color: c.noteInk }}>{children}</Text>
    </View>
  );
}

// ── card prose ─────────────────────────────────────────────────────────────

/** The call to action, under the name. */
export function Ask({ children }: { children: React.ReactNode }) {
  const { c, font } = useV2Theme();
  return (
    <Text style={{ fontFamily: font.bold, fontSize: 18, lineHeight: 25, letterSpacing: -0.22, color: c.ask, marginTop: 20 }}>
      {children}
    </Text>
  );
}

/** A big statement of the thing itself (a to-do's text). */
export function Lead({ children }: { children: React.ReactNode }) {
  const { c, font } = useV2Theme();
  return (
    <Text style={{ fontFamily: font.extra, fontSize: 27, lineHeight: 31, letterSpacing: -0.86, color: c.cardInk, marginTop: 22 }}>
      {children}
    </Text>
  );
}

/** Something someone said — a prayer's burden. */
export function Said({ children }: { children: React.ReactNode }) {
  const { c, font } = useV2Theme();
  return (
    <Text style={{ fontFamily: font.medium, fontSize: 20, lineHeight: 28, letterSpacing: -0.24, color: c.said, marginTop: 18 }}>
      {children}
    </Text>
  );
}

/** Why this matters today — sits below a hairline. */
export function Why({ children }: { children: React.ReactNode }) {
  const { c, font } = useV2Theme();
  return (
    <Text
      style={{
        fontFamily: font.medium,
        fontSize: 16,
        lineHeight: 25,
        color: c.why,
        marginTop: 22,
        paddingTop: 20,
        borderTopWidth: 1,
        borderTopColor: c.line,
      }}
    >
      {children}
    </Text>
  );
}

/** A message from your full-timer, quoted. */
export function Quote({ children }: { children: React.ReactNode }) {
  const { c, font } = useV2Theme();
  return (
    <View style={{ marginTop: 20, paddingLeft: 16, borderLeftWidth: 3, borderLeftColor: c.quoteLine }}>
      <Text style={{ fontFamily: font.medium, fontSize: 18, lineHeight: 26, color: c.said }}>{children}</Text>
    </View>
  );
}

// ── buttons ────────────────────────────────────────────────────────────────
export type ButtonTone = 'primary' | 'warm' | 'deep' | 'green';

export function PrimaryButton({
  title,
  onPress,
  tone = 'primary',
}: {
  title: string;
  onPress: () => void;
  tone?: ButtonTone;
}) {
  const { c, font, radius } = useV2Theme();
  const bg = { primary: c.primary, warm: c.warm, deep: c.deep, green: c.green }[tone];
  const fg = { primary: c.onPrimary, warm: c.onWarm, deep: c.onDeep, green: c.onGreen }[tone];
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        height: 56,
        borderRadius: radius.button,
        backgroundColor: bg,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Text style={{ fontFamily: font.bold, fontSize: 16.5, color: fg }}>{title}</Text>
    </Pressable>
  );
}

export function SecondaryButton({ title, onPress }: { title: string; onPress: () => void }) {
  const { c, font, radius } = useV2Theme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        height: 52,
        borderRadius: radius.button,
        borderWidth: 1.5,
        borderColor: c.border,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Text style={{ fontFamily: font.bold, fontSize: 15, color: c.cardInk2 }}>{title}</Text>
    </Pressable>
  );
}

/** The one ghost affordance at the foot of every card. */
export function LaterButton({ label = 'Later', onPress }: { label?: string; onPress: () => void }) {
  const { c, font } = useV2Theme();
  return (
    <Pressable
      onPress={onPress}
      style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingVertical: 14 }}
    >
      <Text style={{ fontFamily: font.bold, fontSize: 13.5, color: c.cardInk3 }}>{label}  →</Text>
    </Pressable>
  );
}

// ── the small "about this person" chip under a message ─────────────────────
export function AboutChip({
  name,
  id,
  detail,
  onPress,
}: {
  name: string;
  id: string;
  detail?: string;
  onPress: () => void;
}) {
  const { c, font, radius } = useV2Theme();
  return (
    <Pressable
      onPress={onPress}
      style={{
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 9,
        marginTop: 16,
        backgroundColor: c.card2,
        borderRadius: radius.chip,
        paddingLeft: 8,
        paddingRight: 14,
        paddingVertical: 7,
        minHeight: 44,
      }}
    >
      <PersonMark name={name} id={id} size={26} radius={9} fontSize={10} />
      <Text style={{ fontFamily: font.bold, fontSize: 13, color: c.cardInk2 }}>{name}</Text>
      {!!detail && <Text style={{ fontFamily: font.semi, fontSize: 13, color: c.cardInk3 }}>· {detail}</Text>}
    </Pressable>
  );
}

// ── the emoji acknowledgement row ──────────────────────────────────────────
export function Reactions({
  options,
  mine,
  onPick,
}: {
  options: readonly string[];
  mine: string[];
  onPick: (emoji: string) => void;
}) {
  const { c } = useV2Theme();
  return (
    <View style={{ flexDirection: 'row', gap: 8, marginTop: 18 }}>
      {options.map((e) => {
        const on = mine.includes(e);
        return (
          <Pressable
            key={e}
            onPress={() => onPick(e)}
            style={{
              width: 46,
              height: 46,
              borderRadius: 14,
              borderWidth: 1.5,
              borderColor: on ? c.reactOnBorder : c.border,
              backgroundColor: on ? c.reactOnBg : c.card2,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontSize: 18 }}>{e}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ── a section label, on the room or on the card ────────────────────────────
export function Kicker({ children, onRoom, style }: { children: string; onRoom?: boolean; style?: StyleProp<ViewStyle> }) {
  const { c, font } = useV2Theme();
  return (
    <View style={style}>
      <Text
        style={{
          fontFamily: font.bold,
          fontSize: 10.5,
          letterSpacing: 1.26,
          textTransform: 'uppercase',
          color: onRoom ? c.roomInk3 : c.cardInk3,
        }}
      >
        {children}
      </Text>
    </View>
  );
}
