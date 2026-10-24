// Mobile v2 — the small pieces every focus card is built from. Ported from the
// design project's views/mobile/cards.jsx + the `.m2-*` block in mobile.css.
//
// These deliberately do NOT reuse components/ui: v2 has its own type, palette
// and geometry (see src/theme/v2.ts). Every target here is ≥44px.
import React from 'react';
import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getUserInitials, personColor } from '@cisa/core';
import { useV2Theme, type V2ToneKey } from '../../theme/v2';
import { useLanguage } from '../../lib/LanguageProvider';

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
export function NoteBlock({ label, children, lines }: { label: string; children: string; lines?: number }) {
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
      <Text numberOfLines={lines} style={{ fontFamily: font.semi, fontSize: fs(14), lineHeight: fs(20), color: c.card.noteInk }}>
        {children}
      </Text>
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
export function Said({ children, lines }: { children: React.ReactNode; lines?: number }) {
  const { c, font, fs } = useV2Theme();
  return (
    <Text numberOfLines={lines} style={{ fontFamily: font.medium, fontSize: fs(20), lineHeight: fs(28), letterSpacing: -0.24, color: c.card.said, marginTop: 18 }}>
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
export function Quote({ children, lines }: { children: React.ReactNode; lines?: number }) {
  const { c, font, fs } = useV2Theme();
  return (
    <View style={{ marginTop: 20, paddingLeft: 16, borderLeftWidth: 3, borderLeftColor: c.card.quoteLine }}>
      <Text numberOfLines={lines} style={{ fontFamily: font.medium, fontSize: fs(18), lineHeight: fs(26), color: c.card.said }}>{children}</Text>
    </View>
  );
}

// ── buttons ────────────────────────────────────────────────────────────────
export type ButtonTone = 'primary' | 'warm' | 'deep' | 'green';

export function PrimaryButton({
  title,
  onPress,
  tone = 'primary',
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  tone?: ButtonTone;
  disabled?: boolean;
}) {
  const { c, font, radius, fs } = useV2Theme();
  const bg = { primary: c.card.primary, warm: c.card.warm, deep: c.card.deep, green: c.card.green }[tone];
  const fg = { primary: c.card.onPrimary, warm: c.card.onWarm, deep: c.card.onDeep, green: c.card.onGreen }[tone];
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        height: 56,
        borderRadius: radius.button,
        paddingHorizontal: 18,
        backgroundColor: bg,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.5 : pressed ? 0.88 : 1,
        transform: [{ scale: pressed && !disabled ? 0.98 : 1 }],
      })}
    >
      <Text numberOfLines={1} style={{ fontFamily: font.bold, fontSize: fs(16.5), color: fg, flexShrink: 1, textAlign: 'center' }}>{title}</Text>
    </Pressable>
  );
}

export function SecondaryButton({
  title,
  onPress,
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const { c, font, radius, fs } = useV2Theme();
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        height: 52,
        borderRadius: radius.button,
        borderWidth: 1.5,
        borderColor: c.card.border,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.5 : pressed ? 0.8 : 1,
        transform: [{ scale: pressed && !disabled ? 0.98 : 1 }],
      })}
    >
      <Text style={{ fontFamily: font.bold, fontSize: fs(15), color: c.card.ink2 }}>{title}</Text>
    </Pressable>
  );
}

// ── the Today card's foot (#1715): raised, an icon inline with each label ──
// A solid darker bottom edge plus a soft drop, so they read as pressable. The
// other v2 sheets keep the flat Primary/SecondaryButton above.
type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** The one action that answers the card — full width. */
export function CardPrimary({
  title,
  icon,
  onPress,
  tone = 'primary',
}: {
  title: string;
  icon: IconName;
  onPress: () => void;
  tone?: 'primary' | 'warm' | 'deep' | 'inverse';
}) {
  const { c, font, radius, shadow, fs } = useV2Theme();
  const bg = { primary: c.card.primary, warm: c.card.warm, deep: c.card.deep, inverse: c.card.inverse }[tone];
  const fg = { primary: c.card.onPrimary, warm: c.card.onWarm, deep: c.card.onDeep, inverse: c.card.onInverse }[tone];
  const edge = tone === 'warm' ? c.card.warmEdge : tone === 'inverse' ? c.card.inverseEdge : c.card.primaryEdge;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => [
        {
          height: 56,
          borderRadius: radius.button,
          backgroundColor: bg,
          borderBottomWidth: pressed ? 2 : 5,
          borderBottomColor: edge,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 9,
          transform: [{ translateY: pressed ? 3 : 0 }],
        },
        shadow.raisedSmall,
      ]}
    >
      <Ionicons name={icon} size={19} color={fg} />
      <Text style={{ fontFamily: font.bold, fontSize: fs(16.5), color: fg }}>{title}</Text>
    </Pressable>
  );
}

/** One of the two smaller actions in the row under the primary. */
export function CardAction({ title, icon, onPress }: { title: string; icon: IconName; onPress: () => void }) {
  const { c, font, radius, shadow, fs } = useV2Theme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => [
        {
          flex: 1,
          minHeight: 48,
          paddingHorizontal: 8,
          borderRadius: radius.button,
          backgroundColor: c.card.bg,
          borderWidth: 1.5,
          borderColor: c.card.border,
          borderBottomWidth: pressed ? 2 : 4,
          borderBottomColor: c.card.edge,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 7,
          transform: [{ translateY: pressed ? 2 : 0 }],
        },
        shadow.raisedSmall,
      ]}
    >
      <Ionicons name={icon} size={16} color={c.card.ink2} />
      <Text numberOfLines={1} style={{ fontFamily: font.bold, fontSize: fs(14), color: c.card.ink2, flexShrink: 1 }}>
        {title}
      </Text>
    </Pressable>
  );
}

/** "Later today" — sets the card aside; it comes round again after the others. */
export function LaterTodayButton({ onPress }: { onPress: () => void }) {
  const { t } = useLanguage();
  return <CardAction title={t('mobile.queue.later_today')} icon="refresh" onPress={onPress} />;
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
      style={({ pressed }) => ({
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
        opacity: pressed ? 0.82 : 1,
        transform: [{ scale: pressed ? 0.97 : 1 }],
      })}
    >
      <PersonMark name={name} id={id} size={26} radius={9} fontSize={10} />
      <Text style={{ fontFamily: font.bold, fontSize: fs(13), color: c.card.ink2 }}>{name}</Text>
      {!!detail && <Text style={{ fontFamily: font.semi, fontSize: fs(13), color: c.card.ink3 }}>· {detail}</Text>}
    </Pressable>
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
