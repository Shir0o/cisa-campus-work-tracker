// Mobile v2 — "You". Ported from the design's `MbrYou`: who you are, who to
// reach, how it looks, and one honest line about what the team keeps.
//
// The design calls the roster "who cares for you"; there's no such link in this
// schema (see memberHome.ts's substitution note), so it reads "the team" and
// offers to open a conversation with any of them.
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { firstName, roleLabel, type FullTimerSummary, type MemberRole } from '@cisa/core';
import { useAuth } from '../../lib/AuthProvider';
import { useTheme } from '../../theme/ThemeProvider';
import { useV2Theme } from '../../theme/v2';
import { subscribeFullTimers } from '../../lib/data/users';
import { getOrCreateDirectChat } from '../../lib/data/chat';
import { PersonMark } from '../queue/atoms';
import { Sech } from '../v2/Widget';
import { MemberBack, MemberFoot, MemberHead, MemberRoom, MemberScreen } from './MemberScreen';
import { InviteSheet } from './InviteSheet';

const LOOKS: { key: 'light' | 'dark' | 'system'; label: string }[] = [
  { key: 'light', label: 'Daylight' },
  { key: 'dark', label: 'Dark' },
  { key: 'system', label: 'Match my phone' },
];

/** `showBack` is for the '/settings' deep link, which lands here for a member.
 * As the "You" tab there is nothing to go back to. */
export function MemberYouScreen({ role, showBack }: { role: MemberRole; showBack?: boolean }) {
  return (
    <MemberRoom>
      <MemberYou role={role} showBack={showBack} />
    </MemberRoom>
  );
}

function MemberYou({ role, showBack }: { role: MemberRole; showBack?: boolean }) {
  const { c, font, radius, shadow } = useV2Theme();
  const { scheme, setScheme } = useTheme();
  const { uid, user, role: appRole } = useAuth();
  const router = useRouter();
  const [fullTimers, setFullTimers] = React.useState<FullTimerSummary[]>([]);
  const [inviteOpen, setInviteOpen] = React.useState(false);

  // Quiet on error, as the home's own roster read is — this list only names who
  // you can message, and the rest of the screen stands without it.
  React.useEffect(
    () => subscribeFullTimers(setFullTimers, () => setFullTimers([])),
    [],
  );

  const me = user?.displayName || 'You';

  const openDm = (ft: FullTimerSummary) => {
    if (!uid) return;
    void getOrCreateDirectChat(
      { uid, displayName: me },
      { uid: ft.uid, displayName: ft.name },
    ).then((roomId) => router.push(`/messages/${roomId}`));
  };

  return (
    <>
      <MemberScreen>
        {showBack && <MemberBack />}
        <MemberHead greeting="You" showDate={false} />

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 13,
            backgroundColor: c.card,
            borderRadius: radius.tile,
            padding: 16,
            ...shadow.soft,
          }}
        >
          <PersonMark name={me} id={uid} size={46} radius={15} fontSize={15} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: font.extra, fontSize: 17, color: c.cardInk }}>{me}</Text>
            <Text style={{ fontFamily: font.medium, fontSize: 13, color: c.cardInk3, marginTop: 2 }}>
              {roleLabel(appRole)}
            </Text>
          </View>
        </View>

        <View>
          <Sech label={role === 'student' ? 'Who to reach' : 'Your link to the team'} />
          <View style={{ gap: 10 }}>
            {fullTimers.length === 0 && (
              <Text
                style={{ fontFamily: font.medium, fontSize: 14.5, lineHeight: 21, color: c.roomInk2 }}
              >
                We'll have someone to connect you with here soon.
              </Text>
            )}
            {fullTimers.map((ft) => (
              <View
                key={ft.uid}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  backgroundColor: c.card,
                  borderRadius: radius.tile,
                  padding: 14,
                  ...shadow.soft,
                }}
              >
                <PersonMark name={ft.name} id={ft.uid} size={38} radius={13} fontSize={13} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ fontFamily: font.bold, fontSize: 15, color: c.cardInk }}>
                    {ft.name}
                  </Text>
                  <Text style={{ fontFamily: font.medium, fontSize: 12.5, color: c.cardInk3 }}>
                    Campus team
                  </Text>
                </View>
                <Pressable
                  onPress={() => openDm(ft)}
                  hitSlop={8}
                  style={({ pressed }) => ({
                    minHeight: 44,
                    justifyContent: 'center',
                    opacity: pressed ? 0.55 : 1,
                  })}
                >
                  <Text style={{ fontFamily: font.bold, fontSize: 13, color: c.link }}>
                    Message →
                  </Text>
                </Pressable>
              </View>
            ))}
          </View>
        </View>

        <View>
          <Sech label="How it looks" />
          {/* Reads and writes ThemeProvider's own scheme — the one source of
              truth for light/dark app-wide, just in v2 clothes here. */}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {LOOKS.map((look) => {
              const on = scheme === look.key;
              return (
                <Pressable
                  key={look.key}
                  onPress={() => setScheme(look.key)}
                  style={({ pressed }) => ({
                    flex: 1,
                    minHeight: 48,
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingHorizontal: 8,
                    borderRadius: radius.button,
                    borderWidth: 1.5,
                    borderColor: on ? 'transparent' : c.roomChip,
                    backgroundColor: on ? c.card : 'transparent',
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <Text
                    style={{
                      fontFamily: font.bold,
                      fontSize: 13,
                      textAlign: 'center',
                      color: on ? c.cardInk : c.roomInk2,
                    }}
                  >
                    {look.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {role === 'student' && (
          <View>
            <Sech label="Bring someone in" />
            <Pressable
              onPress={() => setInviteOpen(true)}
              style={({ pressed }) => ({
                backgroundColor: c.card,
                borderRadius: radius.tile,
                padding: 18,
                opacity: pressed ? 0.85 : 1,
                ...shadow.soft,
              })}
            >
              <Text style={{ fontFamily: font.extra, fontSize: 15.5, color: c.cardInk }}>
                Invite a friend
              </Text>
              <Text
                style={{ fontFamily: font.medium, fontSize: 13, color: c.cardInk3, marginTop: 3 }}
              >
                An invitation you can send in a text
              </Text>
            </Pressable>
          </View>
        )}

        <MemberFoot>
          {role === 'student'
            ? `Your details, your gatherings and who you're connected to are kept by the team — ask ${
                fullTimers[0] ? firstName(fullTimers[0].name) : 'them'
              } anytime and they'll change it with you.`
            : 'The team keeps the rest — students, gatherings, everything admin. Ask them anytime.'}
        </MemberFoot>
      </MemberScreen>

      <InviteSheet
        visible={inviteOpen}
        event={null}
        onClose={() => setInviteOpen(false)}
        onShared={() => setInviteOpen(false)}
      />
    </>
  );
}
