import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Switch, Text, View } from 'react-native';
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
import { BRAND_BLUE, BRAND_HEADER_GRADIENT, BRAND_MIST } from '@/theme/brand';
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
  return (
    <View
      className="flex-row items-center gap-3.5 rounded-[24px] bg-white px-4 py-4"
      style={{
        borderWidth: 1,
        borderColor: '#E8EEF4',
        shadowColor: '#0B1424',
        shadowOpacity: 0.05,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 6 },
        elevation: 2,
      }}
    >
      <View className="h-11 w-11 items-center justify-center rounded-[14px] bg-[#EFF6FF]">
        <Ionicons name={icon} size={20} color={BRAND_BLUE} />
      </View>
      <View className="min-w-0 flex-1 pr-2">
        <Text className="text-[15px] font-bold text-ink">{title}</Text>
        <Text className="mt-1 text-[13px] leading-5 text-slate-500">{description}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: '#CBD5E1', true: '#93C5FD' }}
        thumbColor={value ? BRAND_BLUE : '#F8FAFC'}
      />
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
    <View className="flex-1" style={{ backgroundColor: BRAND_MIST }}>
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
            className="mb-3 px-0.5 text-[11px] font-semibold uppercase text-[#94A3B8]"
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
