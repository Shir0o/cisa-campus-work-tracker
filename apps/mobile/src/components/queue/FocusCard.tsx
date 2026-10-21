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
import { Ionicons } from '@expo/vector-icons';
import { useLanguage } from '../../lib/LanguageProvider';
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
  const { c, radius, shadow, font, fs } = useV2Theme();
  const { t } = useLanguage();
  // The body clips rather than scrolls, so a cut-off card has to say so: the
  // body's room against its content's natural height (#1715 review).
  const [room, setRoom] = React.useState(0);
  const [content, setContent] = React.useState(0);
  const cutOff = !!onRead && room > 0 && content > room + 1;

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
          testID="focus-card-body"
          onLayout={(e) => setRoom(e.nativeEvent.layout.height)}
        >
          <View testID="focus-card-content" onLayout={(e) => setContent(e.nativeEvent.layout.height)}>
            <ToneBadge tone={tone} label={label} ago={ago} />
            {children}
          </View>
        </Pressable>
        {cutOff && (
          <Pressable
            onPress={onRead}
            accessibilityRole="button"
            hitSlop={6}
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              minHeight: 44,
              paddingHorizontal: 24,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              backgroundColor: c.card.bg,
              borderTopWidth: 1,
              borderTopColor: c.card.line,
            }}
          >
            <Text style={{ fontFamily: font.bold, fontSize: fs(14), color: c.card.link }}>{t('mobile.queue.read_more')}</Text>
            <Ionicons name="chevron-down" size={16} color={c.card.link} />
          </Pressable>
        )}
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
