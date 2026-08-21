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
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '@/auth/AuthProvider';
import { useTheme } from '@/theme/ThemeProvider';
import {
  getAboutUrl,
  getPrivacyUrl,
  getShareUrl,
  getTermsUrl,
} from '@/config/api';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { useFloatingTabClearance } from '@/components/app-tab-bar';
import { LABEL_TEXT_ANDROID } from '@/components/ui/app-text';
import { BRAND_BLUE, BRAND_HEADER_GRADIENT } from '@/theme/brand';
import { cardChrome } from '@/theme/tokens';

function SectionLabel({ eyebrow }: { eyebrow: string }) {
  return (
    <View className="mb-3 px-0.5">
      <Text className="text-[11px] font-semibold uppercase text-subtle" style={{ letterSpacing: 2.0 }}>
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
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      className={`flex-row items-center gap-3.5 px-4 py-3.5 ${
        last ? '' : 'border-b border-line'
      }`}
    >
      <View
        className="h-10 w-10 items-center justify-center rounded-[14px]"
        style={{
          backgroundColor: destructive ? colors.dangerBg : colors.iconBg,
        }}
      >
        <Ionicons
          name={icon}
          size={18}
          color={destructive ? colors.danger : BRAND_BLUE}
        />
      </View>
      <Text
        numberOfLines={1}
        className="min-w-0 flex-1 text-[15px] font-semibold"
        style={{ flexShrink: 1, color: destructive ? colors.danger : colors.ink }}
      >
        {label}
      </Text>
      <View className="h-8 w-8 items-center justify-center rounded-full bg-surface-muted">
        <Ionicons
          name="chevron-forward"
          size={15}
          color={destructive ? colors.danger : colors.subtle}
        />
      </View>
    </Pressable>
  );
}

function CardGroup({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View
      className="mb-7 overflow-hidden rounded-[24px] bg-surface"
      style={cardChrome(colors)}
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
    <View className="flex-1 bg-canvas">
      <StatusBar style="light" />
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: tabClearance }}>
        <View
          className="overflow-hidden"
          style={{
            borderBottomLeftRadius: 32,
            borderBottomRightRadius: 32,
          }}
        >
          <LinearGradient
            colors={[...BRAND_HEADER_GRADIENT]}
            locations={[0, 0.5, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              paddingTop: insets.top + 12,
              paddingBottom: 28,
              paddingHorizontal: 22,
              borderBottomLeftRadius: 32,
              borderBottomRightRadius: 32,
            }}
          >
            <View
              pointerEvents="none"
              className="absolute -right-20 -top-6 h-52 w-52 rounded-full"
              style={{ backgroundColor: 'rgba(255,255,255,0.14)' }}
            />
            <View
              pointerEvents="none"
              className="absolute -left-24 bottom-4 h-44 w-44 rounded-full"
              style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
            />

            <Text
              className="text-center text-[11px] font-semibold uppercase text-white/70"
              style={[LABEL_TEXT_ANDROID, { letterSpacing: 2.2 }]}
            >
              Account
            </Text>

            <View className="mt-6 items-center">
              <View
                className="h-24 w-24 items-center justify-center rounded-full"
                style={{
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.35)',
                  backgroundColor: 'rgba(255,255,255,0.16)',
                }}
              >
                <Text className="text-3xl font-black text-white">{initial}</Text>
              </View>
              <Text
                className="mt-4 text-center text-[26px] font-black tracking-tight text-white"
                numberOfLines={1}
                style={[LABEL_TEXT_ANDROID, { letterSpacing: -0.5 }]}
              >
                {displayName}
              </Text>
              {user?.email ? (
                <Text
                  className="mt-1.5 text-center text-[13px] text-white/75"
                  numberOfLines={1}
                  style={LABEL_TEXT_ANDROID}
                >
                  {user.email}
                </Text>
              ) : null}
              <Pressable
                onPress={() => router.push('/(tabs)/account/profile')}
                className="mt-5 flex-row items-center justify-center gap-2 rounded-full px-5 py-2.5"
                style={{
                  backgroundColor: 'rgba(255,255,255,0.14)',
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.28)',
                }}
              >
                <Ionicons name="create-outline" size={15} color="#FFFFFF" />
                <Text className="text-[13px] font-semibold text-white">
                  {hasName ? 'Edit' : 'Complete profile'}
                </Text>
              </Pressable>
            </View>
          </LinearGradient>
        </View>

        <View className="px-5 pt-6 bg-canvas">
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
