import { useState } from 'react';
import { ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import {
  AuthError,
  AuthField,
  AuthLink,
  AuthPrimaryButton,
  AuthScreenShell,
  AuthSecondaryButton,
} from '@/components/auth/auth-ui';
import { useAuth } from '@/auth/AuthProvider';
import { useGoogleAuth } from '@/auth/use-google-auth';

export default function LoginScreen() {
  const { signInWithPassword } = useAuth();
  const google = useGoogleAuth();
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    setError(null);
    setBusy(true);
    try {
      await signInWithPassword(identifier.trim(), password);
    } catch (e) {
      const err = e as Error & { code?: string; email?: string };
      if (err.code === 'EMAIL_NOT_VERIFIED' && err.email) {
        router.push({ pathname: '/(auth)/verify-email', params: { email: err.email } });
        return;
      }
      setError(err.message || 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthScreenShell
      title="Welcome back"
      subtitle="Use your email or phone number and password."
      showBack
    >
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <AuthError message={error} />
        <AuthField
          label="Email or phone"
          autoCapitalize="none"
          autoCorrect={false}
          value={identifier}
          onChangeText={setIdentifier}
          placeholder="you@school.edu"
        />
        <AuthField
          label="Password"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          placeholder="••••••••"
        />
        <AuthLink label="Forgot password?" onPress={() => router.push('/(auth)/forgot-password')} />
        <AuthPrimaryButton label={busy ? 'Signing in…' : 'Log in'} disabled={busy} onPress={onSubmit} />
        <AuthSecondaryButton
          label="Continue with Google"
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
        <AuthLink label="Create an account" onPress={() => router.push('/(auth)/signup')} />
      </ScrollView>
    </AuthScreenShell>
  );
}
