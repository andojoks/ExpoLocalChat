import { useCallback, useEffect, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
  getAutodownloadPackImages,
  setAutodownloadPackImages,
} from '@/preferences/pack-images';
import {
  getStudyRemindersEnabled,
  setRemindersEnabled,
} from '@/notifications/study-reminders';
import { BRAND_BLUE, BRAND_HEADER_GRADIENT } from '@/theme/brand';
import { useTheme } from '@/theme/ThemeProvider';
import type { ThemePreference } from '@/theme/tokens';
import { LABEL_TEXT_ANDROID } from '@/components/ui/app-text';

function PrefCard({
  icon,
  title,
  description,
  value,
  onValueChange,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
}) {
  const { colors } = useTheme();
  return (
    <View
      className="flex-row items-center gap-3.5 rounded-[24px] bg-surface py-4 pl-4 pr-3.5"
      style={{
        borderWidth: 1,
        borderColor: colors.line,
        shadowColor: colors.ink,
        shadowOpacity: 0.05,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 6 },
        elevation: 2,
      }}
    >
      <View
        className="h-11 w-11 items-center justify-center rounded-[14px]"
        style={{ backgroundColor: colors.iconBg }}
      >
        <Ionicons name={icon} size={20} color={BRAND_BLUE} />
      </View>
      <View className="min-w-0 flex-1 pr-3">
        <Text className="text-[15px] font-bold text-ink">{title}</Text>
        <Text className="mt-1 text-[13px] leading-5 text-muted">{description}</Text>
      </View>
      <View
        pointerEvents="box-none"
        style={{
          width: 52,
          height: 32,
          flexShrink: 0,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Switch
          value={value}
          onValueChange={onValueChange}
          trackColor={{ false: colors.switchTrackOff, true: colors.switchTrackOn }}
          thumbColor="#FFFFFF"
          ios_backgroundColor={colors.switchTrackOff}
          style={Platform.OS === 'android' ? { width: 52, height: 32 } : undefined}
        />
      </View>
    </View>
  );
}

const DISPLAY_MODES: Array<{
  id: ThemePreference;
  label: string;
  hint: string;
  icon: keyof typeof Ionicons.glyphMap;
}> = [
  { id: 'light', label: 'Light', hint: 'Always use light surfaces', icon: 'sunny-outline' },
  { id: 'dark', label: 'Dark', hint: 'Always use dark surfaces', icon: 'moon-outline' },
  {
    id: 'system',
    label: 'System default',
    hint: 'Match the device appearance',
    icon: 'phone-portrait-outline',
  },
];

function DisplayModeCard() {
  const { colors, preference, setPreference } = useTheme();
  return (
    <View
      className="overflow-hidden rounded-[24px] bg-surface"
      style={{
        borderWidth: 1,
        borderColor: colors.line,
        shadowColor: colors.ink,
        shadowOpacity: 0.05,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 6 },
        elevation: 2,
      }}
    >
      {DISPLAY_MODES.map((mode, i) => {
        const on = preference === mode.id;
        const last = i === DISPLAY_MODES.length - 1;
        return (
          <Pressable
            key={mode.id}
            onPress={() => setPreference(mode.id)}
            className={`flex-row items-center gap-3.5 px-4 py-3.5 ${last ? '' : 'border-b border-line'}`}
          >
            <View
              className="h-10 w-10 items-center justify-center rounded-[14px]"
              style={{ backgroundColor: colors.iconBg }}
            >
              <Ionicons name={mode.icon} size={18} color={BRAND_BLUE} />
            </View>
            <View className="min-w-0 flex-1">
              <Text className="text-[15px] font-semibold text-ink">{mode.label}</Text>
              <Text className="mt-0.5 text-[12px] text-muted">{mode.hint}</Text>
            </View>
            <View
              className="h-6 w-6 items-center justify-center rounded-full"
              style={{
                borderWidth: 2,
                borderColor: on ? BRAND_BLUE : colors.line,
                backgroundColor: on ? BRAND_BLUE : 'transparent',
              }}
            >
              {on ? <Ionicons name="checkmark" size={14} color="#FFFFFF" /> : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function PreferencesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [autodownloadImages, setAutodownloadImages] = useState(true);
  const [studyReminders, setStudyReminders] = useState(true);

  useEffect(() => {
    void getAutodownloadPackImages().then(setAutodownloadImages);
    void getStudyRemindersEnabled().then(setStudyReminders);
  }, []);

  const onToggleAutodownload = useCallback(async (value: boolean) => {
    setAutodownloadImages(value);
    await setAutodownloadPackImages(value);
  }, []);

  const onToggleReminders = useCallback(async (value: boolean) => {
    const enabled = await setRemindersEnabled(value);
    setStudyReminders(enabled);
    if (value && !enabled) {
      Alert.alert(
        'Notifications blocked',
        'Enable notifications for ExpertLearner in system settings to get study reminders.',
      );
    }
  }, []);

  return (
    <View className="flex-1 bg-canvas">
      <StatusBar style="light" />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 24) + 16 }}
      >
        <LinearGradient
          colors={[...BRAND_HEADER_GRADIENT]}
          locations={[0, 0.5, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            paddingTop: insets.top + 8,
            paddingBottom: 18,
            paddingHorizontal: 14,
          }}
        >
          <View
            pointerEvents="none"
            className="absolute -right-16 -top-8 h-40 w-40 rounded-full"
            style={{ backgroundColor: 'rgba(255,255,255,0.12)' }}
          />

          <View className="flex-row items-center gap-1">
            <Pressable
              onPress={() => router.navigate('/(tabs)/account' as never)}
              hitSlop={12}
              className="h-10 w-10 items-center justify-center rounded-full"
              style={{ backgroundColor: 'rgba(255,255,255,0.12)' }}
            >
              <Ionicons name="arrow-back" size={20} color="#F8FAFC" />
            </Pressable>
            <View className="min-w-0 flex-1 pr-2">
              <Text
                className="text-xl font-black text-white"
                numberOfLines={1}
                style={[LABEL_TEXT_ANDROID, { lineHeight: 28 }]}
              >
                Preferences
              </Text>
            </View>
          </View>
        </LinearGradient>

        <View className="px-5 pt-6">
          <Text
            className="mb-3 px-0.5 text-[11px] font-semibold uppercase text-subtle"
            style={[LABEL_TEXT_ANDROID, { letterSpacing: 2.0 }]}
          >
            Display
          </Text>
          <View className="mb-7">
            <DisplayModeCard />
          </View>

          <Text
            className="mb-3 px-0.5 text-[11px] font-semibold uppercase text-subtle"
            style={[LABEL_TEXT_ANDROID, { letterSpacing: 2.0 }]}
          >
            Settings
          </Text>

          <View className="gap-3.5">
            <PrefCard
              icon="notifications-outline"
              title="Study reminders"
              description="Daily study nudge at 8:00 and streak reminder at 20:00. On by default."
              value={studyReminders}
              onValueChange={(v) => void onToggleReminders(v)}
            />
            <PrefCard
              icon="images-outline"
              title="Auto-download pack images"
              description="Fetch question images during pack install before it completes."
              value={autodownloadImages}
              onValueChange={(v) => void onToggleAutodownload(v)}
            />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
