// Mobile v2 — "Your queue". The trainee's own settings for the focus queue,
// ported from the design project's `M2Settings` (views/mobile/screens2.jsx).
// Same room, same type: this is a v2 screen, not a Material one.
//
// Two deliberate departures from the prototype's M2Settings:
//   • "How it looks" is not here. The app-wide AppearancePicker on /settings
//     already owns light/dark for every role; a second control over the same
//     state is a bug waiting to happen.
//   • Who you are / who cares for you stays on /settings too, where it is real.
// What IS here is everything the queue itself reads — and nothing else.
import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { hourLabel, onCampusSummary, pickLandingForRole } from '@cisa/core';
import { useAuth } from '../src/lib/AuthProvider';
import { useQueuePrefs, type QueueSettings } from '../src/lib/queuePrefs';
import { useQueueState } from '../src/lib/queueState';
import { useV2Theme } from '../src/theme/v2';
import { Kicker, SecondaryButton } from '../src/components/queue/atoms';
import { Snackbar } from '../src/components/ui';

const DAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
/** The hours a campus day plausibly runs between. */
const HOURS = Array.from({ length: 16 }, (_, i) => i + 7); // 7am … 10pm

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
  const { c, font, radius } = useV2Theme();
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
        <Text style={{ fontFamily: font.bold, fontSize: 13.5, color: on ? c.card : c.cardInk2 }}>{o.label}</Text>
      </Pressable>
    );
  });

  return (
    <View style={{ gap: 10 }}>
      <View>
        <Text style={{ fontFamily: font.bold, fontSize: 15.5, color: c.cardInk }}>{label}</Text>
        {!!sub && (
          <Text style={{ fontFamily: font.medium, fontSize: 12.5, lineHeight: 17, color: c.cardInk3, marginTop: 3 }}>
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
  const { c, radius } = useV2Theme();
  return (
    <View style={{ gap: 10 }}>
      <Kicker onRoom style={{ marginHorizontal: 4 }}>
        {title}
      </Kicker>
      <View style={{ backgroundColor: c.card, borderRadius: radius.card, padding: 20, gap: 22 }}>{children}</View>
    </View>
  );
}

export default function QueueSettingsScreen() {
  const { c, font } = useV2Theme();
  const router = useRouter();
  const { uid, role } = useAuth();
  const { prefs, set } = useQueuePrefs(uid);
  const queueState = useQueueState(uid);
  const [toast, setToast] = React.useState<string | null>(null);

  // The queue is the trainee's home; nobody else has one to tune.
  if (pickLandingForRole(role) !== 'trainee') {
    return <Redirect href="/" />;
  }

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
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10 }}>
        <Pressable
          onPress={() => router.back()}
          style={{
            height: 44,
            paddingHorizontal: 15,
            borderRadius: 15,
            backgroundColor: c.roomChip,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontFamily: font.bold, fontSize: 13, color: c.roomInk2 }}>← Back</Text>
        </Pressable>
        <Text style={{ fontFamily: font.extra, fontSize: 18, letterSpacing: -0.45, color: c.roomInk }}>Your queue</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 36, gap: 20 }}
        showsVerticalScrollIndicator={false}
      >
        <Text
          style={{ fontFamily: font.medium, fontSize: 14, lineHeight: 21, color: c.roomInk2, marginHorizontal: 4 }}
        >
          How today gets built. Change any of it — the queue rebuilds as you go.
        </Text>

        <Section title="When you're on campus">
          <View style={{ gap: 10 }}>
            <View>
              <Text style={{ fontFamily: font.bold, fontSize: 15.5, color: c.cardInk }}>The days you're there</Text>
              <Text style={{ fontFamily: font.medium, fontSize: 12.5, lineHeight: 17, color: c.cardInk3, marginTop: 3 }}>
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
                    <Text style={{ fontFamily: font.extra, fontSize: 14, color: on ? c.card : c.cardInk3 }}>
                      {initial}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
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

        <Section title="Today">
          <View style={{ gap: 12 }}>
            <Text style={{ fontFamily: font.medium, fontSize: 14, lineHeight: 21, color: c.cardInk2 }}>
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

        <Text
          style={{
            fontFamily: font.medium,
            fontSize: 12.5,
            lineHeight: 19,
            color: c.roomFaint,
            marginHorizontal: 4,
            marginTop: 4,
          }}
        >
          These live on this phone. The roster, the stages and everything admin stay on the desktop site.
        </Text>
      </ScrollView>

      {!!toast && <Snackbar message={toast} onDismiss={() => setToast(null)} />}
    </SafeAreaView>
  );
}
