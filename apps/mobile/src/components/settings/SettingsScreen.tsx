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
import { SafeAreaView } from '../ui/SafeArea';
import {
  hourLabel,
  onCampusNowLine,
  onCampusSummary,
  SEASON_ORDER,
  SEASONS,
  settingsCareLine,
  settingsFoot,
  shellForRole,
} from '@cisa/core';
import { useAuth } from '../../lib/AuthProvider';
import { useLanguage } from '../../lib/LanguageProvider';
import { useActiveSeason } from '../../lib/useActiveSeason';
import { useFullTimerNames } from '../../lib/useFullTimerNames';
import { usePeopleData } from '../../lib/usePeopleData';
import {
  ensureNotificationPermission,
  getNotificationPermissionStatus,
  registerForPushToken,
  sendTestLocalNotification,
} from '../../lib/notifications';
import { sendPushNotification } from '../../lib/push';
import { setPushToken } from '../../lib/data/users';
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
          if (on && !shown.current) {
            shown.current = true;
            const x = Math.max(0, e.nativeEvent.layout.x - 16);
            setTimeout(() => strip.current?.scrollTo({ x, y: 0, animated: false }), 50);
          }
        }}
        style={({ pressed }) => ({
          paddingHorizontal: 16,
          paddingVertical: 10,
          borderRadius: 999,
          borderWidth: 1.5,
          borderColor: on ? c.card.ink : c.card.border,
          backgroundColor: on ? c.card.ink : c.card.react,
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <Text style={{ fontFamily: font.bold, fontSize: fs(13), color: on ? c.card.bg : c.card.ink }}>
          {o.label}
        </Text>
      </Pressable>
    );
  });

  return (
    <View style={{ gap: 10 }}>
      <View>
        <Text style={{ fontFamily: font.bold, fontSize: fs(15.5), color: c.card.ink }}>{label}</Text>
        {sub ? (
          <Text
            style={{ fontFamily: font.medium, fontSize: fs(12.5), lineHeight: fs(17), color: c.card.ink3, marginTop: 3 }}
          >
            {sub}
          </Text>
        ) : null}
      </View>
      {scroll ? (
        <ScrollView
          ref={strip}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingRight: 16 }}
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
  const { c, font, radius, fs } = useV2Theme();
  return (
    <View
      style={{
        gap: 16,
        padding: 16,
        borderRadius: radius.card,
        backgroundColor: c.card.bg,
      }}
    >
      <Text style={{ fontFamily: font.bold, fontSize: fs(17), color: c.card.ink }}>{title}</Text>
      {children}
    </View>
  );
}

