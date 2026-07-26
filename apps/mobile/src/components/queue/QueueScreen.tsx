// Mobile v2 — the trainee's home. A full-screen focus queue, not a dashboard:
// one actionable card at a time, "Later" advances, and the queue ENDS.
// See the design project's MOBILE-V2.md; the visual language lives in
// src/theme/v2.ts and the ordering in @cisa/core's buildQueue.
//
// The bottom tab bar stays (it already carries navigation), so v2's ☰ drawer is
// not ported — the chrome here is the quiet meta line and the ＋ log button.
import React from 'react';
import { ActivityIndicator, Linking, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  firstName,
  getUserInitials,
  isOnCampus,
  personColor,
  type Contact,
  type QueueCard as QueueCardData,
} from '@cisa/core';
import { useAuth } from '../../lib/AuthProvider';
import { useTraineeLandingData } from '../../lib/useTraineeLandingData';
import { setTodoDone, updateTodo } from '../../lib/data/todos';
import { addThreadMessage, toggleReaction } from '../../lib/data/threads';
import { InboxReads } from '../../lib/data/inboxReads';
import { useV2Theme } from '../../theme/v2';
import { QuickCaptureSheet } from '../quickcapture/QuickCaptureSheet';
import { Snackbar } from '../ui';
import { QueueCard, type QueueCardApi } from './QueueCard';
import { OnCampusStrip } from './OnCampusStrip';
import { EndOfQueue } from './EndOfQueue';
import { AllTodayList } from './AllTodayList';
import { ReplySheet } from './ReplySheet';

const tomorrowISO = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString();
};

export function QueueScreen() {
  const { c, font, shadow } = useV2Theme();
  const { uid, user } = useAuth();
  const router = useRouter();
  const data = useTraineeLandingData(uid, user?.displayName ?? null);

  const [index, setIndex] = React.useState(0);
  const [showAll, setShowAll] = React.useState(false);
  const [logFor, setLogFor] = React.useState<Contact | null>(null);
  const [logOpen, setLogOpen] = React.useState(false);
  const [replyTo, setReplyTo] = React.useState<QueueCardData | null>(null);
  const [toast, setToast] = React.useState<string | null>(null);

  const { queue, queueState, queuePrefs } = data;
  // The queue rebuilds continuously (handling a card shortens it), so the
  // pointer is clamped on read rather than corrected in an effect.
  const at = queue.length === 0 ? 0 : Math.min(index, queue.length - 1);
  const current = queue[at];

  const onCampus = isOnCampus(queuePrefs.prefs.onCampus);

  const api: QueueCardApi = {
    handle: (id) => {
      queueState.handle(id);
      setIndex(0);
    },
    later: (id) => {
      queueState.pushLater(id);
      setIndex(0);
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
    openBoardDoc: (docId) => router.push(docId ? `/coordination/${docId}` : '/coordination'),
    openContact: (contactId, tab) =>
      router.push(tab ? `/contact/${contactId}?tab=${tab}` : `/contact/${contactId}`),
    openReply: (card) => setReplyTo(card),
    openLog: (card) => {
      setLogFor(card.contact ?? null);
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

  const me = firstName(user?.displayName ?? '') || 'friend';

  // ── loading / error ──────────────────────────────────────────────────────
  if (data.loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.room, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={c.roomInk2} />
      </SafeAreaView>
    );
  }

  if (showAll) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.room }}>
        <AllTodayList
          cards={queue}
          currentId={current?.id}
          held={queue.held}
          onPick={(i) => {
            setIndex(i);
            setShowAll(false);
          }}
          onBack={() => setShowAll(false)}
          onOpenSettings={() => router.push('/queue-settings')}
        />
      </SafeAreaView>
    );
  }

  const upNext = queue.slice(at + 1, at + 4);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.room }}>
      {!!data.error && (
        <Text
          style={{
            fontFamily: font.semi,
            fontSize: 12.5,
            color: c.roomInk2,
            paddingHorizontal: 18,
            paddingTop: 8,
          }}
        >
          {data.error}
        </Text>
      )}

      {/* Chrome in the air above the card: where you are in today. One counter,
          one source of truth — the pips are retired. */}
      <View style={{ paddingHorizontal: 18, paddingTop: 10, paddingBottom: 14 }}>
        <Pressable
          onPress={() => setShowAll(true)}
          disabled={queue.length === 0}
          style={{ height: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <Text
            style={{
              fontFamily: font.extra,
              fontSize: 10.5,
              letterSpacing: 1.47,
              textTransform: 'uppercase',
              color: c.roomInk2,
            }}
          >
            {queue.length === 0 ? 'All clear' : `${at + 1} of ${queue.length} today`}
          </Text>
          {queue.length > 0 && (
            <Text style={{ fontFamily: font.semi, fontSize: 11, color: c.roomInk3 }}>Everything today</Text>
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
                  onPress={() => {
                    setLogFor(null);
                    setLogOpen(true);
                  }}
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
          week={data.week}
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
                borderColor: c.room,
                backgroundColor: card.contact
                  ? personColor(card.contact.id)
                  : c.tones[card.tone].dot,
              }}
            >
              <Text style={{ fontFamily: font.extra, fontSize: 10.5, color: '#fff' }}>
                {card.contact ? getUserInitials(card.contact.name) : '·'}
              </Text>
            </View>
          ))}
          {upNext.length > 0 && (
            <Text
              style={{ fontFamily: font.medium, fontSize: 12, color: c.roomFaint, marginLeft: 10, flexShrink: 1 }}
              numberOfLines={1}
            >
              {upNext.length === 1 ? 'One more after this' : `${queue.length - at - 1} more after this`}
            </Text>
          )}
        </View>

        <Pressable
          accessibilityLabel="Log a conversation"
          onPress={() => {
            setLogFor(null);
            setLogOpen(true);
          }}
          style={[
            {
              width: 54,
              height: 54,
              borderRadius: 27,
              backgroundColor: c.inverse,
              alignItems: 'center',
              justifyContent: 'center',
            },
            shadow.fab,
          ]}
        >
          <Ionicons name="add" size={28} color={c.onInverse} />
        </Pressable>
      </View>

      {/* Keyed so the sheet remounts when the person it's about changes — its
          step/contact are seeded from initialContact at mount. */}
      <QuickCaptureSheet
        key={logFor?.id ?? 'anyone'}
        visible={logOpen}
        initialContact={logFor}
        // logFor is left alone here: clearing it would swap the key mid-close
        // and cut the dismiss animation. Each opener sets it first.
        onClose={() => setLogOpen(false)}
      />
      <ReplySheet
        key={replyTo?.id ?? 'no-reply'}
        message={replyTo?.msg ?? null}
        onClose={() => setReplyTo(null)}
        onSend={sendReply}
      />
      {!!toast && <Snackbar message={toast} onDismiss={() => setToast(null)} />}
    </SafeAreaView>
  );
}
