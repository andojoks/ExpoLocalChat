import { useState } from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  AuthError,
  AuthField,
  AuthLink,
  AuthPrimaryButton,
  AuthScreenShell,
} from '@/components/auth/auth-ui';
import { useAuth } from '@/auth/AuthProvider';
import { getTermsUrl } from '@/config/api';

export default function SignupScreen() {
  const { signUp } = useAuth();
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    setError(null);
    if (!accepted) {
      setError('Please accept the terms of service to continue.');
      return;
    }
    setBusy(true);
    try {
      const result = await signUp({
        name: name.trim() || undefined,
        email: email.trim(),
        password,
        phone: phone.trim() || undefined,
      });
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
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
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
        <AuthField
          label="Phone (optional)"
          keyboardType="phone-pad"
          value={phone}
          onChangeText={setPhone}
          placeholder="+234…"
        />
        <AuthField
          label="Password"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          placeholder="At least 8 characters"
        />
        <Pressable
          onPress={() => setAccepted((x) => !x)}
          className="mb-2 mt-1 flex-row items-start gap-3"
        >
          <View
            className={`mt-0.5 h-5 w-5 items-center justify-center rounded border ${accepted ? 'border-forest bg-forest' : 'border-line bg-white'}`}
          >
            {accepted ? <Text className="text-[10px] font-bold text-white">✓</Text> : null}
          </View>
          <Text className="flex-1 text-sm leading-5 text-slate-600">
            I agree to the{' '}
            <Text
              className="font-semibold text-forest"
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
      </ScrollView>
    </AuthScreenShell>
  );
}
