import { Text, View } from 'react-native';
import type { AgentPhase } from '@/ai/agent';
import { AGENT_DEBUG } from '@/config/debug';
import { getChatGpuStatus, type ChatGpuStatus } from '@/ai/chat-provider';

const PHASE_LABEL: Record<AgentPhase, string> = {
  plan: 'Planning next step',
  tool: 'Running tools',
  answer: 'Answering',
};

function gpuLabel(gpu: ChatGpuStatus): string {
  if (gpu.enabled && gpu.backend === 'hexagon') return 'NPU on · Hexagon';
  if (gpu.enabled && gpu.backend === 'metal') return 'GPU on · Metal';
  if (gpu.enabled) return 'GPU on · OpenCL';
  const reason = gpu.reason ? ` · ${gpu.reason}` : '';
  return `CPU${reason}`;
}

export function AgentStatusBar({
  providerName,
  phase,
  busy,
}: {
  providerName: string;
  phase?: AgentPhase | null;
  busy: boolean;
}) {
  const gpu = AGENT_DEBUG ? getChatGpuStatus() : null;
  const label = busy && phase ? PHASE_LABEL[phase] : AGENT_DEBUG ? providerName : 'Ready to help';

  return (
    <View className="gap-1">
      <View className="flex-row items-center gap-2">
        <View className={`h-2 w-2 rounded-full ${busy ? 'bg-amber-400' : 'bg-emerald-500'}`} />
        <Text numberOfLines={1} className="flex-1 text-xs font-medium text-slate-500">
          {label}
        </Text>
        {AGENT_DEBUG && (
          <Text className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
            DEBUG
          </Text>
        )}
      </View>
      {AGENT_DEBUG && gpu && (
        <Text numberOfLines={2} className="text-[10px] text-slate-400">
          {gpuLabel(gpu)}
        </Text>
      )}
    </View>
  );
}