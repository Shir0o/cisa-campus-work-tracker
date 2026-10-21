// Mobile v2 — the focus card shell. Direction 02 ("One at a Time"): one clean
// white sheet that ALWAYS fills the room between the header and the floor, so
// a short card spans the height instead of floating as a stub and its actions
// rest on the floor. Nothing sits above it: anything variable (the on-campus
// strip, the first-run hint) rides inside, in `header`.
//
// No swipe and no inner scroll (#1715): every card is answered or set aside by
// a visible button, and long content is clamped by the card's own blocks —
// tapping the body opens everything in a full-height sheet instead.
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useV2Theme, type V2ToneKey } from '../../theme/v2';
import { ToneBadge } from './atoms';

export function FocusCard({
  tone,
  label,
  ago,
  children,
  foot,
  header,
  onRead,
  readLabel,
}: {
  tone: V2ToneKey;
  label: string;
  ago?: string;
  children: React.ReactNode;
  foot: React.ReactNode;
  /** The on-campus strip or the first-run hint — inside the card, above the body. */
  header?: React.ReactNode;
  /** Tapping the body opens the full card. */
  onRead?: () => void;
  readLabel?: string;
}) {
  const { c, radius, shadow } = useV2Theme();

  return (
    <View
      style={[
        {
          flex: 1,
          backgroundColor: c.card.bg,
          borderRadius: radius.card,
          borderBottomWidth: 5,
          borderBottomColor: c.card.edge,
        },
        shadow.raised,
      ]}
    >
      <View style={{ flex: 1, minHeight: 0, paddingTop: 24, paddingHorizontal: 24, paddingBottom: 2, overflow: 'hidden' }}>
        {header}
        <Pressable
          onPress={onRead}
          disabled={!onRead}
          accessibilityRole="button"
          accessibilityLabel={readLabel}
          style={{ flex: 1, minHeight: 0 }}
        >
          <ToneBadge tone={tone} label={label} ago={ago} />
          {children}
        </Pressable>
      </View>
      <View style={{ paddingTop: 16, paddingHorizontal: 24, paddingBottom: 18, gap: 10 }}>{foot}</View>
    </View>
  );
}

/** The all-clear / empty variants borrow the card's ink but not its geometry. */
export function CardText({ children }: { children: React.ReactNode }) {
  const { c, font, fs } = useV2Theme();
  return <Text style={{ fontFamily: font.medium, fontSize: fs(15.5), lineHeight: fs(23), color: c.card.ink2 }}>{children}</Text>;
}
