import { Alert, Linking, Pressable, ScrollView, Share, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useAuth } from '@/auth/AuthProvider';
import { AppScreenHeader } from '@/components/screen-header';
import {
  getAboutUrl,
  getPrivacyUrl,
  getShareUrl,
  getTermsUrl,
} from '@/config/api';

function Row({
  icon,
  label,
  onPress,
  destructive,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center justify-between border-b border-line px-4 py-4"
    >
      <View className="flex-row items-center gap-3">
        <Ionicons name={icon} size={20} color={destructive ? '#B4534B' : '#2563EB'} />
        <Text className={`text-[15px] font-semibold ${destructive ? 'text-[#B4534B]' : 'text-ink'}`}>
          {label}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
    </Pressable>
  );
}

export default function SettingsScreen() {
  const { user, signOut } = useAuth();
  const router = useRouter();

  function confirmLogout() {
    Alert.alert('Log out?', 'You’ll need to sign in again to download packs.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: () => {
          void signOut();
        },
      },
    ]);
  }

  return (
    <View className="flex-1 bg-[#EEF4F8]">
      <AppScreenHeader title="Settings" />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <Animated.View entering={FadeInDown.duration(350)} className="mt-2">
          <View className="mx-5 overflow-hidden rounded-md border border-line bg-white">
            <Pressable
              onPress={() => router.push('/(tabs)/settings/profile')}
              className="flex-row items-center gap-3 px-4 py-4"
            >
              <View className="h-12 w-12 items-center justify-center rounded-md bg-mint">
                <Text className="text-lg font-black text-forest">
                  {(user?.name || user?.email || '?').slice(0, 1).toUpperCase()}
                </Text>
              </View>
              <View className="flex-1">
                <Text className="text-[16px] font-bold text-ink">{user?.name || 'Add your name'}</Text>
                <Text className="mt-0.5 text-sm text-slate-500">{user?.email}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
            </Pressable>
          </View>
        </Animated.View>

        <Text className="mx-5 mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Payment
        </Text>
        <View className="mx-5 overflow-hidden rounded-md border border-line bg-white">
          <Row
            icon="albums-outline"
            label="Subscriptions"
            onPress={() => router.push('/(tabs)/settings/subscriptions')}
          />
        </View>

        <Text className="mx-5 mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Legal
        </Text>
        <View className="mx-5 overflow-hidden rounded-md border border-line bg-white">
          <Row icon="information-circle-outline" label="About" onPress={() => void Linking.openURL(getAboutUrl())} />
          <Row icon="shield-checkmark-outline" label="Privacy policy" onPress={() => void Linking.openURL(getPrivacyUrl())} />
          <Row icon="document-text-outline" label="Terms of service" onPress={() => void Linking.openURL(getTermsUrl())} />
        </View>

        <Text className="mx-5 mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Social
        </Text>
        <View className="mx-5 overflow-hidden rounded-md border border-line bg-white">
          <Row
            icon="share-outline"
            label="Share app"
            onPress={() =>
              void Share.share({
                message: `Study past papers with ExpertLearner — ${getShareUrl()}`,
                url: getShareUrl(),
              })
            }
          />
        </View>

        <View className="mx-5 mt-6 overflow-hidden rounded-md border border-line bg-white">
          <Row icon="log-out-outline" label="Log out" destructive onPress={confirmLogout} />
        </View>
      </ScrollView>
    </View>
  );
}
