import { useEffect, useMemo } from 'react';
import { Animated, Text, View } from 'react-native';
import type { AgentPhase } from '@/ai/agent';
import { BotAvatar } from './message-card';

const PHASE_LABEL: Record<AgentPhase, string> = {
  plan: 'Planning next step…',
  tool: 'Looking up the question bank…',
  answer: 'Writing a reply…',
};

export function ThinkingBubble({ phase }: { phase?: AgentPhase | null }) {
  return (
    <View className="flex-row items-end gap-2.5">
      <BotAvatar />
      <View className="rounded-[22px] rounded-bl-md border border-white bg-white px-4 py-3 shadow-sm">
        <TypingDots />
        {!!phase && (
          <Text className="mt-2 text-[11px] font-medium text-slate-500">{PHASE_LABEL[phase]}</Text>
        )}
      </View>
    </View>
  );
}

function TypingDots() {
  const values = useMemo(() => [0, 1, 2].map(() => new Animated.Value(0.35)), []);
  useEffect(() => {
    const loops = values.map((value, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(index * 140),
          Animated.timing(value, { toValue: 1, duration: 260, useNativeDriver: true }),
          Animated.timing(value, { toValue: 0.35, duration: 260, useNativeDriver: true }),
          Animated.delay(280 - index * 90),
        ]),
      ),
    );
    loops.forEach((loop) => loop.start());
    return () => loops.forEach((loop) => loop.stop());
  }, [values]);

  return (
    <View className="h-5 flex-row items-center gap-1.5">
      {values.map((value, index) => (
        <Animated.View
          key={index}
          className="h-2 w-2 rounded-full bg-forest"
          style={{
            opacity: value,
            transform: [
              {
                translateY: value.interpolate({
                  inputRange: [0.35, 1],
                  outputRange: [0, -3],
                }),
              },
            ],
          }}
        />
      ))}
    </View>
  );
}
