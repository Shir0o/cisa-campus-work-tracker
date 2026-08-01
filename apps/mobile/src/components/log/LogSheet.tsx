// Mobile v2 — the log sheet. The design's `M2LogSheet` (views/mobile/m2.jsx),
// and the screen mobile v2 exists for: a conversation written down in about
// twenty seconds, from wherever you are.
//
// Three modes, exactly as the design has them:
//   palette — two tiles, plus the people you probably saw today
//   new     — a name, where you met, one line to remember
//   convo   — who, what it was, what you'll want to remember
//
// It saves, toasts and closes. The Material sheet this replaces had a fourth
// "Saved" step (a follow-up reminder, an inline prayer, "Log another", "Open
// their page"); that shape lives only in the design's PRE-v2 views/quick-capture.jsx,
// which the v2 shell does not mount. See CHANGELOG for what that costs.
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  QUICK_CAPTURE_KINDS,
  contactAddedLine,
  firstName,
  logSavedLine,
  logSheetFootLine,
  newContactFromLog,
  quickCaptureRecents,
  quickCaptureSearchMatches,
  type Contact,
  type OnCampusWindow,
  type QuickCaptureKindId,
} from '@cisa/core';
import { Sheet } from '../ui';
import { useV2Theme, type V2Room } from '../../theme/v2';
import { Kicker, PersonMark, PrimaryButton, SecondaryButton } from '../queue/atoms';
import { Room, V2Input, V2TextArea } from '../v2/Widget';
import { useAuth } from '../../lib/AuthProvider';
import { useActiveSeason } from '../../lib/useActiveSeason';
import { useLogSheetData } from '../../lib/useLogSheetData';
import { addContact } from '../../lib/data/contacts';
import { addInteraction } from '../../lib/data/interactions';
import { setTodoDone } from '../../lib/data/todos';

type Mode = 'palette' | 'new' | 'convo';

/** Everything the sheet forgets when it reopens, in one place so the reset is
 * one assignment rather than eight. */
interface Draft {
  mode: Mode;
  contact: Contact | null;
  query: string;
  kind: QuickCaptureKindId;
  body: string;
  name: string;
  where: string;
  note: string;
}

export interface LogSheetProps {
  visible: boolean;
  onClose: () => void;
  room: V2Room;
  /** Opens straight on the conversation, about this person — the person page's
   * **Log** and the queue's "Log what happened" both already know who. */
  initialContact?: Contact | null;
  /** Skips the palette. People's ＋ New passes `new`, the design's `init.start`. */
  start?: Exclude<Mode, 'palette'>;
  /** The to-do behind a "You said you'd follow up" card. Saving the log keeps
   * the promise, so the to-do is completed with it — the design's `init.taskId`. */
  taskId?: string | null;
  /** The caller's own toast. The design's `onDone(msg)`. */
  onSaved?: (message: string) => void;
  /** The trainee's window, for the palette's foot. Only the queue has one. */
  onCampus?: OnCampusWindow;
}

/** Bottom sheets portal to the app root, outside the screen's provider, so this
 * one carries the room itself (the recipe `ContactPrayerSheet` established). */
export function LogSheet(props: LogSheetProps) {
  return (
    <Room room={props.room}>
      <LogSheetBody {...props} />
    </Room>
  );
}

