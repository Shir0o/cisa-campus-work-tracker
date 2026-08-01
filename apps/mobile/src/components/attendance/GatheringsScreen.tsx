// Mobile v2 — Gatherings. The design's `M2Gatherings`
// (views/mobile/screens.jsx): absence turned into care first, then the sessions
// we've had (each opening its roster in place), then what's coming.
//
// Trainee-shaped, as the design specifies: no hero figures, no type filter, no
// export. Adding or removing a gathering stays on the desktop site — the foot
// of an open roster says so.
import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { format, isValid } from 'date-fns';
import { firstName, type Contact, type Event, type MissedContact } from '@cisa/core';
import { useAuth } from '../../lib/AuthProvider';
import { useAttendanceData } from '../../lib/useAttendanceData';
import { roomForRole, useV2Theme } from '../../theme/v2';
import { Kicker } from '../queue/atoms';
import { V2DateBox } from '../v2/DateBox';
import { Room, V2Empty, V2Hint, V2PersonRow, V2RowCard, V2Screen } from '../v2/Widget';

/** How many sessions show before "Show earlier". The design's own number. */
const FIRST_PAGE = 5;

export function GatheringsScreen() {
  const { role } = useAuth();
  return (
    <Room room={roomForRole(role)}>
      <Gatherings />
    </Room>
  );
}

/** One name in an open roster. Tapping it cycles present → late → absent. */
function RosterName({
  contact,
  session,
  status,
  canMark,
  onCycle,
}: {
  contact: Contact;
  session: Event;
  status: 'present' | 'late' | 'absent';
  canMark: boolean;
  onCycle: () => void;
}) {
  const { c, font, radius } = useV2Theme();
  const tone = status === 'late' ? c.tones.due : status === 'present' ? c.tones.note : undefined;
  return (
    <Pressable
      onPress={onCycle}
      disabled={!canMark}
      accessibilityLabel={`${contact.name}, ${status} at ${session.name}`}
      style={({ pressed }) => ({
        minHeight: 44,
        justifyContent: 'center',
        paddingHorizontal: 13,
        borderRadius: radius.chip,
        backgroundColor: tone ? tone.band : 'transparent',
        borderWidth: tone ? 0 : 1,
        borderColor: c.border,
        opacity: pressed ? 0.65 : 1,
      })}
    >
      <Text style={{ fontFamily: font.semi, fontSize: 13, color: tone ? tone.text : c.cardInk2 }}>
        {contact.name}
        {status === 'late' ? ' · late' : ''}
      </Text>
    </Pressable>
  );
}

function SessionRow({
  session,
  contacts,
  isHere,
  open,
  canMark,
  onToggle,
  onCycle,
}: {
  session: Event;
  contacts: Contact[];
  isHere: (contact: Contact, eventId: string) => boolean;
  open: boolean;
  canMark: boolean;
  onToggle: () => void;
  onCycle: (contact: Contact) => void;
}) {
  const { c, font, radius } = useV2Theme();
  const came = contacts.filter((x) => isHere(x, session.id));
  const away = contacts.filter((x) => x.attendance?.[session.id] === 'absent');
  const d = new Date(session.date);

  return (
    <View style={{ backgroundColor: c.card, borderRadius: radius.tile, marginTop: 9, overflow: 'hidden' }}>
      <Pressable
        onPress={onToggle}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: 13,
          minHeight: 64,
          paddingVertical: 14,
          paddingHorizontal: 16,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <View style={{ width: 44, alignItems: 'center' }}>
          <Text style={{ fontFamily: font.extra, fontSize: 13, color: c.cardInk }}>
            {isValid(d) ? format(d, 'EEE') : '—'}
          </Text>
          <Text style={{ fontFamily: font.bold, fontSize: 11.5, color: c.cardInk3, marginTop: 2 }}>
            {isValid(d) ? format(d, 'MMM d') : ''}
          </Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ fontFamily: font.extra, fontSize: 15, letterSpacing: -0.3, color: c.cardInk }}>
            {session.name}
          </Text>
          {!!session.type && (
            <Text numberOfLines={1} style={{ fontFamily: font.semi, fontSize: 12.5, color: c.cardInk3, marginTop: 2 }}>
              {[session.type, session.location].filter(Boolean).join(' · ')}
            </Text>
          )}
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ fontFamily: font.extra, fontSize: 16, color: c.cardInk }}>{came.length}</Text>
          <Text style={{ fontFamily: font.semi, fontSize: 11, color: c.cardInk3 }}>came</Text>
        </View>
      </Pressable>

      {open && (
        <View style={{ paddingHorizontal: 16, paddingBottom: 16, gap: 10 }}>
          <Text style={{ fontFamily: font.medium, fontSize: 12.5, lineHeight: 18, color: c.cardInk3 }}>
            {canMark
              ? 'Tap a name to change it — came, late, missed.'
              : 'Marking the roster is a full-timer or trainee job.'}
          </Text>

          <Kicker>{`Came · ${came.length}`}</Kicker>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
            {came.length === 0 && (
              <Text style={{ fontFamily: font.semi, fontSize: 13, color: c.cardInk3 }}>Nobody marked yet.</Text>
            )}
            {came.map((x) => (
              <RosterName
                key={x.id}
                contact={x}
                session={session}
                status={x.attendance?.[session.id] === 'late' ? 'late' : 'present'}
                canMark={canMark}
                onCycle={() => onCycle(x)}
              />
            ))}
          </View>

          <Kicker>{`We missed · ${away.length}`}</Kicker>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
            {away.length === 0 && (
              <Text style={{ fontFamily: font.semi, fontSize: 13, color: c.cardInk3 }}>Nobody marked absent.</Text>
            )}
            {away.map((x) => (
              <RosterName
                key={x.id}
                contact={x}
                session={session}
                status="absent"
                canMark={canMark}
                onCycle={() => onCycle(x)}
              />
            ))}
          </View>

          <Text style={{ fontFamily: font.medium, fontSize: 12, lineHeight: 17, color: c.cardInk3, marginTop: 2 }}>
            Adding or removing a gathering happens on the desktop site.
          </Text>
        </View>
      )}
    </View>
  );
}

