import { type ReactNode } from 'react';
import { Pressable, Text, TextInput, View, type TextInputProps } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ExpertLearnerLogo } from '@/components/brand/expert-learner-logo';
import { GoogleLogo } from '@/components/brand/google-logo';

const APP_BG = '#E8EEF5';

const FIELD_SURFACE = {
  borderWidth: 1,
  borderColor: '#E8EEF4',
  backgroundColor: '#FFFFFF',
  borderRadius: 16,
} as const;

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

  return (
    <View
      className="flex-1"
      style={{
        backgroundColor: APP_BG,
        paddingTop: insets.top + 8,
        paddingBottom: Math.max(insets.bottom, 12),
      }}
    >
      <StatusBar style="dark" />

      {showBack ? (
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          className="absolute z-20 h-10 w-10 items-center justify-center rounded-full bg-white"
          style={{
            top: insets.top + 8,
            left: 16,
            borderWidth: 1,
            borderColor: '#E8EEF4',
          }}
        >
          <Ionicons name="arrow-back" size={20} color="#0B1424" />
        </Pressable>
      ) : null}

      <View className="min-h-0 flex-1 px-6">
        <View className="items-center justify-center px-2 pb-4 pt-10">
          <ExpertLearnerLogo size={72} variant="onLight" />
          <Text className="mt-6 text-center text-[11px] font-semibold uppercase tracking-[0.22em] text-[#64748B]">
            {eyebrow}
          </Text>
          <Text
            className="mt-3 text-center text-[32px] font-black tracking-tight text-ink"
            style={{ letterSpacing: -0.5 }}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text className="mt-3 max-w-sm text-center text-[14px] leading-5 text-[#64748B]">
              {subtitle}
            </Text>
          ) : null}
        </View>

        <View className="min-h-0 flex-1">{children}</View>
      </View>
    </View>
  );
}

export function AuthField({
  label,
  ...props
}: TextInputProps & { label: string }) {
  return (
    <View className="mb-3.5">
      <Text className="mb-1.5 px-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#94A3B8]">
        {label}
      </Text>
      <TextInput
        placeholderTextColor="#94A3B8"
        className="px-4 py-3.5 text-[15px] text-ink"
        style={FIELD_SURFACE}
        {...props}
      />
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
      className="mt-2 items-center py-4"
      style={{
        borderRadius: 16,
        backgroundColor: disabled ? '#CBD5E1' : '#2563EB',
      }}
    >
      <Text className="text-[15px] font-bold text-white">{label}</Text>
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
  /** Ghost style for ink / dark surfaces (e.g. welcome). */
  light?: boolean;
}) {
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
              backgroundColor: '#FFFFFF',
              borderWidth: 1,
              borderColor: '#E8EEF4',
            }
      }
    >
      {icon === 'google' ? (
        <GoogleLogo size={18} />
      ) : icon ? (
        <Ionicons name={icon} size={18} color={light ? '#F8FAFC' : '#0B1424'} />
      ) : null}
      <Text
        className={`text-[15px] font-semibold ${light ? 'text-white' : 'text-ink'}`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function AuthError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <View
      className="mb-3 px-3.5 py-3"
      style={{
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#FECACA',
        backgroundColor: '#FEF2F2',
      }}
    >
      <Text className="text-sm text-[#B91C1C]">{message}</Text>
    </View>
  );
}

export function AuthLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} className="mt-4 items-center py-1">
      <Text className="text-sm font-semibold text-[#2563EB]">{label}</Text>
    </Pressable>
  );
}
