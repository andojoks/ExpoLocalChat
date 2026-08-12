import { memo } from 'react';
import { View, Text, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ChatMessage } from '@/domain/types';
import type { AgentPhase } from '@/ai/agent';
import { RichMarkdown } from '@/components/rich-markdown';
import { ThinkingIndicator } from './thinking-bubble';
import { BRAND_BLUE } from '@/theme/brand';
import { LABEL_TEXT_ANDROID } from '@/components/ui/app-text';

function messagePropsEqual(
  prev: {
    message: ChatMessage;
    thinking?: boolean;
    phase?: AgentPhase | null;
  },
  next: {
    message: ChatMessage;
    thinking?: boolean;
    phase?: AgentPhase | null;
  },
) {
  const a = prev.message;
  const b = next.message;
  return (
    a.id === b.id &&
    a.content === b.content &&
    a.role === b.role &&
    a.createdAt === b.createdAt &&
    prev.thinking === next.thinking &&
    prev.phase === next.phase
  );
}

export const MessageCard = memo(function MessageCard({
  message,
  thinking = false,
  phase = null,
}: {
  message: ChatMessage;
  /** Empty assistant placeholder while the agent is working — show one thinking UI, not "…". */
  thinking?: boolean;
  phase?: AgentPhase | null;
}) {
  if (!message) return null;
  const user = message.role === 'user';
  const empty = !message.content?.trim();

  return (
    <View className={`flex-row items-end gap-2.5 ${user ? 'justify-end' : 'justify-start'}`}>
      {!user && <BotAvatar />}
      <View className="max-w-[82%]">
        <View
          className={`px-4 py-3 ${user ? '' : 'bg-white'}`}
          style={{
            borderRadius: 22,
            borderBottomRightRadius: user ? 8 : 22,
            borderBottomLeftRadius: user ? 22 : 8,
            backgroundColor: user ? BRAND_BLUE : '#FFFFFF',
            borderWidth: user ? 0 : 1,
            borderColor: '#E8EEF4',
            ...(Platform.OS === 'web'
              ? {}
              : {
                  shadowColor: '#0B1424',
                  shadowOpacity: user ? 0.12 : 0.05,
                  shadowRadius: user ? 10 : 12,
                  shadowOffset: { width: 0, height: 4 },
                  elevation: user ? 3 : 2,
                }),
          }}
        >
          {empty && !user && thinking ? (
            <ThinkingIndicator phase={phase} />
          ) : empty ? (
            <Text
              className={`text-[15px] leading-[23px] ${user ? 'text-white/70' : 'text-slate-400'}`}
            >
              …
            </Text>
          ) : (
            <RichMarkdown inverted={user}>{message.content}</RichMarkdown>
          )}
        </View>
        {!!message.createdAt && (
          <Text
            className={`mt-1.5 text-[10px] font-medium text-slate-400 ${user ? 'text-right' : 'text-left'}`}
            style={LABEL_TEXT_ANDROID}
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
      className={`${large ? 'h-14 w-14' : 'h-9 w-9'} items-center justify-center`}
      style={{
        borderRadius: large ? 18 : 14,
        backgroundColor: BRAND_BLUE,
      }}
    >
      <View
        className={`${large ? 'h-8 w-8' : 'h-6 w-6'} items-center justify-center`}
        style={{
          borderRadius: large ? 12 : 8,
          backgroundColor: 'rgba(255,255,255,0.15)',
        }}
      >
        <Ionicons name="school" size={large ? 22 : 16} color="white" />
      </View>
    </View>
  );
}

function UserAvatar() {
  return (
    <View
      className="h-9 w-9 items-center justify-center"
      style={{ borderRadius: 14, backgroundColor: '#EFF6FF' }}
    >
      <Ionicons name="person" size={16} color={BRAND_BLUE} />
    </View>
  );
}

function formatTime(value: number) {
  if (!value) return '';
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(
    new Date(value),
  );
}
