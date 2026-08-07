import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Redirect, Stack, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { Newsreader_500Medium } from '@expo-google-fonts/newsreader';
import { HankenGrotesk_400Regular, HankenGrotesk_600SemiBold } from '@expo-google-fonts/hanken-grotesk';
import {
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
} from '@expo-google-fonts/manrope';
import { InstrumentSerif_400Regular } from '@expo-google-fonts/instrument-serif';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, useTheme } from '../src/theme/ThemeProvider';
import { AuthProvider, useAuth } from '../src/lib/AuthProvider';
import { useRoomTint } from '../src/lib/roomTint';
import { V2RoomTintContext } from '../src/theme/v2';
import { usePushRegistration } from '../src/lib/usePushRegistration';
import { ImpersonateLayer } from '../src/components/impersonate/ImpersonateLayer';

// Routes reachable while signed out — the public welcome form (a prospective
// student fills it out themselves, no account needed) plus login itself.
const PUBLIC_ROUTES = ['/signup', '/login'];

// Keep the native splash on-screen through auth/font loading instead of an
// instant auto-hide followed by the spinner below flashing separately.
SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { mode, colors } = useTheme();
  const { user, uid, loading } = useAuth();
  const [tint] = useRoomTint(uid);
  const pathname = usePathname();
  usePushRegistration();
  const [fontsLoaded, fontError] = useFonts({
    Newsreader_500Medium,
    HankenGrotesk_400Regular,
    HankenGrotesk_600SemiBold,
    // Mobile v2 ("the trainee app") has its own type: Manrope 500–800 for
    // everything, Instrument Serif for the single end-of-queue headline.
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
    InstrumentSerif_400Regular,
  });

  useEffect(() => {
    if (fontError) {
      // Non-fatal — falls back to the system font below, but this should never
      // happen with bundled fonts, so surface it for debugging.
      console.error('Failed to load bundled fonts:', fontError);
    }
  }, [fontError]);

  useEffect(() => {
    if (!loading && (fontsLoaded || fontError)) {
      SplashScreen.hideAsync();
    }
  }, [loading, fontsLoaded, fontError]);

  if (loading || (!fontsLoaded && !fontError)) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <V2RoomTintContext.Provider value={tint}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      {/* Wraps the Stack rather than sitting beside it, so the "See it as they
          do" pill (position: 'absolute') floats over every route — including
          the trainee's tab-less queue — the way the design's impersonation
          layer rides over every branch of its App. */}
      <View style={{ flex: 1 }}>
        <ImpersonateLayer>
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
        </ImpersonateLayer>
      </View>
      {!user && !PUBLIC_ROUTES.includes(pathname) && <Redirect href="/login" />}
    </V2RoomTintContext.Provider>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        {/* AuthProvider wraps ThemeProvider, not the other way round: the
            appearance preference is saved per person, so the theme needs a uid.
            AuthProvider itself reads no theme. */}
        <AuthProvider>
          <ThemeProvider>
            <BottomSheetModalProvider>
              <RootNavigator />
            </BottomSheetModalProvider>
          </ThemeProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
