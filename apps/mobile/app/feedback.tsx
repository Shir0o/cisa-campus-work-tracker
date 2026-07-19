import { useRef, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import ViewShot, { captureRef } from 'react-native-view-shot';
import { kindMeta, type FeedbackKind } from '@cisa/core';
import { Screen, AppText, Button } from '../src/components/ui';
import { useTheme } from '../src/theme/ThemeProvider';
import { useAuth } from '../src/lib/AuthProvider';
import { submitFeedback } from '../src/lib/data/feedback';
import { FeedbackKindPicker } from '../src/components/feedback/FeedbackKindPicker';

const MESSAGE_MAX = 5000;
// Firestore rules cap `screenshot` at 200000 chars — stay comfortably under.
const SCREENSHOT_MAX_CHARS = 190_000;
// A full-resolution capture of a desktop-width screen alone gets close to
// that cap, leaving no margin — downscale to a diagnostic-sized thumbnail.
const CAPTURE_MAX_WIDTH = 480;

// Leave a note — ported from src/views/SubmitFeedback.tsx. Any signed-in
// role can submit (ROUTE_MIN_ROLE['/feedback'] = 'viewer'), reached from
// "More". Writes directly to Firestore (see data/feedback.ts) rather than
// through web's /api/feedback server route — GitHub-issue auto-creation is
// still deferred (see MIGRATION.md). Screenshot capture is a best-effort
// capture of *this* form screen, not the screen the user was complaining
// about — web's floating FAB captures whatever page it's opened from, but
// mobile's Feedback is a routed screen reached only from "More", so the
// "offending" screen is already unmounted by the time this form is open.
export default function FeedbackScreen() {
  const router = useRouter();
  const { colors, spacing, radius } = useTheme();
  const { user, uid } = useAuth();
  const viewShotRef = useRef<ViewShot>(null);
  const captureSize = useRef<{ width: number; height: number } | null>(null);

  const [kind, setKind] = useState<FeedbackKind>('thought');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const inputStyle = {
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14.5,
    color: colors.onSurface,
    backgroundColor: colors.surfaceContainer,
    minHeight: 140,
    textAlignVertical: 'top' as const,
  };

  const handleSubmit = async () => {
    if (!uid || !message.trim()) return;
    setLoading(true);
    setError(null);

    // Best-effort — a failed capture must never block submitting the note.
    // Downscaled to a thumbnail width so it stays well under the rules' cap
    // regardless of the device's screen size or pixel density.
    let screenshot: string | undefined;
    try {
      const size = captureSize.current;
      const width = size ? Math.min(CAPTURE_MAX_WIDTH, size.width) : undefined;
      const height = width && size ? Math.round(width * (size.height / size.width)) : undefined;
      const base64 = await captureRef(viewShotRef, {
        format: 'jpg',
        quality: 0.6,
        result: 'base64',
        ...(width && height ? { width, height } : {}),
      });
      if (base64.length <= SCREENSHOT_MAX_CHARS) screenshot = `data:image/jpeg;base64,${base64}`;
    } catch {
      // no screenshot this time
    }

    try {
      await submitFeedback({
        uid,
        userEmail: user?.email?.toLowerCase() || 'anonymous',
        userName: user?.displayName || 'Anonymous User',
        kind,
        message: message.trim(),
        screenshot,
      });
      setSent(true);
      setMessage('');
    } catch {
      setError("Something went wrong sending that — mind trying again?");
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <Screen>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, padding: spacing.xl, justifyContent: 'center', alignItems: 'center' }}
        >
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 20,
              backgroundColor: colors.primaryContainer,
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: spacing.lg,
            }}
          >
            <Ionicons name="checkmark-circle" size={30} color={colors.primary} />
          </View>
          <AppText variant="title">Got it.</AppText>
          <AppText
            variant="body"
            color={colors.onSurfaceVariant}
            style={{ marginTop: spacing.sm, textAlign: 'center', maxWidth: 320 }}
          >
            Thank you! The application admins have been notified.
          </AppText>
          <View style={{ flexDirection: 'row', gap: 12, marginTop: spacing.xl }}>
            <Button title="Back to app" variant="ghost" onPress={() => router.back()} />
            <Button title="Leave another note" onPress={() => setSent(false)} />
          </View>
        </ScrollView>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingTop: spacing.sm }}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={{ padding: 6 }}>
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>
      </View>

      <ViewShot
        ref={viewShotRef}
        style={{ flex: 1 }}
        options={{ format: 'jpg', quality: 0.6 }}
        onLayout={(e) => {
          captureSize.current = { width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height };
        }}
      >
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.md }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ gap: 4 }}>
            <AppText variant="title">Leave a note</AppText>
            <AppText variant="body" color={colors.onSurfaceVariant}>
              Ideas, friction, appreciation — all welcome. Your note goes straight to the team.
            </AppText>
          </View>

          {error && (
            <View style={{ backgroundColor: colors.errorContainer, borderRadius: radius.md, padding: 12 }}>
              <AppText variant="body" color={colors.onErrorContainer}>
                {error}
              </AppText>
            </View>
          )}

          <View style={{ gap: 6 }}>
            <AppText variant="label" color={colors.onSurfaceVariant}>
              What kind of note is it?
            </AppText>
            <FeedbackKindPicker value={kind} onChange={setKind} />
          </View>

          <View style={{ gap: 6 }}>
            <AppText variant="label" color={colors.onSurfaceVariant}>
              Your note
            </AppText>
            <TextInput
              style={inputStyle}
              value={message}
              onChangeText={(v) => setMessage(v.slice(0, MESSAGE_MAX))}
              placeholder={kindMeta(kind).placeholder}
              placeholderTextColor={colors.onSurfaceVariant}
              multiline
              maxLength={MESSAGE_MAX}
            />
          </View>

          <Button title={loading ? 'Sending…' : 'Send it'} onPress={handleSubmit} disabled={loading || !message.trim()} full />
        </ScrollView>
      </ViewShot>
    </Screen>
  );
}
