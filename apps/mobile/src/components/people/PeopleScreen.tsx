// Mobile v2 — People. The design's `M2People` (views/mobile/screens.jsx):
// search, then the people in your care (longest since you talked, first) and
// everyone else (alphabetical, with who added them on the right).
//
// No stage-filter pills: in v2 the stages belong to The Journey, and People is
// a directory you look someone up in.
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from '../ui/SafeArea';
import {
  groupContactsByCreator,
  isPushedScreen,
  stageToneKey,
  touchWords,
  type Leader,
  type Stage,
} from '@cisa/core';
import { useAuth } from '../../lib/AuthProvider';
import { usePeopleData } from '../../lib/usePeopleData';
import { roomForRole, useV2Theme } from '../../theme/v2';
import { Kicker } from '../queue/atoms';
import { Room, V2Empty, V2Hint, V2Input, V2PersonRow, V2Screen } from '../v2/Widget';
import { Snackbar } from '../ui';
import { LogSheet } from '../log/LogSheet';
import { SkeletonList } from '../skeleton/SkeletonList';

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

function PersonRows({ rows, stages, own }: { rows: Leader[]; stages: Stage[]; own: boolean }) {
  const { c } = useV2Theme();
  const router = useRouter();
  return (
    <>
      {rows.map((leader) => (
        <V2PersonRow
          key={leader.contact.id}
          name={leader.contact.name}
          colorSeed={leader.contact.id}
          sub={subLine(leader)}
          dot={c.card.tones[stageToneKey(stages, leader.contact.stage)].dot}
          rightText={own ? touchWords(leader.days) : leader.contact.createdByName || '—'}
          onPress={() => router.push(`/contact/${leader.contact.id}`)}
        />
      ))}
    </>
  );
}

function People() {
  const { c } = useV2Theme();
  const router = useRouter();
  const { uid, role } = useAuth();
  const data = usePeopleData(uid);
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  // #358 — trainees can browse the whole team's People list by teammate.
  const [peopleView, setPeopleView] = useState<'people' | 'teammates'>('people');
  const visibleContacts = useMemo(
    () => [...data.mine.map((l) => l.contact), ...data.rest.map((l) => l.contact)],
    [data.mine, data.rest],
  );
  const creatorGroups = useMemo(() => groupContactsByCreator(visibleContacts), [visibleContacts]);
  const showTeammateToggle = role === 'manager';

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const nothing = data.mine.length === 0 && data.rest.length === 0 && creatorGroups.length === 0;

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

        {showTeammateToggle && (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
            {([
              ['people', 'People'],
              ['teammates', 'By teammate'],
            ] as const).map(([key, label]) => (
              <Pressable
                key={key}
                onPress={() => setPeopleView(key)}
                style={{
                  minHeight: 40,
                  paddingHorizontal: 14,
                  borderRadius: 999,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: peopleView === key ? c.room.chip : 'transparent',
                }}
              >
                <Text
                  style={{
                    fontFamily: 'System',
                    fontWeight: peopleView === key ? '700' : '500',
                    fontSize: 13,
                    color: peopleView === key ? c.room.ink : c.room.ink3,
                  }}
                >
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        {data.loading ? (
          <SkeletonList rows={7} style={{ marginTop: 20 }} />
        ) : data.error ? (
          <V2Empty>{data.error}</V2Empty>
        ) : nothing ? (
          <V2Empty>Nobody by that name. Try less of it.</V2Empty>
        ) : peopleView === 'teammates' ? (
          creatorGroups.length === 0 ? (
            <V2Empty>No teammates have added people yet.</V2Empty>
          ) : (
            creatorGroups.map((group) => (
              <View key={group.key} style={{ marginTop: 22, gap: 8 }}>
                <Kicker onRoom>{`${group.name} · ${group.contacts.length}`}</Kicker>
                {group.contacts.map((contact) => (
                  <V2PersonRow
                    key={contact.id}
                    name={contact.name}
                    colorSeed={contact.id}
                    sub={subLine({ contact, days: 0, note: '' })}
                    onPress={() => router.push(`/contact/${contact.id}`)}
                  />
                ))}
              </View>
            ))
          )
        ) : (
          <>
            {data.mine.length > 0 && (
              <View style={{ marginTop: 22, gap: 8 }}>
                <Kicker onRoom>{`In your care · ${data.mine.length}`}</Kicker>
                <V2Hint>Longest since you talked, first.</V2Hint>
                <PersonRows rows={data.mine} stages={data.stages} own />
              </View>
            )}
            {data.rest.length > 0 && (
              <View style={{ marginTop: 22, gap: 8 }}>
                <Kicker onRoom>{`Everyone else · ${data.rest.length}`}</Kicker>
                <PersonRows rows={data.rest} stages={data.stages} own={false} />
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

      {!!toast && <Snackbar message={toast} onDismiss={() => setToast(null)} />}
    </SafeAreaView>
  );
}
