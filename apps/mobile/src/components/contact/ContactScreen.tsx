// Mobile v2 — the person screen. The design's `M2Contact`
// (views/mobile/contact.jsx): a back row, a white hero, Text / Call / Log, then
// segmented Story · Prayers · Conversation. The only deep screen the queue links
// into, and the last one in the app still wearing the Material language.
//
// Conversation is the contact-level open stream in the one written-stream
// grammar (ADR 0033, #1261): rows from the core stream model, the composer
// pinned at the foot, the stream opening on its newest message. A Full-timer
// switches between it and the staff-only Full-timers stream; a Trainee never
// sees the switch. An Interaction's Thread hangs off its Story entry and opens
// as a pushed screen — it is not part of the Conversation.
//
// The design's three tabs are all there is: Discussion (team comments), the
// per-contact History timeline and the admin edit form have no counterpart here
// and are desktop work now — see MIGRATION.md. Contact details survive as
// Story's "Details, notes, how to reach them" disclosure, read-only.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from '../ui/SafeArea';
import {
  canManageCollaborators,
  canRemoveContactMember,
  canSeeContact,
  buildStream,
  contactCareLine,
  contactConnectedLine,
  countFor,
  daysSince,
  feedVisibleThreads,
  firstName,
  ftAssignees,
  hasMinRole,
  lastTimeLine,
  parseMs,
  prayerCardKicker,
  roleLabel,
  splitContactPrayers,
  stageToneKey,
  storyRowLine,
  type AppUser,
  type Contact,
  type Interaction,
  type PrayerRecord,
  type StreamRow,
  type ThreadMessage,
  type ThreadSummary,
} from '@cisa/core';
import { useAuth } from '../../lib/AuthProvider';
import { useLanguage } from '../../lib/LanguageProvider';
import { Translate } from '../Translate';
import { useContactDetailData } from '../../lib/useContactDetailData';
import { conversationMessages, fullTimersMessages, interactionThread } from '../../lib/contactStreams';
import { addTodo } from '../../lib/data/todos';
import type { JourneyStage } from '../../lib/useJourneyData';
import { prayerCardId } from '../../lib/useFtHomeData';
import { useQueueState } from '../../lib/queueState';
import { moveContactStage } from '../../lib/data/contacts';
import { subscribeUsers } from '../../lib/data/users';
import {
  scheduleInteractionRemoval,
  cancelInteractionRemoval,
  subscribeInteractionRemovals,
  getPendingRemovalIds,
} from '../../lib/interactionRemoval';
import { openCall, openEmail, openMessage } from '../../lib/messaging';
import { roomForRole, useV2Theme } from '../../theme/v2';
import { Kicker, PersonMark, PrimaryButton } from '../queue/atoms';
import { Room, V2Empty, V2Seg } from '../v2/Widget';
import { ContactSkeleton } from '../skeleton/ContactSkeleton';
import { SkeletonList } from '../skeleton/SkeletonList';
import { Snackbar } from '../ui';
import { LogSheet } from '../log/LogSheet';
import { MoveStepSheet } from '../journey/MoveStepSheet';
import { AddCollaboratorSheet } from './AddCollaboratorSheet';
import { ContactPrayerSheet } from './ContactPrayerSheet';
import { EditContactSheet } from './EditContactSheet';
import { FtTodoSheet } from '../ft/FtTodoSheet';
import { StreamList } from '../stream/StreamList';
import { StreamComposer } from '../stream/StreamComposer';
import { StreamActionSheet } from '../stream/StreamActionSheet';
import { ThreadChip } from '../stream/StreamRow';

export type ContactV2Tab = 'story' | 'prayers' | 'conversation';
/** Which of a contact's two streams the Conversation tab is showing. */
type ContactStream = 'open' | 'team';

interface ContactScreenProps {
  contactId: string;
  initialTab: ContactV2Tab;
  /** A deep link into one logged conversation's own Thread (a queue card's
   * "Open the conversation"), pushed over Story on arrival. */
  initialInteractionId?: string | null;
  /** A deep link onto the Full-timers side of the Conversation (#1303); only a
   * Full-timer actually sees that side. */
  initialStream?: ContactStream;
}

/** Where a Thread opens: a pushed screen over this one (T2). */
export const threadHref = (contactId: string, q: { parent?: string; interaction?: string; team?: boolean }) =>
  `/contact/${contactId}/thread?` +
  (q.interaction ? `interaction=${q.interaction}` : `parent=${q.parent}${q.team ? '&stream=team' : ''}`);

export function ContactScreen(props: ContactScreenProps) {
  const { role } = useAuth();
  return (
    <Room room={roomForRole(role)}>
      <Person {...props} />
    </Room>
  );
}

