import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  AuthError,
  AuthPrimaryButton,
  AuthScreenShell,
} from '@/components/auth/auth-ui';
import { AuthPasswordField } from '@/components/auth/password-field';
import { useAuth } from '@/auth/AuthProvider';
import { isPasswordLongEnough, PASSWORD_MIN_LENGTH } from '@/auth/password-strength';
import { setPendingAuth } from '@/auth/pending-auth';

export default function ResetPasswordScreen() {
  const { identifier: idParam, code: codeParam } = useLocalSearchParams<{
    identifier?: string;
    code?: string;
  }>();
  const identifier = String(idParam || '');
  const code = String(codeParam || '');
  const router = useRouter();
  const { resetPassword } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!identifier.trim() || !code.trim()) {
      router.replace('/(auth)/forgot-password');
      return;
    }
    void setPendingAuth({
      screen: 'reset-password',
      identifier: identifier.trim(),
      code: code.trim(),
    });
  }, [identifier, code, router]);

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
      title="Choose a new password"
      subtitle="Your reset code is verified. Set a new password for your account."
      showBack
    >
      <AuthError message={error} />
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
    </AuthScreenShell>
  );
}
