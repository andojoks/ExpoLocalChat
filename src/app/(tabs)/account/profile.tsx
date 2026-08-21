import { useMemo, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { CountryCode } from 'libphonenumber-js';
import { useAuth } from '@/auth/AuthProvider';
import { AuthError, AuthField, AuthPrimaryButton } from '@/components/auth/auth-ui';
import { PhoneField } from '@/components/auth/phone-field';
import { SubInkHeader } from '@/components/subscriptions/sub-chrome';
import { useTheme } from '@/theme/ThemeProvider';
import {
  DEFAULT_PHONE_COUNTRY,
  splitE164,
  toE164,
  validateOptionalPhone,
} from '@/auth/phone';

export default function ProfileScreen() {
  const { colors } = useTheme();
  const { user, updateProfile } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const initial = useMemo(() => splitE164(user?.phone), [user?.phone]);
  const [name, setName] = useState(user?.name || '');
  const [phoneCountry, setPhoneCountry] = useState<CountryCode>(
    initial.country || DEFAULT_PHONE_COUNTRY,
  );
  const [phoneNational, setPhoneNational] = useState(initial.national);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSave() {
    setError(null);
    setMessage(null);
    const phoneError = validateOptionalPhone(phoneNational, phoneCountry);
    if (phoneError) {
      setError(phoneError);
      return;
    }
    setBusy(true);
    try {
      await updateProfile({
        name: name.trim() || null,
        phone: toE164(phoneNational, phoneCountry),
      });
      setMessage('Profile updated');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View className="flex-1 bg-canvas">
      <SubInkHeader
        title="Profile"
        onBack={() => router.navigate('/(tabs)/account' as never)}
      />
      <ScrollView
        className="px-5 pt-5"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 24) + 16 }}
      >
        <AuthError message={error} />
        {message ? (
          <View className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2.5">
            <Text className="text-sm text-emerald-700">{message}</Text>
          </View>
        ) : null}
        <AuthField label="Name" value={name} onChangeText={setName} placeholder="Your name" />
        <View className="mb-3.5">
          <Text
            className="mb-1.5 px-0.5 text-[11px] font-semibold uppercase text-subtle"
            style={{ letterSpacing: 1.5 }}
          >
            Email
          </Text>
          <TextInput
            editable={false}
            value={user?.email || ''}
            className="px-4 py-3.5 text-[15px] text-muted"
            style={{
              borderRadius: 16,
              borderWidth: 1,
              borderColor: colors.line,
              backgroundColor: colors.surfaceMuted,
            }}
          />
        </View>
        <PhoneField
          label="Phone"
          country={phoneCountry}
          nationalNumber={phoneNational}
          onCountryChange={setPhoneCountry}
          onNationalChange={setPhoneNational}
        />
        <AuthPrimaryButton
          label={busy ? 'Saving…' : 'Save changes'}
          disabled={busy}
          onPress={() => void onSave()}
        />
      </ScrollView>
    </View>
  );
}
