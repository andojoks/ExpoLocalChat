import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ChatMessage } from '@/domain/types';
import { RichMarkdown } from '@/components/rich-markdown';
import { ToolDebugPanel } from './tool-debug-panel';

export function MessageCard({ message }: { message: ChatMessage }) {
  if (!message.content.trim()) return null;
  const user = message.role === 'user';

  return (
    <View className={`flex-row items-end gap-2.5 ${user ? 'justify-end' : 'justify-start'}`}>
      {!user && <BotAvatar />}
      <View className="max-w-[82%]">
        <View
          className={`rounded-[22px] px-4 py-3 shadow-sm ${
            user ? 'rounded-br-md bg-forest' : 'rounded-bl-md border border-white bg-white'
          }`}
        >
          <RichMarkdown inverted={user}>{message.content}</RichMarkdown>
          {!user && (
            <ToolDebugPanel toolCalls={message.toolCalls} agentDebug={message.agentDebug} />
          )}
        </View>
        <Text
          className={`mt-1.5 text-[10px] font-medium text-slate-400 ${user ? 'text-right' : 'text-left'}`}
        >
          {formatTime(message.createdAt)}
        </Text>
      </View>
      {user && <UserAvatar />}
    </View>
  );
}

export function BotAvatar({ large = false }: { large?: boolean }) {
  return (
    <View
      className={`${large ? 'h-14 w-14 rounded-[22px]' : 'h-9 w-9 rounded-2xl'} items-center justify-center bg-forest shadow-sm`}
    >
      <View
        className={`${large ? 'h-8 w-8 rounded-2xl' : 'h-6 w-6 rounded-xl'} items-center justify-center bg-white/15`}
      >
        <Ionicons name="school" size={large ? 22 : 16} color="white" />
      </View>
    </View>
  );
}

function UserAvatar() {
  return (
    <View className="h-9 w-9 items-center justify-center rounded-2xl bg-[#DDE7F6] shadow-sm">
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
