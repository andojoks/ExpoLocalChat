import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Keyboard,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import { Ionicons } from '@expo/vector-icons';
import {
  clearConversation,
  createConversation,
  ensureConversation,
  listConversations,
  loadConversation,
  migrateDatabase,
  saveMessage,
} from '@/db/database';
import {
  HashEmbeddingProvider,
  type EmbeddingProvider,
  type EmbeddingStatus,
} from '@/ai/embeddings/embedding';
import { createPlatformProvider } from '@/ai/embeddings/platform-provider';
import { downloadModel, getModelState } from '@/ai/embeddings/model-manager';
import { QuestionBankAgent, type AgentPhase } from '@/ai/agent';
import { createChatModel } from '@/ai/chat-provider';
import type { AgentContext, ChatMessage, ContextUsage, ConversationSummary } from '@/domain/types';
import { DEFAULT_MODEL_SERVER_URL, loadServerUrl, saveServerUrl } from '@/config/server-config';
import { AGENT_DEBUG } from '@/config/debug';
import { localTutorErrorMessage } from '@/app/local-error';
import { AgentStatusBar } from '@/components/chat/agent-status';
import { BotAvatar, MessageCard } from '@/components/chat/message-card';
import { SuggestionChips } from '@/components/chat/suggestion-chips';
import { ThinkingBubble } from '@/components/chat/thinking-bubble';

const starter: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  createdAt: 0,
  content:
    '## Welcome to QuestionBank\n\nI am your local study tutor. I can chat naturally, then use the on-device question-bank tools for exact Cameroon GCE questions, answers, topics, papers, and explanations.\n\nAsk me something like: **Show Paper 2 questions from 2024** or **Explain the osmosis question**.',
};

const emptyUsage: ContextUsage = { usedTokens: 0, maxTokens: 2048, percent: 0, full: false };

export default function Screen() {
  return (
    <SQLiteProvider databaseName="questionbank.db" onInit={migrateDatabase}>
      <Chat />
    </SQLiteProvider>
  );
}

