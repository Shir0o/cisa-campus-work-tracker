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
  const { c, font, radius, fs } = useV2Theme();
  const t = c.card.tones[tone];
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
          fontSize: fs(10.5),
          lineHeight: fs(14),
          
          color: t.text,
          
        }}
      >
        {label}
      </Text>
      {!!ago && (
        <Text
          style={{
            fontFamily: font.semi,
            fontSize: fs(11),
            lineHeight: fs(14),
            
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
  const { font, fs } = useV2Theme();
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
      {/* `size` and `fontSize` arrive as DRAWN units, so the type scale is
          applied here, once — never again at the call sites. The mark keeps its
          drawn diameter: the design's scale moves type, not geometry. */}
      <Text style={{ fontFamily: font.extra, fontSize: fs(fontSize ?? size * 0.31), color: '#1A212B' }}>
        {getUserInitials(name)}
      </Text>
    </View>
  );
}

// ── the card's subject: mark over a big name, then who they are ────────────
// The person's name is ALWAYS the card title. Never a rival headline.
export function WhoBlock({ name, sub, id }: { name: string; sub?: string; id?: string | null }) {
  const { c, font, fs } = useV2Theme();
  return (
    <View style={{ marginTop: 22, gap: 16, alignItems: 'flex-start' }}>
      <PersonMark name={name} id={id} />
      <View>
        <Text style={{ fontFamily: font.extra, fontSize: fs(31), lineHeight: fs(33), letterSpacing: -1, color: c.card.ink }}>
          {name}
        </Text>
        {!!sub && (
          <Text style={{ fontFamily: font.semi, fontSize: fs(13), lineHeight: fs(18), color: c.card.ink3, marginTop: 8 }}>
            {sub}
          </Text>
        )}
      </View>
    </View>
  );
}

// ── "What you wrote down" — a quiet inset note ─────────────────────────────
export function NoteBlock({ label, children }: { label: string; children: string }) {
  const { c, font, radius, fs } = useV2Theme();
  return (
    <View
      style={{
        marginTop: 18,
        backgroundColor: c.card.note,
        borderRadius: radius.note,
        paddingVertical: 14,
        paddingHorizontal: 16,
      }}
    >
      <Text
        style={{
          fontFamily: font.bold,
          fontSize: fs(10.5),
          
          color: c.card.noteLabel,
          
          marginBottom: 7,
        }}
      >
        {label}
      </Text>
      <Text style={{ fontFamily: font.semi, fontSize: fs(14), lineHeight: fs(20), color: c.card.noteInk }}>{children}</Text>
    </View>
  );
}

// ── card prose ─────────────────────────────────────────────────────────────

/** The call to action, under the name. */
export function Ask({ children }: { children: React.ReactNode }) {
  const { c, font, fs } = useV2Theme();
  return (
    <Text style={{ fontFamily: font.bold, fontSize: fs(18), lineHeight: fs(25), letterSpacing: -0.22, color: c.card.ask, marginTop: 20 }}>
      {children}
    </Text>
  );
}

/** A big statement of the thing itself (a to-do's text). */
export function Lead({ children }: { children: React.ReactNode }) {
  const { c, font, fs } = useV2Theme();
  return (
    <Text style={{ fontFamily: font.extra, fontSize: fs(27), lineHeight: fs(31), letterSpacing: -0.86, color: c.card.ink, marginTop: 22 }}>
      {children}
    </Text>
  );
}

/** Something someone said — a prayer's burden. */
export function Said({ children }: { children: React.ReactNode }) {
  const { c, font, fs } = useV2Theme();
  return (
    <Text style={{ fontFamily: font.medium, fontSize: fs(20), lineHeight: fs(28), letterSpacing: -0.24, color: c.card.said, marginTop: 18 }}>
      {children}
    </Text>
  );
}

/** Why this matters today — sits below a hairline. */
export function Why({ children }: { children: React.ReactNode }) {
  const { c, font, fs } = useV2Theme();
  return (
    <Text
      style={{
        fontFamily: font.medium,
        fontSize: fs(16),
        lineHeight: fs(25),
        color: c.card.why,
        marginTop: 22,
        paddingTop: 20,
        borderTopWidth: 1,
        borderTopColor: c.card.line,
      }}
    >
      {children}
    </Text>
  );
}

/** A message quoted from a thread. */
export function Quote({ children }: { children: React.ReactNode }) {
  const { c, font, fs } = useV2Theme();
  return (
    <View style={{ marginTop: 20, paddingLeft: 16, borderLeftWidth: 3, borderLeftColor: c.card.quoteLine }}>
      <Text style={{ fontFamily: font.medium, fontSize: fs(18), lineHeight: fs(26), color: c.card.said }}>{children}</Text>
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
  const { c, font, radius, fs } = useV2Theme();
  const bg = { primary: c.card.primary, warm: c.card.warm, deep: c.card.deep, green: c.card.green }[tone];
  const fg = { primary: c.card.onPrimary, warm: c.card.onWarm, deep: c.card.onDeep, green: c.card.onGreen }[tone];
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
      <Text style={{ fontFamily: font.bold, fontSize: fs(16.5), color: fg }}>{title}</Text>
    </Pressable>
  );
}

export function SecondaryButton({ title, onPress }: { title: string; onPress: () => void }) {
  const { c, font, radius, fs } = useV2Theme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        height: 52,
        borderRadius: radius.button,
        borderWidth: 1.5,
        borderColor: c.card.border,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Text style={{ fontFamily: font.bold, fontSize: fs(15), color: c.card.ink2 }}>{title}</Text>
    </Pressable>
  );
}

/** The one ghost affordance at the foot of every card. */
export function LaterButton({ label = 'Later', onPress }: { label?: string; onPress: () => void }) {
  const { c, font, fs } = useV2Theme();
  return (
    <Pressable
      onPress={onPress}
      style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingVertical: 14 }}
    >
      <Text style={{ fontFamily: font.bold, fontSize: fs(13.5), color: c.card.ink3 }}>{label}  →</Text>
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
  const { c, font, radius, fs } = useV2Theme();
  return (
    <Pressable
      onPress={onPress}
      style={{
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 9,
        marginTop: 16,
        backgroundColor: c.card.bg2,
        borderRadius: radius.chip,
        paddingLeft: 8,
        paddingRight: 14,
        paddingVertical: 7,
        minHeight: 44,
      }}
    >
      <PersonMark name={name} id={id} size={26} radius={9} fontSize={10} />
      <Text style={{ fontFamily: font.bold, fontSize: fs(13), color: c.card.ink2 }}>{name}</Text>
      {!!detail && <Text style={{ fontFamily: font.semi, fontSize: fs(13), color: c.card.ink3 }}>· {detail}</Text>}
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
  const { c, fs } = useV2Theme();
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
              borderColor: on ? c.card.reactOnBorder : c.card.border,
              backgroundColor: on ? c.card.reactOnBg : c.card.react,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontSize: fs(18) }}>{e}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ── a section label, on the room or on the card ────────────────────────────
export function Kicker({ children, onRoom, style }: { children: string; onRoom?: boolean; style?: StyleProp<ViewStyle> }) {
  const { c, font, fs } = useV2Theme();
  return (
    <View style={style}>
      <Text
        style={{
          fontFamily: font.bold,
          fontSize: fs(10.5),
          
          
          color: onRoom ? c.room.ink3 : c.card.ink3,
        }}
      >
        {children}
      </Text>
    </View>
  );
}
