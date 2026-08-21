import { Text, View } from 'react-native';
import type { AgentPhase } from '@/ai/agent';

const PHASE_LABEL: Record<AgentPhase, string> = {
  plan: 'Planning next step',
  tool: 'Running tools',
  answer: 'Answering',
};

export function AgentStatusBar({
  phase,
  busy,
}: {
  providerName?: string;
  phase?: AgentPhase | null;
  busy: boolean;
}) {
  const label = busy && phase ? PHASE_LABEL[phase] : 'Ready to help';

  return (
    <View className="flex-row items-center gap-2">
      <View
        className="h-2 w-2 rounded-full"
        style={{ backgroundColor: busy ? '#F59E0B' : '#10B981' }}
      />
      <Text numberOfLines={1} className="flex-1 text-xs font-medium text-muted">
        {label}
      </Text>
    </View>
  );
}