function Chat() {
  const db = useSQLiteContext();
  const list = useRef<FlatList>(null);
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<ChatMessage[]>([starter]);
  const [context, setContext] = useState<AgentContext>({});
  const [contextUsage, setContextUsage] = useState<ContextUsage>(emptyUsage);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<AgentPhase | null>(null);
  const [streamingText, setStreamingText] = useState('');
  const [inputHeight, setInputHeight] = useState(46);
  const [full, setFull] = useState(true);
  const [provider, setProvider] = useState<EmbeddingProvider | null>(null);
  const [model, setModel] = useState<EmbeddingStatus>({
    kind: 'missing',
    progress: 0,
    label: 'Checking models...',
  });
  const [serverUrl, setServerUrl] = useState(DEFAULT_MODEL_SERVER_URL);
  const [showServer, setShowServer] = useState(false);
  const [serverMessage, setServerMessage] = useState('');
  const [conversationId, setConversationId] = useState('');
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const chatModel = useMemo(() => createChatModel(), []);
  const agent = useMemo(
    () => (provider ? new QuestionBankAgent(db, provider, chatModel) : null),
    [db, provider, chatModel],
  );

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (event) => {
      setKeyboardHeight(event.endCoordinates.height);
      setTimeout(() => list.current?.scrollToEnd({ animated: true }), 50);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    (async () => {
      const configuredUrl = await loadServerUrl();
      setServerUrl(configuredUrl);
      await bootConversation();
      const state = await getModelState();
      setModel(state.status);
      if (state.path) {
        const p = state.manifest?.mock ? new HashEmbeddingProvider() : createPlatformProvider();
        await p.initialize(state.path);
        setProvider(p);
      }
    })();
  }, [db]);

  async function bootConversation() {
    let summaries = await listConversations(db);
    let active = summaries[0]?.id;
    if (!active) active = await createConversation(db, 'New study chat');
    setConversationId(active);
    await openConversation(active);
    summaries = await listConversations(db);
    setConversations(summaries);
  }

  async function openConversation(idValue: string) {
    await ensureConversation(db, idValue);
    const saved = await loadConversation(db, idValue);
    setConversationId(idValue);
    setMessages(saved.messages.length ? [starter, ...saved.messages] : [starter]);
    setContext(saved.context);
    setContextUsage(estimateUsage(saved.messages));
    setSuggestions([]);
    setMenuOpen(false);
    setTimeout(() => list.current?.scrollToEnd({ animated: false }), 50);
  }

  async function refreshConversationList() {
    setConversations(await listConversations(db));
  }

  async function startNewChat() {
    const newId = await createConversation(db, 'New study chat');
    await refreshConversationList();
    await openConversation(newId);
  }

  async function prepare() {
    try {
      await saveServerUrl(serverUrl);
      const downloaded = await downloadModel(setModel);
      const p = downloaded.manifest.mock ? new HashEmbeddingProvider() : createPlatformProvider();
      await p.initialize(downloaded.path);
      setProvider(p);
    } catch {
      setModel({ kind: 'missing', progress: 0, label: 'Could not download - start model server' });
    }
  }

  async function applyServer() {
    try {
      const saved = await saveServerUrl(serverUrl);
      setServerUrl(saved);
      setServerMessage('Saved. New model downloads will use this server.');
      setShowServer(false);
    } catch (e) {
      setServerMessage(e instanceof Error ? e.message : 'Invalid server URL');
    }
  }

  async function send(value = input) {
    const text = value.trim();
    if (!text || !agent || busy || !conversationId) return;
    setInput('');
    setInputHeight(46);
    setBusy(true);
    setPhase('plan');
    setStreamingText('');
    const user: ChatMessage = { id: id(), role: 'user', content: text, createdAt: Date.now() };
    const assistantId = id();
    const history = [...messages.filter((message) => message.id !== 'welcome'), user];
    setMessages((current) => [
      ...current,
      user,
      { id: assistantId, role: 'assistant', content: '', createdAt: Date.now() },
    ]);
    await saveMessage(db, conversationId, user, context);
    await refreshConversationList();
    try {
      let streamed = '';
      const answer = await agent.invoke(
        { message: text, context, history, fullExplanation: full },
        {
          onPhase: setPhase,
          onToken: (token) => {
            if (!token) return;
            streamed += token;
            setStreamingText(streamed);
            setMessages((current) =>
              current.map((item) =>
                item.id === assistantId ? { ...item, content: streamed } : item,
              ),
            );
            setTimeout(() => list.current?.scrollToEnd({ animated: true }), 0);
          },
        },
      );
      setContext(answer.context);
      setContextUsage(answer.contextUsage);
      setSuggestions(answer.suggestions);
      if (!streamed.trim()) await animateAnswer(answer.content, assistantId);
      const assistant: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        content: answer.content,
        toolCalls: answer.toolCalls,
        agentDebug: answer.agentDebug,
        createdAt: Date.now(),
      };
      setMessages((current) => current.map((item) => (item.id === assistantId ? assistant : item)));
      await saveMessage(db, conversationId, assistant, answer.context);
      await refreshConversationList();
    } catch (e) {
      setMessages((current) =>
        current.map((item) =>
          item.id === assistantId ? { ...item, content: localTutorErrorMessage(e) } : item,
        ),
      );
    } finally {
      setBusy(false);
      setPhase(null);
      setStreamingText('');
      setTimeout(() => list.current?.scrollToEnd({ animated: true }), 40);
    }
  }

  async function animateAnswer(content: string, assistantId: string) {
    const chunks = content.split(/(?<=\s)/);
    let partial = '';
    for (const chunk of chunks) {
      partial += chunk;
      setMessages((current) =>
        current.map((item) => (item.id === assistantId ? { ...item, content: partial } : item)),
      );
      await pause(16);
    }
  }

  async function reset() {
    if (!conversationId) return;
    await clearConversation(db, conversationId);
    setContext({});
    setContextUsage(emptyUsage);
    setSuggestions([]);
    setMessages([starter]);
    await refreshConversationList();
  }

  if (!provider) {
    return (
      <ModelGate
        status={model}
        onDownload={prepare}
        serverUrl={serverUrl}
        onServerUrl={setServerUrl}
        message={serverMessage}
      />
    );
  }

  const chips = [context.subject, context.topic, context.year?.toString()].filter(
    Boolean,
  ) as string[];
  const showStarters = messages.filter((message) => message.id !== 'welcome').length === 0;

  return (
    <SafeAreaView className="flex-1 bg-[#EEF4F1]" edges={['top', 'left', 'right']}>
      <View className="flex-1" style={{ paddingBottom: keyboardHeight > 0 ? keyboardHeight : 0 }}>
        <View className="border-b border-white/70 bg-[#FDFEFE] px-5 pb-3 pt-4 shadow-sm">
          <View className="flex-row items-center justify-between">
            <View className="flex-row flex-1 items-center gap-3 pr-3">
              <IconButton icon="menu" onPress={() => setMenuOpen(true)} />
              <BotAvatar large />
              <View className="flex-1">
                <Text className="text-xl font-black text-ink">QuestionBank AI</Text>
                <View className="mt-1">
                  <AgentStatusBar providerName={provider.name} phase={phase} busy={busy} />
                </View>
              </View>
            </View>
            <View className="flex-row gap-2">
              <IconButton icon="server-outline" onPress={() => setShowServer((x) => !x)} />
              <IconButton icon="refresh" onPress={reset} />
            </View>
          </View>
          <View className="mt-4 flex-row items-center justify-between">
            <View className="flex-1 flex-row flex-wrap gap-2 pr-3">
              {chips.length ? (
                chips.map((x) => <HeaderChip key={x} label={x} />)
              ) : (
                <HeaderChip label="Ready to study" muted />
              )}
              <HeaderChip
                label={`${contextUsage.percent}% context`}
                muted={contextUsage.percent < 70}
              />
            </View>
            <Pressable
              onPress={() => setFull((x) => !x)}
              className={`flex-row items-center gap-1.5 rounded-full px-3 py-2 ${full ? 'bg-forest' : 'bg-slate-200'}`}
            >
              <Ionicons name="sparkles" size={14} color={full ? 'white' : '#526A63'} />
              <Text className={`text-xs font-bold ${full ? 'text-white' : 'text-slate-600'}`}>
                Explain
              </Text>
            </Pressable>
          </View>
        </View>
        {showServer && (
          <ServerPanel
            serverUrl={serverUrl}
            setServerUrl={setServerUrl}
            applyServer={applyServer}
            serverMessage={serverMessage}
          />
        )}
        {contextUsage.full && <ContextFullBanner onNewChat={startNewChat} usage={contextUsage} />}
        <FlatList
          ref={list}
          className="flex-1"
          style={{ flex: 1 }}
          data={messages}
          keyExtractor={(x) => x.id}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: 16,
            paddingTop: 18,
            paddingBottom: 18,
            gap: 16,
          }}
          onContentSizeChange={() => list.current?.scrollToEnd({ animated: true })}
          renderItem={({ item }) => <MessageCard message={item} />}
          ListFooterComponent={
            busy && !streamingText.trim() ? <ThinkingBubble phase={phase} /> : null
          }
        />
        <SuggestionChips
          suggestions={suggestions}
          showStarters={showStarters}
          disabled={busy}
          onSelect={send}
        />
        <View
          className="border-t border-white/70 bg-white px-4 pt-3 shadow-lg"
          style={{
            paddingBottom: keyboardHeight > 0 ? 10 : Math.max(insets.bottom, 10),
          }}
        >
          <View className="flex-row items-end rounded-[24px] border border-slate-200 bg-[#F7FAF8] p-2 shadow-sm">
            <TextInput
              value={input}
              onChangeText={setInput}
              onSubmitEditing={() => send()}
              blurOnSubmit={false}
              multiline
              placeholder="Ask about a paper, topic, question, or explanation..."
              placeholderTextColor="#8A9B96"
              onContentSizeChange={(e) =>
                setInputHeight(Math.min(132, Math.max(46, e.nativeEvent.contentSize.height)))
              }
              style={{ height: inputHeight }}
              className="flex-1 px-3 py-3 text-[15px] leading-5 text-ink"
            />
            <Pressable
              disabled={!input.trim() || busy}
              onPress={() => send()}
              className={`mb-0.5 h-11 w-11 items-center justify-center rounded-2xl ${input.trim() && !busy ? 'bg-forest' : 'bg-slate-200'}`}
            >
              <Ionicons
                name={busy ? 'hourglass-outline' : 'arrow-up'}
                size={21}
                color={input.trim() && !busy ? 'white' : '#92A19C'}
              />
            </Pressable>
          </View>
          {AGENT_DEBUG ? (
            <Text className="pt-2 text-center text-[10px] text-slate-400">
              Debug mode · tool traces on · local SQLite RAG
            </Text>
          ) : (
            <Text className="pt-2 text-center text-[10px] text-slate-400">
              On-device tutor · tools · SQLite memory
            </Text>
          )}
        </View>
      </View>
      {menuOpen && (
        <ChatDrawer
          conversations={conversations}
          activeId={conversationId}
          onClose={() => setMenuOpen(false)}
          onSelect={openConversation}
          onNew={startNewChat}
        />
      )}
    </SafeAreaView>
  );
}

