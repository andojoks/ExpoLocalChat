import '../global.css';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { SplashScreen, Stack, useRouter, useSegments } from 'expo-router';
import { setOptions as setSplashOptions } from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { SQLiteProvider } from 'expo-sqlite';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { migrateDatabase } from '@/db/database';
import { AuthProvider, useAuth } from '@/auth/AuthProvider';
import { isOnboardingComplete, peekOnboardingComplete } from '@/onboarding/storage';
import { PrivacyScreenGuard } from '@/privacy/privacy-screen-guard';
import {
  getPendingAuth,
  pendingAuthHref,
  type PendingAuth,
} from '@/auth/pending-auth';
import { BRAND_BLUE } from '@/theme/brand';

// Must use expo-router's SplashScreen so the router does not auto-hide on first paint.
SplashScreen.preventAutoHideAsync().catch(() => {
  /* already prevented / unavailable on web */
});

function AppGate() {
  const { status } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const [onboardingDone, setOnboardingDone] = useState<boolean | null>(null);
  const [pendingAuth, setPendingAuthState] = useState<PendingAuth | null | undefined>(undefined);
  const restoredPending = useRef(false);
  const splashHidden = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void isOnboardingComplete()
      .then((done) => {
        if (!cancelled) setOnboardingDone(done);
      })
      .catch(() => {
        /* keep null — unknown is not "needs onboarding" */
      });
    void getPendingAuth().then((pending) => {
      if (!cancelled) setPendingAuthState(pending);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const ready = status !== 'loading' && onboardingDone !== null && pendingAuth !== undefined;
  const onboardingComplete = onboardingDone === true || peekOnboardingComplete();

  // Token present → home, even if the onboarding flag were missing.
  const showOnboarding = ready && !onboardingComplete && status !== 'authenticated';
  const showAuth = ready && onboardingComplete && status === 'unauthenticated';
  const showApp = ready && status === 'authenticated';

  const root = (segments as string[])[0];
  const destinationVisible =
    (showOnboarding && root === '(onboarding)') ||
    (showAuth && root === '(auth)') ||
    (showApp && root === '(tabs)');

  useEffect(() => {
    if (!showAuth || restoredPending.current) return;
    if (!pendingAuth) return;
    restoredPending.current = true;
    const href = pendingAuthHref(pendingAuth);
    const authScreen = (segments as string[])[1];
    const alreadyThere =
      root === '(auth)' &&
      ((pendingAuth.screen === 'verify-email' && authScreen === 'verify-email') ||
        (pendingAuth.screen === 'verify-password-reset' &&
          authScreen === 'verify-password-reset') ||
        (pendingAuth.screen === 'reset-password' && authScreen === 'reset-password'));
    if (!alreadyThere) {
      router.replace(href as never);
    }
  }, [showAuth, pendingAuth, segments, router, root]);

  useEffect(() => {
    if (!destinationVisible || splashHidden.current) return;
    splashHidden.current = true;
    try {
      setSplashOptions({ fade: false, duration: 0 });
    } catch {
      /* Expo Go / unsupported */
    }
    void SplashScreen.hideAsync().catch(() => {
      /* ignore */
    });
  }, [destinationVisible]);

  return (
    <View style={{ flex: 1, backgroundColor: BRAND_BLUE }}>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'none',
          contentStyle: { backgroundColor: BRAND_BLUE },
        }}
      >
        <Stack.Protected guard={showOnboarding}>
          <Stack.Screen name="(onboarding)" />
        </Stack.Protected>
        <Stack.Protected guard={showAuth}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={showApp}>
          <Stack.Screen name="(tabs)" />
        </Stack.Protected>
      </Stack>
    </View>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: BRAND_BLUE }}>
      <PrivacyScreenGuard>
        <BottomSheetModalProvider>
          <SQLiteProvider databaseName="questionbank.db" onInit={migrateDatabase}>
            <AuthProvider>
              <AppGate />
            </AuthProvider>
          </SQLiteProvider>
        </BottomSheetModalProvider>
      </PrivacyScreenGuard>
    </GestureHandlerRootView>
  );
}
