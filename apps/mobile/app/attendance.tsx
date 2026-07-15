import { useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import type { Event } from '@cisa/core';
import { Screen, AppText } from '../src/components/ui';
import { useTheme } from '../src/theme/ThemeProvider';
import { useAuth } from '../src/lib/AuthProvider';
import { useAttendanceData } from '../src/lib/useAttendanceData';
import { GatheringHero } from '../src/components/attendance/GatheringHero';
import { MissedList } from '../src/components/attendance/MissedList';
import { GatheringTypeFilterPills } from '../src/components/attendance/GatheringTypeFilterPills';
import { SessionCard } from '../src/components/attendance/SessionCard';
import { RosterSheet } from '../src/components/attendance/RosterSheet';
import { UpcomingGatherings } from '../src/components/attendance/UpcomingGatherings';

// Gatherings — hero stats, who we've missed, past sessions with roster
// marking, and coming-up gatherings. Design: src/views/AttendanceMobile.tsx
// (already shipped on the web app at mobile width). Reached from "More" and
// the Student/Community landings' "Full calendar" link, following History's
// pushed-route/back-button pattern.
export default function Attendance() {
  const router = useRouter();
  const { colors, spacing } = useTheme();
  const { uid, user, role } = useAuth();
  const data = useAttendanceData(uid, user?.displayName ?? null, role);
  const [openSession, setOpenSession] = useState<Event | null>(null);

  const onOpenContact = (name: string) => {
    Alert.alert(name, "Contact details aren't wired up yet — coming in a later pass.");
  };

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingTop: spacing.sm }}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={{ padding: 6 }}>
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing.sm, paddingBottom: 40, gap: spacing.xl }}>
        <GatheringHero count={data.gatheringsCount} avgPer={data.avgPer} />

        {data.error ? (
          <AppText variant="body" color={colors.onSurfaceVariant} style={{ textAlign: 'center', paddingVertical: 24 }}>
            {data.error}
          </AppText>
        ) : data.loading ? (
          <AppText variant="body" color={colors.onSurfaceVariant} style={{ textAlign: 'center', paddingVertical: 24 }}>
            Gathering the last few sessions…
          </AppText>
        ) : (
          <>
            <MissedList missed={data.missed} onOpenContact={(c) => onOpenContact(c.name)} />

            <View style={{ gap: spacing.sm }}>
              <AppText variant="heading">When we met</AppText>
              <GatheringTypeFilterPills types={data.gatheringTypes} value={data.typeFilter} onChange={data.setTypeFilter} />
              {data.sessions.length === 0 ? (
                <AppText variant="body" color={colors.onSurfaceVariant} style={{ paddingVertical: 8 }}>
                  No gatherings logged yet.
                </AppText>
              ) : (
                <View style={{ gap: 8 }}>
                  {data.sessions.map((session) => (
                    <SessionCard
                      key={session.id}
                      session={session}
                      contacts={data.contacts}
                      hereFn={data.here}
                      onPress={() => setOpenSession(session)}
                    />
                  ))}
                </View>
              )}
            </View>

            <UpcomingGatherings upcoming={data.upcoming} />
          </>
        )}
      </ScrollView>

      <RosterSheet
        visible={!!openSession}
        session={openSession}
        contacts={data.contacts}
        canTakeAttendance={data.canTakeAttendance}
        onCycle={(contact, eventId) => void data.cycleAttendance(contact, eventId)}
        onClose={() => setOpenSession(null)}
      />
    </Screen>
  );
}
