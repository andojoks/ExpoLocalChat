import { Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import type { StreakSnapshot } from '@/study/streak-api';

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function greetingForHour(hour: number) {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

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

export function HomeWelcome({
  name,
  initial,
  streak,
  activePackCount,
  topInset,
}: {
  name: string;
  initial: string;
  streak: StreakSnapshot | null;
  activePackCount: number;
  topInset: number;
}) {
  const greeting = greetingForHour(new Date().getHours());
  const count = streak?.currentStreakDays ?? 0;
  const days = streak?.last7DaysActive?.length === 7 ? streak.last7DaysActive : null;
  const labels = labelsForLast7();

  return (
    <View
      className="overflow-hidden"
      style={{
        borderBottomLeftRadius: 32,
        borderBottomRightRadius: 32,
      }}
    >
      <LinearGradient
        colors={['#0B1424', '#101C30', '#152844']}
        locations={[0, 0.5, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          paddingTop: topInset + 12,
          paddingBottom: 32,
          paddingHorizontal: 22,
          borderBottomLeftRadius: 32,
          borderBottomRightRadius: 32,
        }}
      >
        {/* Soft theme-blue atmosphere (forest #2563EB), kept low so ink stays dominant */}
        <View
          pointerEvents="none"
          className="absolute -right-20 -top-6 h-52 w-52 rounded-full"
          style={{ backgroundColor: 'rgba(37,99,235,0.14)' }}
        />
        <View
          pointerEvents="none"
          className="absolute -left-24 bottom-8 h-44 w-44 rounded-full"
          style={{ backgroundColor: 'rgba(37,99,235,0.08)' }}
        />

        <View className="flex-row items-start justify-between">
          <View className="min-w-0 flex-1 pr-4">
            <Text className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#64748B]">
              ExpertLearner
            </Text>
            <Text className="mt-3 text-[13px] font-medium text-[#93C5FD]">{greeting}</Text>
            <Text
              className="mt-1 text-[34px] font-black tracking-tight text-white"
              numberOfLines={1}
              style={{ letterSpacing: -0.8 }}
            >
              {name}
            </Text>
          </View>
          <View
            className="h-14 w-14 items-center justify-center rounded-full"
            style={{
              borderWidth: 1,
              borderColor: 'rgba(37,99,235,0.35)',
              backgroundColor: 'rgba(37,99,235,0.12)',
            }}
          >
            <Text className="text-lg font-black text-white">{initial}</Text>
          </View>
        </View>

        {/* Metric glass strip */}
        <View
          className="mt-7 overflow-hidden rounded-[22px]"
          style={{
            borderWidth: 1,
            borderColor: 'rgba(148,163,184,0.14)',
            backgroundColor: 'rgba(11,20,36,0.55)',
          }}
        >
          <View className="flex-row">
            <View className="flex-1 px-4 py-4">
              <View className="flex-row items-center gap-1.5">
                <Ionicons name="flame" size={13} color="#FBBF24" />
                <Text className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#94A3B8]">
                  Streak
                </Text>
              </View>
              <Text className="mt-2 text-[28px] font-black text-white" style={{ letterSpacing: -0.6 }}>
                {streak ? count : '—'}
                <Text className="text-[13px] font-semibold text-[#64748B]">
                  {' '}
                  {count === 1 ? 'day' : 'days'}
                </Text>
              </Text>
              <Text className="mt-1 text-[11px] text-[#64748B]" numberOfLines={1}>
                Keep it alive today
              </Text>
            </View>
            <View
              className="w-px self-stretch"
              style={{ backgroundColor: 'rgba(148,163,184,0.14)' }}
            />
            <View className="flex-1 px-4 py-4">
              <View className="flex-row items-center gap-1.5">
                <Ionicons name="shield-checkmark" size={13} color="#2563EB" />
                <Text className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#94A3B8]">
                  Access
                </Text>
              </View>
              <Text className="mt-2 text-[28px] font-black text-white" style={{ letterSpacing: -0.6 }}>
                {activePackCount}
                <Text className="text-[13px] font-semibold text-[#64748B]">
                  {' '}
                  active
                </Text>
              </Text>
              <Text className="mt-1 text-[11px] text-[#64748B]" numberOfLines={1}>
                Subscription packs
              </Text>
            </View>
          </View>

          <View
            className="flex-row justify-between px-4 pb-4 pt-1"
            style={{ borderTopWidth: 1, borderTopColor: 'rgba(148,163,184,0.1)' }}
          >
            {(days || Array.from({ length: 7 }, () => false)).map((active, i) => {
              const isToday = i === 6;
              return (
                <View key={`d-${i}`} className="items-center gap-1">
                  <View
                    className="h-8 w-8 items-center justify-center rounded-full"
                    style={
                      active
                        ? { backgroundColor: '#2563EB' }
                        : {
                            backgroundColor: 'rgba(255,255,255,0.04)',
                            borderWidth: isToday ? 1 : 0,
                            borderColor: 'rgba(37,99,235,0.45)',
                          }
                    }
                  >
                    <Text
                      className="text-[10px] font-bold"
                      style={{ color: active ? '#FFFFFF' : '#64748B' }}
                    >
                      {labels[i]}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      </LinearGradient>
    </View>
  );
}
