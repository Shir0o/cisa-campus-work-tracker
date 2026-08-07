// Mobile v2 — Settings, staff-side. The design's `M2Settings`
// (views/mobile/screens2.jsx): who you are, when you're on campus, when to
// nudge you, how it looks, and one honest line about what stays on the desktop.
//
// This absorbed the separate "Your queue" screen. That split only existed
// because the Material /settings owned appearance and identity; now that this
// screen IS M2Settings, the design's one settings page, there is nothing left
// to split.
//
// Strict fidelity to the design costs the team roster: approving a new signup,
// inviting someone, changing a role and removing access are desktop work now —
// which is exactly what the foot line says.
import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  caredForBy,
  fullTimerOf,
  hourLabel,
  onCampusNowLine,
  onCampusSummary,
  settingsCareLine,
  settingsFoot,
  shellForRole,
} from '@cisa/core';
import { useAuth } from '../../lib/AuthProvider';
import { useFullTimerNames } from '../../lib/useFullTimerNames';
import { usePeopleData } from '../../lib/usePeopleData';
import { useQueuePrefs, type QueueSettings } from '../../lib/queuePrefs';
import { useQueueState } from '../../lib/queueState';
import { useTheme } from '../../theme/ThemeProvider';
import { useRoomTint, type V2RoomTint } from '../../lib/roomTint';
import { roomForRole, useV2Theme } from '../../theme/v2';
import { Kicker, PersonMark, SecondaryButton } from '../queue/atoms';
import { Room, V2Screen } from '../v2/Widget';
import { Snackbar } from '../ui';

const DAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
/** The hours a campus day plausibly runs between. */
const HOURS = Array.from({ length: 16 }, (_, i) => i + 7); // 7am … 10pm

const LOOKS: { key: 'light' | 'dark' | 'system'; label: string }[] = [
  { key: 'light', label: 'Daylight' },
  { key: 'dark', label: 'Dark' },
  { key: 'system', label: 'Match my phone' },
];

const TINTS: { key: V2RoomTint; label: string }[] = [
  { key: 'green', label: 'Green room' },
  { key: 'blue', label: 'Navy room' },
];

export function SettingsScreen() {
  const { role } = useAuth();
  return (
    <Room room={roomForRole(role)}>
      <Settings />
    </Room>
  );
}

// ── the one control this screen is built from ──────────────────────────────
function Choice<T>({
  label,
  sub,
  options,
  value,
  onPick,
  scroll,
}: {
  label: string;
  sub?: string;
  options: { value: T; label: string }[];
  value: T;
  onPick: (v: T) => void;
  /** Hour strips are too long for one row — let them run off the edge. */
  scroll?: boolean;
}) {
  const { c, font, radius, fs } = useV2Theme();
  // An hour strip is longer than the screen, so the chosen hour can start off
  // the right edge — scroll it into view once, the way the design's step picker
  // does (`scrollLeft`, never scrollIntoView).
  const strip = React.useRef<ScrollView>(null);
  const shown = React.useRef(false);

  const chips = options.map((o) => {
    const on = o.value === value;
    return (
      <Pressable
        key={String(o.value)}
        accessibilityRole="radio"
        accessibilityState={{ selected: on }}
        onPress={() => onPick(o.value)}
        onLayout={(e) => {
          if (!on || shown.current || !scroll) return;
          shown.current = true;
          strip.current?.scrollTo({ x: Math.max(0, e.nativeEvent.layout.x - 12), animated: false });
        }}
        style={{
          minWidth: 46,
          height: 44,
          paddingHorizontal: 14,
          borderRadius: radius.chip,
          borderWidth: 1.5,
          borderColor: on ? c.cardInk : c.border,
          backgroundColor: on ? c.cardInk : c.react,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ fontFamily: font.bold, fontSize: fs(13.5), color: on ? c.card : c.cardInk2 }}>{o.label}</Text>
      </Pressable>
    );
  });

  return (
    <View style={{ gap: 10 }}>
      <View>
        <Text style={{ fontFamily: font.bold, fontSize: fs(15.5), color: c.cardInk }}>{label}</Text>
        {!!sub && (
          <Text style={{ fontFamily: font.medium, fontSize: fs(12.5), lineHeight: fs(17), color: c.cardInk3, marginTop: 3 }}>
            {sub}
          </Text>
        )}
      </View>
      {scroll ? (
        <ScrollView
          ref={strip}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingRight: 4 }}
        >
          {chips}
        </ScrollView>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{chips}</View>
      )}
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { c, radius, fs } = useV2Theme();
  return (
    <View style={{ gap: 10, marginTop: 20 }}>
      <Kicker onRoom style={{ marginHorizontal: 4 }}>
        {title}
      </Kicker>
      <View style={{ backgroundColor: c.card, borderRadius: radius.card, padding: 20, gap: 22 }}>{children}</View>
    </View>
  );
}

