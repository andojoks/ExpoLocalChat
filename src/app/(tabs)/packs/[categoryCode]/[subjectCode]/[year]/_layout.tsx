import { Stack } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';

/** Nested stack; screens use SubInkHeader (edge-to-edge). */
export default function PackYearLayout() {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: colors.canvas },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="paper/[paperId]" />
      <Stack.Screen name="question/[questionId]" />
    </Stack>
  );
}