function ChatDrawer({
  conversations,
  activeId,
  onClose,
  onSelect,
  onNew,
}: {
  conversations: ConversationSummary[];
  activeId: string;
  onClose: () => void;
  onSelect: (id: string) => void;
  onNew: () => void;
}) {
  return (
    <View className="absolute inset-0 z-50 flex-row bg-black/25">
      <View className="h-full w-[82%] max-w-sm bg-[#FDFEFE] px-4 pb-6 pt-12 shadow-2xl">
        <View className="mb-4 flex-row items-center justify-between">
          <Text className="text-2xl font-black text-ink">Study chats</Text>
          <IconButton icon="close" onPress={onClose} />
        </View>
        <Pressable
          onPress={onNew}
          className="mb-4 flex-row items-center justify-center gap-2 rounded-2xl bg-forest py-3"
        >
          <Ionicons name="add" size={18} color="white" />
          <Text className="font-bold text-white">Start new chat</Text>
        </Pressable>
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ gap: 10, paddingBottom: 24 }}
          renderItem={({ item }) => {
            const active = item.id === activeId;
            return (
              <Pressable
                onPress={() => onSelect(item.id)}
                className={`rounded-2xl border px-4 py-3 ${active ? 'border-forest bg-[#E2F3EA]' : 'border-line bg-white'}`}
              >
                <Text numberOfLines={1} className="font-bold text-ink">
                  {item.title}
                </Text>
                <Text numberOfLines={2} className="mt-1 text-xs leading-4 text-slate-500">
                  {item.lastMessage || 'No messages yet'}
                </Text>
                <Text className="mt-2 text-[10px] font-medium text-slate-400">
                  {item.messageCount} messages - {formatDate(item.updatedAt)}
                </Text>
              </Pressable>
            );
          }}
        />
      </View>
      <Pressable onPress={onClose} className="flex-1" />
    </View>
  );
}

