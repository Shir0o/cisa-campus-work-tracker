// Mobile v2 — the trainee's home. A full-screen focus queue, not a dashboard:
// one actionable card at a time, "Later" advances, and the queue ENDS.
// See the design project's MOBILE-V2.md; the visual language lives in
// src/theme/v2.ts and the ordering in @cisa/core's buildQueue.
//
// This shell has no tab bar at all (app/(tabs)/_layout.tsx hides it for the
// trainee): the chrome is ☰ · the meta line · the ＋ log button, and everything
// that isn't the queue lives behind the drawer.
import React from 'react';
import { ActivityIndicator, Linking, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from '../ui/SafeArea';
import {
  canAccessRoute,
  firstName,
  getUserInitials,
  isOnCampus,
  personColor,
  queueMeta,
  upNextLine,
  type Contact,
  type QueueCard as QueueCardData,
} from '@cisa/core';
import { useAuth } from '../../lib/AuthProvider';
import { useTraineeLandingData } from '../../lib/useTraineeLandingData';
import { setTodoDone, updateTodo } from '../../lib/data/todos';
import { addThreadMessage, toggleReaction } from '../../lib/data/threads';
import { InboxReads } from '../../lib/data/inboxReads';
import { useV2Theme } from '../../theme/v2';
import { LogSheet } from '../log/LogSheet';
import { Snackbar } from '../ui';
import { QueueCard, type QueueCardApi } from './QueueCard';
import { OnCampusStrip } from './OnCampusStrip';
import { EndOfQueue } from './EndOfQueue';
import { AllTodayList } from './AllTodayList';
import { WeekLookBack } from './WeekLookBack';
import { DrawerButton, QueueDrawer } from './QueueDrawer';
import { ReplySheet } from './ReplySheet';

const tomorrowISO = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString();
};

