import { useState } from 'react';
import { Text } from 'react-native';
import { useRouter } from 'expo-router';
import {
  AuthError,
  AuthField,
  AuthPrimaryButton,
  AuthScreenShell,
} from '@/components/auth/auth-ui';
import { useAuth } from '@/auth/AuthProvider';
import { setPendingAuth } from '@/auth/pending-auth';

export default function ForgotPasswordScreen() {
  const { forgotPassword } = useAuth();
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    setError(null);
    setBusy(true);
    try {
      const trimmed = identifier.trim();
      await forgotPassword(trimmed);
      await setPendingAuth({ screen: 'verify-password-reset', identifier: trimmed });
      router.push({
        pathname: '/(auth)/verify-password-reset',
        params: { identifier: trimmed },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthScreenShell
      title="Forgot password"
      subtitle="Enter your email or phone. If an account exists, we’ll email a reset code."
      showBack
    >
      <AuthError message={error} />
      <AuthField
        label="Email or phone"
        autoCapitalize="none"
        value={identifier}
        onChangeText={setIdentifier}
        placeholder="you@school.edu"
      />
      <AuthPrimaryButton
        label={busy ? 'Sending…' : 'Send reset code'}
        disabled={busy || !identifier.trim()}
        onPress={onSubmit}
      />
      <Text className="mt-4 text-center text-xs text-[#94A3B8]">
        For phone logins, the code is sent to the email on that account.
      </Text>
    </AuthScreenShell>
  );
}
