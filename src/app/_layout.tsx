import '../global.css';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SQLiteProvider } from 'expo-sqlite';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { migrateDatabase } from '@/db/database';
import { AuthProvider, useAuth } from '@/auth/AuthProvider';
import { isOnboardingComplete } from '@/onboarding/storage';

SplashScreen.preventAutoHideAsync().catch(() => {
  /* already prevented / unavailable on web */
});

function AppGate({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const [onboardingDone, setOnboardingDone] = useState<boolean | null>(null);
  const [splashHidden, setSplashHidden] = useState(false);

  useEffect(() => {
    void isOnboardingComplete().then(setOnboardingDone);
  }, [segments]);

  // Hold native splash + gate until auth bootstrap finishes — never paint auth while loading.
  const ready = status !== 'loading' && onboardingDone !== null;

  const hideSplash = useCallback(async () => {
    if (splashHidden || !ready) return;
    try {
      await SplashScreen.hideAsync();
    } catch {
      /* ignore */
    }
    setSplashHidden(true);
  }, [ready, splashHidden]);

  useEffect(() => {
    if (!ready) return;
    void hideSplash();
  }, [ready, hideSplash]);

  useEffect(() => {
    if (!ready) return;
    const root = (segments as string[])[0];
    const inOnboarding = root === '(onboarding)';
    const inAuth = root === '(auth)';

    if (!onboardingDone) {
      if (!inOnboarding) router.replace('/(onboarding)');
      return;
    }

    if (status === 'unauthenticated') {
      // After onboarding, unauthenticated entry is welcome (not login).
      // Stay on other (auth) screens once the user navigates there from welcome.
      if (!inAuth) router.replace('/(auth)/welcome');
      return;
    }

    if (status === 'authenticated') {
      if (inAuth || inOnboarding) {
        router.replace('/(tabs)');
      }
    }
  }, [ready, onboardingDone, status, segments, router]);

  // Keep brand-colored splash plane until routing decision is known (no login flash).
  if (!ready) {
    return (
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: '#2563EB' }}>
        <ActivityIndicator color="#FFFFFF" size="large" />
      </View>
    );
  }

  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
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
    </GestureHandlerRootView>
  );
}
