import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Screen, AppText } from '../src/components/ui';
import { useTheme } from '../src/theme/ThemeProvider';
import { useAuth } from '../src/lib/AuthProvider';

// Phase 0.5 WebView editor spike (see MIGRATION.md "Coordination Notes / The
// Board") — hosts the web app's live TipTap/Yjs editor via a bare embed route
// on the already-deployed SPA (src/views/EmbedCoordinationDoc.tsx), rather
// than a separately-bundled page. Auth is bridged with a short-lived Firebase
// custom token, injected before any page script runs so the embed route can
// read it synchronously on mount (avoids a postMessage-after-load race).
// Scoped narrowly: one hardcoded seeded doc id, no doc picker yet.
const WEB_APP_URL = process.env.EXPO_PUBLIC_WEB_APP_URL || 'http://localhost:3000';
const SPIKE_DOC_ID = 'demo-board-team';

export default function Coordination() {
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
          source={{ uri: `${WEB_APP_URL}/embed/coordination/${SPIKE_DOC_ID}` }}
          injectedJavaScriptBeforeContentLoaded={`window.__CISA_CUSTOM_TOKEN__=${JSON.stringify(customToken)};true;`}
          style={{ flex: 1 }}
        />
      )}
    </Screen>
  );
}
