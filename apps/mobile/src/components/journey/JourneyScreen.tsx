// Mobile v2 — The Journey. The design's `M2Journey` (views/mobile/screens.jsx):
// the kanban as a horizontal step picker, then the people standing at that
// step — yours first — each with a "Move a step" of their own.
//
// Trainee-shaped, as the design specifies: read plus one care action. Adding
// someone and editing the stage list itself stay off this screen.
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from '../ui/SafeArea';
import {
  firstName,
  isPushedScreen,
  stageToneKey,
  touchWords,
  type Contact,
  type Leader,
  type StageToneKey,
} from '@cisa/core';
import { useAuth } from '../../lib/AuthProvider';
import { useJourneyData, type JourneyTab } from '../../lib/useJourneyData';
import { moveContactStage } from '../../lib/data/contacts';
import { roomForRole, useV2Theme } from '../../theme/v2';
import { Room, V2Empty, V2PersonRow, V2RowCard, V2Screen } from '../v2/Widget';
import { MoveStepSheet } from './MoveStepSheet';
import { SkeletonList } from '../skeleton/SkeletonList';

export function JourneyScreen() {
  const { role } = useAuth();
  return (
    <Room room={roomForRole(role)}>
      <Journey />
    </Room>
  );
}

/** One step in the horizontal picker — dot · name · how many stand there. */
function StepPill({
  tab,
  tone,
  active,
  onPress,
  onLayout,
}: {
  tab: JourneyTab;
  tone: StageToneKey;
  active: boolean;
  onPress: () => void;
  onLayout: (x: number) => void;
}) {
  const { c, font, fs } = useV2Theme();
  // `.m2j-step`: the dot rides ABOVE the label, and the chosen step inverts —
  // near-white on the night room, near-black on paper. A tint difference alone
  // is invisible in the dark rooms.
  return (
    <Pressable
      onPress={onPress}
      onLayout={(e) => onLayout(e.nativeEvent.layout.x)}
      style={({ pressed }) => ({
        minHeight: 56,
        justifyContent: 'center',
        paddingVertical: 11,
        paddingHorizontal: 14,
        borderRadius: 16,
        backgroundColor: active ? c.card.inverse : c.card.bg2,
        opacity: pressed ? 0.75 : 1,
      })}
    >
      <View
        style={{
          width: 8,
          height: 8,
          borderRadius: 3,
          backgroundColor: c.card.tones[tone].dot,
          opacity: active ? 1 : 0.55,
        }}
      />
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 7, marginTop: 8 }}>
        <Text style={{ fontFamily: font.bold, fontSize: fs(13.5), color: active ? c.card.onInverse : c.card.ink2 }}>
          {tab.label}
        </Text>
        <Text style={{ fontFamily: font.extra, fontSize: fs(12), color: active ? c.card.onInverse : c.card.ink3 }}>
          {tab.count}
        </Text>
      </View>
    </Pressable>
  );
}

function Journey() {
  const { c, font, fs } = useV2Theme();
  const router = useRouter();
  const { user, uid, role } = useAuth();
  const data = useJourneyData(uid);
  const [moving, setMoving] = useState<Contact | null>(null);

  // Keep the chosen step in view. The design's note: set scrollLeft directly —
  // scrollIntoView fights the shell's own scrolling.
  const strip = useRef<ScrollView>(null);
  const offsets = useRef<Record<number, number>>({});
  useEffect(() => {
    const x = offsets.current[data.activeIndex];
    if (x != null) strip.current?.scrollTo({ x: Math.max(0, x - 12), animated: true });
  }, [data.activeIndex]);

  const handleMove = async (_contactId: string, newStageLabel: string) => {
    if (!moving) return;
    await moveContactStage(moving, newStageLabel, { uid, name: user?.displayName });
  };

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const noteFor = (leader: Leader) =>
    data.personalContactIds.has(leader.contact.id)
      ? 'In your care'
      : leader.contact.createdByName
        ? `${firstName(leader.contact.createdByName)} added them`
        : undefined;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.room.bg }}>
      <V2Screen
        title="The Journey"
        note={`${data.totalCount} ${data.totalCount === 1 ? 'person' : 'people'}`}
        onBack={isPushedScreen(role, 'journey') ? back : undefined}
      >
        <Text style={{ fontFamily: font.semi, fontSize: fs(14), lineHeight: fs(20), color: c.room.ink2, marginBottom: 14 }}>
          From a first hello toward a church home. Nobody walks it on a schedule.
        </Text>

        <ScrollView
          ref={strip}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingRight: 14 }}
        >
          {data.tabs.map((tab, i) => (
            <StepPill
              key={tab.id}
              tab={tab}
              tone={stageToneKey(data.mobileStages, tab.label)}
              active={i === data.activeIndex}
              onPress={() => data.setActiveIndex(i)}
              onLayout={(x) => {
                offsets.current[i] = x;
              }}
            />
          ))}
        </ScrollView>

        <View style={{ marginTop: 16 }}>
          {data.loading ? (
            <SkeletonList rows={4} style={{ marginTop: 20 }} />
          ) : data.error ? (
            <V2Empty>{data.error}</V2Empty>
          ) : data.items.length === 0 ? (
            <V2Empty>Nobody here right now.</V2Empty>
          ) : (
            data.items.map((leader) => (
              <V2RowCard key={leader.contact.id} action="Move a step" onAction={() => setMoving(leader.contact)}>
                <V2PersonRow
                  flat
                  name={leader.contact.name}
                  colorSeed={leader.contact.id}
                  sub={[leader.contact.year, leader.contact.major].filter(Boolean).join(' · ') || undefined}
                  note={noteFor(leader)}
                  dot={c.card.tones[stageToneKey(data.mobileStages, leader.contact.stage)].dot}
                  rightText={touchWords(leader.days)}
                  onPress={() => router.push(`/contact/${leader.contact.id}`)}
                />
              </V2RowCard>
            ))
          )}
        </View>
      </V2Screen>

      <MoveStepSheet
        visible={!!moving}
        contact={moving}
        stages={data.mobileStages}
        room={roomForRole(role)}
        onMove={handleMove}
        onClose={() => setMoving(null)}
      />
    </SafeAreaView>
  );
}
