// Mobile v2 — the full-timer's home. Direction 05 "Widgets": an at-a-glance
// scroll on warm paper, not the trainee's focus queue. See the design project's
// MOBILE-V2.md ("the FULL-TIMER app") and its Jul 26 revision, item 2.
//
// Powers here are PEOPLE actions only — log, encourage, write back, hand a to-do
// over, pray. Structural work (Board pages, gatherings, kinds) stays on the
// desktop site, which is what the foot line says out loud.
//
// This is the "Today" tab of the design's four-tab full-timer shell
// (Today · People · Messages · More — see app/(tabs)/_layout.tsx); the widget
// links route into the app's own screens.
import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { format } from 'date-fns';
import {
  firstName,
  getGreeting,
  type Contact,
  type FtInboxRow,
  type Task,
} from '@cisa/core';
import { useAuth } from '../../lib/AuthProvider';
import { useFtHomeData } from '../../lib/useFtHomeData';
import { useV2Theme } from '../../theme/v2';
import { QuickCaptureSheet } from '../quickcapture/QuickCaptureSheet';
import { Snackbar } from '../ui';
import { PersonMark } from '../queue/atoms';
import { Room } from '../v2/Widget';
import { FtGlance } from './FtGlance';
import { NeedsYouToday } from './NeedsYouToday';
import { FromTeam } from './FromTeam';
import { GoneQuiet } from './GoneQuiet';
import { PrayersToCarry } from './PrayersToCarry';
import { HomesOpen } from './HomesOpen';
import { WeekAhead } from './WeekAhead';
import { FtNoteSheet, type FtNoteTarget } from './FtNoteSheet';
import { FtTodoSheet } from './FtTodoSheet';

/** The room provider has to sit ABOVE everything that reads useV2Theme() —
 * including the screen itself — so the home is two components, not one. */
export function FtHomeScreen() {
  return (
    <Room room="ft">
      <FtHome />
    </Room>
  );
}

function QuickTile({
  title,
  sub,
  dark,
  onPress,
}: {
  title: string;
  sub: string;
  dark?: boolean;
  onPress: () => void;
}) {
  const { c, font, radius, shadow } = useV2Theme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 92,
        justifyContent: 'flex-end',
        backgroundColor: dark ? c.inverse : c.card,
        borderRadius: radius.tile,
        paddingVertical: 15,
        paddingHorizontal: 15,
        opacity: pressed ? 0.85 : 1,
        ...shadow.soft,
      })}
    >
      <Text
        style={{
          fontFamily: font.extra,
          fontSize: 15.5,
          lineHeight: 21,
          letterSpacing: -0.4,
          color: dark ? c.onInverse : c.cardInk,
        }}
      >
        {title}
      </Text>
      <Text
        style={{
          fontFamily: font.semi,
          fontSize: 12.5,
          color: dark ? c.onInverse : c.cardInk3,
          opacity: dark ? 0.72 : 1,
          marginTop: 3,
        }}
      >
        {sub}
      </Text>
    </Pressable>
  );
}