function Gatherings() {
  const { c, font } = useV2Theme();
  const router = useRouter();
  const { uid, user, role } = useAuth();
  const data = useAttendanceData(uid, user?.displayName ?? null, role);
  const [openSession, setOpenSession] = useState<string | null>(null);
  const [showEarlier, setShowEarlier] = useState(false);

  const shown = showEarlier ? data.sessions : data.sessions.slice(0, FIRST_PAGE);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const textThem = (contact: Contact) => {
    const number = (contact.phone || '').replace(/[^\d+]/g, '');
    if (number) void Linking.openURL(`sms:${number}`);
  };

  const missedNote = ({ lastSeen }: MissedContact) => `Last with us at ${lastSeen.name}`;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.room }}>
      <V2Screen title="Gatherings" onBack={back}>
        {data.loading ? (
          <ActivityIndicator color={c.roomInk2} style={{ marginTop: 28 }} />
        ) : data.error ? (
          <V2Empty>{data.error}</V2Empty>
        ) : (
          <>
            {data.missed.length > 0 && (
              <View style={{ gap: 8 }}>
                <Kicker onRoom>Who we&apos;ve missed</Kicker>
                <V2Hint>Two gatherings or more without them. A text is enough.</V2Hint>
                {data.missed.map((m) => (
                  <V2RowCard
                    key={m.contact.id}
                    action={m.contact.phone ? `Send ${firstName(m.contact.name)} a text` : undefined}
                    onAction={() => textThem(m.contact)}
                  >
                    <V2PersonRow
                      flat
                      name={m.contact.name}
                      colorSeed={m.contact.id}
                      sub={[m.contact.year, m.contact.major].filter(Boolean).join(' · ') || undefined}
                      note={missedNote(m)}
                      rightText={`${m.since} missed`}
                      onPress={() => router.push(`/contact/${m.contact.id}`)}
                    />
                  </V2RowCard>
                ))}
              </View>
            )}

            <View style={{ marginTop: data.missed.length > 0 ? 22 : 0 }}>
              <Kicker onRoom>When we gathered</Kicker>
              {shown.length === 0 ? (
                <V2Empty>No gatherings logged yet.</V2Empty>
              ) : (
                shown.map((session) => (
                  <SessionRow
                    key={session.id}
                    session={session}
                    contacts={data.contacts}
                    isHere={data.here}
                    open={openSession === session.id}
                    canMark={data.canTakeAttendance}
                    onToggle={() => setOpenSession(openSession === session.id ? null : session.id)}
                    onCycle={(contact) => void data.cycleAttendance(contact, session.id)}
                  />
                ))
              )}
              {data.sessions.length > FIRST_PAGE && (
                <Pressable
                  onPress={() => setShowEarlier((v) => !v)}
                  style={({ pressed }) => ({
                    minHeight: 44,
                    justifyContent: 'center',
                    alignItems: 'center',
                    marginTop: 10,
                    opacity: pressed ? 0.6 : 1,
                  })}
                >
                  <Text style={{ fontFamily: font.bold, fontSize: 13, color: c.roomInk2 }}>
                    {showEarlier ? 'Show less' : `Show earlier · ${data.sessions.length - FIRST_PAGE} more`}
                  </Text>
                </Pressable>
              )}
            </View>

            <View style={{ marginTop: 22 }}>
              {data.upcoming.length === 0 ? (
                <>
                  <Kicker onRoom>Coming up</Kicker>
                  <V2Empty>Nothing on the calendar just yet.</V2Empty>
                </>
              ) : (
                <V2DateBox
                  label="Coming up"
                  dates={data.upcoming.map(({ ev, ms }) => ({
                    id: ev.id,
                    date: new Date(ms).toISOString(),
                    title: ev.name,
                    sub: [ev.type, ev.location].filter(Boolean).join(' · '),
                  }))}
                />
              )}
            </View>
          </>
        )}
      </V2Screen>
    </SafeAreaView>
  );
}
