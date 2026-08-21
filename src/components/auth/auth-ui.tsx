import { type ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ExpertLearnerLogo } from '@/components/brand/expert-learner-logo';
import { GoogleLogo } from '@/components/brand/google-logo';
import { ButtonLabel, InlineLabel } from '@/components/ui/app-text';
import { INPUT_CARET, inputFocusChrome, useInputFocus } from '@/components/ui/input-focus';
import { BRAND_BLUE } from '@/theme/brand';
import { useTheme } from '@/theme/ThemeProvider';
import { ThemedStatusBar } from '@/theme/ThemedStatusBar';

export function AuthScreenShell({
  children,
  title,
  subtitle,
  showBack,
  eyebrow = 'ExpertLearner',
}: {
  children: ReactNode;
  title: string;
  subtitle?: string;
  showBack?: boolean;
  eyebrow?: string;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();

  return (
    <View
      className="flex-1"
      style={{
        backgroundColor: colors.canvas,
        paddingTop: insets.top + 8,
        paddingBottom: Math.max(insets.bottom, 12),
      }}
    >
      <ThemedStatusBar />

      {showBack ? (
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          className="absolute z-20 h-10 w-10 items-center justify-center rounded-full bg-surface"
          style={{
            top: insets.top + 8,
            left: 16,
            borderWidth: 1,
            borderColor: colors.line,
            backgroundColor: colors.surface,
          }}
        >
          <Ionicons name="arrow-back" size={20} color={colors.ink} />
        </Pressable>
      ) : null}

      <ScrollView
        className="flex-1"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'center',
          paddingHorizontal: 24,
          paddingVertical: 24,
          width: '100%',
        }}
      >
        <View className="items-center justify-center px-2 pb-6">
          <ExpertLearnerLogo size={72} variant={isDark ? 'onBlue' : 'onLight'} />
          <Text
            className="mt-6 text-center text-[11px] font-semibold uppercase text-muted"
            style={{ letterSpacing: 2.4 }}
          >
            {eyebrow}
          </Text>
          <Text
            className="mt-3 text-center text-[32px] font-black text-ink"
            style={{ letterSpacing: -0.5 }}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text className="mt-3 max-w-sm text-center text-[14px] leading-5 text-muted">
              {subtitle}
            </Text>
          ) : null}
        </View>

        <View className="w-full">{children}</View>
      </ScrollView>
    </View>
  );
}

export function AuthField({
  label,
  onFocus,
  onBlur,
  style,
  ...props
}: TextInputProps & { label: string }) {
  const { colors, isDark } = useTheme();
  const focus = useInputFocus({ onFocus, onBlur });
  return (
    <View className="mb-3.5">
      <Text
        className="mb-1.5 px-0.5 text-[11px] font-semibold uppercase text-subtle"
        style={{ letterSpacing: 1.5 }}
      >
        {label}
      </Text>
      <View collapsable={false} style={inputFocusChrome(focus.focused, colors, { isDark })}>
        <TextInput
          {...props}
          {...INPUT_CARET}
          placeholderTextColor={colors.subtle}
          onFocus={focus.onFocus}
          onBlur={focus.onBlur}
          className="px-4 py-3.5 text-[15px] text-ink"
          style={style}
        />
      </View>
    </View>
  );
}

export function AuthPrimaryButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      className="mt-2 py-4"
      style={{
        borderRadius: 16,
        backgroundColor: disabled ? '#CBD5E1' : BRAND_BLUE,
      }}
    >
      <ButtonLabel className="text-[15px] font-bold text-white">{label}</ButtonLabel>
    </Pressable>
  );
}

export function AuthSecondaryButton({
  label,
  onPress,
  icon,
  light,
}: {
  label: string;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap | 'google';
  light?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      className="mt-3 flex-row items-center justify-center gap-2 py-3.5"
      style={
        light
          ? {
              borderRadius: 16,
              backgroundColor: 'rgba(255,255,255,0.08)',
              borderWidth: 1,
              borderColor: 'rgba(148,163,184,0.28)',
            }
          : {
              borderRadius: 16,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.line,
            }
      }
    >
      {icon === 'google' ? (
        <GoogleLogo size={18} />
      ) : icon ? (
        <Ionicons name={icon} size={18} color={light ? '#F8FAFC' : colors.ink} />
      ) : null}
      {icon ? (
        <InlineLabel
          className={`text-[15px] font-semibold ${light ? 'text-white' : 'text-ink'}`}
        >
          {label}
        </InlineLabel>
      ) : (
        <ButtonLabel
          className={`text-[15px] font-semibold ${light ? 'text-white' : 'text-ink'}`}
        >
          {label}
        </ButtonLabel>
      )}
    </Pressable>
  );
}

export function AuthError({ message }: { message: string | null }) {
  const { colors } = useTheme();
  if (!message) return null;
  return (
    <View
      className="mb-3 px-3.5 py-3"
      style={{
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.danger,
        backgroundColor: colors.dangerBg,
      }}
    >
      <Text className="text-sm" style={{ color: colors.danger }}>{message}</Text>
    </View>
  );
}

export function AuthLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} className="mt-4 self-stretch py-1">
      <ButtonLabel className="text-sm font-semibold" style={{ color: BRAND_BLUE }}>
        {label}
      </ButtonLabel>
    </Pressable>
  );
}
