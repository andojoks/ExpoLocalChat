import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  AuthError,
  AuthPrimaryButton,
  AuthSecondaryButton,
} from '@/components/auth/auth-ui';
import { useGoogleAuth } from '@/auth/use-google-auth';
import { useState } from 'react';

export default function WelcomeScreen() {
  const router = useRouter();
  const google = useGoogleAuth();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <SafeAreaView className="flex-1 bg-[#0B1424]">
      <View className="absolute inset-0">
        <View className="absolute -right-20 top-16 h-72 w-72 rounded-full bg-[#2563EB]/25" />
        <View className="absolute -left-16 bottom-40 h-64 w-64 rounded-full bg-[#38BDF8]/20" />
      </View>
      <Animated.View entering={FadeIn.duration(500)} className="flex-1 justify-between px-6 pb-8 pt-10">
        <View>
          <Text className="text-[13px] font-semibold uppercase tracking-[0.22em] text-[#93C5FD]">
            ExpertLearner
          </Text>
          <Animated.Text
            entering={FadeInDown.delay(80).duration(450)}
            className="mt-4 text-4xl font-black leading-tight tracking-tight text-white"
          >
            Past papers,{`\n`}clearer.
          </Animated.Text>
          <Text className="mt-4 max-w-sm text-[16px] leading-6 text-slate-300">
            Sign in to sync packs, study offline, and chat with your on-device tutor.
          </Text>
        </View>
        <View>
          <AuthError message={error} />
          <AuthPrimaryButton
            label="Log in"
            onPress={() => router.push('/(auth)/login')}
          />
          <AuthSecondaryButton
            label="Create account"
            onPress={() => router.push('/(auth)/signup')}
          />
          <AuthSecondaryButton
            label={busy ? 'Connecting…' : 'Continue with Google'}
            icon="logo-google"
            onPress={async () => {
              setError(null);
              setBusy(true);
              try {
                await google.signIn();
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Google sign-in failed');
              } finally {
                setBusy(false);
              }
            }}
          />
        </View>
      </Animated.View>
    </SafeAreaView>
  );
}
