import { memo, useRef, useState } from 'react';
import { LayoutChangeEvent, Pressable, View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { AgentDebugStep, AgentTiming, ToolTrace } from '@/domain/types';
import { AGENT_DEBUG } from '@/config/debug';

export const ToolDebugPanel = memo(function ToolDebugPanel({
  toolCalls,
  agentDebug,
  timing,
  onExpandBy,
}: {
  toolCalls?: ToolTrace[];
  agentDebug?: AgentDebugStep[];
  timing?: AgentTiming;
  /** Inverted list: shift scroll by expanded height so the reply stays on screen. */
  onExpandBy?: (deltaPx: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const bodyHeightRef = useRef(0);
  const compensatedOpenRef = useRef(false);
  if (!AGENT_DEBUG) return null;

  const empty = !toolCalls?.length && !agentDebug?.length;
  const stepCount = (agentDebug?.length || 0) + (toolCalls?.length || 0);
  const timingLabel = timing
    ? `${formatDuration(timing.elapsedMs)} · ${timing.outputTokens} tok · ${timing.tokensPerSecond} tok/s`
    : null;

  const onBodyLayout = (event: LayoutChangeEvent) => {
    const height = event.nativeEvent.layout.height;
    const prev = bodyHeightRef.current;
    bodyHeightRef.current = height;
    if (!open || height <= 0) return;
    // Compensate once per open so nested layout passes don't stack.
    if (compensatedOpenRef.current) return;
    if (prev > 0 && height <= prev) return;
    compensatedOpenRef.current = true;
    onExpandBy?.(prev === 0 ? height : height - prev);
  };

  return (
    <View className="mt-3 border-t border-line pt-2">
      <Pressable
        onPress={() => {
          setOpen((v) => {
            if (v) {
              bodyHeightRef.current = 0;
              compensatedOpenRef.current = false;
            } else {
              compensatedOpenRef.current = false;
            }
            return !v;
          });
        }}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        className="flex-row items-start justify-between gap-2 py-0.5"
      >
        <View className="min-w-0 flex-1 gap-0.5">
          <View className="flex-row flex-wrap items-center gap-x-1.5 gap-y-0.5">
            <Ionicons name="bug-outline" size={12} color="#668078" />
            <Text className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
              Agent debug
            </Text>
            {!empty && (
              <Text className="text-[10px] text-slate-400">
                · {stepCount} step{stepCount === 1 ? '' : 's'}
              </Text>
            )}
          </View>
          {!!timingLabel && (
            <Text className="text-[10px] leading-4 text-slate-400">{timingLabel}</Text>
          )}
        </View>
        <Ionicons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={14}
          color="#668078"
          style={{ marginTop: 1 }}
        />
      </Pressable>

      {open && (
        <View className="mt-2 gap-2" onLayout={onBodyLayout}>
          {empty ? (
            <Text className="text-[10px] text-slate-400">
              Debug: no tool steps recorded this turn
            </Text>
          ) : (
            <>
              {!!agentDebug?.length && (
                <View className="gap-1.5">
                  <Text className="text-[10px] font-semibold text-slate-500">Runtime steps</Text>
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
                    <View key={`${tool.name}-${index}`} className="rounded-md bg-slate-50 px-2.5 py-2">
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
            </>
          )}
        </View>
      )}
    </View>
  );
});

function formatDuration(ms: number) {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)} s`;
}
