// Mobile v2 — the trainee's home. A full-screen focus queue, not a dashboard:
// one actionable card at a time, "Later" advances, and the queue ENDS.
// See the design project's MOBILE-V2.md; the visual language lives in
// src/theme/v2.ts and the ordering in @cisa/core's buildQueue.
//
// This shell has no tab bar at all (app/(tabs)/_layout.tsx hides it for the
// trainee): the chrome is ☰ · "Today · N left" · the ＋ log button, and everything
// that isn't the queue lives behind the drawer.
import React, { useRef } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from '../ui/SafeArea';
import {
  canAccessRoute,
  firstName,
  goalCountFor,
  goalFill,
  goalShow,
  getUserInitials,
  isOnCampus,
  onCampusHeadline,
  personColor,
  upNextLine,
  type Contact,
  type QueueCard as QueueCardData,
} from '@cisa/core';
import { useAuth } from '../../lib/AuthProvider';
import { useLanguage } from '../../lib/LanguageProvider';
import { useTraineeLandingData } from '../../lib/useTraineeLandingData';
import { setTodoDone, updateTodo } from '../../lib/data/todos';
import { addThreadMessage } from '../../lib/data/threads';
import { useDayGoal } from '../../lib/useDayGoal';
import { useTodayHint } from '../../lib/todayHint';
import { InboxReads } from '../../lib/data/inboxReads';
import { useV2Theme } from '../../theme/v2';
import { LogSheet } from '../log/LogSheet';
import { Snackbar } from '../ui';
import { QueueCard, type QueueCardApi } from './QueueCard';
import { OnCampusStrip } from './OnCampusStrip';
import { CampusModeScreen } from './CampusModeScreen';
import { campusRecent } from './campusRecent';
import { EndOfQueue } from './EndOfQueue';
import { AllTodayList } from './AllTodayList';
import { WeekLookBack } from './WeekLookBack';
import { DrawerButton, QueueDrawer } from './QueueDrawer';
import { ReplySheet } from './ReplySheet';
import { FeedbackSheet } from '../feedback/FeedbackSheet';
import { QueueSkeleton } from '../skeleton/QueueSkeleton';
import { M2Release } from '../release/M2Release';

/** What the "done for today" toast calls a card: its person, else the thing itself. */
const cardName = (card: QueueCardData | undefined): string =>
  card?.contact ? firstName(card.contact.name) : (card?.task?.title ?? card?.title ?? '');

const tomorrowISO = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString();
};

