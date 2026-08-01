// Mobile v2 — People. The design's `M2People` (views/mobile/screens.jsx):
// search, then the people in your care (longest since you talked, first) and
// everyone else (alphabetical, with who added them on the right).
//
// No stage-filter pills: in v2 the stages belong to The Journey, and People is
// a directory you look someone up in.
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
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
          dot={c.tones[stageToneKey(stages, leader.contact.stage)].dot}
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

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const nothing = data.mine.length === 0 && data.rest.length === 0;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.room }}>
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

        {data.loading ? (
          <ActivityIndicator color={c.roomInk2} style={{ marginTop: 28 }} />
        ) : data.error ? (
          <V2Empty>{data.error}</V2Empty>
        ) : nothing ? (
          <V2Empty>Nobody by that name. Try less of it.</V2Empty>
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
          (`init.start`) — v2 has no separate add-contact form. The fuller one
          (email, phone, stage, tags) stays on the desktop site, as this
          screen's own roster foot says. */}
      <LogSheet
        visible={showAddSheet}
        room={roomForRole(role)}
        start="new"
        onSaved={setToast}
        onClose={() => setShowAddSheet(false)}
      />

      {!!toast && <Snackbar message={toast} onDismiss={() => setToast(null)} />}
    </SafeAreaView>
  );
}