function FtHome() {
  const { c, font } = useV2Theme();
  const { uid, user } = useAuth();
  const router = useRouter();
  const data = useFtHomeData(uid, user?.displayName ?? null);

  const [logFor, setLogFor] = React.useState<Contact | null>(null);
  const [logOpen, setLogOpen] = React.useState(false);
  const [todoFor, setTodoFor] = React.useState<Contact | null>(null);
  const [todoOpen, setTodoOpen] = React.useState(false);
  const [noteRow, setNoteRow] = React.useState<FtInboxRow | null>(null);
  const [noteOpen, setNoteOpen] = React.useState(false);
  const [toast, setToast] = React.useState<string | null>(null);

  // Same fallback My Day used: an account with no display name is greeted as a
  // friend, not as "Someone".
  const me = firstName(user?.displayName || 'friend');

  // Every sheet below is keyed by the person (or row) it is about, so changing
  // that REMOUNTS it and its draft starts clean. But `Sheet` only presents when
  // `visible` goes false → true: set both in one go and the sheet mounts with
  // `visible` already true, the transition never happens, and it silently never
  // opens. So flip `visible` a frame later, once the remount has landed.
  const openLog = (contact: Contact | null) => {
    setLogFor(contact);
    setLogOpen(true);
  };
  const openTodo = (contact: Contact | null) => {
    setTodoFor(contact);
    setTodoOpen(true);
  };
  const openNote = (row: FtInboxRow) => {
    setNoteRow(row);
    setNoteOpen(true);
  };
  const openContact = (contactId: string, tab?: 'thread' | 'prayer') =>
    router.push(tab ? `/contact/${contactId}?tab=${tab}` : `/contact/${contactId}`);

  const noteTarget: FtNoteTarget | null = noteRow
    ? {
        kind: noteRow.replyKind,
        who: noteRow.who,
        contactName: data.contacts.find((x) => x.id === noteRow.item.contactId)?.name ?? '',
      }
    : null;

  if (data.loading) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.room, justifyContent: 'center' }}>
        <ActivityIndicator color={c.roomInk2} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.room }}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 18,
          paddingTop: 10,
          paddingBottom: 40,
          gap: 22,
        }}
        showsVerticalScrollIndicator={false}
      >
        {!!data.error && (
          <Text
            style={{
              fontFamily: font.semi,
              fontSize: 13,
              color: c.tones.follow.text,
            }}
          >
            {data.error}
          </Text>
        )}

        {/* ── who you are, and what today holds ── */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontFamily: font.bold,
                fontSize: 10.5,
                letterSpacing: 1.26,
                textTransform: 'uppercase',
                color: c.roomInk3,
              }}
            >
              {format(new Date(), 'EEEE, MMMM d')}
            </Text>
            <Text
              style={{
                fontFamily: font.extra,
                fontSize: 28,
                lineHeight: 32,
                letterSpacing: -0.9,
                color: c.roomInk,
                marginTop: 6,
              }}
            >
              {getGreeting()}, {me}.
            </Text>
            <Text
              style={{
                fontFamily: font.medium,
                fontSize: 14.5,
                lineHeight: 21,
                color: c.roomInk2,
                marginTop: 8,
              }}
            >
              {data.summary}
            </Text>
          </View>
          <PersonMark name={user?.displayName || me} id={uid} size={44} radius={15} fontSize={14} />
        </View>

        {/* ── the two things worth doing in twenty seconds ── */}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <QuickTile title="Log a moment" sub="20 seconds" dark onPress={() => openLog(null)} />
          <QuickTile title="Hand something over" sub="A to-do for the team" onPress={() => openTodo(null)} />
        </View>

        <FtGlance
          carrying={data.carrying}
          next={data.nextGathering}
          onOpenPrayers={() => router.push('/prayer-log')}
          onOpenGatherings={() => router.push('/attendance')}
        />

        <NeedsYouToday
          todos={data.todos}
          onDone={(t: Task) => {
            void data.markTodoDone(t);
            setToast('Done. One less thing.');
          }}
          onOpenBoard={() => router.push('/journey')}
        />

        {data.inboxRows.length > 0 && (
          <FromTeam
            rows={data.inboxRows}
            unread={data.unreadCount}
            onReply={openNote}
            onOpen={(id) => openContact(id, 'thread')}
            onScan={(row) => data.markScanned(row.item.id, row.unread)}
          />
        )}

        <GoneQuiet
          quiet={data.quiet}
          onLog={openLog}
          onSetTodo={openTodo}
          onOpen={(id) => openContact(id)}
          onOpenPeople={() => router.push('/people')}
        />

        <PrayersToCarry
          rows={data.carryRows}
          prayedToday={data.prayedToday}
          onPray={(row) => {
            data.markPrayed(row.id);
            setToast('Prayed. Held before God.');
          }}
          onAnswered={(row) => {
            if (row.requestId) void data.markRequestAnswered(row.requestId);
            setToast('Thank God. They’ll see it’s answered.');
          }}
          onOpenPrayers={() => router.push('/prayer-log')}
        />

        <HomesOpen
          offers={data.homesOpen}
          onMessage={(offer) => {
            void data.messageThem(offer.uid, offer.name).then((roomId) => {
              if (roomId) router.push(`/messages/${roomId}`);
            });
          }}
        />

        <WeekAhead chips={data.weekAhead} />

        <Text
          style={{
            fontFamily: font.medium,
            fontSize: 12.5,
            lineHeight: 18,
            color: c.roomFaint,
            marginTop: 2,
          }}
        >
          The rest of the work — pages, gatherings, planning — is waiting on your desk.
        </Text>
      </ScrollView>

      {/* Keyed so each sheet remounts when the person (or row) it's about
          changes — each seeds its draft at mount. The openers above flip
          `visible` a frame after setting that person, so the remount lands
          first. `logFor` / `todoFor` / `noteRow` are deliberately NOT cleared on
          close: swapping the key mid-close would cut the dismiss animation. */}
      <QuickCaptureSheet
        key={logFor?.id ?? 'anyone'}
        visible={logOpen}
        initialContact={logFor}
        onClose={() => setLogOpen(false)}
      />
      <FtTodoSheet
        key={todoFor?.id ?? 'no-one'}
        visible={todoOpen}
        contact={todoFor}
        me={uid ?? ''}
        assignees={data.assignees}
        onClose={() => setTodoOpen(false)}
        onSave={(input) => {
          void data.handOver({ ...input, contact: todoFor });
          setTodoOpen(false);
          setToast(
            input.assigneeId === uid
              ? 'On your plate.'
              : `${firstName(data.nameByUid[input.assigneeId] ?? '')} will see it.`,
          );
        }}
      />
      <FtNoteSheet
        key={noteRow?.item.id ?? 'no-note'}
        visible={noteOpen}
        target={noteTarget}
        onClose={() => setNoteOpen(false)}
        onSend={(body) => {
          if (noteRow) data.postNote(noteRow.item, noteRow.replyKind, body);
          const who = noteRow ? firstName(noteRow.who) : 'They';
          setNoteOpen(false);
          setToast(`Sent — ${who} will see it.`);
        }}
      />
      {!!toast && <Snackbar message={toast} onDismiss={() => setToast(null)} />}
    </SafeAreaView>
  );
}
