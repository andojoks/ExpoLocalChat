import { View, Text } from 'react-native';
import { BotAvatar } from '@/components/chat/message-card';

/** Empty-state welcome — UI only, never part of chat history / agent context. */
export function WelcomeHero() {
  return (
    <View className="flex-1 items-center justify-center px-8">
      <View className="w-full max-w-md items-center">
        <BotAvatar large />
        <Text className="mt-5 text-center text-2xl font-black text-ink">Ready to study</Text>
        <Text className="mt-3 text-center text-[15px] leading-6 text-slate-600">
          Ask for a paper, a topic, or help explaining a question from your installed packs.
        </Text>
      </View>
    </View>
  );
}
