import '../global.css';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SQLiteProvider } from 'expo-sqlite';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { migrateDatabase } from '@/db/database';
import { AuthProvider, useAuth } from '@/auth/AuthProvider';
import { isOnboardingComplete } from '@/onboarding/storage';
import { PrivacyScreenGuard } from '@/privacy/privacy-screen-guard';
import { BootstrapSetupScreen } from '@/components/bootstrap/bootstrap-setup-screen';
import {
  getPendingAuth,
  pendingAuthHref,
  type PendingAuth,
} from '@/auth/pending-auth';

SplashScreen.preventAutoHideAsync().catch(() => {
  /* already prevented / unavailable on web */
});

/**
 * True when the visible route group matches auth/onboarding state.
 * Used to keep the bootstrap overlay up until replace() has landed — otherwise
 * Expo’s default first screen (onboarding) flashes before tabs on cold start.
 */
function isGateRouteSettled({
  onboardingDone,
  status,
  segments,
}: {
  onboardingDone: boolean;
  status: 'authenticated' | 'unauthenticated';
  segments: string[];
}): boolean {
  const root = segments[0];
  if (!root) return false;

  if (!onboardingDone) return root === '(onboarding)';

  if (status === 'unauthenticated') {
    return root === '(auth)';
  }

  // Authenticated: any app surface except auth/onboarding.
  return root !== '(auth)' && root !== '(onboarding)';
}

function AppGate({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const [onboardingDone, setOnboardingDone] = useState<boolean | null>(null);
  const [pendingAuth, setPendingAuthState] = useState<PendingAuth | null | undefined>(undefined);
  const [splashHidden, setSplashHidden] = useState(false);
  /** Cover only for cold-start settle — never again (e.g. onboarding → welcome). */
  const [coldStartCover, setColdStartCover] = useState(true);
  const restoredPending = useRef(false);

  useEffect(() => {
    void isOnboardingComplete().then(setOnboardingDone);
  }, [segments]);

  useEffect(() => {
    void getPendingAuth().then(setPendingAuthState);
  }, []);

  // Keep the navigator mounted during bootstrap so auth screens survive process remount races.
  const bootstrapped =
    status !== 'loading' && onboardingDone !== null && pendingAuth !== undefined;

  const routeSettled =
    bootstrapped &&
    isGateRouteSettled({
      onboardingDone: onboardingDone!,
      status: status as 'authenticated' | 'unauthenticated',
      segments: segments as string[],
    });

  useEffect(() => {
    if (routeSettled && coldStartCover) {
      setColdStartCover(false);
    }
  }, [routeSettled, coldStartCover]);

  // Cold-start only: hide wrong initial route until first settle. Later navigations stay uncovered.
  const showGateCover = coldStartCover && !routeSettled;

  const hideSplash = useCallback(async () => {
    if (splashHidden) return;
    try {
      await SplashScreen.hideAsync();
    } catch {
      /* ignore */
    }
    setSplashHidden(true);
  }, [splashHidden]);

  // Native splash → bootstrap cover (avoid a blank frame before the overlay mounts).
  useEffect(() => {
    void hideSplash();
  }, [hideSplash]);

  useEffect(() => {
    if (!bootstrapped) return;
    const root = (segments as string[])[0];
    const inOnboarding = root === '(onboarding)';
    const inAuth = root === '(auth)';
    const authScreen = (segments as string[])[1];

    if (!onboardingDone) {
      if (!inOnboarding) router.replace('/(onboarding)');
      return;
    }

    if (status === 'unauthenticated') {
      // Resume OTP / reset flows after leaving the app (email, SMS, etc.).
      if (pendingAuth && !restoredPending.current) {
        const href = pendingAuthHref(pendingAuth);
        const alreadyThere =
          inAuth &&
          ((pendingAuth.screen === 'verify-email' && authScreen === 'verify-email') ||
            (pendingAuth.screen === 'verify-password-reset' &&
              authScreen === 'verify-password-reset') ||
            (pendingAuth.screen === 'reset-password' && authScreen === 'reset-password'));
        restoredPending.current = true;
        if (!alreadyThere) {
          router.replace(href as never);
        }
        return;
      }

      // After onboarding, unauthenticated entry is welcome (not login).
      // Stay on other (auth) screens once the user navigates there from welcome.
      if (!inAuth) router.replace('/(auth)/welcome');
      return;
    }

    if (status === 'authenticated') {
      restoredPending.current = false;
      if (inAuth || inOnboarding) {
        router.replace('/(tabs)');
      }
    }
  }, [bootstrapped, onboardingDone, status, segments, router, pendingAuth]);

  return (
    <View style={{ flex: 1 }}>
      {children}
      {showGateCover ? (
        <View style={[StyleSheet.absoluteFillObject, { zIndex: 50 }]}>
          <BootstrapSetupScreen />
        </View>
      ) : null}
    </View>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <PrivacyScreenGuard>
        <BottomSheetModalProvider>
          <SQLiteProvider databaseName="questionbank.db" onInit={migrateDatabase}>
            <AuthProvider>
              <AppGate>
                <StatusBar style="auto" />
                <Stack screenOptions={{ headerShown: false, animation: 'fade' }} />
              </AppGate>
            </AuthProvider>
          </SQLiteProvider>
        </BottomSheetModalProvider>
      </PrivacyScreenGuard>
    </GestureHandlerRootView>
  );
}
