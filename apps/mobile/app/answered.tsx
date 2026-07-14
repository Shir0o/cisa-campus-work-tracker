import { Alert, Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { toneForAnsweredId } from '@cisa/core';
import { Screen, AppText } from '../src/components/ui';
import { useTheme } from '../src/theme/ThemeProvider';
import { useAnsweredData } from '../src/lib/useAnsweredData';
import { AnsweredTile } from '../src/components/answered/AnsweredTile';

// Answered — a read-only wall of the prayers this ministry has watched God
// answer. Design: no shipped mobile-native source exists (the design tool's
// answered.jsx depicts a photo-wall/featured-hero concept the web app never
// built — see src/views/AnsweredList.tsx for what actually shipped, which
// already collapses to a single column at phone width). Pushed (non-tab)
// route, reached from "More", following History's back-nav pattern.
export default function Answered() {
  const router = useRouter();
  const { colors, spacing } = useTheme();
  const data = useAnsweredData();

  const onOpenContact = (contactId?: string) => {
    const contact = data.openContact(contactId);
    if (contact) Alert.alert(contact.name, "Contact details aren't wired up yet — coming in a later pass.");
  };

  const isEmpty = data.recent.length === 0 && data.earlier.length === 0;

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingTop: spacing.sm }}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={{ padding: 6 }}>
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing.sm, paddingBottom: 40, gap: spacing.lg }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: spacing.md }}>
          <View style={{ flex: 1, gap: 4 }}>
            <AppText variant="label" color={colors.success} style={{ textTransform: 'uppercase' }}>
              Answered
            </AppText>
            <AppText variant="title">Answered</AppText>
            <AppText variant="body" color={colors.onSurfaceVariant}>
              A record of the prayers this ministry has watched God answer. Every one of them a small testimony.
            </AppText>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <AppText variant="display" color={colors.success}>
              {data.totalThisYear}
            </AppText>
            <AppText variant="caption" style={{ textAlign: 'right' }}>
              answered{'\n'}this year
            </AppText>
          </View>
        </View>

        {data.error ? (
          <AppText variant="body" color={colors.onSurfaceVariant} style={{ textAlign: 'center', paddingVertical: 24 }}>
            {data.error}
          </AppText>
        ) : data.loading ? (
          <AppText variant="body" color={colors.onSurfaceVariant} style={{ textAlign: 'center', paddingVertical: 24 }}>
            Gathering the answered prayers…
          </AppText>
        ) : isEmpty ? (
          <View style={{ alignItems: 'center', paddingVertical: 40, gap: 8 }}>
            <Ionicons name="heart-outline" size={40} color={colors.onSurfaceVariant} style={{ opacity: 0.4 }} />
            <AppText variant="heading" style={{ textAlign: 'center' }}>
              No answered prayers recorded yet
            </AppText>
            <AppText variant="body" color={colors.onSurfaceVariant} style={{ textAlign: 'center' }}>
              As prayers are marked answered and testimonies are written, they will blossom here.
            </AppText>
          </View>
        ) : (
          <>
            {data.recent.length > 0 && (
              <View style={{ gap: spacing.sm }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <AppText variant="heading">Recent answers</AppText>
                  <AppText variant="caption">{data.recent.length}</AppText>
                </View>
                <View style={{ gap: spacing.sm }}>
                  {data.recent.map((p) => (
                    <AnsweredTile
                      key={p.id}
                      prayer={p}
                      contact={data.openContact(p.contactId)}
                      tone={toneForAnsweredId(p.id)}
                      onPress={() => onOpenContact(p.contactId)}
                    />
                  ))}
                </View>
              </View>
            )}

            {data.earlier.length > 0 && (
              <View style={{ gap: spacing.sm }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <AppText variant="heading">Earlier this year</AppText>
                  <AppText variant="caption">{data.earlier.length}</AppText>
                </View>
                <View style={{ gap: spacing.sm }}>
                  {data.earlier.map((p) => (
                    <AnsweredTile
                      key={p.id}
                      prayer={p}
                      contact={data.openContact(p.contactId)}
                      tone={toneForAnsweredId(p.id)}
                      onPress={() => onOpenContact(p.contactId)}
                    />
                  ))}
                </View>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