function Settings() {
  const router = useRouter();
  const { user, uid, role, logOut } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const { scheme, setScheme } = useTheme();
  const [tint, setTint] = useRoomTint(uid);
  const { prefs, set } = useQueuePrefs(uid);
  const queueState = useQueueState(uid);
  const { c, font, radius, fs } = useV2Theme();
  const season = useActiveSeason();
  const people = usePeopleData(uid);
  const [notifyBusy, setNotifyBusy] = React.useState(false);
  const [testPushBusy, setTestPushBusy] = React.useState(false);
  const [permStatus, setPermStatus] = React.useState<string | null>(null);
  const [toast, setToast] = React.useState<string | null>(null);
  const [resetConfirm, setResetConfirm] = React.useState(false);

  React.useEffect(() => {
    getNotificationPermissionStatus().then((status) => {
      setPermStatus(status);
    });
  }, []);

  const isManager = role === 'admin' || role === 'manager';
  const hasQueue = shellForRole(role) === 'queue';

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const w = prefs.onCampus;

  const toggleDay = (d: number) => {
    const on = w.days.includes(d);
    if (on && w.days.length === 1) {
      setToast(t('mobile.settings.pick_at_least_one_day'));
      return;
    }
    set({ onCampus: { ...w, days: on ? w.days.filter((x: number) => x !== d) : [...w.days, d] } });
  };
  const setPref = (patch: Partial<QueueSettings>) => set(patch);

  const enableNotifications = async () => {
    if (notifyBusy) return;
    setNotifyBusy(true);
    try {
      const granted = await ensureNotificationPermission();
      const status = await getNotificationPermissionStatus();
      setPermStatus(status);
      if (!granted) {
        setToast('Notifications are off. You can still use the app — this only affects phone nudges.');
        return;
      }
      const token = await registerForPushToken();
      if (token && uid) {
        await setPushToken(uid, token);
        setToast('Phone notifications are on.');
      } else {
        setToast('Permission granted, but this build cannot register for push yet.');
      }
    } catch (e) {
      console.error('Failed to enable notifications:', e);
      setToast('Could not turn on notifications right now.');
    } finally {
      setNotifyBusy(false);
    }
  };

  const handleSendTestNotification = async () => {
    if (testPushBusy) return;
    setTestPushBusy(true);
    try {
      const status = await getNotificationPermissionStatus();
      setPermStatus(status);
      if (status === 'denied') {
        setToast('Notifications are blocked in system settings. Please enable them in your device settings.');
        return;
      }
      if (status !== 'granted') {
        const granted = await ensureNotificationPermission();
        const nextStatus = await getNotificationPermissionStatus();
        setPermStatus(nextStatus);
        if (!granted) {
          setToast('Notification permission was not granted.');
          return;
        }
      }

      // Fire local test notification
      const localSent = await sendTestLocalNotification();

      // If user is logged in, also try dispatching push test via backend
      if (uid) {
        const token = await registerForPushToken();
        if (token) {
          await setPushToken(uid, token);
        }
        await sendPushNotification({
          userId: uid,
          title: 'Test Notification',
          body: 'Push delivery verified successfully.',
          data: { type: 'test' },
        });
      }

      if (localSent) {
        setToast('Test notification sent! Check your notification center.');
      } else {
        setToast('Test notification dispatched.');
      }
    } catch (e) {
      console.error('Failed to send test notification:', e);
      setToast('Failed to send test notification.');
    } finally {
      setTestPushBusy(false);
    }
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.room.bg }}>
      <V2Screen title={t('mobile.settings.title')} onBack={back}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 14,
            padding: 16,
            borderRadius: radius.card,
            backgroundColor: c.card.bg,
          }}
        >
          <PersonMark name={user?.displayName || t('mobile.common.you')} id={uid} size={52} radius={17} fontSize={17} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontFamily: font.extra, fontSize: fs(17), letterSpacing: -0.4, color: c.card.ink }}>
              {user?.displayName || t('mobile.common.you')}
            </Text>
            <Text style={{ fontFamily: font.semi, fontSize: fs(13), color: c.card.ink2, marginTop: 2 }}>
              {user?.email || ''}
            </Text>
          </View>
        </View>

        <Text
          style={{
            fontFamily: font.medium,
            fontSize: fs(13.5),
            lineHeight: fs(20),
            color: c.room.ink2,
            marginTop: 12,
            marginHorizontal: 4,
          }}
        >
          {settingsCareLine(people.mine.length, hasQueue ? queueState.handledCount : null)}
        </Text>

        {isManager && (
          <Section title={t('mobile.settings.tagging_signups')}>
            <View style={{ gap: 10 }}>
              <View>
                <Text style={{ fontFamily: font.bold, fontSize: fs(15.5), color: c.card.ink }}>
                  {t('mobile.settings.new_signups_get')}
                </Text>
                <Text
                  style={{
                    fontFamily: font.medium,
                    fontSize: fs(13),
                    lineHeight: fs(18),
                    color: c.card.ink3,
                    marginTop: 3,
                  }}
                >
                  {season.label}
                  {season.clubRush ? ` · ${t('mobile.settings.club_rush')}` : ''}
                </Text>
              </View>

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {SEASON_ORDER.map((id) => {
                  const on = season.activeId === id;
                  return (
                    <Pressable
                      key={id}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                      onPress={() => season.setSeason(id)}
                      style={{
                        minWidth: 64,
                        height: 44,
                        paddingHorizontal: 14,
                        borderRadius: radius.chip,
                        borderWidth: 1.5,
                        borderColor: on ? c.card.ink : c.card.border,
                        backgroundColor: on ? c.card.ink : c.card.react,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: font.bold,
                          fontSize: fs(13.5),
                          color: on ? c.card.bg : c.card.ink2,
                        }}
                      >
                        {SEASONS[id].label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {!season.isAuto && (
                <Pressable
                  onPress={season.resetSeason}
                  style={{ alignSelf: 'flex-start', paddingVertical: 4 }}
                >
                  <Text style={{ fontFamily: font.semi, fontSize: fs(12.5), color: c.card.ink3 }}>
                    {t('mobile.settings.back_to_current_term')}
                  </Text>
                </Pressable>
              )}

              <Pressable
                accessibilityRole="switch"
                accessibilityState={{ checked: season.clubRush }}
                onPress={season.toggleClubRush}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  borderRadius: radius.chip,
                  borderWidth: 1.5,
                  borderColor: c.card.border,
                  backgroundColor: c.card.react,
                  paddingVertical: 12,
                  paddingHorizontal: 14,
                }}
              >
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontFamily: font.bold, fontSize: fs(14), color: c.card.ink }}>
                    {t('mobile.settings.club_rush')}
                  </Text>
                  <Text style={{ fontFamily: font.medium, fontSize: fs(12), color: c.card.ink3 }}>
                    {t('mobile.settings.club_rush_sub')}
                  </Text>
                </View>
                <View
                  style={{
                    width: 44,
                    height: 26,
                    borderRadius: 13,
                    backgroundColor: season.clubRush ? c.card.ink : c.card.border,
                    padding: 3,
                  }}
                >
                  <View
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 10,
                      backgroundColor: season.clubRush ? c.card.bg : c.card.bg,
                      transform: [{ translateX: season.clubRush ? 18 : 0 }],
                    }}
                  />
                </View>
              </Pressable>
            </View>
          </Section>
        )}

        {hasQueue && (
          <Section title={t('mobile.settings.when_on_campus')}>
            <View style={{ gap: 10 }}>
              <View>
                <Text style={{ fontFamily: font.bold, fontSize: fs(15.5), color: c.card.ink }}>{t('mobile.settings.the_days_youre_there')}</Text>
                <Text
                  style={{ fontFamily: font.medium, fontSize: fs(12.5), lineHeight: fs(17), color: c.card.ink3, marginTop: 3 }}
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
                        borderColor: on ? c.card.ink : c.card.border,
                        backgroundColor: on ? c.card.ink : c.card.react,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Text style={{ fontFamily: font.extra, fontSize: fs(14), color: on ? c.card.bg : c.card.ink3 }}>
                        {initial}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={{ fontFamily: font.semi, fontSize: fs(12.5), color: c.card.ink2 }}>{onCampusNowLine(w)}</Text>
            </View>

            <Choice
              scroll
              label={t('mobile.settings.from')}
              options={HOURS.filter((h) => h < w.to).map((h) => ({ value: h, label: hourLabel(h) }))}
              value={w.from}
              onPick={(from) => set({ onCampus: { ...w, from } })}
            />
            <Choice
              scroll
              label={t('mobile.settings.until')}
              options={HOURS.filter((h) => h > w.from).map((h) => ({ value: h, label: hourLabel(h) }))}
              value={w.to}
              onPick={(to) => set({ onCampus: { ...w, to } })}
            />
          </Section>
        )}

        {hasQueue && (
          <Section title={t('mobile.settings.when_to_nudge')}>
            <Choice
              label={t('mobile.settings.someones_gone_quiet_after')}
              sub="How long without a conversation before they turn up in your queue."
              options={[1, 2, 3, 5, 7].map((n) => ({ value: n, label: `${n} ${n === 1 ? 'day' : 'days'}` }))}
              value={prefs.quietDays}
              onPick={(quietDays) => setPref({ quietDays })}
            />
            <Choice
              label={t('mobile.settings.quiet_people_at_a_time')}
              sub="So a long list never lands on you all at once."
              options={[1, 2, 3].map((n) => ({ value: n, label: String(n) }))}
              value={prefs.quietMax}
              onPick={(quietMax) => setPref({ quietMax })}
            />
            <Choice
              label={t('mobile.settings.prayers_to_carry')}
              sub="How many of your people's prayers ride in the queue each day."
              options={[
                { value: 0, label: t('mobile.common.none') },
                { value: 1, label: '1' },
                { value: 3, label: '3' },
                { value: 5, label: '5' },
              ]}
              value={prefs.prayers}
              onPick={(prayers) => setPref({ prayers })}
            />
            <Choice
              label={t('mobile.settings.a_day_holds')}
              sub="Anything past this waits for tomorrow — except a to-do that's actually due. Those are promises."
              options={[
                { value: 5, label: '5' },
                { value: 8, label: '8' },
                { value: 12, label: '12' },
                { value: 0, label: t('mobile.common.all') },
              ]}
              value={prefs.dayCap}
              onPick={(dayCap) => setPref({ dayCap })}
            />
          </Section>
        )}

        <Section title={t('mobile.settings.nudges_on_phone')}>
          <Text style={{ fontFamily: font.medium, fontSize: fs(13.5), lineHeight: fs(19), color: c.card.ink2 }}>
            Turn on notifications to get a nudge when something needs you — a due to-do, a new message, a quiet person.
          </Text>

          {permStatus && (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                padding: 12,
                borderRadius: radius.card,
                backgroundColor: permStatus === 'granted' ? c.card.react : c.card.border,
              }}
            >
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: permStatus === 'granted' ? '#22c55e' : '#f59e0b',
                }}
              />
              <Text style={{ fontFamily: font.medium, fontSize: fs(12.5), color: c.card.ink }}>
                {permStatus === 'granted'
                  ? t('mobile.settings.notifications_enabled')
                  : permStatus === 'denied'
                    ? t('mobile.settings.notifications_disabled')
                    : 'Notification permission not determined'}
              </Text>
            </View>
          )}

          <Pressable
            accessibilityRole="button"
            onPress={enableNotifications}
            disabled={notifyBusy}
            style={({ pressed }) => ({
              minHeight: 48,
              borderRadius: radius.card,
              backgroundColor: c.card.primary,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed || notifyBusy ? 0.7 : 1,
            })}
          >
            <Text style={{ fontFamily: font.bold, fontSize: fs(14), color: c.card.onPrimary }}>
              {notifyBusy ? t('mobile.settings.working') : t('mobile.settings.turn_on_notifications')}
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={handleSendTestNotification}
            disabled={testPushBusy}
            style={({ pressed }) => ({
              minHeight: 48,
              borderRadius: radius.card,
              backgroundColor: c.card.react,
              borderWidth: 1.5,
              borderColor: c.card.border,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed || testPushBusy ? 0.7 : 1,
            })}
          >
            <Text style={{ fontFamily: font.bold, fontSize: fs(14), color: c.card.ink }}>
              {testPushBusy ? t('mobile.settings.sending_test_notification') : t('mobile.settings.send_test_notification')}
            </Text>
          </Pressable>
        </Section>

        <Section title={t('mobile.settings.how_this_works')}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/tutorial')}
            style={({ pressed }) => ({
              minHeight: 48,
              borderRadius: radius.card,
              backgroundColor: c.card.react,
              borderWidth: 1.5,
              borderColor: c.card.border,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text style={{ fontFamily: font.bold, fontSize: fs(14), color: c.card.ink }}>
              {t('mobile.settings.read_how_this_works')}
            </Text>
          </Pressable>
        </Section>

        <Section title={t('mobile.settings.language')}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(['en', 'es'] as const).map((lang) => {
              const active = language === lang;
              return (
                <Pressable
                  key={lang}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  onPress={() => setLanguage(lang)}
                  style={{
                    flex: 1,
                    minHeight: 48,
                    borderRadius: radius.chip,
                    borderWidth: 1.5,
                    borderColor: active ? c.card.ink : c.card.border,
                    backgroundColor: active ? c.card.ink : c.card.react,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ fontFamily: font.bold, fontSize: fs(14), color: active ? c.card.bg : c.card.ink2 }}>
                    {lang === 'en' ? t('mobile.settings.english') : t('mobile.settings.spanish')}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Section>

        <Section title={t('mobile.settings.how_it_looks')}>
          <Choice
            label={t('mobile.settings.daylight_or_dark')}
            sub="Dark is easier at night and on a dim screen — it changes the phone only."
            options={LOOKS.map((l) => ({ value: l.key, label: t(`mobile.settings.${l.key === 'light' ? 'daylight' : l.key === 'dark' ? 'dark' : 'match_my_phone'}`) }))}
            value={scheme}
            onPick={setScheme}
          />
          <Choice
            label={t('mobile.settings.room_tint')}
            sub="Green is the classic trainee room; Navy is the deep night and team paper tone."
            options={TINTS.map((tintOption) => ({ value: tintOption.key, label: t(`mobile.settings.${tintOption.key === 'green' ? 'green_room' : 'navy_room'}`) }))}
            value={tint}
            onPick={setTint}
          />
        </Section>

        <Section title={t('mobile.settings.account_session')}>
          <View style={{ gap: 12 }}>
            <Text style={{ fontFamily: font.medium, fontSize: fs(13.5), color: c.card.ink2 }}>
              {t('mobile.settings.signed_in_as').replace('{name}', user?.email || user?.displayName || t('mobile.common.you'))}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('mobile.common.log_out')}
              onPress={() => logOut()}
              style={({ pressed }) => ({
                minHeight: 48,
                borderRadius: radius.card,
                backgroundColor: c.card.bg,
                borderWidth: 1.5,
                borderColor: '#FCA5A5',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text style={{ fontFamily: font.bold, fontSize: fs(14), color: '#DC2626' }}>
                {t('mobile.common.log_out')}
              </Text>
            </Pressable>
          </View>
        </Section>

        {hasQueue && (
          <Section title={t('mobile.settings.todays_queue')}>
            <View style={{ gap: 12 }}>
              <Text style={{ fontFamily: font.medium, fontSize: fs(14), lineHeight: fs(21), color: c.card.ink2 }}>
                You've dealt with {queueState.handledCount}{' '}
                {queueState.handledCount === 1 ? 'card' : 'cards'} today. Bringing them back starts the day over — it
                doesn't undo anything you did.
              </Text>
              <SecondaryButton
                title={t('mobile.settings.bring_back_todays_queue')}
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
            color: c.room.faint,
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
