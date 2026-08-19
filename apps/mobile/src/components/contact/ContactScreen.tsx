// Mobile v2 — the person screen. The design's `M2Contact`
// (views/mobile/contact.jsx): a back row, a white hero, Text / Call / Log, then
// segmented Story · Prayers · Alongside. The only deep screen the queue links
// into, and the last one in the app still wearing the Material language.
//
// The design's three tabs are all there is: Discussion (team comments), the
// per-contact History timeline and the admin edit form have no counterpart here
// and are desktop work now — see MIGRATION.md. Contact details survive as
// Story's "Details, notes, how to reach them" disclosure, read-only.
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from '../ui/SafeArea';
import {
  composeKindsFor,
  contactCareLine,
  contactConnectedLine,
  countFor,
  daysSince,
  firstName,
  interactionSnippet,
  isTrainee,
  lastTimeLine,
  mergedContactThread,
  parseMs,
  prayerCardKicker,
  splitContactPrayers,
  stageToneKey,
  storyRowLine,
  threadsFor,
  type Interaction,
  type PrayerRecord,
  type ThreadKind,
} from '@cisa/core';
import { useAuth } from '../../lib/AuthProvider';
import { useContactDetailData } from '../../lib/useContactDetailData';
import { prayerCardId } from '../../lib/useFtHomeData';
import { useQueueState } from '../../lib/queueState';
import { openCall, openEmail, openMessage } from '../../lib/messaging';
import { roomForRole, useV2Theme } from '../../theme/v2';
import { Kicker, PersonMark, PrimaryButton } from '../queue/atoms';
import { Room, V2Empty, V2Seg } from '../v2/Widget';
import { ContactSkeleton } from '../skeleton/ContactSkeleton';
import { SkeletonList } from '../skeleton/SkeletonList';
import { Snackbar } from '../ui';
import { LogSheet } from '../log/LogSheet';
import { ContactPrayerSheet } from './ContactPrayerSheet';
import { ThreadCompose } from './ThreadCompose';
import { ThreadMessageRow } from './ThreadMessageRow';

export type ContactV2Tab = 'story' | 'prayers' | 'alongside';

interface ContactScreenProps {
  contactId: string;
  initialTab: ContactV2Tab;
  /** A deep link into one logged conversation's own thread (a queue card's
   * "Open the conversation"), which opens Story with that card unfolded. */
  initialInteractionId?: string | null;
}

export function ContactScreen(props: ContactScreenProps) {
  const { role } = useAuth();
  return (
    <Room room={roomForRole(role)}>
      <Person {...props} />
    </Room>
  );
}

