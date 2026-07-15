import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Card, AppText, Screen, SectionHead } from '../ui';
import { useTheme } from '../../theme/ThemeProvider';
import { useAuth } from '../../lib/AuthProvider';
import { useStudentLandingData } from '../../lib/useStudentLandingData';
import { PersonalPrayerRow, AddPersonalPrayerRow } from '../myday/YourPrayers';
import { UpcomingEventsRsvp } from './UpcomingEventsRsvp';

// Student landing: what's coming up (with RSVP) + a quiet place to pray for
// the friends on your heart. Ported from src/views/landings/LandingStudent.tsx.
export function LandingStudent() {
  const { spacing } = useTheme();
  const router = useRouter();
  const { uid, user } = useAuth();
  const data = useStudentLandingData(uid);
  const firstName = (user?.displayName || 'friend').split(' ')[0];

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40, gap: spacing.xl }}>
        <View style={{ gap: 6 }}>
          <AppText variant="title">Hi {firstName}.</AppText>
          <AppText variant="body">Here's what's coming up, and a quiet place to pray for the people on your heart.</AppText>
        </View>

        <UpcomingEventsRsvp
          heading="Coming up"
          sub="You're always welcome."
          emptyText="Nothing on the calendar just yet — check back soon."
          linkLabel="Full calendar"
          onLink={() => router.push('/attendance')}
        />

        <View>
          <SectionHead title="Pray for your friends" />
          <Card style={{ padding: 0 }}>
            <View style={{ paddingHorizontal: spacing.lg }}>
              {data.activePersonalPrayers.length === 0 && (
                <AppText variant="body" style={{ textAlign: 'center', paddingVertical: 20 }}>
                  No one yet — add the first person on your heart below.
                </AppText>
              )}
              {data.activePersonalPrayers.map((p, i) => (
                <PersonalPrayerRow
                  key={p.id}
                  prayer={p}
                  first={i === 0}
                  contacts={[]}
                  onOpenContact={() => {}}
                  onUpdate={(patch) => data.updatePersonalPrayer(p.id, patch)}
                  onDelete={() => data.deletePersonalPrayer(p.id)}
                />
              ))}
              <AddPersonalPrayerRow
                onAdd={(title) => data.addPersonalPrayer(title)}
                addLabel="Add someone"
                placeholder="Who's on your heart? e.g. “Daniel — finals stress”"
              />
            </View>
          </Card>
        </View>
      </ScrollView>
    </Screen>
  );
}
