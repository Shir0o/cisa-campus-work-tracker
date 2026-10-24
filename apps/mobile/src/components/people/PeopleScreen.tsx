// Mobile v2 — People. The design's `M2People` (views/mobile/screens.jsx):
// search, then the people in your care (longest since you talked, first) and
// everyone else (alphabetical, with who added them on the right).
//
// Under the search sit the Step pills (ADR 0047): on the phone The Journey is
// People narrowed by Step. *Everyone* is the directory; any other pill is the
// old Journey, each row with a "Move a step". Trainees and up only — below
// that, People is just *Everyone*.
import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from '../ui/SafeArea';
import {
  canAccessRoute,
  EVERYONE_PILL,
  isPushedScreen,
  isUnplaced,
  stageToneKey,
  touchWords,
  UNPLACED_PILL,
  type Contact,
  type Leader,
  type Stage,
} from '@cisa/core';
import { useAuth } from '../../lib/AuthProvider';
import { useLanguage } from '../../lib/LanguageProvider';
import { usePeopleData } from '../../lib/usePeopleData';
import { moveContactStage } from '../../lib/data/contacts';
import { roomForRole, useV2Theme } from '../../theme/v2';
import { Kicker } from '../queue/atoms';
import { Room, V2Empty, V2Hint, V2Input, V2PersonRow, V2RowCard, V2Screen } from '../v2/Widget';
import { Snackbar } from '../ui';
import { LogSheet } from '../log/LogSheet';
import { MoveStepSheet, type JourneyStage } from '../journey/MoveStepSheet';
import { SkeletonList } from '../skeleton/SkeletonList';
import { StepPills } from './StepPills';

export function PeopleScreen() {
  const { role } = useAuth();
  return (
    <Room room={roomForRole(role)}>
      <People />
    </Room>
  );
}

const subLine = (leader: Leader) =>
  [leader.contact.year, leader.contact.major].filter(Boolean).join(' · ') || undefined;

/** `onMove` is set only while a Step pill is on: each row then sits in a card
 * with its own "Move a step", as on the old Journey. */
function PersonRows({
  rows,
  stages,
  own,
  onMove,
}: {
  rows: Leader[];
  stages: Stage[];
  own: boolean;
  onMove?: (contact: Contact) => void;
}) {
  const { c } = useV2Theme();
  const router = useRouter();
  return (
    <>
      {rows.map((leader) => {
        const row = (
          <V2PersonRow
            key={leader.contact.id}
            flat={!!onMove}
            name={leader.contact.name}
            colorSeed={leader.contact.id}
            sub={subLine(leader)}
            dot={c.card.tones[stageToneKey(stages, leader.contact.stage)].dot}
            rightText={own ? touchWords(leader.days) : leader.contact.createdByName || '—'}
            onPress={() => router.push(`/contact/${leader.contact.id}`)}
          />
        );
        return onMove ? (
          <V2RowCard key={leader.contact.id} action="Move a step" onAction={() => onMove(leader.contact)}>
            {row}
          </V2RowCard>
        ) : (
          row
        );
      })}
    </>
  );
}

const UNASSIGNED: JourneyStage = { id: 'uncategorized', label: 'Unassigned' };

function People() {
  const { c } = useV2Theme();
  const router = useRouter();
  const { user, uid, role } = useAuth();
  const { t } = useLanguage();
  const data = usePeopleData(uid, role);
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [moving, setMoving] = useState<Contact | null>(null);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const nothing = data.mine.length === 0 && data.rest.length === 0;

  // The pills and Move follow who may see The Journey.
  const byStep = canAccessRoute(role, '/board');
  const onMove = byStep && data.pillId !== EVERYONE_PILL ? setMoving : undefined;
  const pills = data.pills.map((p) =>
    p.id === EVERYONE_PILL
      ? { ...p, label: t('mobile.people.everyone') }
      : p.id === UNPLACED_PILL
        ? { ...p, label: t('mobile.people.not_on_a_step') }
        : p,
  );
  // Someone on no step gets "Unassigned" in the sheet, marked "now".
  const moveStages: JourneyStage[] =
    moving && isUnplaced(moving, data.stages) ? [UNASSIGNED, ...data.stages] : data.stages;

  const handleMove = async (_contactId: string, newStageLabel: string) => {
    if (!moving) return;
    await moveContactStage(moving, newStageLabel, { uid, name: user?.displayName });
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.room.bg }}>
      <V2Screen
        title="People"
        action={role !== 'viewer' ? { label: '＋ New', onPress: () => setShowAddSheet(true) } : undefined}
        onBack={isPushedScreen(role, 'people') ? back : undefined}
      >
        <V2Input
          value={data.search}
          onChangeText={data.setSearch}
          placeholder="Find someone by name, major, hall…"
        />

        {byStep && !data.loading && !data.error && (
          <StepPills pills={pills} stages={data.stages} activeId={data.pillId} onSelect={data.setPillId} />
        )}

        {data.loading ? (
          <SkeletonList rows={7} style={{ marginTop: 20 }} />
        ) : data.error ? (
          <V2Empty>{data.error}</V2Empty>
        ) : nothing ? (
          <V2Empty>
            {data.search.trim() || data.pillId === EVERYONE_PILL
              ? 'Nobody by that name. Try less of it.'
              : 'Nobody here right now.'}
          </V2Empty>
        ) : (
          <>
            {data.mine.length > 0 && (
              <View style={{ marginTop: 22, gap: 8 }}>
                <Kicker onRoom>{`In your care · ${data.mine.length}`}</Kicker>
                <V2Hint>Longest since you talked, first.</V2Hint>
                <PersonRows rows={data.mine} stages={data.stages} own onMove={onMove} />
              </View>
            )}
            {data.rest.length > 0 && (
              <View style={{ marginTop: 22, gap: 8 }}>
                <Kicker onRoom>{`Everyone else · ${data.rest.length}`}</Kicker>
                <PersonRows rows={data.rest} stages={data.stages} own={false} onMove={onMove} />
              </View>
            )}
          </>
        )}
      </V2Screen>

      {/* The design's ＋ New opens the log sheet straight in *Someone new*
          (`init.start`) — v2 has no separate add-contact form. The fuller
          picture now folds out of the sheet's own "Fill in the rest". */}
      <LogSheet
        visible={showAddSheet}
        room={roomForRole(role)}
        start="new"
        onSaved={setToast}
        onOpenContact={(id) => router.push(`/contact/${id}`)}
        onClose={() => setShowAddSheet(false)}
      />

      <MoveStepSheet
        visible={!!moving}
        contact={moving}
        stages={moveStages}
        room={roomForRole(role)}
        onMove={handleMove}
        onClose={() => setMoving(null)}
      />

      {!!toast && <Snackbar message={toast} onDismiss={() => setToast(null)} />}
    </SafeAreaView>
  );
}
