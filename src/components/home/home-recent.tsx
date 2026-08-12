import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { RecentStudyItem } from '@/study/recent-history';
import { BRAND_BLUE } from '@/theme/brand';
import { LABEL_TEXT_ANDROID } from '@/components/ui/app-text';

export function HomeRecentSection({
  items,
  onOpen,
}: {
  items: RecentStudyItem[];
  onOpen: (item: RecentStudyItem) => void;
}) {
  return (
    <View className="mb-4">
      <View className="mb-4 px-0.5">
        <Text
          className="text-[11px] font-semibold uppercase text-[#94A3B8]"
          style={[LABEL_TEXT_ANDROID, { letterSpacing: 2.0 }]}
        >
          Continue
        </Text>
        <Text className="mt-1 text-[22px] font-black tracking-tight text-ink">
          Recent study
        </Text>
      </View>

      {items.length === 0 ? (
        <View
          className="items-center rounded-[24px] bg-white/80 px-6 py-10"
          style={{ borderWidth: 1, borderColor: '#E8EEF4' }}
        >
          <View
            className="mb-3 h-12 w-12 items-center justify-center rounded-[14px]"
            style={{ backgroundColor: '#EFF6FF' }}
          >
            <Ionicons name="book-outline" size={20} color={BRAND_BLUE} />
          </View>
          <Text className="text-center text-[15px] font-bold text-ink">Your shelf is clear</Text>
          <Text className="mt-1.5 text-center text-[13px] leading-5 text-slate-500">
            Papers you open will land here for a one-tap return.
          </Text>
        </View>
      ) : (
        <View className="gap-3">
          {items.map((item) => (
            <Pressable
              key={item.id}
              onPress={() => onOpen(item)}
              className="flex-row items-center gap-3.5 rounded-[22px] bg-white px-4 py-3.5"
              style={{
                borderWidth: 1,
                borderColor: '#E8EEF4',
                shadowColor: '#0B1424',
                shadowOpacity: 0.04,
                shadowRadius: 12,
                shadowOffset: { width: 0, height: 4 },
                elevation: 1,
              }}
            >
              <View
                className="h-11 w-11 items-center justify-center rounded-[14px]"
                style={{ backgroundColor: '#EFF6FF' }}
              >
                <Ionicons
                  name={item.kind === 'paper' ? 'document-text-outline' : 'help-buoy-outline'}
                  size={18}
                  color={BRAND_BLUE}
                />
              </View>
              <View className="min-w-0 flex-1">
                <Text
                  className="text-[11px] font-semibold uppercase text-[#94A3B8]"
                  style={[LABEL_TEXT_ANDROID, { letterSpacing: 1.3 }]}
                >
                  {item.kind === 'paper' ? 'Paper' : 'Question'}
                </Text>
                <Text
                  className="mt-0.5 text-[15px] font-bold text-ink"
                  numberOfLines={1}
                  style={LABEL_TEXT_ANDROID}
                >
                  {item.title}
                </Text>
                {item.subtitle ? (
                  <Text
                    className="mt-0.5 text-[12px] text-slate-500"
                    numberOfLines={1}
                    style={LABEL_TEXT_ANDROID}
                  >
                    {item.subtitle}
                  </Text>
                ) : null}
              </View>
              <View className="h-8 w-8 items-center justify-center rounded-full bg-[#F1F5F9]">
                <Ionicons name="chevron-forward" size={15} color="#94A3B8" />
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}
