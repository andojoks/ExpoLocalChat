import { memo } from 'react';
import { View, Text, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ChatMessage } from '@/domain/types';
import type { AgentPhase } from '@/ai/agent';
import { RichMarkdown } from '@/components/rich-markdown';
import { ThinkingIndicator } from './thinking-bubble';
import { ToolDebugPanel } from './tool-debug-panel';

function messagePropsEqual(
  prev: {
    message: ChatMessage;
    thinking?: boolean;
    phase?: AgentPhase | null;
    onDebugExpandBy?: (deltaPx: number) => void;
  },
  next: {
    message: ChatMessage;
    thinking?: boolean;
    phase?: AgentPhase | null;
    onDebugExpandBy?: (deltaPx: number) => void;
  },
) {
  const a = prev.message;
  const b = next.message;
  return (
    a.id === b.id &&
    a.content === b.content &&
    a.role === b.role &&
    a.createdAt === b.createdAt &&
    a.toolCalls === b.toolCalls &&
    a.agentDebug === b.agentDebug &&
    a.agentTiming === b.agentTiming &&
    prev.thinking === next.thinking &&
    prev.phase === next.phase &&
    prev.onDebugExpandBy === next.onDebugExpandBy
  );
}

export const MessageCard = memo(function MessageCard({
  message,
  thinking = false,
  phase = null,
  onDebugExpandBy,
}: {
  message: ChatMessage;
  /** Empty assistant placeholder while the agent is working — show one thinking UI, not "…". */
  thinking?: boolean;
  phase?: AgentPhase | null;
  onDebugExpandBy?: (deltaPx: number) => void;
}) {
  if (!message) return null;
  const user = message.role === 'user';
  const empty = !message.content?.trim();

  return (
    <View className={`flex-row items-end gap-2.5 ${user ? 'justify-end' : 'justify-start'}`}>
      {!user && <BotAvatar />}
      <View className="max-w-[82%]">
        <View
          className={`rounded-2xl px-4 py-3 ${
            user
              ? 'rounded-br-md bg-forest'
              : 'rounded-bl-md border border-line bg-white'
          } ${Platform.OS === 'web' ? '' : 'shadow-sm'}`}
        >
          {empty && !user && thinking ? (
            <ThinkingIndicator phase={phase} />
          ) : empty ? (
            <Text className={`text-[15px] leading-[23px] ${user ? 'text-white/70' : 'text-slate-400'}`}>
              …
            </Text>
          ) : (
            <RichMarkdown inverted={user}>{message.content}</RichMarkdown>
          )}
          {!user && !empty && (
            <ToolDebugPanel
              toolCalls={message.toolCalls}
              agentDebug={message.agentDebug}
              timing={message.agentTiming}
              onExpandBy={onDebugExpandBy}
            />
          )}
        </View>
        {!!message.createdAt && (
          <Text
            className={`mt-1.5 text-[10px] font-medium text-slate-400 ${user ? 'text-right' : 'text-left'}`}
          >
            {formatTime(message.createdAt)}
          </Text>
        )}
      </View>
      {user && <UserAvatar />}
    </View>
  );
}, messagePropsEqual);

export function BotAvatar({ large = false }: { large?: boolean }) {
  return (
    <View
      className={`${large ? 'h-14 w-14 rounded-2xl' : 'h-9 w-9 rounded-xl'} items-center justify-center bg-forest shadow-sm`}
    >
      <View
        className={`${large ? 'h-8 w-8 rounded-xl' : 'h-6 w-6 rounded-lg'} items-center justify-center bg-white/15`}
      >
        <Ionicons name="school" size={large ? 22 : 16} color="white" />
      </View>
    </View>
  );
}

function UserAvatar() {
  return (
    <View className="h-9 w-9 items-center justify-center rounded-xl bg-[#DDE7F6] shadow-sm">
      <Ionicons name="person" size={16} color="#365072" />
    </View>
  );
}

function formatTime(value: number) {
  if (!value) return '';
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(
    new Date(value),
  );
}
