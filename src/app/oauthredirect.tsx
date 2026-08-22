import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/auth/AuthProvider';
import { BRAND_BLUE } from '@/theme/brand';

/** Catch-all for the Google OAuth App Link if the router sees the URL. */
export default function OAuthRedirectScreen() {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === 'authenticated') {
      router.replace('/(tabs)' as never);
      return;
    }
    if (status !== 'unauthenticated') return;
    const t = setTimeout(() => {
      router.replace('/(auth)/welcome' as never);
    }, 2500);
    return () => clearTimeout(t);
  }, [status, router]);

  return (
    <View className="flex-1 items-center justify-center" style={{ backgroundColor: BRAND_BLUE }}>
      <ActivityIndicator color="#FFFFFF" />
    </View>
  );
}
