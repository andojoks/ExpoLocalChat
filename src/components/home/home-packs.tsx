import { Platform, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { LearnerPackSummary, PackCourse } from '@/subscription/api';
import { formatDateDmY, formatDaysLeft, daysLeftUntil } from '@/subscription/dates';
import { BRAND_BLUE } from '@/theme/brand';
import { LABEL_TEXT_ANDROID } from '@/components/ui/app-text';

export type PackHomeStatus = 'active' | 'expired' | 'unpaid';

export function packHomeStatus(pack: LearnerPackSummary): PackHomeStatus {
  if (pack.activeSubscription) return 'active';
  if (pack.subscriptions?.length) return 'expired';
  return 'unpaid';
}

function statusMeta(status: PackHomeStatus) {
  if (status === 'active') {
    return {
      label: 'Active',
      tone: '#0F766E',
      wash: '#ECFDF5',
    };
  }
  if (status === 'expired') {
    return {
      label: 'Expired',
      tone: '#B45309',
      wash: '#FFFBEB',
    };
  }
  return {
    label: 'Unpaid',
    tone: '#64748B',
    wash: '#F1F5F9',
  };
}

export function HomePacksSection({
  packs,
  onOpenCourse,
  onCreatePack,
  onManagePacks,
}: {
  packs: LearnerPackSummary[];
  onOpenCourse: (pack: LearnerPackSummary, course: PackCourse) => void;
  onCreatePack: () => void;
  onManagePacks: () => void;
}) {
  return (
    <View className="mb-8">
      <View className="mb-4 flex-row items-end justify-between px-0.5">
        <View>
          <Text
            className="text-[11px] font-semibold uppercase text-[#94A3B8]"
            style={[LABEL_TEXT_ANDROID, { letterSpacing: 2.0 }]}
          >
            Subscriptions
          </Text>
          <Text className="mt-1 text-[22px] font-black tracking-tight text-ink">
            Your packs
          </Text>
        </View>
        <Pressable onPress={onManagePacks} hitSlop={10} className="pb-1">
          <Text className="text-[13px] font-semibold" style={{ color: BRAND_BLUE }}>
            Manage
          </Text>
        </Pressable>
      </View>

      {packs.length === 0 ? (
        <View
          className="rounded-[24px] bg-white px-5 py-6"
          style={{
            borderWidth: 1,
            borderColor: '#E8EEF4',
            shadowColor: '#0B1424',
            shadowOpacity: 0.05,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 6 },
            elevation: 2,
          }}
        >
          <View
            className="mb-4 h-12 w-12 items-center justify-center rounded-[14px]"
            style={{ backgroundColor: '#EFF6FF' }}
          >
            <Ionicons name="layers-outline" size={22} color={BRAND_BLUE} />
          </View>
          <Text className="text-[18px] font-black tracking-tight text-ink">
            Unlock your first pack
          </Text>
          <Text className="mt-2 text-[14px] leading-6 text-slate-500">
            Choose a category, select courses, and activate offline access in minutes.
          </Text>
          <Pressable
            onPress={onCreatePack}
            className="mt-5 rounded-2xl py-3.5"
            style={{ backgroundColor: BRAND_BLUE }}
          >
            <Text
              numberOfLines={1}
              className="text-[14px] font-bold text-white"
              style={[LABEL_TEXT_ANDROID, { width: '100%', textAlign: 'center' }]}
            >
              Create pack
            </Text>
          </Pressable>
        </View>
      ) : (
        <View className="gap-3.5">
          {packs.map((pack) => {
            const status = packHomeStatus(pack);
            const meta = statusMeta(status);
            const daysLeft =
              status === 'active'
                ? daysLeftUntil(pack.activeSubscription?.expiresAt)
                : null;
            return (
              <View
                key={pack.id}
                className="rounded-[24px] bg-white px-4 py-4"
                style={{
                  borderWidth: 1,
                  borderColor: '#E8EEF4',
                  shadowColor: '#0B1424',
                  shadowOpacity: 0.05,
                  shadowRadius: 16,
                  shadowOffset: { width: 0, height: 6 },
                  elevation: 2,
                }}
              >
                <View className="min-w-0">
                  <View className="flex-row items-center gap-2">
                    <Text
                      className="min-w-0 flex-1 text-[16px] font-bold tracking-tight text-ink"
                      numberOfLines={1}
                      style={
                        Platform.OS === 'android'
                          ? { includeFontPadding: false, paddingRight: 2 }
                          : undefined
                      }
                    >
                      {pack.category.name}
                    </Text>
                    <View
                      className="shrink-0 rounded-full px-3 py-1"
                      style={{ backgroundColor: meta.wash }}
                    >
                      <Text
                        className="text-[10px] font-bold uppercase"
                        numberOfLines={1}
                        style={[
                          LABEL_TEXT_ANDROID,
                          {
                            color: meta.tone,
                            letterSpacing: 0.6,
                            paddingRight: Platform.OS === 'android' ? 4 : 0,
                          },
                        ]}
                      >
                        {meta.label}
                      </Text>
                    </View>
                  </View>

                  {status === 'active' && pack.activeSubscription ? (
                    <Text
                      className="mt-1.5 text-[13px] text-slate-500"
                      numberOfLines={1}
                      style={LABEL_TEXT_ANDROID}
                    >
                      {formatDaysLeft(pack.activeSubscription.expiresAt)}
                      {pack.activeSubscription.expiresAt
                        ? ` · ${formatDateDmY(pack.activeSubscription.expiresAt)}`
                        : ''}
                    </Text>
                  ) : status === 'expired' ? (
                    <Text
                      className="mt-1.5 text-[13px] text-slate-500"
                      numberOfLines={1}
                      style={LABEL_TEXT_ANDROID}
                    >
                      Renew to restore answer unlocks
                    </Text>
                  ) : (
                    <Text
                      className="mt-1.5 text-[13px] text-slate-500"
                      numberOfLines={1}
                      style={LABEL_TEXT_ANDROID}
                    >
                      Ready to activate with MoMo
                    </Text>
                  )}

                  {status === 'active' && daysLeft != null ? (
                    <View className="mt-3.5 h-1.5 overflow-hidden rounded-full bg-[#EEF2F7]">
                      <View
                        className="h-full rounded-full"
                        style={{
                          backgroundColor: BRAND_BLUE,
                          width: `${Math.max(8, Math.min(100, (daysLeft / 30) * 100))}%`,
                        }}
                      />
                    </View>
                  ) : null}

                  <View className="mt-3.5 overflow-hidden rounded-2xl bg-[#F8FAFC]">
                    {pack.courses.length === 0 ? (
                      <Text className="px-3.5 py-3 text-[13px] text-slate-400">
                        No courses selected yet
                      </Text>
                    ) : (
                      pack.courses.map((course, idx) => (
                        <Pressable
                          key={course.id}
                          onPress={() => onOpenCourse(pack, course)}
                          className={`flex-row items-center gap-3 px-3.5 py-3 ${
                            idx > 0 ? 'border-t border-[#E8EEF4]' : ''
                          }`}
                        >
                          <View className="h-9 w-9 items-center justify-center rounded-[12px] bg-white">
                            <Ionicons name="book-outline" size={16} color={BRAND_BLUE} />
                          </View>
                          <Text
                            className="min-w-0 flex-1 text-[14px] font-semibold text-ink"
                            numberOfLines={2}
                          >
                            {course.name}
                          </Text>
                          <Ionicons name="chevron-forward" size={15} color="#94A3B8" />
                        </Pressable>
                      ))
                    )}
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}