function Person({ contactId, initialTab, initialInteractionId, initialStream }: ContactScreenProps) {
  const { c, font, radius, shadow, fs } = useV2Theme();
  const router = useRouter();
  const { uid, user, role, isImpersonating } = useAuth();
  const { t } = useLanguage();
  const data = useContactDetailData(contactId);
  const queueState = useQueueState(uid ?? null);

  const [tab, setTab] = useState<ContactV2Tab>(initialTab);
  const [stream, setStream] = useState<ContactStream>(initialStream ?? 'open');
  const [held, setHeld] = useState<StreamRow<ThreadMessage> | null>(null);
  // The message being rewritten, if any (author-only; ADR 0033).
  const [editingMessage, setEditingMessage] = useState<ThreadMessage | null>(null);
  const [todoFrom, setTodoFrom] = useState<string | null>(null);
  const scroller = useRef<ScrollView>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [sheet, setSheet] = useState<'log' | 'pray' | 'edit' | 'addCollaborator' | null>(null);
  const [moving, setMoving] = useState<Contact | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pendingRemovalIds, setPendingRemovalIds] = useState<string[]>(() => getPendingRemovalIds());
  useEffect(() => subscribeInteractionRemovals(() => setPendingRemovalIds(getPendingRemovalIds())), []);
  const [removalSnack, setRemovalSnack] = useState<{ message: string; onAction: () => void } | null>(null);

  const [teamMembers, setTeamMembers] = useState<AppUser[]>([]);
  useEffect(() => {
    return subscribeUsers(setTeamMembers);
  }, []);
  // @mention candidates (ADR 0007): any teammate on the Conversation, only
  // Full-timers on the staff-only stream.
  const mentionCandidates = useMemo(
    () => teamMembers.map((m) => ({ uid: m.uid, name: m.displayName, role: m.role })),
    [teamMembers],
  );

  const canWrite = role !== 'viewer' && !isImpersonating;
  // The Full-timers switch is cut on the EFFECTIVE role, as feedVisibleThreads
  // is, so "See it as they do" shows a Trainee's screen (#1024 phase 2).
  const isFullTimer = role === 'admin';
  const canShare = !isImpersonating && canManageCollaborators(role, uid, data.contact);

  useEffect(() => {
    if (initialInteractionId) router.push(threadHref(contactId, { interaction: initialInteractionId }) as never);
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Newest first, and the newest is what the hero quotes.
  const story = useMemo(
    () => [...data.interactions].filter((i) => !pendingRemovalIds.includes(i.id)).reverse(),
    [data.interactions, pendingRemovalIds],
  );
  const lastTouchDays = useMemo(() => {
    const newest = story
      .map((i) => parseMs(i.dateTime) ?? parseMs(i.createdAt))
      .filter((ms): ms is number => ms !== null)
      .sort((a, b) => b - a)[0];
    return newest === undefined ? null : daysSince(newest);
  }, [story]);
  // Team-scope Discussion is Full-timer-only, cut on the reader's EFFECTIVE
  // role so the preview hides it (#1024 phase 2).
  const visibleThreads = useMemo(() => feedVisibleThreads(data.threadMessages, role), [data.threadMessages, role]);
  const conversation = useMemo(() => conversationMessages(visibleThreads), [visibleThreads]);
  const fullTimers = useMemo(
    () => (isFullTimer ? fullTimersMessages(visibleThreads) : []),
    [visibleThreads, isFullTimer],
  );
  const showing = isFullTimer && stream === 'team' ? 'team' : 'open';
  // Read once per visit: "Today" and "Open N days" are said against it.
  const [now] = useState(Date.now);
  // A viewer who may not write gets no ask actions from the model.
  const viewer = { uid: uid ?? '', role: canWrite ? role : null };
  const items = buildStream({ messages: showing === 'team' ? fullTimers : conversation, viewer, now });
  const topLevel = (list: ThreadMessage[]) => list.filter((m) => !m.parentId).length;
  const { open: openPrayers, closed: closedPrayers } = useMemo(
    () => splitContactPrayers(data.prayers),
    [data.prayers],
  );

  // The same stage list The Journey uses, including the synthetic Unassigned
  // row when this contact's stage is blank or no longer exists (#395).
  const currentContact = data.contact;
  const moveStages = useMemo<JourneyStage[]>(() => {
    const list = data.stages.map((s) => ({ id: s.id, label: s.label }));
    const hasUnassigned = data.stages.some((s) => s.label === 'Unassigned');
    if (currentContact && !data.stages.some((s) => s.label === currentContact.stage) && !hasUnassigned) {
      list.unshift({ id: 'uncategorized', label: 'Unassigned' });
    }
    return list;
  }, [data.stages, currentContact]);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const openThread = (q: Parameters<typeof threadHref>[1]) => router.push(threadHref(contactId, q) as never);
  const openRowThread = (row: StreamRow<ThreadMessage>) =>
    openThread({ parent: row.message.id, team: row.message.scope === 'team' });
  const canRemoveInteraction = (interaction: Interaction) =>
    !interaction.id.startsWith('visit_') && (uid === interaction.userId || hasMinRole(role, 'manager'));

  const handleRemoveInteraction = (interaction: Interaction) => {
    // Match the web gate: team-scoped discussion messages don't count toward
    // the warning (web's countFor filters them by default scope).
    const threadCount = countFor(
      visibleThreads.filter((m) => m.scope !== 'team'),
      interaction.id,
    );
    const doRemove = () => {
      scheduleInteractionRemoval(interaction.id, () => {
        void data.deleteInteraction(interaction);
      });
      setRemovalSnack({
        message: t('mobile.contact.interaction_removed'),
        onAction: () => {
          cancelInteractionRemoval(interaction.id);
          setRemovalSnack(null);
        },
      });
    };
    if (threadCount > 0) {
      Alert.alert(
        t('mobile.contact.remove_interaction'),
        t('mobile.contact.remove_interaction_confirm').replace('{count}', String(threadCount)),
        [
          { text: t('actions.cancel'), style: 'cancel' },
          { text: t('actions.remove'), style: 'destructive', onPress: doRemove },
        ],
      );
    } else {
      doRemove();
    }
  };

  if (data.error || (!data.loading && !data.contact)) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.room.bg }}>
        <BackRow onBack={back} note="" />
        <View style={{ paddingHorizontal: 14 }}>
          <V2Empty>{data.error || t('mobile.contact.we_cant_find')}</V2Empty>
        </View>
      </SafeAreaView>
    );
  }

  if (data.loading || !data.contact) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.room.bg }}>
        <BackRow onBack={back} note="" />
        <ContactSkeleton />
      </SafeAreaView>
    );
  }

  const contact = data.contact;

  // A reader with no tie to this person sees a locked state, not a blank
  // screen. The route guard above answers a different question (may this role
  // open person screens at all); this is the per-contact boundary, against the
  // EFFECTIVE identity so "See it as they do" tells the truth (#1024 phase 1).
  if (!canSeeContact(role, uid, contact)) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.room.bg }}>
        <BackRow onBack={back} note="" />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, gap: 8 }}>
          <Ionicons name="lock-closed-outline" size={32} color={c.room.ink3} />
          <Text style={{ fontFamily: font.extra, fontSize: fs(18), color: c.room.ink, textAlign: 'center' }}>
            {t('mobile.contact.no_access_title')}
          </Text>
          <Text style={{ fontFamily: font.medium, fontSize: fs(14.5), lineHeight: fs(21), color: c.room.ink2, textAlign: 'center' }}>
            {t('mobile.contact.no_access_body')}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const first = firstName(contact.name);
  const lastTime = lastTimeLine(story[0]);

  const handleMove = async (_contactId: string, newStageLabel: string) => {
    if (!moving) return;
    await moveContactStage(moving, newStageLabel, { uid, name: user?.displayName });
    setToast(newStageLabel ? `Moved to ${newStageLabel}.` : 'Moved to Unassigned.');
    setMoving(null);
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.room.bg }}>
      <BackRow
        onBack={back}
        note={contactCareLine(data.inYourCare, contact.createdByName)}
        canEdit={canWrite}
        onEdit={() => setSheet('edit')}
      />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        ref={scroller}
        contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: tab === 'conversation' ? 12 : 30 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        // A stream opens on its newest message, just above the pinned composer (G4).
        onContentSizeChange={() => {
          if (tab === 'conversation') scroller.current?.scrollToEnd({ animated: false });
        }}
      >
        {/* ── the hero ─────────────────────────────────────────────────── */}
        <View style={{ backgroundColor: c.card.bg, borderRadius: radius.hero, padding: 20, ...shadow.soft }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <PersonMark name={contact.name} id={contact.id} size={60} radius={21} fontSize={19} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: font.extra, fontSize: fs(25), lineHeight: fs(28), letterSpacing: -0.875, color: c.card.ink }}>
                {contact.name}
              </Text>
              {!![contact.year, contact.major].filter(Boolean).length && (
                <Text style={{ fontFamily: font.semi, fontSize: fs(12.5), lineHeight: fs(17), color: c.card.ink3, marginTop: 5 }}>
                  {[contact.year, contact.major].filter(Boolean).join(' · ')}
                </Text>
              )}
            </View>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 7, marginTop: 16 }}>
            <View
              style={{
                width: 9,
                height: 9,
                borderRadius: 3,
                backgroundColor: c.card.tones[stageToneKey(data.stages, contact.stage)].dot,
              }}
            />
            <Text style={{ fontFamily: font.bold, fontSize: fs(12.5), color: c.card.ink2 }}>{contact.stage}</Text>
            <Text style={{ fontFamily: font.bold, fontSize: fs(12.5), color: c.card.border }}>·</Text>
            <Text style={{ fontFamily: font.bold, fontSize: fs(12.5), color: c.card.ink2 }}>
              {contactConnectedLine(lastTouchDays)}
            </Text>
            {canWrite && (
              <Pressable
                accessibilityRole="button"
                onPress={() => setMoving(contact)}
                hitSlop={8}
                style={({ pressed }) => ({ paddingVertical: 6, paddingHorizontal: 2, opacity: pressed ? 0.6 : 1 })}
              >
                <Text style={{ fontFamily: font.bold, fontSize: fs(12.5), color: c.card.link }}>{t('mobile.contact.move_a_step')}</Text>
              </Pressable>
            )}
          </View>

          {!!lastTime && (
            <Text style={{ fontFamily: font.medium, fontSize: fs(14.5), lineHeight: fs(21), color: c.card.ink2, marginTop: 10 }}>
              {lastTime}
            </Text>
          )}

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 18 }}>
            <HeroAction label={t('mobile.contact.text')} disabled={!contact.phone} onPress={() => openMessage(contact.phone)} />
            <HeroAction label={t('mobile.contact.call')} disabled={!contact.phone} onPress={() => openCall(contact.phone)} />
            {canWrite && <HeroAction label={t('mobile.contact.log')} dark onPress={() => setSheet('log')} />}
          </View>
        </View>

        <V2Seg
          value={tab}
          onChange={setTab}
          items={[
            { id: 'story', label: t('mobile.contact.story'), count: story.length },
            { id: 'prayers', label: t('mobile.contact.prayers'), count: openPrayers.length },
            { id: 'conversation', label: t('mobile.contact.conversation'), count: topLevel(conversation) },
          ]}
        />

        {/* ── Story ────────────────────────────────────────────────────── */}
        {tab === 'story' && (
          <View style={{ gap: 10 }}>
            {data.interactionsLoading ? (
              <SkeletonList rows={3} avatar={false} style={{ marginTop: 20 }} />
            ) : story.length === 0 ? (
              <V2Empty>{t('mobile.contact.nothing_logged_yet').replace('{name}', first)}</V2Empty>
            ) : (
              story.map((interaction) => (
                <StoryCard
                  key={interaction.id}
                  interaction={interaction}
                  meUid={uid ?? ''}
                  thread={interactionThread({ interaction, messages: visibleThreads, viewer, now }).parent.thread}
                  now={now}
                  onOpenThread={() => openThread({ interaction: interaction.id })}
                  canRemove={canRemoveInteraction(interaction)}
                  onRemove={() => handleRemoveInteraction(interaction)}
                />
              ))
            )}

            <Pressable
              onPress={() => setShowDetails(!showDetails)}
              style={({ pressed }) => ({ minHeight: 44, justifyContent: 'center', paddingHorizontal: 4, opacity: pressed ? 0.6 : 1 })}
            >
              <Text style={{ fontFamily: font.bold, fontSize: fs(13.5), color: c.room.ink2 }}>
                {showDetails ? t('mobile.contact.hide_the_details') : t('mobile.contact.details_notes_how_to_reach')}
              </Text>
            </Pressable>

            {showDetails && (
              <Details
                contact={contact}
                carerNames={data.carerNames}
                teamMembers={teamMembers}
                uid={uid ?? null}
                role={role}
                canEdit={canWrite}
                canShare={canShare}
                onEdit={() => setSheet('edit')}
                onOpenAddCollaborator={() => setSheet('addCollaborator')}
                onRemoveCollaborator={(staffId, staffName) => void data.removeCollaborator(staffId, staffName)}
              />
            )}
          </View>
        )}

        {/* ── Prayers ──────────────────────────────────────────────────── */}
        {tab === 'prayers' && (
          <View style={{ gap: 10 }}>
            {canWrite && <PrimaryButton title={t('mobile.contact.pray_for').replace('{name}', first)} tone="deep" onPress={() => setSheet('pray')} />}

            {data.prayersLoading ? (
              <SkeletonList rows={3} style={{ marginTop: 20 }} />
            ) : data.prayers.length === 0 ? (
              <V2Empty>{t('mobile.contact.nothing_written_down')}</V2Empty>
            ) : null}

            {openPrayers.map((prayer) => (
              <PrayerCard
                key={prayer.id}
                prayer={prayer}
                prayed={!!queueState.handled[prayerCardId(prayer.id)]}
                canWrite={canWrite}
                onPrayed={() => queueState.handle(prayerCardId(prayer.id))}
                onAnswered={() => void data.markPrayerAnswered(prayer)}
              />
            ))}

            {closedPrayers.length > 0 && (
              <>
                <Kicker onRoom style={{ marginTop: 14, marginHorizontal: 4 }}>
                  {t('mobile.contact.looking_back')}
                </Kicker>
                {closedPrayers.map((prayer) => (
                  <PrayerCard key={prayer.id} prayer={prayer} done canWrite={false} />
                ))}
              </>
            )}
          </View>
        )}

        {/* ── Conversation ─────────────────────────────────────────────── */}
        {tab === 'conversation' && (
          <View style={{ gap: 10 }}>
            {isFullTimer && (
              <StreamSwitch
                value={showing}
                onChange={setStream}
                items={[
                  { id: 'open', label: t('mobile.contact.conversation'), count: topLevel(conversation) },
                  { id: 'team', label: t('mobile.contact.full_timers'), count: topLevel(fullTimers) },
                ]}
              />
            )}
            {items.length === 0 ? (
              <V2Empty>
                {showing === 'team' ? t('mobile.contact.empty_full_timers') : t('mobile.contact.empty_conversation')}
              </V2Empty>
            ) : (
              <View style={{ backgroundColor: c.card.bg, borderRadius: radius.tile, paddingHorizontal: 14, paddingVertical: 8 }}>
                <StreamList
                  items={items}
                  now={now}
                  readOnly={!canWrite}
                  onLongPress={(row) => setHeld(row)}
                  onOpenThread={openRowThread}
                  onCloseAsk={(row) => void data.closeAsk(row.message)}
                  editingId={editingMessage?.id ?? null}
                  onSaveEdit={async (body) => {
                    if (!editingMessage) return;
                    await data.editThreadMessage(editingMessage, body);
                    setEditingMessage(null);
                  }}
                  onCancelEdit={() => setEditingMessage(null)}
                  editFailure={t('mobile.stream.edit_failed')}
                />
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {tab === 'conversation' && canWrite && (
        <StreamComposer
          key={showing}
          kinds={showing === 'open'}
          audience={
            showing === 'team'
              ? t('mobile.contact.audience_full_timers')
              : t('mobile.contact.audience_conversation').replace('{name}', first)
          }
          askAudience={t('mobile.contact.audience_conversation_ask').replace('{name}', first)}
          locked={showing === 'team'}
          placeholder={t('mobile.contact.placeholder_full_timers')}
          candidates={showing === 'team' ? mentionCandidates.filter((m) => m.role === 'admin') : mentionCandidates}
          label={
            showing === 'team'
              ? t('mobile.contact.compose_full_timers')
              : t('mobile.contact.compose_conversation').replace('{name}', first)
          }
          onSend={({ body, kind, mentionedUserIds }) =>
            void data.postThreadMessage(
              showing === 'team'
                ? { interactionId: null, scope: 'team', kind: 'comment', body, mentionedUserIds }
                : { interactionId: null, scope: null, kind, body, mentionedUserIds },
            )
          }
        />
      )}
      </KeyboardAvoidingView>

      {/* Long-press on a row (G7): the hover toolbar's actions, phone-shaped. */}
      <StreamActionSheet
        row={held}
        visible={!!held}
        onClose={() => setHeld(null)}
        onReply={openRowThread}
        onMakeTodo={canWrite ? (row) => setTodoFrom(row.message.body) : undefined}
        onCopy={(row) => {
          void Clipboard.setStringAsync(row.message.body);
          setToast(t('mobile.stream.copied'));
        }}
        onDelete={canWrite ? (row) => void data.deleteThreadMessage(row.message) : undefined}
        // Author-only, and only the open Conversation — Full-timers messages are
        // posted and removed, never edited (firestore.rules).
        onEdit={
          canWrite && showing === 'open' && held?.message.from === uid && !held?.message.scope
            ? (row) => setEditingMessage(row.message)
            : undefined
        }
      />

      <FtTodoSheet
        key={todoFrom ?? 'none'}
        visible={todoFrom !== null}
        contact={contact}
        initialTitle={todoFrom ?? undefined}
        me={uid ?? ''}
        assignees={ftAssignees(teamMembers, uid)}
        onClose={() => setTodoFrom(null)}
        onSave={(input) => {
          setTodoFrom(null);
          void addTodo(
            { ...input, contactId: contact.id, contactName: contact.name },
            { uid: uid ?? '', name: user?.displayName || 'Someone' },
          );
          setToast(
            input.assigneeId === uid
              ? t('mobile.stream.todo_mine')
              : t('mobile.stream.todo_theirs').replace(
                  '{name}',
                  firstName(teamMembers.find((m) => m.uid === input.assigneeId)?.displayName ?? ''),
                ),
          );
        }}
      />

      {/* The hero's Log — the design's `M2LogSheet init={{contact}}`, which
          opens straight on the conversation because it already knows who. */}
      <LogSheet
        visible={sheet === 'log'}
        room={roomForRole(role)}
        initialContact={contact}
        onSaved={setToast}
        onClose={() => setSheet(null)}
      />

      <ContactPrayerSheet
        visible={sheet === 'pray'}
        contactName={contact.name}
        room={roomForRole(role)}
        onSave={(input) => {
          setSheet(null);
          void data.addPrayer(input);
        }}
        onClose={() => setSheet(null)}
      />

      {/* Change where they're at right from the person screen (#395). */}
      <MoveStepSheet
        visible={!!moving}
        contact={moving}
        stages={moveStages}
        room={roomForRole(role)}
        onMove={handleMove}
        onClose={() => setMoving(null)}
      />

      {/* Add collaborator selection sheet. */}
      <AddCollaboratorSheet
        visible={sheet === 'addCollaborator'}
        contact={contact}
        teamMembers={teamMembers}
        room={roomForRole(role)}
        onAdd={(staffId, staffName) => {
          void data.addCollaborator(staffId, staffName);
        }}
        onClose={() => setSheet(null)}
      />

      {/* Edit contact info, notes, and tags directly from mobile. */}
      <EditContactSheet
        visible={sheet === 'edit'}
        contact={contact}
        room={roomForRole(role)}
        onSaved={(name) =>
          setToast(
            t('mobile.contact.details_updated')
              ? t('mobile.contact.details_updated').replace('{name}', name)
              : `${name} updated`,
          )
        }
        onClose={() => setSheet(null)}
      />

      {removalSnack && (
        <Snackbar
          message={removalSnack.message}
          actionLabel={t('actions.undo')}
          onAction={removalSnack.onAction}
          onDismiss={() => setRemovalSnack(null)}
          // Shorter than the registry's 5s commit window so the Undo offer is
          // never still visible after the delete has fired.
          duration={4500}
        />
      )}
      {!!toast && <Snackbar message={toast} onDismiss={() => setToast(null)} />}
    </SafeAreaView>
  );
}

/** The design's `.m2-ch` on this screen: back, then who's looking after them. */
function BackRow({
  onBack,
  note,
  canEdit,
  onEdit,
}: {
  onBack: () => void;
  note: string;
  canEdit?: boolean;
  onEdit?: () => void;
}) {
  const { c, font, fs } = useV2Theme();
  const { t } = useLanguage();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10 }}>
      <Pressable
        onPress={onBack}
        style={({ pressed }) => ({
          height: 44,
          paddingHorizontal: 15,
          borderRadius: 15,
          backgroundColor: c.room.chip,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.65 : 1,
        })}
      >
        <Text style={{ fontFamily: font.bold, fontSize: fs(13), color: c.room.ink2 }}>{t('mobile.contact.back')}</Text>
      </Pressable>
      {!!note && (
        <Text style={{ fontFamily: font.semi, fontSize: fs(12), color: c.room.ink3, marginLeft: 'auto' }} numberOfLines={1}>
          {note}
        </Text>
      )}
      {canEdit && onEdit && (
        <Pressable
          onPress={onEdit}
          style={({ pressed }) => ({
            height: 44,
            paddingHorizontal: 15,
            borderRadius: 15,
            backgroundColor: c.room.chip,
            alignItems: 'center',
            justifyContent: 'center',
            marginLeft: note ? 0 : 'auto',
            opacity: pressed ? 0.65 : 1,
          })}
        >
          <Text style={{ fontFamily: font.bold, fontSize: fs(13), color: c.room.ink2 }}>
            {t('actions.edit') || 'Edit'}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

/** One of the hero's three thumb-sized actions (`.m2c-acts`).
 *
 * Text and Call go quiet when we have no number for someone. `openMessage` /
 * `openCall` already bail on an empty one, so the tap was never unsafe — it just
 * did nothing, which is worse than saying so. The button stays in place rather
 * than disappearing: the design's row is three columns wide, and a contact with
 * no phone would otherwise be left with a lone stretched Log. */
function HeroAction({
  label,
  dark,
  disabled,
  onPress,
}: {
  label: string;
  dark?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const { c, font, radius, fs } = useV2Theme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => ({
        flex: 1,
        height: 48,
        borderRadius: radius.note,
        borderWidth: 1.5,
        borderColor: dark ? c.card.ink : c.card.border,
        backgroundColor: dark ? c.card.ink : 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
      })}
    >
      <Text style={{ fontFamily: font.bold, fontSize: fs(14.5), color: dark ? c.card.bg : c.card.ink }}>{label}</Text>
    </Pressable>
  );
}

/** One logged conversation (`.m2c-cv`). Its Thread hangs off it (T4): a
 * replies chip when there are replies, "Think it through together" when there
 * are none — either opens the Thread as a pushed screen.
 *
 * The design's mock splits a conversation into a short `title` and a `body`; an
 * `Interaction` here has one `content` field of the staffer's own prose, so the
 * card is the kicker line and then what they wrote. */
function StoryCard({
  interaction,
  meUid,
  thread,
  now,
  onOpenThread,
  canRemove,
  onRemove,
}: {
  interaction: Interaction;
  meUid: string;
  thread: ThreadSummary | null;
  now: number;
  onOpenThread: () => void;
  canRemove?: boolean;
  onRemove?: () => void;
}) {
  const { c, font, radius, fs } = useV2Theme();
  const { t } = useLanguage();
  return (
    <View style={{ backgroundColor: c.card.bg, borderRadius: radius.tile, paddingHorizontal: 18, paddingTop: 16, paddingBottom: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Kicker>{storyRowLine(interaction, meUid)}</Kicker>
        </View>
        {canRemove && (
          <Pressable
            onPress={onRemove}
            accessibilityRole="button"
            hitSlop={8}
            style={({ pressed }) => ({ paddingVertical: 4, paddingHorizontal: 2, opacity: pressed ? 0.6 : 1 })}
          >
            <Text style={{ fontFamily: font.bold, fontSize: fs(12), color: c.card.ink2 }}>{t('actions.remove')}</Text>
          </Pressable>
        )}
      </View>
      <Text style={{ fontFamily: font.medium, fontSize: fs(14.5), lineHeight: fs(21.75), color: c.card.said, marginTop: 10 }}>
        {interaction.content}
      </Text>

      {thread ? (
        <View style={{ marginTop: 6, marginBottom: 6 }}>
          <ThreadChip thread={thread} now={now} onPress={onOpenThread} />
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('mobile.contact.think_it_through')}
          onPress={onOpenThread}
          style={({ pressed }) => ({ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, opacity: pressed ? 0.6 : 1 })}
        >
          <Ionicons name="chatbubble-ellipses-outline" size={15} color={c.card.ink2} />
          <Text style={{ fontFamily: font.bold, fontSize: fs(13), color: c.card.ink2 }}>{t('mobile.contact.think_it_through')}</Text>
        </Pressable>
      )}
    </View>
  );
}

/** The Conversation / Full-timers switch at the top of the tab — a Full-timer's
 * only. The count sits on the stream you are not reading. */
function StreamSwitch({
  value,
  onChange,
  items,
}: {
  value: ContactStream;
  onChange: (next: ContactStream) => void;
  items: { id: ContactStream; label: string; count: number }[];
}) {
  const { c, font, fs } = useV2Theme();
  const { t } = useLanguage();
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={t('mobile.contact.which_stream')}
      style={{ flexDirection: 'row', alignSelf: 'flex-start', gap: 2, padding: 3, borderRadius: 999, backgroundColor: c.room.chip }}
    >
      {items.map((item) => {
        const on = item.id === value;
        return (
          <Pressable
            key={item.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(item.id)}
            style={({ pressed }) => ({
              minHeight: 44,
              paddingHorizontal: 16,
              borderRadius: 999,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              backgroundColor: on ? c.card.bg : 'transparent',
              opacity: pressed ? 0.7 : 1,
            })}
          >
            {item.id === 'team' && <Ionicons name="lock-closed" size={12} color={on ? c.card.ink : c.room.ink2} />}
            <Text style={{ fontFamily: font.bold, fontSize: fs(13), color: on ? c.card.ink : c.room.ink2 }}>{item.label}</Text>
            {!on && item.count > 0 && (
              <Text style={{ fontFamily: font.bold, fontSize: fs(11), color: c.room.ink3 }}>{item.count}</Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

/** An open or set-down prayer (`.m2c-pr`). */
function PrayerCard({
  prayer,
  prayed,
  done,
  canWrite,
  onPrayed,
  onAnswered,
}: {
  prayer: PrayerRecord;
  prayed?: boolean;
  done?: boolean;
  canWrite: boolean;
  onPrayed?: () => void;
  onAnswered?: () => void;
}) {
  const { c, font, radius, fs } = useV2Theme();
  const { t } = useLanguage();
  return (
    <View
      style={{
        backgroundColor: done ? c.card.bg2 : c.card.bg,
        borderRadius: radius.tile,
        paddingHorizontal: 18,
        paddingVertical: 16,
      }}
    >
      <Kicker>{prayerCardKicker(prayer)}</Kicker>
      <Text
        style={{
          fontFamily: font.extra,
          fontSize: fs(16),
          lineHeight: fs(20.8),
          letterSpacing: -0.4,
          color: done ? c.card.ink2 : c.card.ink,
          marginTop: 10,
        }}
      >
        {prayer.burden}
      </Text>
      {!!prayer.answer && (
        <Text style={{ fontFamily: font.medium, fontSize: fs(14.5), lineHeight: fs(21.75), color: c.card.ink2, marginTop: 7 }}>
          {prayer.answer}
        </Text>
      )}

      {!done && canWrite && (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
          <Pressable
            onPress={() => !prayed && onPrayed?.()}
            disabled={prayed}
            style={({ pressed }) => ({
              flex: 1,
              minHeight: 46,
              borderRadius: 15,
              backgroundColor: prayed ? c.card.deep : c.card.tones.pray.band,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.75 : 1,
            })}
          >
            <Text style={{ fontFamily: font.bold, fontSize: fs(13.5), color: prayed ? c.card.onDeep : c.card.tones.pray.text }}>
              {prayed ? t('mobile.contact.prayed') : t('mobile.contact.i_prayed_just_now')}
            </Text>
          </Pressable>
          <Pressable
            onPress={onAnswered}
            style={({ pressed }) => ({
              minHeight: 46,
              paddingHorizontal: 18,
              borderRadius: 15,
              borderWidth: 1.5,
              borderColor: c.card.border,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Text style={{ fontFamily: font.bold, fontSize: fs(13.5), color: c.card.ink2 }}>{t('mobile.contact.answered')}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

/** Story's one disclosure (`.m2c-det`) — everything the old Overview tab held. */
function Details({
  contact,
  carerNames = [],
  teamMembers,
  uid,
  role,
  canEdit,
  canShare,
  onEdit,
  onOpenAddCollaborator,
  onRemoveCollaborator,
}: {
  contact: NonNullable<ReturnType<typeof useContactDetailData>['contact']>;
  carerNames: string[];
  teamMembers: AppUser[];
  uid?: string | null;
  role: string | null;
  canEdit?: boolean;
  canShare?: boolean;
  onEdit?: () => void;
  onOpenAddCollaborator?: () => void;
  onRemoveCollaborator?: (staffId: string, staffName: string) => void;
}) {
  const { c, font, radius, fs } = useV2Theme();
  const { t } = useLanguage();
  const knownMs = parseMs(contact.createdAt);
  const tags = contact.tags ?? [];

  const founders = contact.founders || [];
  const coCreators = contact.coCreators || [];
  const sharedWith = teamMembers.filter((m) => founders.includes(m.uid) || coCreators.includes(m.uid));
  const firstNameOnly = firstName(contact.name);

  const confirmRemoveCollaborator = (member: AppUser) => {
    Alert.alert(
      t('mobile.contact.remove_access'),
      t('mobile.contact.remove_access_confirm').replace('{name}', member.displayName || member.email),
      [
        { text: t('actions.cancel'), style: 'cancel' },
        {
          text: t('actions.remove'),
          style: 'destructive',
          onPress: () => onRemoveCollaborator?.(member.uid, member.displayName || member.email),
        },
      ],
    );
  };

  return (
    <View style={{ backgroundColor: c.card.bg, borderRadius: radius.tile, paddingHorizontal: 18, paddingTop: 6, paddingBottom: 14 }}>
      {!!contact.notes && (
        <View style={{ backgroundColor: c.card.note, borderRadius: radius.badge, padding: 14, marginTop: 14, marginBottom: 4 }}>
          <Kicker>{t('mobile.contact.first_impression')}</Kicker>
          <Translate
            text={contact.notes}
            style={{ fontFamily: font.semi, fontSize: fs(14), lineHeight: fs(20.3), color: c.card.noteInk, marginTop: 7 }}
          />
        </View>
      )}

      {tags.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 14, marginBottom: 4 }}>
          {tags.map((tag) => (
            <View key={tag} style={{ backgroundColor: c.card.note, borderRadius: radius.chip, paddingHorizontal: 13, paddingVertical: 7 }}>
              <Text style={{ fontFamily: font.bold, fontSize: fs(12), color: c.card.ink2 }}>{tag}</Text>
            </View>
          ))}
        </View>
      )}

      <DetailRow label={t('mobile.contact.phone')} value={contact.phone} onPress={() => openCall(contact.phone)} />
      <DetailRow label={t('mobile.contact.email')} value={contact.email} onPress={() => openEmail(contact.email)} />
      <DetailRow label={t('mobile.contact.instagram')} value={contact.instagram} />
      {/* #730: the "How we met" and "Address" rows are gone — the fields
          have been retired from the app. */}
      {carerNames.length > 0 && (
        <DetailRow label={t('mobile.contact.cared_for_by')} value={carerNames.join(', ')} />
      )}

      {/* ── Who else can see ────────────────────────────────────────── */}
      <View style={{ marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: c.card.line }}>
        <Text style={{ fontFamily: font.bold, fontSize: fs(13), color: c.card.ink3, marginBottom: 10 }}>
          {t('mobile.contact.who_else_can_see')}
        </Text>

        {sharedWith.length === 0 && (
          <Text style={{ fontFamily: font.semi, fontSize: fs(13), color: c.card.ink3, marginBottom: 6 }}>
            {t('mobile.contact.just_owner_for_now').replace('{name}', firstNameOnly)}
          </Text>
        )}

        <View style={{ gap: 8 }}>
          {sharedWith.map((member) => (
            <View
              key={member.uid}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                minHeight: 44,
                paddingVertical: 6,
                paddingHorizontal: 10,
                borderRadius: radius.note,
                backgroundColor: c.card.bg2,
              }}
            >
              <PersonMark name={member.displayName || member.email} id={member.uid} size={30} radius={15} fontSize={11} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: font.bold, fontSize: fs(13.5), color: c.card.ink }} numberOfLines={1}>
                  {member.displayName || member.email}
                </Text>
                <Text style={{ fontFamily: font.semi, fontSize: fs(11.5), color: c.card.ink3 }}>
                  {founders.includes(member.uid) ? t('mobile.contact.founder') : roleLabel(member.role)}
                </Text>
              </View>
              {canShare && canRemoveContactMember(role, uid, contact, member.uid) && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('mobile.contact.remove_access')}
                  hitSlop={8}
                  onPress={() => confirmRemoveCollaborator(member)}
                  style={({ pressed }) => ({
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    borderRadius: radius.badge,
                    opacity: pressed ? 0.6 : 1,
                  })}
                >
                  <Text style={{ fontFamily: font.bold, fontSize: fs(16), color: c.card.ink3 }}>×</Text>
                </Pressable>
              )}
            </View>
          ))}
        </View>

        {canShare && (
          <Pressable
            onPress={onOpenAddCollaborator}
            accessibilityRole="button"
            accessibilityLabel={t('mobile.contact.add_someone')}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 40,
              marginTop: 10,
              borderRadius: radius.note,
              borderWidth: 1,
              borderStyle: 'dashed',
              borderColor: c.card.border,
              backgroundColor: 'transparent',
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Text style={{ fontFamily: font.bold, fontSize: fs(13), color: c.card.link }}>
              + {t('mobile.contact.add_someone_lower')}
            </Text>
          </Pressable>
        )}
      </View>

      {canEdit && onEdit && (
        <Pressable
          onPress={onEdit}
          style={({ pressed }) => ({
            marginTop: 14,
            minHeight: 44,
            borderRadius: radius.note,
            backgroundColor: c.card.bg2,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Text style={{ fontFamily: font.bold, fontSize: fs(13), color: c.card.ink2 }}>
            {t('modals.contactDetails.edit_details') || 'Edit details'}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

function DetailRow({ label, value, onPress }: { label: string; value?: string | null; onPress?: () => void }) {
  const { c, font, fs } = useV2Theme();
  if (!value) return null;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 14,
        minHeight: 48,
        paddingVertical: 14,
        borderTopWidth: 1,
        borderTopColor: c.card.line,
        opacity: pressed && onPress ? 0.6 : 1,
      })}
    >
      <Text style={{ fontFamily: font.bold, fontSize: fs(13), color: c.card.ink3 }}>{label}</Text>
      <Text style={{ flex: 1, fontFamily: font.semi, fontSize: fs(14), color: onPress ? c.card.link : c.card.ink, textAlign: 'right' }}>
        {value}
      </Text>
    </Pressable>
  );
}
