import { useCallback, useRef, useState } from 'react';
import type {
  NativeSyntheticEvent,
  TextInputFocusEventData,
  TextInputProps,
  ViewStyle,
} from 'react-native';
import { BRAND_BLUE } from '@/theme/brand';

/** Caret, selection highlight, and Android selection handles. */
export const INPUT_CARET = {
  cursorColor: BRAND_BLUE,
  selectionColor: BRAND_BLUE,
  selectionHandleColor: BRAND_BLUE,
  underlineColorAndroid: 'transparent',
} satisfies Pick<
  TextInputProps,
  'cursorColor' | 'selectionColor' | 'selectionHandleColor' | 'underlineColorAndroid'
>;

/**
 * Stable focus/blur handlers. Do not setState synchronously in the native
 * focus event — that restyles/remounts the TextInput and Android restores
 * the previous field.
 */
export function useInputFocus(handlers?: {
  onFocus?: TextInputProps['onFocus'];
  onBlur?: TextInputProps['onBlur'];
}) {
  const [focused, setFocused] = useState(false);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const onFocus = useCallback((e: NativeSyntheticEvent<TextInputFocusEventData>) => {
    handlersRef.current?.onFocus?.(e);
    requestAnimationFrame(() => setFocused(true));
  }, []);
  const onBlur = useCallback((e: NativeSyntheticEvent<TextInputFocusEventData>) => {
    handlersRef.current?.onBlur?.(e);
    requestAnimationFrame(() => setFocused(false));
  }, []);
  return { focused, onFocus, onBlur };
}

/** Primary-blue outline for a *wrapper* View — never apply this to TextInput. */
export function inputFocusChrome(
  focused: boolean,
  colors: { line: string; surface: string },
  opts?: { radius?: number; isDark?: boolean; backgroundColor?: string },
): ViewStyle {
  const radius = opts?.radius ?? 16;
  const backgroundColor = opts?.backgroundColor ?? colors.surface;
  return {
    borderWidth: 1.5,
    borderColor: focused ? BRAND_BLUE : colors.line,
    backgroundColor,
    borderRadius: radius,
  };
}
