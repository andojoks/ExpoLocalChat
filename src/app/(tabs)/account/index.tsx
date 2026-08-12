import type { ReactNode } from 'react';
import {
  Linking,
  Pressable,
  ScrollView,
  Share,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '@/auth/AuthProvider';
import {
  getAboutUrl,
  getPrivacyUrl,
  getShareUrl,
  getTermsUrl,
} from '@/config/api';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { useFloatingTabClearance } from '@/components/app-tab-bar';
import { BRAND_BLUE, BRAND_MIST } from '@/theme/brand';

function SectionLabel({ eyebrow }: { eyebrow: string }) {
  return (
    <View className="mb-3 px-0.5">
      <Text className="text-[11px] font-semibold uppercase text-[#94A3B8]" style={{ letterSpacing: 2.0 }}>
        {eyebrow}
      </Text>
    </View>
  );
}

function AccountRow({
  icon,
  label,
  onPress,
  destructive,
  last,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  destructive?: boolean;
  last?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-row items-center gap-3.5 px-4 py-3.5 ${
        last ? '' : 'border-b border-[#E8EEF4]'
      }`}
    >
      <View
        className="h-10 w-10 items-center justify-center rounded-[14px]"
        style={{
          backgroundColor: destructive ? '#FEF2F2' : '#EFF6FF',
        }}
      >
        <Ionicons
          name={icon}
          size={18}
          color={destructive ? '#B4534B' : BRAND_BLUE}
        />
      </View>
      <Text
        numberOfLines={1}
        className={`min-w-0 flex-1 text-[15px] font-semibold ${
          destructive ? 'text-[#B4534B]' : 'text-ink'
        }`}
        style={{ flexShrink: 1 }}
      >
        {label}
      </Text>
      <View className="h-8 w-8 items-center justify-center rounded-full bg-[#F1F5F9]">
        <Ionicons
          name="chevron-forward"
          size={15}
          color={destructive ? '#B4534B' : '#94A3B8'}
        />
      </View>
    </Pressable>
  );
}

function CardGroup({ children }: { children: ReactNode }) {
  return (
    <View
      className="mb-7 overflow-hidden rounded-[24px] bg-white"
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
      {children}
    </View>
  );
}

export default function AccountScreen() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const confirm = useConfirmDialog();
  const tabClearance = useFloatingTabClearance();

  function confirmLogout() {
    confirm.ask(
      {
        title: 'Log out?',
        message: 'You’ll need to sign in again to download packs.',
        confirmLabel: 'Log out',
        cancelLabel: 'Cancel',
        destructive: true,
        icon: 'log-out-outline',
      },
      () => {
        void signOut();
      },
    );
  }

  const initial = (user?.name || user?.email || '?').slice(0, 1).toUpperCase();
  const displayName = user?.name?.trim() || 'Add your name';
  const hasName = Boolean(user?.name?.trim());

  return (
    <View className="flex-1" style={{ backgroundColor: BRAND_MIST }}>
      <StatusBar style="dark" />
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: tabClearance }}>
        <View
          className="items-center px-5"
          style={{ paddingTop: insets.top + 20, paddingBottom: 8 }}
        >
          <View
            className="h-24 w-24 items-center justify-center rounded-full"
            style={{ backgroundColor: BRAND_BLUE }}
          >
            <Text className="text-3xl font-black text-white">{initial}</Text>
          </View>
          <Text
            className="mt-4 text-center text-[26px] font-black tracking-tight text-ink"
            numberOfLines={1}
            style={{ letterSpacing: -0.5 }}
          >
            {displayName}
          </Text>
          {user?.email ? (
            <Text className="mt-1.5 text-center text-[13px] text-slate-500" numberOfLines={1}>
              {user.email}
            </Text>
          ) : null}
          <Pressable
            onPress={() => router.push('/(tabs)/account/profile')}
            className="mt-5 flex-row items-center justify-center gap-2 rounded-2xl px-6 py-3"
            style={{ backgroundColor: BRAND_BLUE }}
          >
            <Ionicons name="create-outline" size={16} color="#FFFFFF" />
            <Text className="text-[14px] font-bold text-white">
              {hasName ? 'Edit profile' : 'Complete profile'}
            </Text>
          </Pressable>
        </View>

        <View className="px-5 pt-6" style={{ backgroundColor: BRAND_MIST }}>
          <SectionLabel eyebrow="Settings" />
          <CardGroup>
            <AccountRow
              icon="options-outline"
              label="App preferences"
              onPress={() => router.push('/(tabs)/account/preferences')}
              last
            />
          </CardGroup>

          <SectionLabel eyebrow="Billing" />
          <CardGroup>
            <AccountRow
              icon="albums-outline"
              label="Subscriptions"
              onPress={() => router.push('/(tabs)/account/subscriptions')}
              last
            />
          </CardGroup>

          <SectionLabel eyebrow="Info" />
          <CardGroup>
            <AccountRow
              icon="information-circle-outline"
              label="About"
              onPress={() => void Linking.openURL(getAboutUrl())}
            />
            <AccountRow
              icon="shield-checkmark-outline"
              label="Privacy policy"
              onPress={() => void Linking.openURL(getPrivacyUrl())}
            />
            <AccountRow
              icon="document-text-outline"
              label="Terms of service"
              onPress={() => void Linking.openURL(getTermsUrl())}
              last
            />
          </CardGroup>

          <SectionLabel eyebrow="Community" />
          <CardGroup>
            <AccountRow
              icon="share-outline"
              label="Share app"
              onPress={() =>
                void Share.share({
                  message: `Study past papers with ExpertLearner — ${getShareUrl()}`,
                  url: getShareUrl(),
                })
              }
              last
            />
          </CardGroup>

          <CardGroup>
            <AccountRow
              icon="log-out-outline"
              label="Log out"
              destructive
              onPress={confirmLogout}
              last
            />
          </CardGroup>
        </View>
      </ScrollView>
      {confirm.dialog}
    </View>
  );
}