function Person({ contactId, initialTab, initialInteractionId }: ContactScreenProps) {
  const { c, font, radius, shadow, fs } = useV2Theme();
  const router = useRouter();
  const { uid, role } = useAuth();
  const data = useContactDetailData(contactId);
  const queueState = useQueueState(uid ?? null);

  const [tab, setTab] = useState<ContactV2Tab>(initialTab);
  const [openStoryId, setOpenStoryId] = useState<string | null>(initialInteractionId ?? null);
  const [showDetails, setShowDetails] = useState(false);
  const [sheet, setSheet] = useState<'log' | 'pray' | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const canWrite = role !== 'viewer';
  const kinds = useMemo(() => composeKindsFor(!isTrainee(uid)), [uid]);

  // Newest first, and the newest is what the hero quotes.
  const story = useMemo(() => [...data.interactions].reverse(), [data.interactions]);
  const lastTouchDays = useMemo(() => {
    const newest = story
      .map((i) => parseMs(i.dateTime) ?? parseMs(i.createdAt))
      .filter((ms): ms is number => ms !== null)
      .sort((a, b) => b - a)[0];
    return newest === undefined ? null : daysSince(newest);
  }, [story]);
  const alongside = useMemo(() => mergedContactThread(data.threadMessages), [data.threadMessages]);
  const { open: openPrayers, closed: closedPrayers } = useMemo(
    () => splitContactPrayers(data.prayers),
    [data.prayers],
  );

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const post = (interactionId: string | null) => (input: { kind: ThreadKind; body: string }) =>
    void data.postThreadMessage({ interactionId, ...input });

  if (data.error || (!data.loading && !data.contact)) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.room.bg }}>
        <BackRow onBack={back} note="" />
        <View style={{ paddingHorizontal: 14 }}>
          <V2Empty>{data.error || "We can't find this person."}</V2Empty>
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
  const first = firstName(contact.name);
  const lastTime = lastTimeLine(story[0]);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.room.bg }}>
      <BackRow onBack={back} note={contactCareLine(data.inYourCare, contact.createdByName)} />

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 30 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
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
          </View>

          {!!lastTime && (
            <Text style={{ fontFamily: font.medium, fontSize: fs(14.5), lineHeight: fs(21), color: c.card.ink2, marginTop: 10 }}>
              {lastTime}
            </Text>
          )}

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 18 }}>
            <HeroAction label="Text" disabled={!contact.phone} onPress={() => openMessage(contact.phone)} />
            <HeroAction label="Call" disabled={!contact.phone} onPress={() => openCall(contact.phone)} />
            {canWrite && <HeroAction label="Log" dark onPress={() => setSheet('log')} />}
          </View>
        </View>

        <V2Seg
          value={tab}
          onChange={setTab}
          items={[
            { id: 'story', label: 'Story', count: story.length },
            { id: 'prayers', label: 'Prayers', count: openPrayers.length },
            { id: 'alongside', label: 'Alongside', count: alongside.length },
          ]}
        />

        {/* ── Story ────────────────────────────────────────────────────── */}
        {tab === 'story' && (
          <View style={{ gap: 10 }}>
            {data.interactionsLoading ? (
              <SkeletonList rows={3} avatar={false} style={{ marginTop: 20 }} />
            ) : story.length === 0 ? (
              <V2Empty>{`Nothing logged with ${first} yet. Even a text counts.`}</V2Empty>
            ) : (
              story.map((interaction) => (
                <StoryCard
                  key={interaction.id}
                  interaction={interaction}
                  meUid={uid ?? ''}
                  threadCount={countFor(data.threadMessages, interaction.id)}
                  open={openStoryId === interaction.id}
                  onToggle={() => setOpenStoryId(openStoryId === interaction.id ? null : interaction.id)}
                >
                  {threadsFor(data.threadMessages, interaction.id).map((m) => (
                    <ThreadMessageRow
                      key={m.id}
                      message={m}
                      meUid={uid ?? ''}
                      nested
                      canReact={canWrite}
                      onToggleReaction={data.toggleReaction}
                    />
                  ))}
                  {canWrite && <ThreadCompose kinds={kinds} onPost={post(interaction.id)} />}
                </StoryCard>
              ))
            )}

            <Pressable
              onPress={() => setShowDetails(!showDetails)}
              style={({ pressed }) => ({ minHeight: 44, justifyContent: 'center', paddingHorizontal: 4, opacity: pressed ? 0.6 : 1 })}
            >
              <Text style={{ fontFamily: font.bold, fontSize: fs(13.5), color: c.room.ink2 }}>
                {showDetails ? 'Hide the details' : 'Details, notes, how to reach them'}
              </Text>
            </Pressable>

            {showDetails && (
              <Details
                contact={contact}
                careLine={contactCareLine(data.inYourCare, contact.createdByName)}
              />
            )}
          </View>
        )}

        {/* ── Prayers ──────────────────────────────────────────────────── */}
        {tab === 'prayers' && (
          <View style={{ gap: 10 }}>
            {canWrite && <PrimaryButton title={`Pray for ${first}`} tone="deep" onPress={() => setSheet('pray')} />}

            {data.prayersLoading ? (
              <SkeletonList rows={3} style={{ marginTop: 20 }} />
            ) : data.prayers.length === 0 ? (
              <V2Empty>Nothing written down yet.</V2Empty>
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
                  Looking back
                </Kicker>
                {closedPrayers.map((prayer) => (
                  <PrayerCard key={prayer.id} prayer={prayer} done canWrite={false} />
                ))}
              </>
            )}
          </View>
        )}

        {/* ── Alongside ────────────────────────────────────────────────── */}
        {tab === 'alongside' && (
          <View style={{ gap: 10 }}>
            <V2Empty>
              {alongside.length === 0
                ? `Nothing here yet. Ask a question about ${first} — someone will answer.`
                : `Thinking out loud about ${first}, together.`}
            </V2Empty>
            {alongside.map((m) => (
              <ThreadMessageRow
                key={m.id}
                message={m}
                meUid={uid ?? ''}
                about={
                  m.interactionId
                    ? interactionSnippet(story.find((i) => i.id === m.interactionId))
                    : null
                }
                canReact={canWrite}
                onToggleReaction={data.toggleReaction}
              />
            ))}
            {canWrite && <ThreadCompose kinds={kinds} onPost={post(null)} minHeight={104} onRoom />}
          </View>
        )}
      </ScrollView>

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

      {!!toast && <Snackbar message={toast} onDismiss={() => setToast(null)} />}
    </SafeAreaView>
  );
}

