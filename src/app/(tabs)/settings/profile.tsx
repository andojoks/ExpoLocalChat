import { useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/auth/AuthProvider';
import { AuthError, AuthField, AuthPrimaryButton } from '@/components/auth/auth-ui';
import { AppScreenHeader } from '@/components/screen-header';

export default function ProfileScreen() {
  const { user, updateProfile } = useAuth();
  const router = useRouter();
  const [name, setName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSave() {
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      await updateProfile({
        name: name.trim() || null,
        phone: phone.trim() || null,
      });
      setMessage('Profile updated');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View className="flex-1 bg-[#EEF4F8]">
      <AppScreenHeader title="Profile" onBack={() => router.back()} />
      <ScrollView className="px-5 pt-5" keyboardShouldPersistTaps="handled">
        <AuthError message={error} />
        {message ? (
          <View className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2.5">
            <Text className="text-sm text-emerald-700">{message}</Text>
          </View>
        ) : null}
        <AuthField label="Name" value={name} onChangeText={setName} placeholder="Your name" />
        <View className="mb-3.5">
          <Text className="mb-1.5 text-xs font-semibold text-slate-600">Email</Text>
          <TextInput
            editable={false}
            value={user?.email || ''}
            className="rounded-md border border-line bg-slate-50 px-3.5 py-3.5 text-[15px] text-slate-500"
          />
        </View>
        <AuthField
          label="Phone"
          keyboardType="phone-pad"
          value={phone}
          onChangeText={setPhone}
          placeholder="Optional"
        />
        <AuthPrimaryButton label={busy ? 'Saving…' : 'Save changes'} disabled={busy} onPress={onSave} />
      </ScrollView>
    </View>
  );
}
