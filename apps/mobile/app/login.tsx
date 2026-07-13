import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, AppText, Button } from '../src/components/ui';
import { useTheme } from '../src/theme/ThemeProvider';
import { useAuth } from '../src/lib/AuthProvider';

// Email/password sign-in. Native Google Sign-In is a separate Phase 0.5 spike
// (@react-native-google-signin — popup sign-in doesn't exist in RN).
export default function Login() {
  const { colors, spacing, radius } = useTheme();
  const router = useRouter();
  const { signInWithEmail } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const inputStyle = {
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: radius.md,
    padding: 12,
    fontSize: 15,
    color: colors.onSurface,
    backgroundColor: colors.surface,
  };

  const submit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await signInWithEmail(email, password);
      router.replace('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: 'center', padding: spacing.xl, gap: spacing.md }}>
        <View style={{ gap: 4, marginBottom: spacing.md }}>
          <AppText variant="title">Sign in</AppText>
          <AppText variant="body" color={colors.onSurfaceVariant}>
            Use your CISA Campus account.
          </AppText>
        </View>

        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          placeholderTextColor={colors.onSurfaceVariant}
          style={inputStyle}
        />
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
          secureTextEntry
          placeholderTextColor={colors.onSurfaceVariant}
          style={inputStyle}
        />

        {error && (
          <AppText variant="caption" color={colors.error}>
            {error}
          </AppText>
        )}

        <Button
          title={submitting ? 'Signing in…' : 'Sign in'}
          onPress={submit}
          disabled={submitting || !email || !password}
          full
        />
      </View>
    </Screen>
  );
}