/** The design's `.m2-ch` on this screen: back, then who's looking after them. */
function BackRow({ onBack, note }: { onBack: () => void; note: string }) {
  const { c, font, fs } = useV2Theme();
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
        <Text style={{ fontFamily: font.bold, fontSize: fs(13), color: c.room.ink2 }}>← Back</Text>
      </Pressable>
      {!!note && (
        <Text style={{ fontFamily: font.semi, fontSize: fs(12), color: c.room.ink3, marginLeft: 'auto' }} numberOfLines={1}>
          {note}
        </Text>
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

/** One logged conversation (`.m2c-cv`), unfolding into its own thread.
 *
 * The design's mock splits a conversation into a short `title` and a `body`; an
 * `Interaction` here has one `content` field of the staffer's own prose, so the
 * card is the kicker line and then what they wrote. */
function StoryCard({
  interaction,
  meUid,
  threadCount,
  open,
  onToggle,
  children,
}: {
  interaction: Interaction;
  meUid: string;
  threadCount: number;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const { c, font, radius, fs } = useV2Theme();
  return (
    <View style={{ backgroundColor: c.card.bg, borderRadius: radius.tile, paddingHorizontal: 18, paddingVertical: 16 }}>
      <Kicker>{storyRowLine(interaction, meUid)}</Kicker>
      <Text style={{ fontFamily: font.medium, fontSize: fs(14.5), lineHeight: fs(21.75), color: c.card.said, marginTop: 10 }}>
        {interaction.content}
      </Text>

      <Pressable
        onPress={onToggle}
        style={({ pressed }) => ({ minHeight: 44, justifyContent: 'flex-end', paddingTop: 14, paddingBottom: 2, opacity: pressed ? 0.6 : 1 })}
      >
        <Text style={{ fontFamily: font.bold, fontSize: fs(13), color: c.card.link }}>
          {open ? 'Hide' : threadCount ? `Alongside · ${threadCount}` : 'Think this through together'}
        </Text>
      </Pressable>

      {open && (
        <View style={{ borderTopWidth: 1, borderTopColor: c.card.line, marginTop: 8, paddingTop: 14, gap: 10 }}>
          {children}
        </View>
      )}
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
              {prayed ? 'Prayed ✓' : 'I prayed just now'}
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
            <Text style={{ fontFamily: font.bold, fontSize: fs(13.5), color: c.card.ink2 }}>Answered</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

/** Story's one disclosure (`.m2c-det`) — everything the old Overview tab held,
 * read-only. Tag editing went with the edit form; both live on the desk now. */
function Details({
  contact,
  careLine,
}: {
  contact: NonNullable<ReturnType<typeof useContactDetailData>['contact']>;
  careLine: string;
}) {
  const { c, font, radius, fs } = useV2Theme();
  const knownMs = parseMs(contact.createdAt);
  const tags = contact.tags ?? [];

  return (
    <View style={{ backgroundColor: c.card.bg, borderRadius: radius.tile, paddingHorizontal: 18, paddingTop: 6, paddingBottom: 12 }}>
      {!!contact.notes && (
        <View style={{ backgroundColor: c.card.note, borderRadius: radius.badge, padding: 14, marginTop: 14, marginBottom: 4 }}>
          <Kicker>First impression</Kicker>
          <Text style={{ fontFamily: font.semi, fontSize: fs(14), lineHeight: fs(20.3), color: c.card.noteInk, marginTop: 7 }}>
            {contact.notes}
          </Text>
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

      <DetailRow label="Phone" value={contact.phone} onPress={() => openCall(contact.phone)} />
      <DetailRow label="Email" value={contact.email} onPress={() => openEmail(contact.email)} />
      <DetailRow label="Instagram" value={contact.instagram} />
      {/* "How we met" (#356) — replaces the old "First met / lives" reading of
          the dual-purpose location field. The address stays on `location` for
          the v2 log sheet's "Where you met". */}
      <DetailRow label="How we met" value={contact.metVia} />
      <DetailRow label="Address" value={contact.location} />
      {/* The two fields the log sheet's "Fill in the rest" adds — the design
          asks that they have somewhere to be read. `role` is this app's
          contact group, which the sheet labels "Part of". */}
      <DetailRow label="Part of" value={contact.role} />
      <DetailRow label="Faith, so far" value={contact.spiritualBackground} />
      <DetailRow label="Goes by" value={contact.pronouns} />
      <DetailRow label="Known" value={knownMs === null ? null : `${daysSince(knownMs)} days`} />
      <DetailRow label="Cared for by" value={careLine === 'In your care' ? 'You' : contact.createdByName} />
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
