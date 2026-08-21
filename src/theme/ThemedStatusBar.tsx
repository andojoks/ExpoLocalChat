import { StatusBar } from 'expo-status-bar';
import { useTheme } from '@/theme/ThemeProvider';

/** `onBrand` = light icons on the blue header. Otherwise follows light/dark canvas. */
export function ThemedStatusBar({ onBrand }: { onBrand?: boolean }) {
  const { isDark } = useTheme();
  if (onBrand) return <StatusBar style="light" />;
  return <StatusBar style={isDark ? 'light' : 'dark'} />;
}
