import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { StreakSnapshot } from '@/study/streak-api';
import { BRAND_BLUE, BRAND_GOLD } from '@/theme/brand';
import { useTheme } from '@/theme/ThemeProvider';
import { cardChrome } from '@/theme/tokens';
import { LABEL_TEXT_ANDROID } from '@/components/ui/app-text';

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function labelsForLast7(): string[] {
  const labels: string[] = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const wd = d.getDay();
    labels.push(DAY_LABELS[wd === 0 ? 6 : wd - 1]);
  }
  return labels;
}

export function HomeStreakSection({ streak }: { streak: StreakSnapshot | null }) {
  const { colors } = useTheme();
  const count = streak?.currentStreakDays ?? 0;
  const days = streak?.last7DaysActive?.length === 7 ? streak.last7DaysActive : null;
  const labels = labelsForLast7();

  return (
    <View className="mb-8">
      <View className="mb-4 px-0.5">
        <Text
          className="text-[11px] font-semibold uppercase text-subtle"
          style={[LABEL_TEXT_ANDROID, { letterSpacing: 2.0 }]}
        >
          Progress
        </Text>
        <Text className="mt-1 text-[22px] font-black tracking-tight text-ink">
          Study streak
        </Text>
      </View>

      <View
        className="rounded-[24px] bg-surface px-4 py-4"
        style={cardChrome(colors)}
      >
        <View className="flex-row items-center gap-3.5">
          <View
            className="h-12 w-12 items-center justify-center rounded-[14px]"
            style={{ backgroundColor: colors.iconBg }}
          >
            <Ionicons name="flame-outline" size={22} color={BRAND_BLUE} />
          </View>
          <View className="min-w-0 flex-1">
            <Text
              className="text-[28px] font-black text-ink"
              style={[LABEL_TEXT_ANDROID, { letterSpacing: -0.6 }]}
            >
              {streak ? count : '—'}
              <Text className="text-[13px] font-semibold text-muted">
                {' '}
                {count === 1 ? 'day' : 'days'}
              </Text>
            </Text>
            <Text className="mt-0.5 text-[13px] text-muted">Keep it alive today</Text>
          </View>
          <Ionicons name="flame" size={18} color={BRAND_GOLD} />
        </View>

        <View className="mt-4 flex-row justify-between border-t border-line pt-4">
          {(days || Array.from({ length: 7 }, () => false)).map((active, i) => {
            const isToday = i === 6;
            return (
              <View key={`d-${i}`} className="items-center">
                <View
                  className="h-8 w-8 items-center justify-center rounded-full"
                  style={
                    active
                      ? { backgroundColor: BRAND_BLUE }
                      : {
                          backgroundColor: colors.surfaceMuted,
                          borderWidth: isToday ? 1 : 0,
                          borderColor: colors.selectedBorder,
                        }
                  }
                >
                  <Text
                    className="text-[10px] font-bold"
                    style={[
                      LABEL_TEXT_ANDROID,
                      { color: active ? '#FFFFFF' : colors.subtle },
                    ]}
                  >
                    {labels[i]}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}
