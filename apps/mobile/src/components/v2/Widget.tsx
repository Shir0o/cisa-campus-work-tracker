// Mobile v2 — the widget shell shared by the role apps that scroll rather than
// queue. Ported from the design project's `FtSech` / `FtWidget`
// (views/mobile/ft.jsx, the `.ft-sech` / `.ftw` CSS block): the label lives OUT
// on the room as a section head, and the rows sit on a card under it.
//
// It lived in components/ft/ until the member app (student · community) needed
// the same shell; nothing in here is full-timer-specific — every value comes
// from whichever room the provider below puts it in.
import React, { createContext, useContext } from 'react';
import { Pressable, ScrollView, Text, TextInput, View, type TextInputProps } from 'react-native';
import { getUserInitials, personColor } from '@cisa/core';
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

/** Which ground the rows inside a widget are standing on. `.ftw.deep` restates
 * every hairline and every ink it contains, so the pieces below have to know —
 * a context rather than three optional props, because they are nested inside
 * `children` and cannot be passed to. */
const WidgetToneContext = createContext<'plain' | 'deep'>('plain');

/** A section head, then the widget's own sheet. `deep` is the violet ground the
 * prayer widget carries.
 *
 * The sheet is `theme/v2.ts`'s WIDGET layer (`--mb-card`), not the deck's card:
 * on the green room that's cream where a focus card or a pushed person screen
 * beside it is white, and in the full-timer's room it takes the paper ink the
 * deck layer doesn't. Everything that sits INSIDE one reads `c.widget.*` too. */
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
  const { c, radius, fs } = useV2Theme();
  return (
    <View>
      <Sech label={label} count={count} link={link} onLink={onLink} />
      <View
        style={{
          // `.ftw.deep{background:var(--mb-deep)}` — the widget layer's own
          // violet, not the `pray` tone pill's pale band.
          backgroundColor: tone === 'deep' ? c.widget.deep : c.widget.bg,
          borderRadius: radius.tile,
          paddingVertical: 6,
          paddingHorizontal: 16,
          ...c.widget.shadow,
        }}
      >
        <WidgetToneContext.Provider value={tone}>{children}</WidgetToneContext.Provider>
      </View>
    </View>
  );
}

/** The hairline between two rows inside a widget. On the violet ground the
 * design dims it to `rgba(242,238,248,.16)` — `--mb-line` is a paper hairline
 * and reads as a bright rule there. */
export function WidgetRow({ first, children }: { first: boolean; children: React.ReactNode }) {
  const { c } = useV2Theme();
  const tone = useContext(WidgetToneContext);
  return (
    <View
      style={{
        paddingVertical: 14,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: tone === 'deep' ? 'rgba(242,238,248,0.16)' : c.widget.line,
      }}
    >
      {children}
    </View>
  );
}

/** The ink for whatever ground the current widget is on — `--mb-cink` on paper,
 * `.ftw.deep`'s own #f2eef8 on the violet. */
export function useWidgetInk(): { ink: string; ink3: string } {
  const { c } = useV2Theme();
  const tone = useContext(WidgetToneContext);
  return tone === 'deep'
    ? { ink: c.widget.onDeep, ink3: c.widget.onDeep }
    : { ink: c.widget.ink, ink3: c.widget.ink3 };
}

