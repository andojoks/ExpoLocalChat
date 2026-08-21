import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Appearance, Platform, View, useColorScheme } from 'react-native';
import { colorScheme as nativewindScheme, vars } from 'nativewind';
import * as SystemUI from 'expo-system-ui';
import {
  getThemePreference,
  setThemePreference as persistThemePreference,
} from '@/theme/storage';
import {
  THEME_PALETTES,
  nativewindVars,
  type ThemeColors,
  type ThemePreference,
  type ThemeScheme,
} from '@/theme/tokens';

type ThemeContextValue = {
  preference: ThemePreference;
  scheme: ThemeScheme;
  isDark: boolean;
  colors: ThemeColors;
  setPreference: (next: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Write the user's preference once. Do not also write the *resolved* light/dark
 * scheme: on Android that toggles AppCompat night mode (FOLLOW_SYSTEM vs YES/NO)
 * and recreates the activity in a loop.
 */
function applyNativeScheme(preference: ThemePreference) {
  try {
    nativewindScheme.set(preference);
  } catch {
    try {
      Appearance.setColorScheme(preference === 'system' ? 'unspecified' : preference);
    } catch {
      /* older runtimes / web */
    }
  }
}

function applyAndroidNavBar(isDark: boolean) {
  if (Platform.OS !== 'android') return;
  void import('expo-navigation-bar')
    .then((mod) => {
      const setStyle = mod.setStyle ?? mod.NavigationBar?.setStyle;
      if (typeof setStyle !== 'function') return;
      setStyle(isDark ? 'light' : 'dark');
    })
    .catch(() => undefined);
}

function readSystemScheme(): ThemeScheme {
  return Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const appearance = useColorScheme();
  const lastSystemScheme = useRef<ThemeScheme>(readSystemScheme());
  if (appearance === 'dark' || appearance === 'light') {
    lastSystemScheme.current = appearance;
  }
  const systemScheme = lastSystemScheme.current;

  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const appliedPreference = useRef<ThemePreference | null>(null);

  useEffect(() => {
    void getThemePreference().then(setPreferenceState);
  }, []);

  const scheme: ThemeScheme = preference === 'system' ? systemScheme : preference;
  const colors = THEME_PALETTES[scheme];
  const isDark = scheme === 'dark';

  useEffect(() => {
    if (appliedPreference.current === preference) return;
    appliedPreference.current = preference;
    applyNativeScheme(preference);
  }, [preference]);

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(colors.canvas).catch(() => undefined);
    applyAndroidNavBar(isDark);
  }, [colors.canvas, isDark]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    void persistThemePreference(next);
  }, []);

  const value = useMemo(
    () => ({
      preference,
      scheme,
      isDark,
      colors,
      setPreference,
    }),
    [preference, scheme, isDark, colors, setPreference],
  );

  const themeVars = useMemo(() => vars(nativewindVars(colors)), [colors]);

  return (
    <ThemeContext.Provider value={value}>
      <View style={[{ flex: 1, backgroundColor: colors.canvas }, themeVars]}>{children}</View>
    </ThemeContext.Provider>
  );
}

function fallbackTheme(): ThemeContextValue {
  const scheme: ThemeScheme = Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';
  return {
    preference: 'system',
    scheme,
    isDark: scheme === 'dark',
    colors: THEME_PALETTES[scheme],
    setPreference: () => {},
  };
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  // Portals (bottom sheets) can render beside the provider tree if wrapping
  // is wrong. Never throw — keep chrome usable with the system palette.
  return ctx ?? fallbackTheme();
}

/** Optional access for chrome that may render before the provider (tests). */
export function useThemeOptional() {
  return useContext(ThemeContext);
}
