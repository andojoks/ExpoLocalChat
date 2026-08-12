import { useState } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import {
  AuthError,
  AuthField,
  AuthLink,
  AuthPrimaryButton,
  AuthScreenShell,
  AuthSecondaryButton,
} from '@/components/auth/auth-ui';
import { AuthPasswordField } from '@/components/auth/password-field';
import { useAuth } from '@/auth/AuthProvider';
import { useGoogleAuth } from '@/auth/use-google-auth';
import { accountSuspendedMessage } from '@/auth/account-suspended';
import { setPendingAuth } from '@/auth/pending-auth';

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
        await setPendingAuth({ screen: 'verify-email', email: err.email });
        router.push({ pathname: '/(auth)/verify-email', params: { email: err.email } });
        return;
      }
      if (err.code === 'ACCOUNT_SUSPENDED') {
        const msg = accountSuspendedMessage(err);
        Alert.alert('Account suspended', msg);
        setError(msg);
        return;
      }
      setError(err.message || 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthScreenShell title="Welcome back">
      <AuthError message={error} />
      <AuthField
        label="Email or phone"
        autoCapitalize="none"
        autoCorrect={false}
        value={identifier}
        onChangeText={setIdentifier}
        placeholder="you@school.edu"
      />
      <AuthPasswordField
        label="Password"
        value={password}
        onChangeText={setPassword}
        placeholder="••••••••"
      />
      <AuthLink label="Forgot password?" onPress={() => router.push('/(auth)/forgot-password')} />
      <AuthPrimaryButton label={busy ? 'Signing in…' : 'Log in'} disabled={busy} onPress={onSubmit} />
      <AuthSecondaryButton
        label="Continue with Google"
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
      <AuthLink label="Create an account" onPress={() => router.push('/(auth)/signup')} />
    </AuthScreenShell>
  );
}
