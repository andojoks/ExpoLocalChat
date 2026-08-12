import { useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { CountryCode } from 'libphonenumber-js';
import {
  AuthError,
  AuthField,
  AuthLink,
  AuthPrimaryButton,
  AuthScreenShell,
} from '@/components/auth/auth-ui';
import { AuthPasswordField } from '@/components/auth/password-field';
import { PhoneField } from '@/components/auth/phone-field';
import { useAuth } from '@/auth/AuthProvider';
import { getTermsUrl } from '@/config/api';
import {
  DEFAULT_PHONE_COUNTRY,
  toE164,
  validateOptionalPhone,
} from '@/auth/phone';
import { isPasswordLongEnough, PASSWORD_MIN_LENGTH } from '@/auth/password-strength';
import { setPendingAuth } from '@/auth/pending-auth';

export default function SignupScreen() {
  const { signUp } = useAuth();
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneCountry, setPhoneCountry] = useState<CountryCode>(DEFAULT_PHONE_COUNTRY);
  const [phoneNational, setPhoneNational] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    setError(null);
    if (!accepted) {
      setError('Please accept the terms of service to continue.');
      return;
    }
    if (!isPasswordLongEnough(password)) {
      setError(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    const phoneError = validateOptionalPhone(phoneNational, phoneCountry);
    if (phoneError) {
      setError(phoneError);
      return;
    }
    const phone = toE164(phoneNational, phoneCountry) ?? undefined;

    setBusy(true);
    try {
      const result = await signUp({
        name: name.trim() || undefined,
        email: email.trim(),
        password,
        phone,
      });
      await setPendingAuth({ screen: 'verify-email', email: result.email });
      router.replace({ pathname: '/(auth)/verify-email', params: { email: result.email } });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Signup failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthScreenShell
      title="Create account"
      subtitle="We’ll send a verification code to your email."
      showBack
    >
      <AuthError message={error} />
      <AuthField label="Name" value={name} onChangeText={setName} placeholder="Optional" />
      <AuthField
        label="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
        placeholder="you@school.edu"
      />
      <PhoneField
        country={phoneCountry}
        nationalNumber={phoneNational}
        onCountryChange={setPhoneCountry}
        onNationalChange={setPhoneNational}
      />
      <AuthPasswordField
        label="Password"
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
      <Pressable
        onPress={() => setAccepted((x) => !x)}
        className="mb-2 mt-1 flex-row items-start gap-3"
      >
        <View
          className="mt-0.5 h-5 w-5 items-center justify-center"
          style={{
            borderRadius: 6,
            borderWidth: 1,
            borderColor: accepted ? '#0548E8' : '#E8EEF4',
            backgroundColor: accepted ? '#0548E8' : '#FFFFFF',
          }}
        >
          {accepted ? <Text className="text-[10px] font-bold text-white">✓</Text> : null}
        </View>
        <Text className="flex-1 text-sm leading-5 text-slate-600">
          I agree to the{' '}
          <Text
            className="font-semibold text-[#0548E8]"
            onPress={() => void Linking.openURL(getTermsUrl())}
          >
            Terms of Service
          </Text>
        </Text>
      </Pressable>
      <AuthPrimaryButton
        label={busy ? 'Creating…' : 'Create account'}
        disabled={busy}
        onPress={onSubmit}
      />
      <AuthLink
        label="Already have an account? Log in"
        onPress={() => router.push('/(auth)/login')}
      />
    </AuthScreenShell>
  );
}
