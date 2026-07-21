import { Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { canAccessRoute } from '@cisa/core';
import { Screen, AppText, SectionHead } from '../../src/components/ui';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useAuth } from '../../src/lib/AuthProvider';
import { useBoardListData } from '../../src/lib/useBoardListData';
import { DocCard } from '../../src/components/coordination/DocCard';
import { pinBoardDoc } from '../../src/lib/data/board';

// Coordination Notes / "The Board" — the Pages list (design oracle: web's
// src/views/CoordinationNotes.tsx's Pages rail + src/views/
// CoordinationNotesMobile.tsx's card list, grouped by the shared DOC_GROUPS
// helper). Replaces the Phase 0.5 spike's single hardcoded doc with a real
// role-scoped browser; tapping a page routes to /coordination/[docId], which
// splits by role (admin edits via the proven WebView flow, everyone else gets
// a native read view).
export default function CoordinationList() {
  const router = useRouter();
  const { colors, spacing } = useTheme();
  const { role } = useAuth();
  const data = useBoardListData();
  const isAdmin = role === 'admin';

  if (!canAccessRoute(role, '/coordination')) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: 8 }}>
          <Ionicons name="lock-closed-outline" size={32} color={colors.onSurfaceVariant} />
          <AppText variant="heading">Not available</AppText>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingTop: spacing.sm }}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={{ padding: 6 }}>
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>
        {isAdmin ? (
          <Pressable onPress={() => router.push('/coordination/trash')} hitSlop={8} style={{ padding: 6 }}>
            <Ionicons name="trash-outline" size={20} color={colors.onSurfaceVariant} />
          </Pressable>
        ) : null}
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing.sm, paddingBottom: 40, gap: spacing.lg }}>
        <View style={{ gap: 4 }}>
          <AppText variant="label" color={colors.primary} style={{ textTransform: 'uppercase' }}>
            COORDINATION
          </AppText>
          <AppText variant="title">The Board</AppText>
          <AppText variant="body" color={colors.onSurfaceVariant}>
            Running pages from the team's gatherings.
          </AppText>
        </View>

        {data.error ? (
          <AppText variant="body" color={colors.onSurfaceVariant} style={{ textAlign: 'center', paddingVertical: 24 }}>
            {data.error}
          </AppText>
        ) : data.loading ? (
          <AppText variant="body" color={colors.onSurfaceVariant} style={{ textAlign: 'center', paddingVertical: 24 }}>
            Loading pages…
          </AppText>
        ) : data.sections.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 40, gap: 12 }}>
            <Ionicons name="document-text-outline" size={40} color={colors.onSurfaceVariant} style={{ opacity: 0.4 }} />
            <AppText variant="heading" style={{ textAlign: 'center' }}>
              No pages yet
            </AppText>
            <AppText variant="body" color={colors.onSurfaceVariant} style={{ textAlign: 'center' }}>
              Pages the team starts will show up here.
            </AppText>
          </View>
        ) : (
          data.sections.map((section) => (
            <View key={section.title} style={{ gap: spacing.sm }}>
              <SectionHead title={section.title} />
              <View style={{ gap: 8 }}>
                {section.data.map((doc) => (
                  <DocCard
                    key={doc.id}
                    doc={doc}
                    isAdmin={isAdmin}
                    onPress={() => router.push(`/coordination/${doc.id}`)}
                    onTogglePin={() => pinBoardDoc(doc, !doc.pinned)}
                  />
                ))}
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}