function Settings() {
  const { c, font, radius, fs } = useV2Theme();
  const { scheme, setScheme } = useTheme();
  const router = useRouter();
  const { user, uid, role } = useAuth();
  const [tint, setTint] = useRoomTint(uid);
  const { prefs, set } = useQueuePrefs(uid);
  const queueState = useQueueState(uid);
  const people = usePeopleData(uid);
  const names = useFullTimerNames();
  const [toast, setToast] = React.useState<string | null>(null);

  // The queue is the trainee's home; a full-timer has no queue to tune, so the
  // three blocks that only feed `buildQueue` don't render for them. Same
  // predicate `roomForRole` uses, so the room and the content can't drift.
  const hasQueue = shellForRole(role) === 'queue';
  const carer = caredForBy(names[fullTimerOf(uid) ?? '']);

  // Settings is a drawer row for the trainee and a More row for the full-timer
  // — never a tab, so there is always somewhere to go back to.
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const w = prefs.onCampus;
  const toggleDay = (d: number) => {
    const on = w.days.includes(d);
    // The last day can't be turned off here: an empty window is normalized back
    // to the default whole, which would silently move the hours too. Turning the
    // window off entirely isn't a thing v2 offers — it's when you're on campus.
    if (on && w.days.length === 1) {
      setToast("Keep at least one day — that's when logging gets promoted.");
      return;
    }
    set({ onCampus: { ...w, days: on ? w.days.filter((x) => x !== d) : [...w.days, d] } });
  };
  const setPref = (patch: Partial<QueueSettings>) => set(patch);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.room }}>
      <V2Screen title="Settings" onBack={back}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 14,
            padding: 16,
            borderRadius: radius.card,
            backgroundColor: c.card,
          }}
        >
          <PersonMark name={user?.displayName || 'You'} id={uid} size={52} radius={17} fontSize={17} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontFamily: font.extra, fontSize: fs(17), letterSpacing: -0.4, color: c.cardInk }}>
              {user?.displayName || 'You'}
            </Text>
            <Text style={{ fontFamily: font.semi, fontSize: fs(13), color: c.cardInk2, marginTop: 2 }}>
              {user?.email || ''}
            </Text>
            {!!carer && (
              <Text style={{ fontFamily: font.medium, fontSize: fs(12.5), color: c.cardInk3, marginTop: 3 }}>
                {carer}
              </Text>
            )}
          </View>
        </View>

        <Text
          style={{
            fontFamily: font.medium,
            fontSize: fs(13.5),
            lineHeight: fs(20),
            color: c.roomInk2,
            marginTop: 12,
            marginHorizontal: 4,
          }}
        >
          {settingsCareLine(people.mine.length, hasQueue ? queueState.handledCount : null)}
        </Text>

        {hasQueue && (
          <Section title="When you're on campus">
            <View style={{ gap: 10 }}>
              <View>
                <Text style={{ fontFamily: font.bold, fontSize: fs(15.5), color: c.cardInk }}>The days you're there</Text>
                <Text
                  style={{ fontFamily: font.medium, fontSize: fs(12.5), lineHeight: fs(17), color: c.cardInk3, marginTop: 3 }}
                >
                  {onCampusSummary(w)} — logging gets promoted while you're in it.
                </Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {DAY_INITIALS.map((initial, d) => {
                  const on = w.days.includes(d);
                  return (
                    <Pressable
                      key={d}
                      accessibilityRole="checkbox"
                      accessibilityLabel={DAY_NAMES[d]}
                      accessibilityState={{ checked: on }}
                      onPress={() => toggleDay(d)}
                      style={{
                        flex: 1,
                        height: 46,
                        borderRadius: 15,
                        borderWidth: 1.5,
                        borderColor: on ? c.cardInk : c.border,
                        backgroundColor: on ? c.cardInk : c.react,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Text style={{ fontFamily: font.extra, fontSize: fs(14), color: on ? c.card : c.cardInk3 }}>
                        {initial}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={{ fontFamily: font.semi, fontSize: fs(12.5), color: c.cardInk2 }}>{onCampusNowLine(w)}</Text>
            </View>

            <Choice
              scroll
              label="From"
              options={HOURS.filter((h) => h < w.to).map((h) => ({ value: h, label: hourLabel(h) }))}
              value={w.from}
              onPick={(from) => set({ onCampus: { ...w, from } })}
            />
            <Choice
              scroll
              label="Until"
              options={HOURS.filter((h) => h > w.from).map((h) => ({ value: h, label: hourLabel(h) }))}
              value={w.to}
              onPick={(to) => set({ onCampus: { ...w, to } })}
            />
          </Section>
        )}

        {hasQueue && (
          <Section title="When to nudge you">
            <Choice
              label="Someone's gone quiet after"
              sub="How long without a conversation before they turn up in your queue."
              options={[1, 2, 3, 5, 7].map((n) => ({ value: n, label: `${n} ${n === 1 ? 'day' : 'days'}` }))}
              value={prefs.quietDays}
              onPick={(quietDays) => setPref({ quietDays })}
            />
            <Choice
              label="Quiet people at a time"
              sub="So a long list never lands on you all at once."
              options={[1, 2, 3].map((n) => ({ value: n, label: String(n) }))}
              value={prefs.quietMax}
              onPick={(quietMax) => setPref({ quietMax })}
            />
            <Choice
              label="Prayers to carry"
              sub="How many of your people's prayers ride in the queue each day."
              options={[
                { value: 0, label: 'None' },
                { value: 1, label: '1' },
                { value: 3, label: '3' },
                { value: 5, label: '5' },
              ]}
              value={prefs.prayers}
              onPick={(prayers) => setPref({ prayers })}
            />
            <Choice
              label="A day holds"
              sub="Anything past this waits for tomorrow — except a to-do that's actually due. Those are promises."
              options={[
                { value: 5, label: '5' },
                { value: 8, label: '8' },
                { value: 12, label: '12' },
                { value: 0, label: 'All' },
              ]}
              value={prefs.dayCap}
              onPick={(dayCap) => setPref({ dayCap })}
            />
          </Section>
        )}

        <Section title="How it looks">
          <Choice
            label="Daylight or dark"
            sub="Dark is easier at night and on a dim screen — it changes the phone only."
            options={LOOKS.map((l) => ({ value: l.key, label: l.label }))}
            value={scheme}
            onPick={setScheme}
          />
          <Choice
            label="Room tint"
            sub="Green is the classic trainee room; Navy is the deep night and team paper tone."
            options={TINTS.map((t) => ({ value: t.key, label: t.label }))}
            value={tint}
            onPick={setTint}
          />
        </Section>

        {hasQueue && (
          <Section title="Today's queue">
            <View style={{ gap: 12 }}>
              <Text style={{ fontFamily: font.medium, fontSize: fs(14), lineHeight: fs(21), color: c.cardInk2 }}>
                You've dealt with {queueState.handledCount}{' '}
                {queueState.handledCount === 1 ? 'card' : 'cards'} today. Bringing them back starts the day over — it
                doesn't undo anything you did.
              </Text>
              <SecondaryButton
                title="Bring back today's queue"
                onPress={() => {
                  queueState.reset();
                  setToast("Today's queue is back.");
                }}
              />
            </View>
          </Section>
        )}

        <Text
          style={{
            fontFamily: font.medium,
            fontSize: fs(12.5),
            lineHeight: fs(19),
            color: c.roomFaint,
            marginHorizontal: 4,
            marginTop: 26,
          }}
        >
          {settingsFoot(role)}
        </Text>
      </V2Screen>

      {!!toast && <Snackbar message={toast} onDismiss={() => setToast(null)} />}
    </SafeAreaView>
  );
}
