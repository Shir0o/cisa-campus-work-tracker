// Mobile v2 — "How this works". A short orientation page for the phone app.
//
// The design's `M2Tutorial` (MOBILE-V2.md): a scrollable page of four real
// sections, not a card tour. It ends with the notification ask so a new user
// can opt into phone nudges right after learning why they matter.
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from '../ui/SafeArea';
import { useAuth } from '../../lib/AuthProvider';
import { ensureNotificationPermission, registerForPushToken } from '../../lib/notifications';
import { setPushToken } from '../../lib/data/users';
import { roomForRole, useV2Theme } from '../../theme/v2';
import { Room, V2Screen } from '../v2/Widget';
import { Snackbar } from '../ui';

const SECTIONS: { title: string; body: string }[] = [
  {
    title: 'Logging takes twenty seconds',
    body: 'Tap Log, say who you saw and one honest line about it. The app writes the date and who it was with; you do not have to build a file.',
  },
  {
    title: 'The on-campus window',
    body: 'When you are on campus, logging gets promoted to the front of the app. Off campus, the queue quiets down and lets the day breathe.',
  },
  {
    title: 'Later does not lose anything',
    body: 'If a card is not for right now, send it to Later. It comes back tomorrow — nothing you set aside is forgotten, and nothing is counted against you.',
  },
  {
    title: 'Whose people you see',
    body: 'You see the people in your care first. Everyone else is still searchable, but the app is shaped around the ones you are actually walking with.',
  },
];

export function TutorialScreen() {
  const { c, font, radius, fs } = useV2Theme();
  const router = useRouter();
  const { role, uid } = useAuth();
  const [toast, setToast] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const enableNotifications = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const granted = await ensureNotificationPermission();
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
      setBusy(false);
    }
  };

  return (
    <Room room={roomForRole(role)}>
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.room.bg }}>
        <V2Screen title="How this works" onBack={back}>
          <Text style={{ fontFamily: font.extra, fontSize: fs(26), lineHeight: fs(30), letterSpacing: -0.8, color: c.room.ink, marginTop: 8 }}>
            A phone that helps you care for people.
          </Text>
          <Text style={{ fontFamily: font.medium, fontSize: fs(14.5), lineHeight: fs(21), color: c.room.ink2, marginTop: 10 }}>
            Four things are worth knowing before the app starts asking things of you.
          </Text>

          <View style={{ gap: 14, marginTop: 22 }}>
            {SECTIONS.map((section, i) => (
              <View
                key={section.title}
                style={{
                  backgroundColor: c.card.bg,
                  borderRadius: radius.row,
                  padding: 18,
                  borderWidth: 1,
                  borderColor: c.card.border,
                  borderStyle: 'dashed',
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View
                    style={{
                      minWidth: 28,
                      height: 28,
                      borderRadius: 10,
                      backgroundColor: c.card.bg2,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ fontFamily: font.extra, fontSize: fs(13), color: c.card.ink3 }}>{i + 1}</Text>
                  </View>
                  <Text style={{ flex: 1, fontFamily: font.bold, fontSize: fs(16), color: c.card.ink }}>
                    {section.title}
                  </Text>
                </View>
                <Text style={{ fontFamily: font.medium, fontSize: fs(13.5), lineHeight: fs(19), color: c.card.ink2, marginTop: 10 }}>
                  {section.body}
                </Text>
              </View>
            ))}
          </View>

          <View
            style={{
              marginTop: 20,
              backgroundColor: c.card.bg,
              borderRadius: radius.row,
              padding: 18,
              gap: 10,
            }}
          >
            <Text style={{ fontFamily: font.bold, fontSize: fs(16), color: c.card.ink }}>
              Nudges on your phone
            </Text>
            <Text style={{ fontFamily: font.medium, fontSize: fs(13.5), lineHeight: fs(19), color: c.card.ink2 }}>
              Turn on notifications to get a nudge when something needs you — a due to-do, a new message, a quiet person.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={enableNotifications}
              disabled={busy}
              style={({ pressed }) => ({
                minHeight: 48,
                borderRadius: radius.card,
                backgroundColor: c.card.primary,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed || busy ? 0.7 : 1,
                marginTop: 2,
              })}
            >
              <Text style={{ fontFamily: font.bold, fontSize: fs(14), color: c.card.onPrimary }}>
                {busy ? 'Working…' : 'Turn on notifications'}
              </Text>
            </Pressable>
            <Text style={{ fontFamily: font.medium, fontSize: fs(12), lineHeight: fs(17), color: c.card.ink3 }}>
              You can also change this later in Settings.
            </Text>
          </View>
        </V2Screen>
      </SafeAreaView>
      {!!toast && <Snackbar message={toast} onDismiss={() => setToast(null)} />}
    </Room>
  );
}
