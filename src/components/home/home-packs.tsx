import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { LearnerPackSummary } from '@/subscription/api';
import { formatDateDmY, formatDaysLeft, daysLeftUntil } from '@/subscription/dates';

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
      ring: '#99F6E4',
    };
  }
  if (status === 'expired') {
    return {
      label: 'Expired',
      tone: '#B45309',
      wash: '#FFFBEB',
      ring: '#FDE68A',
    };
  }
  return {
    label: 'Unpaid',
    tone: '#64748B',
    wash: '#F1F5F9',
    ring: '#E2E8F0',
  };
}

function ctaFor(status: PackHomeStatus) {
  if (status === 'active') return 'Open';
  if (status === 'expired') return 'Renew access';
  return 'Activate';
}

export function HomePacksSection({
  packs,
  onOpenPack,
  onCreatePack,
  onManagePacks,
}: {
  packs: LearnerPackSummary[];
  onOpenPack: (pack: LearnerPackSummary, status: PackHomeStatus) => void;
  onCreatePack: () => void;
  onManagePacks: () => void;
}) {
  return (
    <View className="mb-8">
      <View className="mb-4 flex-row items-end justify-between px-0.5">
        <View>
          <Text className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#94A3B8]">
            Subscriptions
          </Text>
          <Text className="mt-1 text-[22px] font-black tracking-tight text-ink">
            Your packs
          </Text>
        </View>
        <Pressable onPress={onManagePacks} hitSlop={10} className="pb-1">
          <Text className="text-[13px] font-semibold text-[#2563EB]">Manage</Text>
        </Pressable>
      </View>

      {packs.length === 0 ? (
        <View
          className="rounded-[24px] bg-white px-5 py-6"
          style={{
            borderWidth: 1,
            borderColor: '#E2E8F0',
            shadowColor: '#0B1424',
            shadowOpacity: 0.06,
            shadowRadius: 18,
            shadowOffset: { width: 0, height: 8 },
            elevation: 3,
          }}
        >
          <View className="mb-4 h-12 w-12 items-center justify-center rounded-2xl bg-[#0B1424]">
            <Ionicons name="layers-outline" size={22} color="#FFFFFF" />
          </View>
          <Text className="text-[18px] font-black tracking-tight text-ink">
            Unlock your first pack
          </Text>
          <Text className="mt-2 text-[14px] leading-6 text-slate-500">
            Choose a category, select courses, and activate offline access in minutes.
          </Text>
          <Pressable
            onPress={onCreatePack}
            className="mt-5 items-center rounded-2xl bg-[#0B1424] py-3.5"
          >
            <Text className="text-[14px] font-bold text-white">Create pack</Text>
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
              <Pressable
                key={pack.id}
                onPress={() => onOpenPack(pack, status)}
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
                <View className="flex-row items-start gap-3.5">
                  <View
                    className="h-12 w-12 items-center justify-center rounded-[16px]"
                    style={{ backgroundColor: meta.wash, borderWidth: 1, borderColor: meta.ring }}
                  >
                    <Text className="text-[15px] font-black" style={{ color: meta.tone }}>
                      {pack.category.code?.slice(0, 2).toUpperCase() || 'EL'}
                    </Text>
                  </View>
                  <View className="min-w-0 flex-1">
                    <View className="flex-row items-center gap-2">
                      <Text
                        className="min-w-0 flex-1 text-[16px] font-bold tracking-tight text-ink"
                        numberOfLines={1}
                      >
                        {pack.category.name}
                      </Text>
                      <View
                        className="rounded-full px-2.5 py-1"
                        style={{ backgroundColor: meta.wash }}
                      >
                        <Text className="text-[10px] font-bold uppercase tracking-wide" style={{ color: meta.tone }}>
                          {meta.label}
                        </Text>
                      </View>
                    </View>

                    {status === 'active' && pack.activeSubscription ? (
                      <Text className="mt-1.5 text-[13px] text-slate-500">
                        {formatDaysLeft(pack.activeSubscription.expiresAt)}
                        {pack.activeSubscription.expiresAt
                          ? ` · ${formatDateDmY(pack.activeSubscription.expiresAt)}`
                          : ''}
                      </Text>
                    ) : status === 'expired' ? (
                      <Text className="mt-1.5 text-[13px] text-slate-500">
                        Renew to restore answer unlocks
                      </Text>
                    ) : (
                      <Text className="mt-1.5 text-[13px] text-slate-500">
                        Ready to activate with MoMo
                      </Text>
                    )}

                    <Text className="mt-2 text-[12px] text-[#94A3B8]" numberOfLines={1}>
                      {pack.courses.length} course{pack.courses.length === 1 ? '' : 's'}
                      {pack.courses.length
                        ? ` · ${pack.courses
                            .slice(0, 2)
                            .map((c) => c.name)
                            .join(', ')}${pack.courses.length > 2 ? '…' : ''}`
                        : ''}
                    </Text>

                    {status === 'active' && daysLeft != null ? (
                      <View className="mt-3.5 h-1.5 overflow-hidden rounded-full bg-[#EEF2F7]">
                        <View
                          className="h-full rounded-full bg-[#38BDF8]"
                          style={{
                            width: `${Math.max(8, Math.min(100, (daysLeft / 30) * 100))}%`,
                          }}
                        />
                      </View>
                    ) : null}

                    <View className="mt-3.5 flex-row items-center justify-between">
                      <Text className="text-[13px] font-bold text-[#0B1424]">
                        {ctaFor(status)}
                      </Text>
                      <View className="h-8 w-8 items-center justify-center rounded-full bg-[#F1F5F9]">
                        <Ionicons name="arrow-forward" size={15} color="#0B1424" />
                      </View>
                    </View>
                  </View>
                </View>
              </Pressable>
            );
          })}

          <Pressable
            onPress={onCreatePack}
            className="flex-row items-center justify-center gap-2 rounded-[22px] py-3.5"
            style={{
              borderWidth: 1,
              borderStyle: 'dashed',
              borderColor: '#CBD5E1',
              backgroundColor: 'rgba(255,255,255,0.55)',
            }}
          >
            <Ionicons name="add" size={18} color="#2563EB" />
            <Text className="text-[14px] font-semibold text-[#2563EB]">Add another pack</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
