import { View, Text } from 'react-native';
import { BotAvatar } from '@/components/chat/message-card';
import { BRAND_BLUE } from '@/theme/brand';
import { LABEL_TEXT_ANDROID } from '@/components/ui/app-text';

/** Empty-state welcome — UI only, never part of chat history / agent context. */
export function WelcomeHero() {
  return (
    <View className="flex-1 items-center justify-center px-8">
      <View className="w-full max-w-md items-center">
        <BotAvatar large />
        <Text
          className="mt-5 text-center text-[26px] font-black tracking-tight text-ink"
          style={[LABEL_TEXT_ANDROID, { letterSpacing: -0.4 }]}
        >
          Ready to study
        </Text>
        <Text className="mt-3 text-center text-[15px] leading-6 text-slate-500">
          Ask for a paper, a topic, or help explaining a question from your installed packs.
        </Text>
        <View
          className="mt-6 self-stretch rounded-[22px] px-4 py-3.5"
          style={{
            backgroundColor: '#FFFFFF',
            borderWidth: 1,
            borderColor: '#E8EEF4',
          }}
        >
          <Text
            className="text-[11px] font-semibold uppercase text-[#94A3B8]"
            style={[LABEL_TEXT_ANDROID, { letterSpacing: 1.6 }]}
          >
            Try asking
          </Text>
          <Text className="mt-1.5 text-[13px] leading-5 text-slate-600">
            “Show Biology 2022 papers” or “Explain photosynthesis from my packs”
          </Text>
          <View className="mt-3 flex-row items-center gap-2">
            <View
              className="h-7 w-7 items-center justify-center rounded-[10px]"
              style={{ backgroundColor: '#EFF6FF' }}
            >
              <Text style={{ color: BRAND_BLUE, fontSize: 12, fontWeight: '800' }}>AI</Text>
            </View>
            <Text className="flex-1 text-[12px] text-slate-400">
              Answers stay grounded in packs on this device
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}
