import { useEffect, type ReactNode } from 'react';
import { Platform } from 'react-native';
import * as ScreenCapture from 'expo-screen-capture';

const PRIVACY_KEY = 'expertlearner-app';

/**
 * Blocks screenshots and screen recording for the whole app (iOS + Android).
 * No-op on web / when the native module is unavailable.
 */
export function PrivacyScreenGuard({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (Platform.OS === 'web') return;

    void ScreenCapture.preventScreenCaptureAsync(PRIVACY_KEY).catch(() => {
      /* Expo Go / unsupported build */
    });

    return () => {
      void ScreenCapture.allowScreenCaptureAsync(PRIVACY_KEY).catch(() => undefined);
    };
  }, []);

  return <>{children}</>;
}
