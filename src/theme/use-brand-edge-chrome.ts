import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as SystemUI from 'expo-system-ui';
import { BRAND_BLUE } from '@/theme/brand';

/**
 * Root + system chrome for blue brand screens (setup, onboarding, welcome).
 * Lets brand blue show through the Android nav bar area (no light system scrim).
 */
export function useBrandEdgeChrome() {
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(BRAND_BLUE).catch(() => undefined);

    if (Platform.OS !== 'android') return;

    try {
      // Dynamic import keeps web/tests light; setStyle is sync on native.
      void import('expo-navigation-bar').then((NavigationBar) => {
        NavigationBar.setStyle('light');
      });
    } catch {
      /* Expo Go / unsupported */
    }
  }, []);
}
