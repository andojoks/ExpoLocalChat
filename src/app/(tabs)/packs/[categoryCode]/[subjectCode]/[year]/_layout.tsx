import { Stack } from 'expo-router';

/** Nested stack so paper/question screens are registered under the pack hub. */
export default function PackYearLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTintColor: '#2563EB',
        headerTitleStyle: { fontWeight: '700', color: '#0B1424' },
        headerStyle: { backgroundColor: '#FFFFFF' },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: '#FFFFFF' },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Papers' }} />
      <Stack.Screen name="paper/[paperId]" options={{ title: 'Questions' }} />
      <Stack.Screen name="question/[questionId]" options={{ title: 'Question' }} />
    </Stack>
  );
}