export function QueueScreen() {
  const { c, font, shadow, fs } = useV2Theme();
  const { uid, user, role } = useAuth();
  const router = useRouter();
  const data = useTraineeLandingData(uid, user?.displayName ?? null);

  const [index, setIndex] = React.useState(0);
  const [showAll, setShowAll] = React.useState(false);
  const [showWeek, setShowWeek] = React.useState(false);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [logFor, setLogFor] = React.useState<Contact | null>(null);
  // The to-do behind a follow-up card, so saving the log closes it too.
  const [logTask, setLogTask] = React.useState<string | null>(null);
  // The card the sheet was opened from, handed back when the sheet closes so
  // the card is looked after once — a "gone quiet" card has no to-do to
  // complete, so logging is the only thing that answers it.
  const [logCard, setLogCard] = React.useState<string | null>(null);
  const [logOpen, setLogOpen] = React.useState(false);
  const [replyTo, setReplyTo] = React.useState<QueueCardData | null>(null);
  const [toast, setToast] = React.useState<string | null>(null);

  const { queue, queueState, queuePrefs } = data;
  // The queue rebuilds continuously (handling a card shortens it), so the
  // pointer is clamped on read rather than corrected in an effect.
  const at = queue.length === 0 ? 0 : Math.min(index, queue.length - 1);
  const current = queue[at];

  const onCampus = isOnCampus(queuePrefs.prefs.onCampus);
  // The design's due card hides this button rather than offering a door that
  // doesn't open (`api.canBoard !== false` in views/mobile/cards.jsx), and a
  // trainee is exactly who can't open it — canAccessRoute('manager', …) closes
  // /coordination, which is why The Board isn't in TRAINEE_DRAWER either.
  const canBoard = canAccessRoute(role, '/coordination');

  // Logging from nowhere in particular: no contact, no to-do, and — the one
  // that bit — no card. Leaving `logCard` behind meant dismissing a card's log
  // sheet and then logging something unrelated marked the stale card handled.
  const openBlankLog = () => {
    setLogFor(null);
    setLogTask(null);
    setLogCard(null);
    setLogOpen(true);
  };

  const api: QueueCardApi = {
    canBoard,
    handle: (id) => {
      queueState.handle(id);
      setIndex(0);
    },
    later: (id) => {
      // The queue this handler closes over is the pre-press one. Deferring a
      // 1-of-1 queue puts the only card back at the front, so it stays on
      // screen — read the length BEFORE the deferral so the toast condition
      // sees the same queue the press was made against.
      const isOnlyCard = queue.length === 1;
      queueState.pushLater(id);
      setIndex(0);
      if (isOnlyCard) setToast('Moved to later.');
    },
    markDone: (taskId) => {
      void setTodoDone(taskId, true);
      queueState.handle('todo:' + taskId);
      setIndex(0);
      setToast('Done. Nice.');
    },
    pushToTomorrow: (taskId) => {
      void updateTodo(taskId, { dueDate: tomorrowISO() });
      queueState.handle('todo:' + taskId);
      setIndex(0);
      setToast('Moved to tomorrow.');
    },
    openBoardDoc: (docId) => {
      // The button is hidden without access, so this only fires if something
      // else routes here — say it plainly rather than pushing a locked screen.
      if (!canBoard) {
        setToast('That page lives with the team.');
        return;
      }
      router.push(docId ? `/coordination/${docId}` : '/coordination');
    },
    openContact: (contactId, tab) =>
      router.push(tab ? `/contact/${contactId}?tab=${tab}` : `/contact/${contactId}`),
    openReply: (card) => setReplyTo(card),
    openLog: (card) => {
      setLogFor(card.contact ?? null);
      setLogTask(card.task?.id ?? null);
      setLogCard(card.id);
      setLogOpen(true);
    },
    react: (card, emoji) => {
      if (!card.msg || !uid) return;
      void toggleReaction(card.msg.contactId, card.msg.id, uid, emoji);
      InboxReads.markRead(uid, 'thread:' + card.msg.id);
      queueState.handle(card.id);
      setIndex(0);
      setToast(`Sent ${emoji}`);
    },
    text: (card) => {
      const phone = card.contact?.phone?.replace(/[^\d+]/g, '');
      if (phone) void Linking.openURL(`sms:${phone}`);
      else setToast(`No number saved for ${firstName(card.contact?.name ?? '')}.`);
    },
  };

  const sendReply = (body: string) => {
    const card = replyTo;
    if (!card?.msg || !uid) return;
    void addThreadMessage(
      card.msg.contactId,
      {
        interactionId: card.msg.interactionId,
        from: uid,
        fromName: user?.displayName ?? 'A trainee',
        kind: 'note',
        body,
      },
      { to: card.msg.from, contactName: card.contact?.name },
    );
    InboxReads.markRead(uid, 'thread:' + card.msg.id);
    queueState.handle(card.id);
    setIndex(0);
    setReplyTo(null);
    setToast('Sent.');
  };

  // `firstName('')` answers "Someone", so the fallback has to go INSIDE it —
  // "That's everything, Someone." is not something to say to anyone.
  const me = firstName(user?.displayName || 'friend');

  // ── loading / error ──────────────────────────────────────────────────────
  if (data.loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.room.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={c.room.ink2} />
      </SafeAreaView>
    );
  }

  if (showAll) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.room.bg }}>
        <AllTodayList
          cards={queue}
          currentId={current?.id}
          held={queue.held}
          handledCount={queueState.handledCount}
          onPick={(i) => {
            setIndex(i);
            setShowAll(false);
          }}
          onBack={() => setShowAll(false)}
        />
      </SafeAreaView>
    );
  }

  if (showWeek) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.room.bg }}>
        <WeekLookBack week={data.week} onBack={() => setShowWeek(false)} />
      </SafeAreaView>
    );
  }

  // The faces on the floor, and the ones they stand for. A card with nobody
  // behind it calls itself by its label, as the design's `nextName` does.
  const waiting = queue.slice(at + 1);
  const upNext = waiting.slice(0, 3);
  const meta = queueMeta(queue.length, queueState.handledCount, at);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.room.bg }}>
      {!!data.error && (
        <Text
          style={{
            fontFamily: font.semi,
            fontSize: fs(12.5),
            color: c.room.ink2,
            paddingHorizontal: 18,
            paddingTop: 8,
          }}
        >
          {data.error}
        </Text>
      )}

      {/* Chrome in the air above the card (the design's `.m2-top`): ☰, then
          what today holds on the left and where you are in it on the right.
          The counter spans the WHOLE day — what's left plus what's already been
          looked after — so working through cards moves it instead of shrinking
          the day. The pips are retired. */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingHorizontal: 18,
          paddingTop: 10,
          paddingBottom: 14,
        }}
      >
        <DrawerButton onPress={() => setDrawerOpen(true)} />
        <Pressable
          onPress={() => setShowAll(true)}
          disabled={queue.length === 0}
          style={{
            flex: 1,
            height: 44,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
          }}
        >
          <Text
            style={{
              fontFamily: font.extra,
              fontSize: fs(10.5),
              letterSpacing: 1.47,
              textTransform: 'uppercase',
              color: c.room.ink2,
              flexShrink: 1,
            }}
            numberOfLines={1}
          >
            {meta.left}
          </Text>
          {!!meta.right && (
            <Text style={{ fontFamily: font.semi, fontSize: fs(11), color: c.room.ink3 }}>{meta.right}</Text>
          )}
        </Pressable>
      </View>

      {current ? (
        <View style={{ flex: 1, paddingHorizontal: 18, minHeight: 0 }}>
          <QueueCard
            key={current.id}
            card={current}
            me={uid ?? ''}
            api={api}
            header={
              onCampus ? (
                <OnCampusStrip
                  window={queuePrefs.prefs.onCampus}
                  onPress={openBlankLog}
                />
              ) : undefined
            }
          />
        </View>
      ) : (
        <EndOfQueue
          firstName={me}
          handledCount={queueState.handledCount}
          dates={data.dates}
          onLookBack={() => setShowWeek(true)}
          onReset={() => {
            queueState.reset();
            setIndex(0);
          }}
        />
      )}

      {/* The floor: who's next, and the one ＋ */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 14,
          paddingHorizontal: 18,
          paddingVertical: 16,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0 }}>
          {upNext.map((card, i) => (
            <View
              key={card.id}
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                alignItems: 'center',
                justifyContent: 'center',
                marginLeft: i === 0 ? 0 : -9,
                borderWidth: 2,
                borderColor: c.room.bg,
                backgroundColor: card.contact
                  ? personColor(card.contact.id)
                  : c.card.tones[card.tone].dot,
              }}
            >
              <Text style={{ fontFamily: font.extra, fontSize: fs(10.5), color: '#fff' }}>
                {card.contact ? getUserInitials(card.contact.name) : '·'}
              </Text>
            </View>
          ))}
          {!!current && (
            <Text
              style={{
                fontFamily: font.medium,
                fontSize: fs(12),
                color: c.room.faint,
                marginLeft: upNext.length > 0 ? 10 : 0,
                flexShrink: 1,
              }}
              numberOfLines={1}
            >
              {upNextLine(waiting.map((k) => (k.contact ? firstName(k.contact.name) : k.label)))}
            </Text>
          )}
        </View>

        <Pressable
          accessibilityLabel="Log a conversation"
          onPress={openBlankLog}
          style={[
            {
              width: 54,
              height: 54,
              borderRadius: 27,
              backgroundColor: c.card.inverse,
              alignItems: 'center',
              justifyContent: 'center',
            },
            shadow.fab,
          ]}
        >
          <Ionicons name="add" size={28} color={c.card.onInverse} />
        </Pressable>
      </View>

      {/* Keyed so the sheet remounts when the person it's about changes — its
          mode/contact are seeded from initialContact at mount. */}
      <LogSheet
        key={logFor?.id ?? 'anyone'}
        visible={logOpen}
        room="queue"
        initialContact={logFor}
        taskId={logTask}
        cardId={logCard}
        onCampus={queuePrefs.prefs.onCampus}
        onSaved={(message, cardId) => {
          setToast(message);
          if (cardId) {
            queueState.handle(cardId);
            setIndex(0);
          }
        }}
        onOpenContact={(id) => router.push(`/contact/${id}`)}
        // logFor is left alone here: clearing it would swap the key mid-close
        // and cut the dismiss animation. Each opener sets it first.
        onClose={() => setLogOpen(false)}
      />
      <ReplySheet
        key={replyTo?.id ?? 'no-reply'}
        message={replyTo?.msg ?? null}
        contactName={replyTo?.contact?.name}
        onClose={() => setReplyTo(null)}
        onSend={sendReply}
      />
      {!!toast && <Snackbar message={toast} onDismiss={() => setToast(null)} />}
      <QueueDrawer visible={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </SafeAreaView>
  );
}
