// Mobile v2 — the full-timer home's widget shell. Ported from the design
// project's `FtSech` / `FtWidget` (views/mobile/ft.jsx, the `.ft-sech` / `.ftw`
// CSS block): the label lives OUT on the paper as a section head, and the rows
// sit on a white card under it.
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useV2Theme, V2RoomContext } from '../../theme/v2';

/** Puts its children in the full-timer's room.
 *
 * Every v2 component reads the room from context, so the provider has to sit
 * ABOVE the one calling useV2Theme() — which is why each screen and sheet here
 * is a wrapper around a body component.
 *
 * A bottom sheet needs it TWICE. `BottomSheetModal` hands its children to the
 * app-root `BottomSheetModalProvider`, which renders them at ITS position in the
 * React tree — so a provider outside `<Sheet>` covers the sheet component's own
 * `useV2Theme()` (its inline styles, its `backgroundColor`) but not the shared
 * atoms inside, which would resolve to the trainee's green. A second one wrapped
 * around the sheet's children travels with those elements and catches them. */
export function FtRoom({ children }: { children: React.ReactNode }) {
  return <V2RoomContext.Provider value="ft">{children}</V2RoomContext.Provider>;
}

/** A section head on the room: label · count · a right-hand link. */
export function FtSech({
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
  const { c, font, radius, fs } = useV2Theme();
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
          fontSize: fs(10.5),
          
          
          color: c.room.ink3,
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
            backgroundColor: c.room.chip,
            alignItems: 'center',
          }}
        >
          <Text style={{ fontFamily: font.extra, fontSize: fs(11), color: c.room.ink2 }}>{count}</Text>
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
          <Text style={{ fontFamily: font.bold, fontSize: fs(12.5), color: c.room.ink2 }}>{link}</Text>
        </Pressable>
      )}
    </View>
  );
}

/** A section head, then the widget's own sheet. `deep` is the violet ground the
 * prayer widget carries. */
export function FtWidget({
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
  const { c, radius, shadow, fs } = useV2Theme();
  return (
    <View>
      <FtSech label={label} count={count} link={link} onLink={onLink} />
      <View
        style={{
          backgroundColor: tone === 'deep' ? c.card.tones.pray.band : c.card.bg,
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
export function FtRow({ first, children }: { first: boolean; children: React.ReactNode }) {
  const { c, fs } = useV2Theme();
  return (
    <View
      style={{
        paddingVertical: 14,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: c.card.line,
      }}
    >
      {children}
    </View>
  );
}

/** One of the quiet inline actions under a row. */
export function FtAction({ label, onPress }: { label: string; onPress: () => void }) {
  const { c, font, fs } = useV2Theme();
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
      <Text style={{ fontFamily: font.bold, fontSize: fs(13), color: c.card.link }}>{label}</Text>
    </Pressable>
  );
}

/** "Nothing due today." — a widget with nothing in it still says something. */
export function FtEmpty({ children }: { children: string }) {
  const { c, font, fs } = useV2Theme();
  return (
    <Text
      style={{
        fontFamily: font.semi,
        fontSize: fs(14),
        lineHeight: fs(20),
        color: c.card.ink3,
        paddingVertical: 16,
      }}
    >
      {children}
    </Text>
  );
}