export function QueueScreen() {
  const { c, font, radius, shadow, fs } = useV2Theme();
  const { uid, user, role } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const data = useTraineeLandingData(uid, user?.displayName ?? null);

  const [index, setIndex] = React.useState(0);
  const [showAll, setShowAll] = React.useState(false);
  const [showWeek, setShowWeek] = React.useState(false);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [feedbackOpen, setFeedbackOpen] = React.useState(false);
  const [logFor, setLogFor] = React.useState<Contact | null>(null);
  // The to-do behind a follow-up card, so saving the log closes it too.
  const [logTask, setLogTask] = React.useState<string | null>(null);
  // The card the sheet was opened from, handed back when the sheet closes so
  // the card is looked after once — a "gone quiet" card has no to-do to
  // complete, so logging is the only thing that answers it.
  const [logCard, setLogCard] = React.useState<string | null>(null);
  const [logOpen, setLogOpen] = React.useState(false);
  // Campus mode's "Add someone new" opens the sheet straight into its
  // new-person form; every other opener clears this so it never sticks.
  const [logStart, setLogStart] = React.useState<'new' | undefined>(undefined);
  // On campus the home is campus mode until the trainee opens Today; then
  // Today stays for as long as this screen is mounted.
  const [todayChosen, setTodayChosen] = React.useState(false);
  const [replyTo, setReplyTo] = React.useState<QueueCardData | null>(null);
  // `undo` is set only after an action that answers a card. `n` remounts the
  // snackbar per toast so each one gets its full time on screen.
  const [toast, setToastState] = React.useState<{ message: string; undo?: () => void; n: number } | null>(null);
  const setToast = (message: string | null, undo?: () => void) =>
    setToastState((prev) => (message ? { message, undo, n: (prev?.n ?? 0) + 1 } : null));

  const { queue, queueState, queuePrefs } = data;
  // The queue rebuilds continuously (handling a card shortens it), so the
  // pointer is clamped on read rather than corrected in an effect.
  const at = queue.length === 0 ? 0 : Math.min(index, queue.length - 1);
  const current = queue[at];

  const onCampus = isOnCampus(queuePrefs.prefs.onCampus);
  // The day's goal (#544): a wordless ring in the on-campus strip that fills as
  // new people go in and vanishes (back to the plain dot) the moment it's met.
  const { goal } = useDayGoal();
  const goalCount = goalCountFor(data.contacts, uid);
  const showGoal = goalShow(goal, goalCount, onCampus);
  const goalRing = showGoal
    ? {
        fill: goalFill(goalCount, goal),
        label: t('mobile.goal.ring_label')
          .replace('{count}', String(goalCount))
          .replace('{goal}', String(goal.count)),
      }
    : undefined;
  // The design's due card hides this button rather than offering a door that
  // doesn't open (`api.canBoard !== false` in views/mobile/cards.jsx), and a
  // trainee is exactly who can't open it — canAccessRoute('manager', …) closes
  // /coordination, which is why The Board isn't in TRAINEE_DRAWER either.
  const canBoard = canAccessRoute(role, '/coordination');
  const hint = useTodayHint(uid);

  // Done for today: the card goes, the toast names it, and Undo brings it back.
  // Undo only ever reverses the queue (and a to-do it completed) — whatever was
  // logged or sent stays saved.
  const doneForToday = (cardId: string, reverse?: () => void) => {
    const card = queue.find((k) => k.id === cardId);
    queueState.handle(cardId);
    setIndex(0);
    setToast(t('mobile.queue.done_for_today').replace('{name}', cardName(card)), () => {
      queueState.unhandle(cardId);
      reverse?.();
      setIndex(0);
      setToast(null);
    });
  };

  // Logging from nowhere in particular: no contact, no to-do, and — the one
  // that bit — no card. Leaving `logCard` behind meant dismissing a card's log
  // sheet and then logging something unrelated marked the stale card handled.
  const openBlankLog = () => {
    setLogFor(null);
    setLogTask(null);
    setLogCard(null);
    setLogStart(undefined);
    setLogOpen(true);
  };

  // A msg card stands for every unread text in its stream (#1793), so whatever
  // clears it reads them all.
  const markStreamRead = (card: QueueCardData) => {
    if (!uid) return;
    for (const m of card.msgs ?? []) InboxReads.markRead(uid, 'thread:' + m.id);
  };
  const markStreamUnread = (card: QueueCardData) => {
    if (!uid) return;
    for (const m of card.msgs ?? []) InboxReads.markUnread(uid, 'thread:' + m.id);
  };

  const openNewPerson = () => {
    openBlankLog();
    setLogStart('new');
  };

  const api: QueueCardApi = {
    canBoard,
    handle: (id) => doneForToday(id),
    later: (id) => {
      // The queue this handler closes over is the pre-press one. Deferring a
      // 1-of-1 queue puts the only card back at the front, so it stays on
      // screen — read the length BEFORE the deferral so the toast condition
      // sees the same queue the press was made against.
      const isOnlyCard = queue.length === 1;
      queueState.pushLater(id);
      setIndex(0);
      if (isOnlyCard) setToast(t('mobile.queue.moved_to_later'));
    },
    markDone: (taskId) => {
      void setTodoDone(taskId, true);
      doneForToday('todo:' + taskId, () => void setTodoDone(taskId, false));
    },
    pushToTomorrow: (taskId) => {
      void updateTodo(taskId, { dueDate: tomorrowISO() });
      queueState.handle('todo:' + taskId);
      setIndex(0);
      setToast(t('mobile.queue.moved_to_tomorrow'));
    },
    openBoardDoc: (docId) => {
      // The button is hidden without access, so this only fires if something
      // else routes here — say it plainly rather than pushing a locked screen.
      if (!canBoard) {
        setToast(t('mobile.queue.that_page_lives_with_team'));
        return;
      }
      router.push(docId ? `/coordination/${docId}` : '/coordination');
    },
    openContact: (contactId, tab, card) => {
      if (card?.kind === 'msg') markStreamRead(card);
      router.push(tab ? `/contact/${contactId}?tab=${tab}` : `/contact/${contactId}`);
    },
    openReply: (card) => setReplyTo(card),
    seenIt: (card) => {
      markStreamRead(card);
      doneForToday(card.id, () => markStreamUnread(card));
    },
    openLog: (card) => {
      setLogFor(card.contact ?? null);
      setLogTask(card.task?.id ?? null);
      setLogCard(card.id);
      setLogStart(undefined);
      setLogOpen(true);
    },
    text: (card) => {
      const phone = card.contact?.phone?.replace(/[^\d+]/g, '');
      if (phone) void Linking.openURL(`sms:${phone}`);
      else setToast(t('mobile.queue.no_number_saved').replace('{name}', firstName(card.contact?.name ?? '')));
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
    markStreamRead(card);
    setReplyTo(null);
    doneForToday(card.id);
  };

  // `firstName('')` answers "Someone", so the fallback has to go INSIDE it —
  // "That's everything, Someone." is not something to say to anyone.
  const me = firstName(user?.displayName || 'friend');

  // Ref for the feedback screenshot capture. The bottom sheet renders at the
  // app-root BottomSheetModalProvider's position, not inline, so this captures
  // the screen behind the sheet rather than the sheet itself. `collapsable`
  // keeps the view natively backed on Android, without which captureRef has
  // nothing to draw.
  const captureRef = useRef<View>(null);

  // ── loading / error ──────────────────────────────────────────────────────
  if (data.loading) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.room.bg }}>
        <QueueSkeleton />
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
  // The header spans the WHOLE day — what's left plus what's already done — so
  // the bar fills as cards clear instead of the day shrinking.
  const done = queueState.handledCount;
  const total = queue.length + done;
  const history = current?.contact
    ? data.interactions
        .filter((i) => i.contactId === current.contact!.id)
        .sort((a, b) => b.dateTime.localeCompare(a.dateTime))
        .slice(0, 5)
    : [];

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.room.bg }}>
      <View ref={captureRef} collapsable={false} style={{ flex: 1 }}>
      {onCampus && !todayChosen ? (
        <CampusModeScreen
          windowLabel={onCampusHeadline(queuePrefs.prefs.onCampus)}
          recent={campusRecent(data.contacts, data.interactions, uid, queuePrefs.prefs.onCampus)}
          todayCount={queue.length}
          todayFaces={queue.flatMap((k) => (k.contact ? [{ id: k.contact.id, name: k.contact.name }] : [])).slice(0, 3)}
          onMenu={() => setDrawerOpen(true)}
          onSignUp={() => router.push('/signup')}
          onAddNew={openNewPerson}
          onLog={openBlankLog}
          onOpenToday={() => setTodayChosen(true)}
        />
      ) : (
      <>
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
          how much of today is left, how much is done, and a bar of the day. */}
      <View style={{ paddingHorizontal: 18, paddingTop: 10, paddingBottom: 14, gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
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
            <Text style={{ fontFamily: font.extra, fontSize: fs(15), color: c.room.ink, flexShrink: 1 }} numberOfLines={1}>
              {total === 0 ? t('mobile.queue.today') : t('mobile.queue.today_left').replace('{count}', String(queue.length))}
            </Text>
            {done > 0 && (
              <Text style={{ fontFamily: font.semi, fontSize: fs(12.5), color: c.room.ink3 }}>
                {t('mobile.queue.done_count').replace('{count}', String(done))}
              </Text>
            )}
          </Pressable>
          {/* Opening Today on campus mustn't strand the sign-up form back behind
              the drawer: this is the way back to campus mode (issue 1715 review). */}
          {onCampus && todayChosen && (
            <Pressable
              onPress={() => setTodayChosen(false)}
              accessibilityRole="button"
              accessibilityLabel={t('mobile.queue.campus')}
              style={({ pressed }) => [
                {
                  minHeight: 44,
                  paddingHorizontal: 14,
                  borderRadius: radius.chip,
                  backgroundColor: c.card.primary,
                  borderBottomWidth: pressed ? 1 : 3,
                  borderBottomColor: c.card.primaryEdge,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  transform: [{ translateY: pressed ? 2 : 0 }],
                },
                shadow.raisedSmall,
              ]}
            >
              <Ionicons name="school-outline" size={16} color={c.card.onPrimary} />
              <Text style={{ fontFamily: font.bold, fontSize: fs(13.5), color: c.card.onPrimary }}>{t('mobile.queue.campus')}</Text>
            </Pressable>
          )}
        </View>
        {total > 0 && (
          <View style={{ flexDirection: 'row', gap: 3 }}>
            {Array.from({ length: total }, (_, i) => (
              <View
                key={i}
                style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: i < done ? c.room.ink : c.room.chip }}
              />
            ))}
          </View>
        )}
      </View>

      {current ? (
        <View style={{ flex: 1, paddingHorizontal: 18, minHeight: 0 }}>
          <QueueCard
            key={current.id}
            card={current}
            me={uid ?? ''}
            api={api}
            history={history}
            header={
              onCampus ? (
                <OnCampusStrip
                  window={queuePrefs.prefs.onCampus}
                  onPress={openBlankLog}
                  goal={goalRing}
                />
              ) : hint.show ? (
                <TodayHint count={queue.length} onDismiss={hint.dismiss} />
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

      {/* The floor: who's next, and the one ＋. The bottom padding clears the
          system nav bar (3-button Android), not just the gesture inset — the
          design's `.m2-bot` is `calc(16px + env(safe-area-inset-bottom))`. */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 14,
          paddingHorizontal: 18,
          paddingTop: 16,
          paddingBottom: 16 + insets.bottom,
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
              <Text style={{ fontFamily: font.extra, fontSize: fs(10.5), color: card.contact ? '#1A212B' : '#fff' }}>
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
          hitSlop={8}
          style={({ pressed }) => [
            {
              width: 54,
              height: 54,
              borderRadius: 27,
              backgroundColor: c.card.inverse,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.9 : 1,
              transform: [{ scale: pressed ? 0.94 : 1 }],
            },
            shadow.fab,
          ]}
        >
          <Ionicons name="add" size={28} color={c.card.onInverse} />
        </Pressable>
      </View>
      </>
      )}

      {/* Keyed so the sheet remounts when the person it's about changes — its
          mode/contact are seeded from initialContact at mount. */}
      <LogSheet
        key={logFor?.id ?? 'anyone'}
        visible={logOpen}
        room="queue"
        initialContact={logFor}
        start={logStart}
        taskId={logTask}
        cardId={logCard}
        onCampus={queuePrefs.prefs.onCampus}
        onSaved={(message, cardId) => {
          // Saving completed the card's to-do (if it had one), and a follow-up
          // card only shows while its to-do is open — so Undo reopens it too.
          // The logged conversation itself stays saved.
          const task = logTask;
          if (cardId) doneForToday(cardId, task ? () => void setTodoDone(task, false) : undefined);
          else setToast(message);
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
      {!!toast && (
        <Snackbar
          key={toast.n}
          message={toast.message}
          actionLabel={toast.undo ? t('mobile.queue.undo') : undefined}
          onAction={toast.undo}
          onDismiss={() => setToast(null)}
        />
      )}
      </View>
      <QueueDrawer
        visible={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onFeedback={() => setFeedbackOpen(true)}
      />
      <FeedbackSheet visible={feedbackOpen} onClose={() => setFeedbackOpen(false)} targetRef={captureRef} />
      {/* What changed since you last opened this (#546) — held while the
          on-campus window is open, so it never interrupts the two hours you're
          actually on campus. */}
      <M2Release role={role} inWindow={onCampus} />
    </SafeAreaView>
  );
}

/** The one-time hint, inside the first card (#1715). */
function TodayHint({ count, onDismiss }: { count: number; onDismiss: () => void }) {
  const { c, font, radius, fs } = useV2Theme();
  const { t } = useLanguage();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
        marginBottom: 16,
        paddingVertical: 12,
        paddingLeft: 14,
        paddingRight: 4,
        borderRadius: radius.note,
        backgroundColor: c.card.note,
      }}
    >
      <Text style={{ flex: 1, fontFamily: font.medium, fontSize: fs(13.5), lineHeight: fs(19), color: c.card.noteInk }}>
        <Text style={{ fontFamily: font.bold }}>
          {count === 1 ? t('mobile.queue.hint_count_one') : t('mobile.queue.hint_count').replace('{count}', String(count))}
        </Text>
        {' ' + t('mobile.queue.hint_body')}
      </Text>
      <Pressable
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel={t('mobile.queue.dismiss_hint')}
        hitSlop={6}
        style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginTop: -10 }}
      >
        <Ionicons name="close" size={18} color={c.card.noteInk} />
      </Pressable>
    </View>
  );
}
