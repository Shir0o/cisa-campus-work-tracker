import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Redirect, Stack, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { Newsreader_500Medium } from '@expo-google-fonts/newsreader';
import { HankenGrotesk_400Regular, HankenGrotesk_600SemiBold } from '@expo-google-fonts/hanken-grotesk';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, useTheme } from '../src/theme/ThemeProvider';
import { AuthProvider, useAuth } from '../src/lib/AuthProvider';

// Routes reachable while signed out — the public welcome form (a prospective
// student fills it out themselves, no account needed) plus login itself.
const PUBLIC_ROUTES = ['/signup', '/login'];

function RootNavigator() {
  const { mode, colors } = useTheme();
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const [fontsLoaded, fontError] = useFonts({
    Newsreader_500Medium,
    HankenGrotesk_400Regular,
    HankenGrotesk_600SemiBold,
  });

  useEffect(() => {
    if (fontError) {
      // Non-fatal — falls back to the system font below, but this should never
      // happen with bundled fonts, so surface it for debugging.
      console.error('Failed to load bundled fonts:', fontError);
    }
  }, [fontError]);

  if (loading || (!fontsLoaded && !fontError)) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="login" />
        <Stack.Screen name="signup" />
        <Stack.Screen name="history" />
      </Stack>
      {!user && !PUBLIC_ROUTES.includes(pathname) && <Redirect href="/login" />}
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AuthProvider>
            <BottomSheetModalProvider>
              <RootNavigator />
            </BottomSheetModalProvider>
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