function HeaderChip({ label, muted }: { label: string; muted?: boolean }) {
  return (
    <Text
      className={`rounded-full px-2.5 py-1 text-xs font-bold ${muted ? 'bg-slate-100 text-slate-500' : 'bg-[#E2F3EA] text-forest'}`}
    >
      {label}
    </Text>
  );
}

function ServerPanel({
  serverUrl,
  setServerUrl,
  applyServer,
  serverMessage,
}: {
  serverUrl: string;
  setServerUrl: (value: string) => void;
  applyServer: () => void;
  serverMessage: string;
}) {
  return (
    <View className="border-b border-line bg-white px-4 py-3">
      <Text className="mb-2 text-xs font-semibold text-slate-600">Development model server</Text>
      <View className="flex-row gap-2">
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          value={serverUrl}
          onChangeText={setServerUrl}
          placeholder="http://192.168.1.10:8787"
          className="flex-1 rounded-xl border border-line bg-paper px-3 py-2 text-sm text-ink"
        />
        <Pressable onPress={applyServer} className="justify-center rounded-xl bg-forest px-4">
          <Text className="font-semibold text-white">Apply</Text>
        </Pressable>
      </View>
      {!!serverMessage && <Text className="mt-2 text-xs text-slate-500">{serverMessage}</Text>}
    </View>
  );
}

