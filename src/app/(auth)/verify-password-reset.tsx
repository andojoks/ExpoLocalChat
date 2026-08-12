import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  AuthError,
  AuthPrimaryButton,
  AuthScreenShell,
} from '@/components/auth/auth-ui';
import { OtpBoxes, ResendCooldown } from '@/components/auth/otp-boxes';
import { useAuth } from '@/auth/AuthProvider';
import { setPendingAuth } from '@/auth/pending-auth';

const RESEND_SECONDS = 60;

export default function VerifyPasswordResetScreen() {
  const { identifier: idParam } = useLocalSearchParams<{ identifier?: string }>();
  const identifier = String(idParam || '');
  const router = useRouter();
  const { verifyPasswordResetOtp, resendOtp, forgotPassword } = useAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!identifier.trim()) return;
    void setPendingAuth({ screen: 'verify-password-reset', identifier: identifier.trim() });
  }, [identifier]);

  async function onSubmit() {
    setError(null);
    setBusy(true);
    try {
      const trimmed = code.trim();
      await verifyPasswordResetOtp(identifier, trimmed);
      await setPendingAuth({
        screen: 'reset-password',
        identifier: identifier.trim(),
        code: trimmed,
      });
      router.replace({
        pathname: '/(auth)/reset-password',
        params: { identifier: identifier.trim(), code: trimmed },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid or expired code');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthScreenShell
      title="Check your email"
      subtitle={`Enter the 6-digit reset code we sent for ${identifier || 'your account'}.`}
      showBack
    >
      <AuthError message={error} />
      <OtpBoxes value={code} onChange={setCode} />
      <AuthPrimaryButton
        label={busy ? 'Verifying…' : 'Verify code'}
        disabled={busy || code.trim().length < 6 || !identifier.trim()}
        onPress={onSubmit}
      />
      <ResendCooldown
        seconds={RESEND_SECONDS}
        onResend={async () => {
          if (identifier.includes('@')) {
            await resendOtp(identifier, 'PASSWORD_RESET');
          } else {
            await forgotPassword(identifier);
          }
        }}
      />
      <Text className="mt-2 text-center text-xs text-[#94A3B8]">
        Codes expire in 10 minutes. You can resend after 1 minute.
      </Text>
    </AuthScreenShell>
  );
}
