import {
  BRAND_BLUE,
  BRAND_BLUE_DEEP,
  BRAND_BLUE_LIGHT,
  BRAND_GOLD,
  BRAND_HEADER_GRADIENT,
  BRAND_INK,
  BRAND_MIST,
} from '@/theme/brand';

export type ThemeScheme = 'light' | 'dark';
export type ThemePreference = ThemeScheme | 'system';

export type ThemeColors = {
  /** Screen / page background. */
  canvas: string;
  /** Cards, sheets, fields. */
  surface: string;
  /** Nested wells, chip backgrounds. */
  surfaceMuted: string;
  /** Primary text / icons on canvas. */
  ink: string;
  /** Secondary text. */
  muted: string;
  /** Tertiary / placeholder text. */
  subtle: string;
  /** Hairline borders. */
  line: string;
  /** Icon wells (blue-tinted). */
  iconBg: string;
  iconBgDanger: string;
  tabBar: string;
  tabBarBorder: string;
  tabInactive: string;
  tabActiveBg: string;
  overlay: string;
  sheetBg: string;
  sheetHandle: string;
  danger: string;
  dangerBg: string;
  success: string;
  successBg: string;
  warning: string;
  warningBg: string;
  /** Selected / active chip wash. */
  selectedBg: string;
  selectedBorder: string;
  /** Disabled controls (send button, pager). */
  controlOff: string;
  switchTrackOff: string;
  switchTrackOn: string;
  headerGradient: readonly [string, string, string];
};

export const LIGHT_COLORS: ThemeColors = {
  canvas: BRAND_MIST,
  surface: '#FFFFFF',
  surfaceMuted: '#F1F5F9',
  ink: BRAND_INK,
  muted: '#64748B',
  subtle: '#94A3B8',
  line: '#E8EEF4',
  iconBg: '#EFF6FF',
  iconBgDanger: '#FEF2F2',
  tabBar: '#FFFFFF',
  tabBarBorder: '#E8EEF4',
  tabInactive: '#94A3B8',
  tabActiveBg: '#EFF6FF',
  overlay: 'rgba(11, 20, 36, 0.45)',
  sheetBg: '#F8FAFC',
  sheetHandle: '#CBD5E1',
  danger: '#B4534B',
  dangerBg: '#FEF2F2',
  success: '#059669',
  successBg: '#ECFDF5',
  warning: '#B45309',
  warningBg: '#FFFBEB',
  selectedBg: '#EFF6FF',
  selectedBorder: '#BFDBFE',
  controlOff: '#E2E8F0',
  switchTrackOff: '#CBD5E1',
  switchTrackOn: '#93C5FD',
  headerGradient: BRAND_HEADER_GRADIENT,
};

/** Blue-tinted dark surfaces so night mode still reads as ExpertLearner, not generic grey. */
export const DARK_COLORS: ThemeColors = {
  canvas: '#080F1E',
  surface: '#121C32',
  surfaceMuted: '#1A2744',
  ink: '#F1F5F9',
  muted: '#94A3B8',
  subtle: '#64748B',
  line: '#243049',
  iconBg: '#1A3160',
  iconBgDanger: '#3F1D24',
  tabBar: '#121C32',
  tabBarBorder: '#243049',
  tabInactive: '#64748B',
  tabActiveBg: '#1A3160',
  overlay: 'rgba(0, 0, 0, 0.62)',
  sheetBg: '#121C32',
  sheetHandle: '#475569',
  danger: '#FCA5A5',
  dangerBg: '#3F1D24',
  success: '#34D399',
  successBg: '#0F2E28',
  warning: '#FBBF24',
  warningBg: '#3D2A10',
  selectedBg: '#1A3160',
  selectedBorder: '#3B82F6',
  controlOff: '#243049',
  switchTrackOff: '#334155',
  switchTrackOn: '#1D4ED8',
  headerGradient: BRAND_HEADER_GRADIENT,
};

export const THEME_PALETTES: Record<ThemeScheme, ThemeColors> = {
  light: LIGHT_COLORS,
  dark: DARK_COLORS,
};

export const BRAND = {
  blue: BRAND_BLUE,
  blueDeep: BRAND_BLUE_DEEP,
  blueLight: BRAND_BLUE_LIGHT,
  gold: BRAND_GOLD,
} as const;

/** Shared card border + lift so screens stay visually aligned. */
export function cardChrome(colors: ThemeColors) {
  return {
    borderWidth: 1 as const,
    borderColor: colors.line,
    shadowColor: colors.ink,
    shadowOpacity: 0.05,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  };
}

export function nativewindVars(colors: ThemeColors): Record<`--${string}`, string> {
  return {
    '--color-canvas': colors.canvas,
    '--color-surface': colors.surface,
    '--color-surface-muted': colors.surfaceMuted,
    '--color-ink': colors.ink,
    '--color-muted': colors.muted,
    '--color-subtle': colors.subtle,
    '--color-line': colors.line,
    '--color-icon-bg': colors.iconBg,
    '--color-danger': colors.danger,
    '--color-danger-bg': colors.dangerBg,
    '--color-success': colors.success,
    '--color-success-bg': colors.successBg,
    '--color-warning': colors.warning,
    '--color-warning-bg': colors.warningBg,
    '--color-selected': colors.selectedBg,
    '--color-selected-border': colors.selectedBorder,
    '--color-control-off': colors.controlOff,
  };
}
