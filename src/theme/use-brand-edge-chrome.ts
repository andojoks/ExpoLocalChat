import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as SystemUI from 'expo-system-ui';
import { BRAND_BLUE } from '@/theme/brand';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * Root + system chrome for blue brand screens (setup, onboarding, welcome).
 * Lets brand blue show through the Android nav bar area (no light system scrim).
 */
export function useBrandEdgeChrome() {
  const { colors, isDark } = useTheme();
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(BRAND_BLUE).catch(() => undefined);

    if (Platform.OS === 'android') {
      void import('expo-navigation-bar')
        .then((mod) => {
          const setStyle = mod.setStyle ?? mod.NavigationBar?.setStyle;
          if (typeof setStyle === 'function') setStyle('light');
        })
        .catch(() => undefined);
    }

    return () => {
      void SystemUI.setBackgroundColorAsync(colors.canvas).catch(() => undefined);
      if (Platform.OS !== 'android') return;
      void import('expo-navigation-bar')
        .then((mod) => {
          const setStyle = mod.setStyle ?? mod.NavigationBar?.setStyle;
          if (typeof setStyle === 'function') setStyle(isDark ? 'light' : 'dark');
        })
        .catch(() => undefined);
    };
  }, [colors.canvas, isDark]);
}