/** One of the quiet inline actions under a row. */
export function WidgetAction({ label, onPress }: { label: string; onPress: () => void }) {
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

/** A full-screen panel in the v2 language — the design's `M2Screen`
 * (views/mobile/screens.jsx): back row · title · either a right-hand action or a
 * quiet note, then a scrolling body. Same shape as `AllTodayList`'s header,
 * factored out once the full-timer's Prayer log needed it too.
 *
 * `onBack` is optional because the same screen can be a tab for one role and a
 * pushed screen for another (People is a tab for the full-timer, a drawer row
 * for the trainee) — pass it only when `isPushedScreen` says so. `action` and
 * `note` share the right-hand slot, as they do in the design. */
export function V2Screen({
  title,
  note,
  action,
  onBack,
  children,
}: {
  title: string;
  note?: string;
  action?: { label: string; onPress: () => void };
  onBack?: () => void;
  children: React.ReactNode;
}) {
  const { c, font, radius, fs } = useV2Theme();
  return (
    <View style={{ flex: 1, backgroundColor: c.room.bg }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingHorizontal: 14,
          paddingVertical: 10,
        }}
      >
        {!!onBack && (
          <Pressable
            onPress={onBack}
            hitSlop={10}
            style={({ pressed }) => ({
              minHeight: 44,
              justifyContent: 'center',
              marginRight: 4,
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Text style={{ fontFamily: font.bold, fontSize: fs(13), color: c.room.ink2 }}>← Back</Text>
          </Pressable>
        )}
        <Text
          style={{ fontFamily: font.extra, fontSize: fs(18), letterSpacing: -0.45, color: c.room.ink, flexShrink: 1 }}
          numberOfLines={1}
        >
          {title}
        </Text>
        {action ? (
          <Pressable
            onPress={action.onPress}
            style={({ pressed }) => ({
              marginLeft: 'auto',
              minHeight: 44,
              justifyContent: 'center',
              paddingHorizontal: 15,
              borderRadius: radius.chip,
              backgroundColor: c.room.chip,
              opacity: pressed ? 0.65 : 1,
            })}
          >
            <Text style={{ fontFamily: font.bold, fontSize: fs(13), color: c.room.ink }}>{action.label}</Text>
          </Pressable>
        ) : note ? (
          <Text
            style={{
              fontFamily: font.semi,
              fontSize: fs(12),
              color: c.room.ink3,
              marginLeft: 'auto',
              flexShrink: 1,
              textAlign: 'right',
            }}
            numberOfLines={2}
          >
            {note}
          </Text>
        ) : null}
      </View>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 28 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    </View>
  );
}

/** A person row with one care action sitting under it, inside the SAME card —
 * the design's `.m2j-row` + `.m2j-mv` (a hairline, then a full-width link).
 * The Journey ("Move a step") and Gatherings ("Send a text") both wear it, so
 * the person row inside goes `flat` and this carries the card. */
export function V2RowCard({
  action,
  onAction,
  children,
}: {
  action?: string;
  onAction?: () => void;
  children: React.ReactNode;
}) {
  const { c, font, radius, fs } = useV2Theme();
  return (
    <View style={{ backgroundColor: c.card.bg, borderRadius: radius.row, marginTop: 9, overflow: 'hidden' }}>
      {children}
      {!!action && !!onAction && (
        <Pressable
          onPress={onAction}
          style={({ pressed }) => ({
            minHeight: 46,
            justifyContent: 'center',
            paddingHorizontal: 16,
            borderTopWidth: 1,
            borderTopColor: c.card.line,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Text style={{ fontFamily: font.bold, fontSize: fs(13), color: c.card.link }}>{action}</Text>
        </Pressable>
      )}
    </View>
  );
}

/** The design's `.m2-input` — one text field.
 *
 * The tint and hairline are the design's own `.m2-input, .m2-ta` rule, shared
 * with `V2TextArea` below. They matter on a SHEET, where the surface behind the
 * field is already `card` and a borderless one disappears into it. */
export function V2Input({
  value,
  onChangeText,
  placeholder,
  keyboardType,
  autoCapitalize,
}: {
  value: string;
  onChangeText: (next: string) => void;
  placeholder: string;
  /** For the log sheet's phone / email fields — the right keyboard on a phone. */
  keyboardType?: TextInputProps['keyboardType'];
  autoCapitalize?: TextInputProps['autoCapitalize'];
}) {
  const { c, font, radius, fs } = useV2Theme();
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={c.card.ink3}
      keyboardType={keyboardType}
      autoCapitalize={autoCapitalize}
      autoCorrect={false}
      style={{
        minHeight: 48,
        paddingHorizontal: 16,
        borderRadius: radius.note,
        backgroundColor: c.card.field,
        borderWidth: 1.5,
        borderColor: c.card.border,
        fontFamily: font.semi,
        fontSize: fs(14.5),
        color: c.card.ink,
      }}
    />
  );
}

/** The design's `.m2-ta` — the taller sibling of `V2Input`, for the words
 * someone actually writes (a prayer's context, a thread message). */
export function V2TextArea({
  value,
  onChangeText,
  placeholder,
  minHeight = 104,
  autoFocus,
}: {
  value: string;
  onChangeText: (next: string) => void;
  placeholder: string;
  minHeight?: number;
  autoFocus?: boolean;
}) {
  const { c, font, radius, fs } = useV2Theme();
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={c.card.ink3}
      multiline
      autoFocus={autoFocus}
      textAlignVertical="top"
      style={{
        minHeight,
        paddingHorizontal: 15,
        paddingVertical: 14,
        borderRadius: radius.note,
        backgroundColor: c.card.field,
        borderWidth: 1.5,
        borderColor: c.card.border,
        fontFamily: font.semi,
        fontSize: fs(15),
        lineHeight: fs(21),
        color: c.card.ink,
      }}
    />
  );
}

/** The design's `.m2c-seg` — the person screen's Story · Prayers · Alongside
 * switch. It rides on the ROOM (between the hero and the list), so the resting
 * pill is the room's chip tint and the chosen one is the room's inverse, the
 * same pair the ☰/＋ chrome uses. Counts are quiet, and hidden at zero. */
export function V2Seg<T extends string>({
  value,
  onChange,
  items,
}: {
  value: T;
  onChange: (next: T) => void;
  items: { id: T; label: string; count?: number }[];
}) {
  const { c, font, fs } = useV2Theme();
  return (
    <View style={{ flexDirection: 'row', gap: 6, marginTop: 16, marginBottom: 12 }}>
      {items.map((item) => {
        const on = item.id === value;
        return (
          <Pressable
            key={item.id}
            onPress={() => onChange(item.id)}
            style={({ pressed }) => ({
              flex: 1,
              minHeight: 44,
              borderRadius: 14,
              backgroundColor: on ? c.card.inverse : c.room.chip,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text style={{ fontFamily: font.bold, fontSize: fs(13.5), color: on ? c.card.onInverse : c.room.ink2 }}>
              {item.label}
            </Text>
            {!!item.count && (
              <Text
                style={{
                  fontFamily: font.bold,
                  fontSize: fs(11),
                  opacity: 0.6,
                  color: on ? c.card.onInverse : c.room.ink2,
                }}
              >
                {item.count}
              </Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

/** The design's `.m2c-empty` — a quiet line where a list would be, on the room
 * rather than inside a widget (which is `WidgetEmpty`'s job). */
export function V2Empty({ children }: { children: string }) {
  const { c, font, fs } = useV2Theme();
  return (
    <Text
      style={{
        fontFamily: font.semi,
        fontSize: fs(14),
        lineHeight: fs(20),
        color: c.room.ink3,
        paddingVertical: 18,
      }}
    >
      {children}
    </Text>
  );
}

/** The hint under a section label — the design's `.m2p-hint`. */
export function V2Hint({ children }: { children: string }) {
  const { c, font, fs } = useV2Theme();
  return (
    <Text style={{ fontFamily: font.medium, fontSize: fs(12.5), lineHeight: fs(18), color: c.room.ink3, marginTop: -4 }}>
      {children}
    </Text>
  );
}

/** One person on a v2 screen — the design's `M2PersonRow`: colour-stable
 * avatar · name · sub-line · an optional note, with whatever the screen wants
 * on the right.
 *
 * The design's own right-hand slot is a stage dot plus a short line
 * (`<u><s/>{right}</u>`); pass `rightText` and `dot` for that, or `right` for
 * anything else (the Prayer log puts a button there). */
export function V2PersonRow({
  name,
  colorSeed,
  sub,
  note,
  right,
  rightText,
  dot,
  flat,
  onPress,
}: {
  name: string;
  /** Stable per-person colour, so the same face is the same colour everywhere. */
  colorSeed: string;
  sub?: React.ReactNode;
  note?: React.ReactNode;
  right?: React.ReactNode;
  rightText?: string;
  /** The stage dot beside `rightText` — resolve it from `stageToneKey`. */
  dot?: string;
  /** Drop the row's own card, for when it sits INSIDE one — the design's
   * `.m2j-row .m2p-row{background:none;box-shadow:none;border-radius:0}`. */
  flat?: boolean;
  onPress?: () => void;
}) {
  const { c, font, radius, fs } = useV2Theme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 13,
        backgroundColor: flat ? 'transparent' : c.card.bg,
        borderRadius: flat ? 0 : radius.row,
        paddingVertical: 14,
        paddingHorizontal: 16,
        minHeight: 64,
        marginTop: flat ? 0 : 9,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: 19,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: personColor(colorSeed),
        }}
      >
        <Text style={{ fontFamily: font.extra, fontSize: fs(12.5), color: '#1A212B' }}>
          {getUserInitials(name)}
        </Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{ fontFamily: font.extra, fontSize: fs(15), letterSpacing: -0.3, color: c.card.ink }}
          numberOfLines={1}
        >
          {name}
        </Text>
        {!!sub && (
          <Text style={{ fontFamily: font.semi, fontSize: fs(12.5), color: c.card.ink3, marginTop: 2 }} numberOfLines={2}>
            {sub}
          </Text>
        )}
        {!!note && (
          <Text style={{ fontFamily: font.medium, fontSize: fs(12.5), color: c.card.ink2, marginTop: 3 }} numberOfLines={2}>
            {note}
          </Text>
        )}
      </View>
      {right}
      {!right && !!rightText && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: 108 }}>
          {!!dot && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot }} />}
          <Text
            style={{ fontFamily: font.semi, fontSize: fs(12), color: c.card.ink3, textAlign: 'right', flexShrink: 1 }}
            numberOfLines={2}
          >
            {rightText}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

/** "Nothing due today." — a widget with nothing in it still says something. */
export function WidgetEmpty({ children }: { children: string }) {
  const { font, fs } = useV2Theme();
  const { ink3 } = useWidgetInk();
  return (
    <Text
      style={{
        fontFamily: font.semi,
        fontSize: fs(14),
        lineHeight: fs(20),
        color: ink3,
        opacity: 0.85,
        paddingVertical: 16,
      }}
    >
      {children}
    </Text>
  );
}