function ContextFullBanner({ usage, onNewChat }: { usage: ContextUsage; onNewChat: () => void }) {
  return (
    <View className="border-b border-amber-200 bg-amber-50 px-4 py-3">
      <Text className="text-sm font-bold text-amber-900">
        This chat is nearly full ({usage.percent}% context).
      </Text>
      <Text className="mt-1 text-xs leading-4 text-amber-800">
        Start a new chat to keep responses focused and avoid losing earlier study context.
      </Text>
      <Pressable
        onPress={onNewChat}
        className="mt-2 self-start rounded-full bg-amber-900 px-3 py-1.5"
      >
        <Text className="text-xs font-bold text-white">Start new chat</Text>
      </Pressable>
    </View>
  );
}

function IconButton({
  icon,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="h-10 w-10 items-center justify-center rounded-2xl bg-slate-100"
    >
      <Ionicons name={icon} size={18} color="#526A63" />
    </Pressable>
  );
}

function ModelGate({
  status,
  onDownload,
  serverUrl,
  onServerUrl,
  message,
}: {
  status: EmbeddingStatus;
  onDownload: () => void;
  serverUrl: string;
  onServerUrl: (value: string) => void;
  message: string;
}) {
  return (
    <SafeAreaView className="flex-1 items-center justify-center bg-[#EEF5F1] px-7">
      <View className="w-full max-w-md rounded-[30px] border border-line bg-white p-7 shadow-lg">
        <View className="mb-6 h-16 w-16 items-center justify-center rounded-3xl bg-forest">
          <Ionicons name="sparkles" size={28} color="white" />
        </View>
        <Text className="text-3xl font-black tracking-tight text-ink">
          Your study AI,{`\n`}on your device.
        </Text>
        <Text className="mt-4 text-[15px] leading-6 text-slate-600">
          Download EmbeddingGemma once to unlock private semantic search. Exam questions and
          conversations remain in local SQLite.
        </Text>
        <View className="mt-5">
          <Text className="mb-2 text-xs font-semibold text-slate-600">
            Development model server
          </Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            value={serverUrl}
            onChangeText={onServerUrl}
            placeholder="http://192.168.1.10:8787"
            className="rounded-xl border border-line bg-paper px-3 py-3 text-sm text-ink"
          />
          {!!message && <Text className="mt-2 text-xs text-rose-600">{message}</Text>}
        </View>
        <View className="my-6 rounded-2xl bg-paper p-4">
          <View className="flex-row items-center justify-between">
            <Text className="font-semibold text-ink">EmbeddingGemma 300M</Text>
            <Text className="text-xs font-medium text-forest">SQLite RAG</Text>
          </View>
          {status.kind === 'downloading' && (
            <View className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200">
              <View
                className="h-full rounded-full bg-forest"
                style={{ width: `${status.progress * 100}%` }}
              />
            </View>
          )}
          <Text className="mt-3 text-xs text-slate-500">{status.label}</Text>
        </View>
        <Pressable
          disabled={status.kind === 'downloading'}
          onPress={onDownload}
          className="items-center rounded-2xl bg-forest py-4"
        >
          <Text className="font-bold text-white">
            {status.kind === 'downloading' ? 'Downloading...' : 'Download model & start'}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function estimateUsage(messages: ChatMessage[]): ContextUsage {
  const maxTokens = 2048;
  const usedTokens = Math.ceil(
    messages.slice(-12).reduce((sum, message) => sum + message.content.length, 0) / 4,
  );
  const percent = Math.min(100, Math.round((usedTokens / maxTokens) * 100));
  return { usedTokens, maxTokens, percent, full: percent >= 88 };
}

function formatDate(value: number) {
  if (!value) return 'new';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(
    new Date(value),
  );
}
function pause(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function id() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
