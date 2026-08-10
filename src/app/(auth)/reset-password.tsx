import { useState } from 'react';
import { ScrollView } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import {
  AuthError,
  AuthPrimaryButton,
  AuthScreenShell,
} from '@/components/auth/auth-ui';
import { AuthPasswordField } from '@/components/auth/password-field';
import { OtpBoxes, ResendCooldown } from '@/components/auth/otp-boxes';
import { useAuth } from '@/auth/AuthProvider';
import { isPasswordLongEnough, PASSWORD_MIN_LENGTH } from '@/auth/password-strength';

export default function ResetPasswordScreen() {
  const { identifier: idParam } = useLocalSearchParams<{ identifier?: string }>();
  const identifier = String(idParam || '');
  const { resetPassword, resendOtp, forgotPassword } = useAuth();
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    setError(null);
    if (!isPasswordLongEnough(password)) {
      setError(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await resetPassword(identifier, code.trim(), password);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Reset failed');
    } finally {
      setBusy(false);
    }
  }

  const canSubmit =
    !busy &&
    code.trim().length >= 6 &&
    isPasswordLongEnough(password) &&
    password === confirmPassword;

  return (
    <AuthScreenShell
      title="Reset password"
      subtitle="Enter the code from your email and choose a new password."
      showBack
    >
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }}>
        <AuthError message={error} />
        <OtpBoxes value={code} onChange={setCode} />
        <AuthPasswordField
          label="New password"
          value={password}
          onChangeText={setPassword}
          placeholder={`At least ${PASSWORD_MIN_LENGTH} characters`}
          showStrength
        />
        <AuthPasswordField
          label="Confirm password"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          placeholder="Re-enter password"
        />
        <AuthPrimaryButton
          label={busy ? 'Saving…' : 'Update password'}
          disabled={!canSubmit}
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