function LogSheetBody({
  visible,
  onClose,
  room,
  initialContact,
  start,
  taskId,
  onSaved,
  onCampus,
}: LogSheetProps) {
  const { c, font, radius } = useV2Theme();
  const { uid, user } = useAuth();
  const season = useActiveSeason();
  const { contacts, stages, touches } = useLogSheetData(visible);

  const blank = (): Draft => ({
    mode: initialContact ? 'convo' : (start ?? 'palette'),
    contact: initialContact ?? null,
    query: '',
    kind: 'gospel',
    body: '',
    name: '',
    where: '',
    note: '',
  });

  const [draft, setDraft] = useState<Draft>(blank);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  // Reopening starts clean. The queue and the full-timer's home remount this by
  // person (`key`), but the person page and People keep one instance alive.
  //
  // Adjusted during render rather than in an effect (React's own recipe for
  // "reset state when a prop changes") — and only on the way OPEN: resetting on
  // close would blank the sheet's words underneath its dismiss animation.
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setDraft(blank());
      setSaving(false);
    }
  }

  const { mode, contact, query, kind, body, name, where, note } = draft;

  // The design's `mine` / `matches`: your people, most recently touched first,
  // narrowed by name once you start typing.
  const mine = quickCaptureRecents(contacts, touches, uid, 6).map((r) => r.contact);
  const matches = query.trim() ? quickCaptureSearchMatches(contacts, query, 6) : mine;

  const done = (message: string) => {
    onSaved?.(message);
    onClose();
  };

  const saveConvo = async () => {
    if (!contact || !uid || saving) return;
    setSaving(true);
    try {
      await addInteraction(
        contact.id,
        contact.name,
        { content: body.trim(), dateTime: new Date().toISOString(), type: kind },
        { uid, name: user?.displayName ?? '', photoURL: user?.photoURL ?? null },
      );
      // A follow-up you said you'd do is a promise; logging it keeps it.
      if (taskId) await setTodoDone(taskId, true);
      done(logSavedLine(contact.name));
    } finally {
      setSaving(false);
    }
  };

  const saveContact = async () => {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      await addContact(
        newContactFromLog({
          name: trimmed,
          where,
          note,
          stageLabel: stages[0]?.label ?? 'Unassigned',
          tags: season.tags,
        }),
        { uid, name: user?.displayName },
      );
      done(contactAddedLine(trimmed));
    } finally {
      setSaving(false);
    }
  };

  const head = (title: string, sub: string) => (
    <>
      <Text style={{ fontFamily: font.extra, fontSize: 20, letterSpacing: -0.5, color: c.cardInk }}>
        {title}
      </Text>
      <Text style={{ fontFamily: font.semi, fontSize: 13, lineHeight: 18, color: c.cardInk3, marginTop: 7 }}>
        {sub}
      </Text>
    </>
  );

  return (
    <Sheet visible={visible} onClose={onClose} maxHeightRatio={0.85} backgroundColor={c.card}>
      <Room room={room}>
        <View style={{ paddingHorizontal: 18, paddingTop: 4, paddingBottom: 24 }}>
          {mode === 'palette' && (
            <>
              {head('Log as you go', 'Nothing long. You can add the rest tonight.')}

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
                <Tile
                  icon="new"
                  label="Someone new"
                  caption="Name and where you met — that's it"
                  onPress={() => set('mode', 'new')}
                />
                <Tile
                  icon="convo"
                  label="A conversation"
                  caption="Who, and what you'll want to remember"
                  onPress={() => set('mode', 'convo')}
                />
              </View>

              {mine.length > 0 && (
                <View style={{ marginTop: 20, gap: 10 }}>
                  <Kicker>You saw them today</Kicker>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {mine.slice(0, 3).map((person) => (
                      <Pressable
                        key={person.id}
                        onPress={() => setDraft((d) => ({ ...d, contact: person, mode: 'convo' }))}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 8,
                          minHeight: 44,
                          paddingLeft: 7,
                          paddingRight: 14,
                          borderRadius: radius.chip,
                          backgroundColor: c.card2,
                        }}
                      >
                        <PersonMark name={person.name} id={person.id} size={26} radius={13} fontSize={10} />
                        <Text style={{ fontFamily: font.bold, fontSize: 13, color: c.cardInk2 }}>
                          {firstName(person.name)}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              )}

              {!!onCampus && (
                <Text
                  style={{
                    fontFamily: font.semi,
                    fontSize: 12,
                    lineHeight: 17,
                    color: c.cardInk3,
                    marginTop: 20,
                  }}
                >
                  {logSheetFootLine(onCampus)}
                </Text>
              )}
            </>
          )}

          {mode === 'new' && (
            <>
              {head('Someone new', "Twenty seconds. They'll be yours to follow up.")}

              <View style={{ marginTop: 16, gap: 9 }}>
                <Kicker>Their name</Kicker>
                <V2Input
                  value={name}
                  onChangeText={(v) => set('name', v)}
                  placeholder="First and last, if you got it"
                />
              </View>
              <View style={{ marginTop: 14, gap: 9 }}>
                <Kicker>Where you met</Kicker>
                <V2Input
                  value={where}
                  onChangeText={(v) => set('where', v)}
                  placeholder="Org fair, dorm lounge, the Quad…"
                />
              </View>
              <View style={{ marginTop: 14, gap: 9 }}>
                <Kicker>Anything you'll want to remember</Kicker>
                <V2TextArea
                  value={note}
                  onChangeText={(v) => set('note', v)}
                  placeholder="One line is plenty."
                  minHeight={88}
                />
              </View>

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
                <View style={{ flex: 1 }}>
                  <PrimaryButton
                    title={saving ? 'Adding…' : `Add ${name.trim() ? firstName(name) : 'them'}`}
                    tone="warm"
                    onPress={() => void saveContact()}
                  />
                </View>
                <View style={{ width: 110 }}>
                  <SecondaryButton title="Back" onPress={() => (start ? onClose() : set('mode', 'palette'))} />
                </View>
              </View>
            </>
          )}

          {mode === 'convo' && !contact && (
            <>
              {head('A conversation', 'Who did you talk with?')}

              <View style={{ marginTop: 16, gap: 9 }}>
                <Kicker>Who</Kicker>
                <V2Input
                  value={query}
                  onChangeText={(v) => set('query', v)}
                  placeholder="Start typing a name"
                />
              </View>

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
                {matches.map((person) => (
                  <Chip key={person.id} label={person.name} on={false} onPress={() => set('contact', person)} />
                ))}
              </View>
              {matches.length === 0 && (
                <Text style={{ fontFamily: font.semi, fontSize: 13, color: c.cardInk3, marginTop: 14 }}>
                  No one by that name yet.
                </Text>
              )}

              <View style={{ marginTop: 18 }}>
                <SecondaryButton title="Back" onPress={() => (start ? onClose() : set('mode', 'palette'))} />
              </View>
            </>
          )}

          {mode === 'convo' && !!contact && (
            <>
              {head(`You and ${firstName(contact.name)}`, 'What will you want to remember?')}

              <View style={{ marginTop: 16, gap: 10 }}>
                <Kicker>What it was</Kicker>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {QUICK_CAPTURE_KINDS.map((k) => (
                    <Chip key={k.id} label={k.label} on={kind === k.id} onPress={() => set('kind', k.id)} />
                  ))}
                </View>
              </View>

              <View style={{ marginTop: 16, gap: 9 }}>
                <Kicker>What you'll want to remember</Kicker>
                <V2TextArea
                  value={body}
                  onChangeText={(v) => set('body', v)}
                  placeholder="What they said, what you noticed, what's next."
                />
              </View>

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
                <View style={{ flex: 1 }}>
                  <PrimaryButton
                    title={saving ? 'Saving…' : 'Save it'}
                    onPress={() => void saveConvo()}
                  />
                </View>
                <View style={{ width: 110 }}>
                  <SecondaryButton
                    title="Back"
                    onPress={() => (initialContact ? onClose() : set('contact', null))}
                  />
                </View>
              </View>
            </>
          )}
        </View>
      </Room>
    </Sheet>
  );
}

