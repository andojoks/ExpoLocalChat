import { Stack } from 'expo-router';
import { SUB_PAGE_BG } from '@/components/subscriptions/sub-chrome';

/** Nested stack; screens use SubInkHeader (edge-to-edge). */
export default function PackYearLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: SUB_PAGE_BG },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="paper/[paperId]" />
      <Stack.Screen name="question/[questionId]" />
    </Stack>
  );
}
