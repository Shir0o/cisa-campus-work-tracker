import { Fragment, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMarkdown } from 'react-native-marked';
import { DOC_STATUS, dateLabelOf, sessionStatus, weekdayOf, type BoardDoc } from '@cisa/core';
import { Screen, AppText, StatusPill } from '../../src/components/ui';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useAuth } from '../../src/lib/AuthProvider';
import { useBoardDocData } from '../../src/lib/useBoardDocData';
import { AudienceBadge } from '../../src/components/coordination/AudienceBadge';

// Coordination Notes / "The Board" — a single page. Admins get the proven
// Phase 0.5 WebView editor (now parameterized by docId instead of the spike's
// hardcoded SPIKE_DOC_ID); every other role — read-only per firestore.rules —
// gets a native read view (design oracle: web's ReadOnlyDoc in
// src/views/CoordinationNotes.tsx). Mobile only ever routes admins into the
// WebView, so EmbedCoordinationDoc.tsx's own isAdmin-only gate stays correct
// as-is.
export default function CoordinationDoc() {
  const { docId } = useLocalSearchParams<{ docId: string }>();
  const { role } = useAuth();

  return role === 'admin' ? <AdminEditor docId={docId} /> : <ReaderView docId={docId} />;
}

const WEB_APP_URL = process.env.EXPO_PUBLIC_WEB_APP_URL || 'http://localhost:3000';

function AdminEditor({ docId }: { docId: string }) {
  const router = useRouter();
  const { colors, spacing } = useTheme();
  const { user } = useAuth();
  const [customToken, setCustomToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) return;
      try {
        const idToken = await user.getIdToken();
        const res = await fetch(`${WEB_APP_URL}/api/mint-custom-token`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${idToken}` },
        });
        const body = await res.json();
        if (!res.ok || !body.success) throw new Error(body.error || `HTTP ${res.status}`);
        if (!cancelled) setCustomToken(body.token);
      } catch (e: any) {
        if (!cancelled) setError(e.message || String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  return (
    <Screen edges={['top']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingTop: spacing.sm }}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={{ padding: 6 }}>
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>
      </View>

      {error ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: 8 }}>
          <Ionicons name="alert-circle-outline" size={32} color={colors.onSurfaceVariant} />
          <AppText variant="body" color={colors.onSurfaceVariant} style={{ textAlign: 'center' }}>
            Couldn't open Coordination Notes: {error}
          </AppText>
        </View>
      ) : !customToken ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <WebView
          source={{ uri: `${WEB_APP_URL}/embed/coordination/${docId}` }}
          injectedJavaScriptBeforeContentLoaded={`window.__CISA_CUSTOM_TOKEN__=${JSON.stringify(customToken)};true;`}
          style={{ flex: 1 }}
        />
      )}
    </Screen>
  );
}

function ReaderView({ docId }: { docId: string }) {
  const router = useRouter();
  const { colors, spacing, mode } = useTheme();
  const data = useBoardDocData(docId);

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingTop: spacing.sm }}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={{ padding: 6 }}>
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>
      </View>

      {data.error || (!data.loading && !data.doc) ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: 8 }}>
          <Ionicons name="alert-circle-outline" size={32} color={colors.onSurfaceVariant} />
          <AppText variant="body" color={colors.onSurfaceVariant} style={{ textAlign: 'center' }}>
            {data.error || "This page couldn't be found."}
          </AppText>
        </View>
      ) : !data.allowed ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: 8 }}>
          <Ionicons name="lock-closed-outline" size={32} color={colors.onSurfaceVariant} />
          <AppText variant="heading">Not available</AppText>
          <AppText variant="body" color={colors.onSurfaceVariant} style={{ textAlign: 'center' }}>
            This page isn't open to your role.
          </AppText>
        </View>
      ) : data.loading || !data.doc ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <DocReader doc={data.doc} colorScheme={mode} />
      )}
    </Screen>
  );
}

function DocReader({ doc, colorScheme }: { doc: BoardDoc; colorScheme: 'light' | 'dark' }) {
  const { colors, spacing } = useTheme();
  const status = sessionStatus(doc.date);
  const statusMeta = DOC_STATUS[status];
  const dateLine = [weekdayOf(doc.date), dateLabelOf(doc.date), doc.time].filter(Boolean).join(' · ');
  const elements = useMarkdown(doc.md?.trim() ? doc.md : '_This page is empty._', {
    colorScheme,
    theme: {
      colors: { text: colors.onSurface, link: colors.primary, code: colors.onSurfaceVariant, border: colors.outlineVariant },
    },
  });

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing.sm, paddingBottom: 40, gap: spacing.md }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        {statusMeta.tone ? <StatusPill label={statusMeta.label} tone={statusMeta.tone} /> : null}
        <AudienceBadge audience={doc.audience ?? 'team'} />
      </View>

      <View style={{ gap: 2 }}>
        <AppText variant="title">{doc.title}</AppText>
        <Text style={{ fontSize: 13, color: colors.onSurfaceVariant }}>
          {dateLine}
          {doc.place ? `  ·  📍 ${doc.place}` : ''}
        </Text>
      </View>

      <View>
        {elements.map((element, index) => (
          <Fragment key={`board_doc_${index}`}>{element}</Fragment>
        ))}
      </View>
    </ScrollView>
  );
}