/** One of the palette's two doors. The icons are DRAWN, never typed: the design
 * learned the hard way that a literal `+` or `…` on a tinted block renders
 * near-invisible (MOBILE-V2.md, "prefer shapes over glyphs"). */
function Tile({
  icon,
  label,
  caption,
  onPress,
}: {
  icon: 'new' | 'convo';
  label: string;
  caption: string;
  onPress: () => void;
}) {
  const { c, font, radius } = useV2Theme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        gap: 10,
        padding: 14,
        borderRadius: radius.tile,
        backgroundColor: c.card2,
        opacity: pressed ? 0.75 : 1,
      })}
    >
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: 13,
          backgroundColor: c.inverse,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: icon === 'convo' ? 3 : 0,
        }}
      >
        {icon === 'new' ? (
          <>
            <View style={{ position: 'absolute', width: 15, height: 2.5, borderRadius: 2, backgroundColor: c.onInverse }} />
            <View style={{ position: 'absolute', width: 2.5, height: 15, borderRadius: 2, backgroundColor: c.onInverse }} />
          </>
        ) : (
          [0, 1, 2].map((i) => (
            <View key={i} style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: c.onInverse }} />
          ))
        )}
      </View>
      <Text style={{ fontFamily: font.bold, fontSize: 14.5, color: c.cardInk }}>{label}</Text>
      <Text style={{ fontFamily: font.semi, fontSize: 12, lineHeight: 16, color: c.cardInk3 }}>
        {caption}
      </Text>
    </Pressable>
  );
}

/** The design's `.m2-chip` — a pickable word. Not `V2Seg`, which is a segmented
 * control over a fixed, always-visible set. */
function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const { c, font, radius } = useV2Theme();
  return (
    <Pressable
      onPress={onPress}
      style={{
        minHeight: 40,
        justifyContent: 'center',
        paddingHorizontal: 14,
        borderRadius: radius.chip,
        borderWidth: 1.5,
        borderColor: on ? c.inverse : c.border,
        backgroundColor: on ? c.inverse : 'transparent',
      }}
    >
      <Text style={{ fontFamily: font.bold, fontSize: 13, color: on ? c.onInverse : c.cardInk2 }}>
        {label}
      </Text>
    </Pressable>
  );
}
