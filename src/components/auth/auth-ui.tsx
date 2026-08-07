import { type ReactNode } from 'react';
import { Pressable, Text, TextInput, View, type TextInputProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

export function AuthScreenShell({
  children,
  title,
  subtitle,
  showBack,
}: {
  children: ReactNode;
  title: string;
  subtitle?: string;
  showBack?: boolean;
}) {
  const router = useRouter();
  return (
    <SafeAreaView className="flex-1 bg-[#EEF4F8]">
      <View className="absolute inset-0 bg-[#DBEAFE]/30" />
      <View className="absolute -right-16 -top-10 h-56 w-56 rounded-full bg-[#2563EB]/10" />
      <View className="absolute -bottom-20 -left-10 h-64 w-64 rounded-full bg-[#38BDF8]/10" />
      <Animated.View entering={FadeInDown.duration(420)} className="flex-1 px-6 pt-4">
        {showBack ? (
          <Pressable
            onPress={() => router.back()}
            className="mb-4 h-10 w-10 items-center justify-center rounded-md bg-white/80"
          >
            <Ionicons name="arrow-back" size={20} color="#0B1424" />
          </Pressable>
        ) : (
          <View className="mb-4 h-10" />
        )}
        <Text className="text-[13px] font-semibold uppercase tracking-[0.18em] text-forest">
          ExpertLearner
        </Text>
        <Text className="mt-2 text-3xl font-black tracking-tight text-ink">{title}</Text>
        {!!subtitle && (
          <Text className="mt-2 text-[15px] leading-6 text-slate-600">{subtitle}</Text>
        )}
        <View className="mt-8 flex-1">{children}</View>
      </Animated.View>
    </SafeAreaView>
  );
}

export function AuthField({
  label,
  ...props
}: TextInputProps & { label: string }) {
  return (
    <View className="mb-3.5">
      <Text className="mb-1.5 text-xs font-semibold text-slate-600">{label}</Text>
      <TextInput
        placeholderTextColor="#94A3B8"
        className="rounded-md border border-line bg-white px-3.5 py-3.5 text-[15px] text-ink"
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
      className={`mt-2 items-center rounded-md py-4 ${disabled ? 'bg-slate-300' : 'bg-forest'}`}
    >
      <Text className="text-[15px] font-bold text-white">{label}</Text>
    </Pressable>
  );
}

export function AuthSecondaryButton({
  label,
  onPress,
  icon,
}: {
  label: string;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="mt-3 flex-row items-center justify-center gap-2 rounded-md border border-line bg-white py-3.5"
    >
      {icon ? <Ionicons name={icon} size={18} color="#0B1424" /> : null}
      <Text className="text-[15px] font-semibold text-ink">{label}</Text>
    </Pressable>
  );
}

export function AuthError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <View className="mb-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2.5">
      <Text className="text-sm text-rose-700">{message}</Text>
    </View>
  );
}

export function AuthLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} className="mt-4 items-center py-1">
      <Text className="text-sm font-semibold text-forest">{label}</Text>
    </Pressable>
  );
}
