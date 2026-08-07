import { useState } from 'react';
import { ScrollView } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import {
  AuthError,
  AuthField,
  AuthPrimaryButton,
  AuthScreenShell,
} from '@/components/auth/auth-ui';
import { OtpBoxes, ResendCooldown } from '@/components/auth/otp-boxes';
import { useAuth } from '@/auth/AuthProvider';

export default function ResetPasswordScreen() {
  const { identifier: idParam } = useLocalSearchParams<{ identifier?: string }>();
  const identifier = String(idParam || '');
  const { resetPassword, resendOtp, forgotPassword } = useAuth();
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    setError(null);
    setBusy(true);
    try {
      await resetPassword(identifier, code.trim(), password);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Reset failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthScreenShell
      title="Reset password"
      subtitle="Enter the code from your email and choose a new password."
      showBack
    >
      <ScrollView keyboardShouldPersistTaps="handled">
        <AuthError message={error} />
        <OtpBoxes value={code} onChange={setCode} />
        <AuthField
          label="New password"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          placeholder="At least 8 characters"
        />
        <AuthPrimaryButton
          label={busy ? 'Saving…' : 'Update password'}
          disabled={busy || code.trim().length < 6 || password.length < 8}
          onPress={onSubmit}
        />
        <ResendCooldown
          onResend={async () => {
            if (identifier.includes('@')) {
              await resendOtp(identifier, 'PASSWORD_RESET');
            } else {
              await forgotPassword(identifier);
            }
          }}
        />
      </ScrollView>
    </AuthScreenShell>
  );
}
