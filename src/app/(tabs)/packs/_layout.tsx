import { Stack } from 'expo-router';

export default function PacksStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#FFFFFF' },
      }}
    />
  );
}
