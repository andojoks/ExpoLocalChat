import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { AgentDebugStep, ToolTrace } from '@/domain/types';
import { AGENT_DEBUG } from '@/config/debug';

export function ToolDebugPanel({
  toolCalls,
  agentDebug,
}: {
  toolCalls?: ToolTrace[];
  agentDebug?: AgentDebugStep[];
}) {
  if (!AGENT_DEBUG) return null;
  if (!toolCalls?.length && !agentDebug?.length) {
    return (
      <View className="mt-3 border-t border-line pt-2">
        <Text className="text-[10px] text-slate-400">Debug: no tool steps recorded this turn</Text>
      </View>
    );
  }

  return (
    <View className="mt-3 gap-2 border-t border-line pt-2">
      <View className="flex-row items-center gap-1.5">
        <Ionicons name="bug-outline" size={12} color="#668078" />
        <Text className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
          Agent debug
        </Text>
      </View>
      {!!agentDebug?.length && (
        <View className="gap-1.5">
          <Text className="text-[10px] font-semibold text-slate-500">Decide loop</Text>
          {agentDebug.map((step) => (
            <Text
              key={`dbg-${step.step}-${step.action}-${step.tool || ''}`}
              className="font-mono text-[10px] leading-4 text-slate-600"
            >
              #{step.step} {step.action}
              {step.tool ? ` → ${step.tool}` : ''}
              {step.note ? ` · ${step.note}` : ''}
              {step.goal ? ` · ${step.goal}` : ''}
              {step.arguments ? `\n${JSON.stringify(step.arguments)}` : ''}
            </Text>
          ))}
        </View>
      )}
      {!!toolCalls?.length && (
        <View className="gap-1.5">
          <Text className="text-[10px] font-semibold text-slate-500">Tool results</Text>
          {toolCalls.map((tool, index) => (
            <View key={`${tool.name}-${index}`} className="rounded-xl bg-slate-50 px-2.5 py-2">
              <Text className="text-[11px] font-semibold text-forest">
                {tool.name}
                {tool.resultCount !== undefined
                  ? ` · ${tool.resultCount} result${tool.resultCount === 1 ? '' : 's'}`
                  : ''}
              </Text>
              <Text className="mt-1 font-mono text-[10px] leading-4 text-slate-600">
                args: {JSON.stringify(tool.input, null, 2)}
              </Text>
              {tool.preview != null && (
                <Text className="mt-1 font-mono text-[10px] leading-4 text-slate-500">
                  out: {JSON.stringify(tool.preview, null, 2)}
                </Text>
              )}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
