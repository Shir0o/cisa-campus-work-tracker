// Mobile v2 — the widget shell shared by the role apps that scroll rather than
// queue. Ported from the design project's `FtSech` / `FtWidget`
// (views/mobile/ft.jsx, the `.ft-sech` / `.ftw` CSS block): the label lives OUT
// on the room as a section head, and the rows sit on a card under it.
//
// It lived in components/ft/ until the member app (student · community) needed
// the same shell; nothing in here is full-timer-specific — every value comes
// from whichever room the provider below puts it in.
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useV2Theme, V2RoomContext, type V2Room } from '../../theme/v2';

/** Puts its children in a room.
 *
 * Every v2 component reads the room from context, so the provider has to sit
 * ABOVE the one calling useV2Theme() — which is why each screen and sheet is a
 * wrapper around a body component.
 *
 * A bottom sheet needs it TWICE. `BottomSheetModal` hands its children to the
 * app-root `BottomSheetModalProvider`, which renders them at ITS position in the
 * React tree — so a provider outside `<Sheet>` covers the sheet component's own
 * `useV2Theme()` (its inline styles, its `backgroundColor`) but not the shared
 * atoms inside, which would resolve to the default room. A second one wrapped
 * around the sheet's children travels with those elements and catches them. */
export function Room({ room, children }: { room: V2Room; children: React.ReactNode }) {
  return <V2RoomContext.Provider value={room}>{children}</V2RoomContext.Provider>;
}

/** A section head on the room: label · count · a right-hand link. */
export function Sech({
  label,
  count,
  link,
  onLink,
}: {
  label: string;
  count?: number;
  link?: string | null;
  onLink?: () => void;
}) {
  const { c, font, radius } = useV2Theme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 9,
        minHeight: 34,
        marginBottom: 10,
      }}
    >
      <Text
        style={{
          fontFamily: font.bold,
          fontSize: 10.5,
          letterSpacing: 1.26,
          textTransform: 'uppercase',
          color: c.roomInk3,
        }}
      >
        {label}
      </Text>
      {!!count && count > 0 && (
        <View
          style={{
            minWidth: 20,
            paddingHorizontal: 6,
            paddingVertical: 2,
            borderRadius: radius.chip,
            backgroundColor: c.roomChip,
            alignItems: 'center',
          }}
        >
          <Text style={{ fontFamily: font.extra, fontSize: 11, color: c.roomInk2 }}>{count}</Text>
        </View>
      )}
      {!!link && onLink && (
        <Pressable
          onPress={onLink}
          hitSlop={10}
          style={({ pressed }) => ({
            marginLeft: 'auto',
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Text style={{ fontFamily: font.bold, fontSize: 12.5, color: c.roomInk2 }}>{link}</Text>
        </Pressable>
      )}
    </View>
  );
}

/** A section head, then the widget's own sheet. `deep` is the violet ground the
 * prayer widget carries. */
export function Widget({
  label,
  count,
  tone = 'plain',
  link,
  onLink,
  children,
}: {
  label: string;
  count?: number;
  tone?: 'plain' | 'deep';
  link?: string | null;
  onLink?: () => void;
  children: React.ReactNode;
}) {
  const { c, radius, shadow } = useV2Theme();
  return (
    <View>
      <Sech label={label} count={count} link={link} onLink={onLink} />
      <View
        style={{
          backgroundColor: tone === 'deep' ? c.tones.pray.band : c.card,
          borderRadius: radius.tile,
          paddingVertical: 6,
          paddingHorizontal: 16,
          ...shadow.soft,
        }}
      >
        {children}
      </View>
    </View>
  );
}

/** The hairline between two rows inside a widget. */
export function WidgetRow({ first, children }: { first: boolean; children: React.ReactNode }) {
  const { c } = useV2Theme();
  return (
    <View
      style={{
        paddingVertical: 14,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: c.line,
      }}
    >
      {children}
    </View>
  );
}

/** One of the quiet inline actions under a row. */
export function WidgetAction({ label, onPress }: { label: string; onPress: () => void }) {
  const { c, font } = useV2Theme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => ({
        minHeight: 44,
        justifyContent: 'center',
        opacity: pressed ? 0.55 : 1,
      })}
    >
      <Text style={{ fontFamily: font.bold, fontSize: 13, color: c.link }}>{label}</Text>
    </Pressable>
  );
}

/** "Nothing due today." — a widget with nothing in it still says something. */
export function WidgetEmpty({ children }: { children: string }) {
  const { c, font } = useV2Theme();
  return (
    <Text
      style={{
        fontFamily: font.semi,
        fontSize: 14,
        lineHeight: 20,
        color: c.cardInk3,
        paddingVertical: 16,
      }}
    >
      {children}
    </Text>
  );
}
