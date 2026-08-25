// Mobile v2 — the member's home (student "Today" · community "What's on").
// Ported from the design project's `MbrHome` (views/mobile/member.jsx); see
// MOBILE-V2.md, "the MEMBER app".
//
// A calm single scroll, not a dashboard and not the trainee's queue: members
// browse. No CRM anywhere — no stages, no owners, no contact ids, no metrics,
// nothing about who cares for whom.
//
// As on the queue and the full-timer home, the app's own bottom tab bar stays
// and the design's four-tab member shell is not ported — Prayer, Messages and
// You are reached through that bar instead.
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  memberFoot,
  memberGreeting,
  memberIntro,
  type Event,
  type MemberRole,
} from '@cisa/core';
import { useAuth } from '../../lib/AuthProvider';
import { useMemberHomeData } from '../../lib/useMemberHomeData';
import { useV2Theme } from '../../theme/v2';
import { Snackbar } from '../ui';
import { M2Release } from '../release/M2Release';
import { MemberFoot, MemberHead, MemberRoom, MemberScreen } from './MemberScreen';
import { NextUp } from './NextUp';
import { NoteFromTeam } from './NoteFromTeam';
import { Announcements } from './Announcements';
import { AlsoComingUp } from './AlsoComingUp';
import { OpenYourHome } from './OpenYourHome';
import { InviteSheet } from './InviteSheet';

export function MemberHomeScreen({ role }: { role: MemberRole }) {
  return (
    <MemberRoom>
      <MemberHome role={role} />
    </MemberRoom>
  );
}

function MemberHome({ role }: { role: MemberRole }) {
  const { c, font, radius, fs } = useV2Theme();
  const { uid, user, role: appRole } = useAuth();
  const router = useRouter();
  const data = useMemberHomeData(uid, user?.displayName ?? null);
  const [inviteFor, setInviteFor] = React.useState<Event | null>(null);
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [toast, setToast] = React.useState<string | null>(null);

  const next = data.upcoming.next;

  // Same two-step the full-timer sheets use: `Sheet` only presents on a
  // false→true transition, and the sheet is keyed by the event, so set the
  // event first and flip `visible` after the remount lands.
  const openInvite = (ev: Event | null) => {
    setInviteFor(ev);
    setInviteOpen(true);
  };

  const toggleRsvp = (ev: Event, going: boolean) => {
    void data.toggleRsvp(ev.id, going);
    setToast(going ? "You're in — see you there." : 'No worries. Maybe the next one.');
  };

  return (
    <>
      <MemberScreen loading={data.loading} error={data.error}>
        {/* Same fallback the full-timer home uses: an account with no display
            name is greeted as a friend, not as "Someone". */}
        <MemberHead
          greeting={memberGreeting(role, user?.displayName || 'friend')}
          intro={memberIntro(role)}
        />

        {next ? (
          <NextUp
            event={next}
            role={role}
            going={data.isGoing(next.id)}
            onToggle={() => toggleRsvp(next, !data.isGoing(next.id))}
            onInvite={() => openInvite(next)}
          />
        ) : (
          <View
            style={{
              backgroundColor: c.widget.bg,
              borderRadius: radius.tile,
              padding: 20,
              ...c.widget.shadow,
            }}
          >
            <Text
              style={{ fontFamily: font.medium, fontSize: fs(14.5), lineHeight: fs(21), color: c.widget.ink2 }}
            >
              Nothing on the calendar just yet — check back soon.
            </Text>
          </View>
        )}

        {!!data.note && (
          <NoteFromTeam
            note={data.note}
            onWriteBack={() => router.push(`/messages/${data.note!.roomId}`)}
          />
        )}

        {data.announcements.length > 0 && (
          <Announcements
            rows={data.announcements}
            label={role === 'student' ? 'From the team' : 'Announcements'}
            onOpen={(roomId) => router.push(`/messages/${roomId}`)}
          />
        )}

        {data.upcoming.rest.length > 0 && (
          <AlsoComingUp
            events={data.upcoming.rest}
            isGoing={data.isGoing}
            onToggle={toggleRsvp}
          />
        )}

        {/* A student always has a way to invite someone, even on a week with
            nothing on the calendar — the hero's "Bring a friend" is gone then. */}
        {role === 'student' && (
          <Pressable
            onPress={() => openInvite(next)}
            style={({ pressed }) => ({
              // the design's `.mbr-inv` is the quiet tile, not the card
              backgroundColor: c.widget.tile,
              borderRadius: radius.tile,
              padding: 18,
              opacity: pressed ? 0.85 : 1,
              ...c.widget.shadow,
            })}
          >
            <Text style={{ fontFamily: font.extra, fontSize: fs(15.5), color: c.widget.ink }}>
              Bring someone with you
            </Text>
            <Text
              style={{ fontFamily: font.medium, fontSize: fs(13), color: c.widget.ink3, marginTop: 3 }}
            >
              An invitation you can send in a text
            </Text>
          </Pressable>
        )}

        {role === 'community' && (
          <OpenYourHome
            offer={data.offer}
            onSave={(input) => {
              void data.saveOffer(input);
              setToast("Thank you — the team will be in touch about who'd love a seat.");
            }}
            onWithdraw={() => {
              void data.withdrawOffer();
              setToast('Withdrawn. Offer again whenever there’s room.');
            }}
          />
        )}

        <MemberFoot>{memberFoot(role)}</MemberFoot>
      </MemberScreen>

      <InviteSheet
        key={inviteFor?.id ?? 'anything'}
        visible={inviteOpen}
        event={inviteFor}
        onClose={() => setInviteOpen(false)}
        onShared={() => setToast('Sent. Hope they come.')}
      />
      {!!toast && <Snackbar message={toast} onDismiss={() => setToast(null)} />}
      {/* What changed since you last opened this (#546). Members have no
          on-campus window of their own, so nothing is passed to the gate. */}
      <M2Release role={appRole} />
    </>
  );
}
