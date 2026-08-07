import { useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import {
  AuthError,
  AuthPrimaryButton,
  AuthScreenShell,
} from '@/components/auth/auth-ui';
import { OtpBoxes, ResendCooldown } from '@/components/auth/otp-boxes';
import { useAuth } from '@/auth/AuthProvider';

export default function VerifyEmailScreen() {
  const { email: emailParam } = useLocalSearchParams<{ email?: string }>();
  const email = String(emailParam || '');
  const { verifyEmail, resendOtp } = useAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    setError(null);
    setBusy(true);
    try {
      await verifyEmail(email, code.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Verification failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthScreenShell
      title="Check your email"
      subtitle={`Enter the 6-digit code we sent to ${email || 'your inbox'}.`}
      showBack
    >
      <ScrollView keyboardShouldPersistTaps="handled">
        <AuthError message={error} />
        <OtpBoxes value={code} onChange={setCode} />
        <AuthPrimaryButton
          label={busy ? 'Verifying…' : 'Verify email'}
          disabled={busy || code.trim().length < 6}
          onPress={onSubmit}
        />
        <ResendCooldown
          onResend={async () => {
            await resendOtp(email, 'EMAIL_VERIFY');
          }}
        />
        <Text className="mt-2 text-center text-xs text-slate-500">
          Codes expire in 10 minutes.
        </Text>
      </ScrollView>
    </AuthScreenShell>
  );
}
