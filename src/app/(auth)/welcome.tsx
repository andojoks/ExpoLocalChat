import {
  AuthError,
  AuthSecondaryButton,
} from '@/components/auth/auth-ui';
import { ExpertLearnerLogo } from '@/components/brand/expert-learner-logo';
import { useGoogleAuth } from '@/auth/use-google-auth';
import { accountSuspendedMessage } from '@/auth/account-suspended';
import { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Alert, Dimensions, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useFonts, Sora_700Bold } from '@expo-google-fonts/sora';

const { width: SCREEN_W } = Dimensions.get('window');
const LOGO_SIZE = Math.min(96, SCREEN_W * 0.26);

export default function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const google = useGoogleAuth();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fontsLoaded] = useFonts({ Sora_700Bold });

  if (!fontsLoaded) {
    return <View className="flex-1 bg-[#0B1424]" />;
  }

  return (
    <View className="flex-1 bg-[#0B1424]">
      <StatusBar style="light" />
      <LinearGradient
        colors={['#0B1424', '#101C30', '#152844']}
        locations={[0, 0.45, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ flex: 1, paddingTop: insets.top + 16, paddingBottom: Math.max(insets.bottom, 16) + 8 }}
      >
        <View
          pointerEvents="none"
          className="absolute -right-16 top-24 h-72 w-72 rounded-full"
          style={{ backgroundColor: 'rgba(37,99,235,0.16)' }}
        />
        <View
          pointerEvents="none"
          className="absolute -left-20 bottom-32 h-64 w-64 rounded-full"
          style={{ backgroundColor: 'rgba(37,99,235,0.1)' }}
        />

        <View className="flex-1 justify-between px-6">
          <View className="flex-1 items-center justify-center px-2">
            <ExpertLearnerLogo size={LOGO_SIZE} variant="onBlue" />
            <Text
              style={{
                marginTop: 28,
                fontFamily: 'Sora_700Bold',
                fontSize: 11,
                letterSpacing: 2.4,
                textTransform: 'uppercase',
                color: '#64748B',
                textAlign: 'center',
              }}
            >
              ExpertLearner
            </Text>
            <Text
              style={{
                marginTop: 16,
                fontFamily: 'Sora_700Bold',
                fontSize: 34,
                lineHeight: 42,
                color: '#FFFFFF',
                textAlign: 'center',
                letterSpacing: -0.5,
              }}
            >
              Learn Smarter.{'\n'}
              <Text style={{ color: '#93C5FD' }}>Grow Faster.</Text>
            </Text>
          </View>

          <View className="pb-2">
            <AuthError message={error} />
            <Pressable
              onPress={() => router.push('/(auth)/login')}
              className="mt-2 items-center py-4"
              style={{
                borderRadius: 16,
                backgroundColor: '#FFFFFF',
              }}
            >
              <Text className="text-[15px] font-bold text-ink">Log in</Text>
            </Pressable>
            <AuthSecondaryButton
              light
              label="Create account"
              onPress={() => router.push('/(auth)/signup')}
            />
            <AuthSecondaryButton
              light
              label={busy ? 'Connecting…' : 'Continue with Google'}
              icon="google"
              onPress={async () => {
                setError(null);
                setBusy(true);
                try {
                  await google.signIn();
                } catch (e) {
                  const err = e as Error & { code?: string };
                  if (err.code === 'ACCOUNT_SUSPENDED') {
                    const msg = accountSuspendedMessage(err);
                    Alert.alert('Account suspended', msg);
                    setError(msg);
                    return;
                  }
                  setError(err.message || 'Google sign-in failed');
                } finally {
                  setBusy(false);
                }
              }}
            />
          </View>
        </View>
      </LinearGradient>
    </View>
  );
}
