import { useEffect, useMemo } from 'react';
import { Animated, Text, View } from 'react-native';
import type { AgentPhase } from '@/ai/agent';
import { BRAND_BLUE } from '@/theme/brand';

const PHASE_LABEL: Record<AgentPhase, string> = {
  plan: 'Working…',
  tool: 'Looking up your packs…',
  answer: 'Writing reply…',
};

/** Typing dots + optional phase label for an assistant bubble body. */
export function ThinkingIndicator({ phase }: { phase?: AgentPhase | null }) {
  return (
    <View>
      <TypingDots />
      {!!phase && (
        <Text className="mt-2 text-[11px] font-medium text-slate-500">{PHASE_LABEL[phase]}</Text>
      )}
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
          style={{
            height: 8,
            width: 8,
            borderRadius: 999,
            backgroundColor: BRAND_BLUE,
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
