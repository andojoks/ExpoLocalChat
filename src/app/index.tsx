import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import { Ionicons } from '@expo/vector-icons';
import { migrateDatabase, loadConversation, saveMessage, clearConversation } from '@/db/database';
import {
  HashEmbeddingProvider,
  type EmbeddingProvider,
  type EmbeddingStatus,
} from '@/ai/embeddings/embedding';
import { createPlatformProvider } from '@/ai/embeddings/platform-provider';
import { downloadModel, getModelState } from '@/ai/embeddings/model-manager';
import { QuestionBankAgent } from '@/ai/agent';
import { createChatModel } from '@/ai/chat-provider';
import type { AgentContext, ChatMessage } from '@/domain/types';
import { RichMarkdown } from '@/components/rich-markdown';
import { DEFAULT_MODEL_SERVER_URL, loadServerUrl, saveServerUrl } from '@/config/server-config';

const CONVERSATION_ID = 'main';
const starter: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  createdAt: 0,
  content:
    '## Welcome to QuestionBank\n\nI can search Cameroon GCE past questions semantically, call local database tools, remember our conversation, and provide complete authored explanations.\n\nTry **Find 2024 O Level algebra questions**.',
};
export default function Screen() {
  return (
    <SQLiteProvider databaseName="questionbank.db" onInit={migrateDatabase}>
      <Chat />
    </SQLiteProvider>
  );
}

function Chat() {
  const db = useSQLiteContext(),
    list = useRef<FlatList>(null),
    insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<ChatMessage[]>([starter]),
    [context, setContext] = useState<AgentContext>({}),
    [input, setInput] = useState(''),
    [busy, setBusy] = useState(false),
    [streamingText, setStreamingText] = useState(''),
    [inputHeight, setInputHeight] = useState(46),
    [full, setFull] = useState(true),
    [provider, setProvider] = useState<EmbeddingProvider | null>(null),
    [model, setModel] = useState<EmbeddingStatus>({
      kind: 'missing',
      progress: 0,
      label: 'Checking models...',
    }),
    [serverUrl, setServerUrl] = useState(DEFAULT_MODEL_SERVER_URL),
    [showServer, setShowServer] = useState(false),
    [serverMessage, setServerMessage] = useState('');
  useEffect(() => {
    (async () => {
      const saved = await loadConversation(db, CONVERSATION_ID);
      if (saved.messages.length) {
        setMessages([starter, ...saved.messages]);
        setContext(saved.context);
      }
      const configuredUrl = await loadServerUrl();
      setServerUrl(configuredUrl);
      const state = await getModelState();
      setModel(state.status);
      if (state.path) {
        const p = state.manifest?.mock ? new HashEmbeddingProvider() : createPlatformProvider();
        await p.initialize(state.path);
        setProvider(p);
      }
    })();
  }, [db]);
  const chatModel = useMemo(() => createChatModel(), []);
  const agent = useMemo(
    () => (provider ? new QuestionBankAgent(db, provider, chatModel) : null),
    [db, provider, chatModel],
  );
  async function prepare() {
    try {
      await saveServerUrl(serverUrl);
      const downloaded = await downloadModel(setModel),
        p = downloaded.manifest.mock ? new HashEmbeddingProvider() : createPlatformProvider();
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
    if (!text || !agent || busy) return;
    setInput('');
    setInputHeight(46);
    setBusy(true);
    setStreamingText('');
    const user: ChatMessage = { id: id(), role: 'user', content: text, createdAt: Date.now() },
      assistantId = id();
    setMessages((m) => [
      ...m,
      user,
      { id: assistantId, role: 'assistant', content: '', createdAt: Date.now() },
    ]);
    await saveMessage(db, CONVERSATION_ID, user, context);
    try {
      let streamed = '';
      const answer = await agent.invoke(
        { message: text, context, fullExplanation: full },
        (token) => {
          if (!token) return;
          streamed += token;
          setStreamingText(streamed);
          setMessages((m) =>
            m.map((item) => (item.id === assistantId ? { ...item, content: streamed } : item)),
          );
          setTimeout(() => list.current?.scrollToEnd({ animated: true }), 0);
        },
      );
      setContext(answer.context);
      if (!streamed.trim()) {
        const chunks = answer.content.split(/(?<=\s)/);
        let partial = '';
        for (const chunk of chunks) {
          partial += chunk;
          setStreamingText(partial);
          setMessages((m) =>
            m.map((item) => (item.id === assistantId ? { ...item, content: partial } : item)),
          );
          await pause(18);
        }
      }
      const assistant: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        content: answer.content,
        toolCalls: answer.toolCalls,
        createdAt: Date.now(),
      };
      setMessages((m) => m.map((item) => (item.id === assistantId ? assistant : item)));
      await saveMessage(db, CONVERSATION_ID, assistant, answer.context);
    } catch (e) {
      setMessages((m) =>
        m.map((item) =>
          item.id === assistantId
            ? {
                ...item,
                content: `I hit a local tutor error: ${e instanceof Error ? e.message : 'Unknown error'}`,
              }
            : item,
        ),
      );
    } finally {
      setBusy(false);
      setStreamingText('');
      setTimeout(() => list.current?.scrollToEnd({ animated: true }), 40);
    }
  }
  async function reset() {
    await clearConversation(db, CONVERSATION_ID);
    setContext({});
    setMessages([starter]);
  }
  if (!provider)
    return (
      <ModelGate
        status={model}
        onDownload={prepare}
        serverUrl={serverUrl}
        onServerUrl={setServerUrl}
        message={serverMessage}
      />
    );
  const chips = [context.subject, context.topic, context.year?.toString()].filter(
    Boolean,
  ) as string[];
  return (
    <SafeAreaView className="flex-1 bg-[#EEF4F1]">
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
        >
          <View className="border-b border-white/70 bg-[#FDFEFE] px-5 pb-3 pt-4 shadow-sm">
            <View className="flex-row items-center justify-between">
              <View className="flex-row flex-1 items-center gap-3 pr-3">
                <BotAvatar large />
                <View className="flex-1">
                  <Text className="text-xl font-black text-ink">QuestionBank AI</Text>
                  <View className="mt-1 flex-row items-center gap-2">
                    <View className="h-2 w-2 rounded-full bg-emerald-500" />
                    <Text numberOfLines={1} className="flex-1 text-xs font-medium text-slate-500">
                      {provider.name}
                    </Text>
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
                  chips.map((x) => (
                    <Text
                      key={x}
                      className="rounded-full bg-[#E2F3EA] px-2.5 py-1 text-xs font-bold text-forest"
                    >
                      {x}
                    </Text>
                  ))
                ) : (
                  <Text className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">
                    Ready to study
                  </Text>
                )}
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
            <View className="border-b border-line bg-white px-4 py-3">
              <Text className="mb-2 text-xs font-semibold text-slate-600">
                Development model server
              </Text>
              <View className="flex-row gap-2">
                <TextInput
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={serverUrl}
                  onChangeText={setServerUrl}
                  placeholder="http://192.168.1.10:8787"
                  className="flex-1 rounded-xl border border-line bg-paper px-3 py-2 text-sm text-ink"
                />
                <Pressable
                  onPress={applyServer}
                  className="justify-center rounded-xl bg-forest px-4"
                >
                  <Text className="font-semibold text-white">Apply</Text>
                </Pressable>
              </View>
              {!!serverMessage && (
                <Text className="mt-2 text-xs text-slate-500">{serverMessage}</Text>
              )}
            </View>
          )}
          <FlatList
            ref={list}
            data={messages}
            keyExtractor={(x) => x.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingTop: 18,
              paddingBottom: 18,
              gap: 16,
            }}
            onContentSizeChange={() => list.current?.scrollToEnd({ animated: true })}
            renderItem={({ item }) => <MessageCard message={item} />}
            ListFooterComponent={busy && !streamingText.trim() ? <ThinkingBubble /> : null}
          />
          {messages.length < 3 && (
            <View className="flex-row flex-wrap gap-2 px-4 pb-2">
              {[
                'Is Mathematics 2023 present?',
                'Find questions about mechanics',
                'Explain osmosis fully',
              ].map((x) => (
                <Pressable
                  key={x}
                  onPress={() => send(x)}
                  className="rounded-full border border-line bg-white px-3 py-2 shadow-sm"
                >
                  <Text className="text-xs font-semibold text-forest">{x}</Text>
                </Pressable>
              ))}
            </View>
          )}
          <View
            className="border-t border-white/70 bg-white px-4 pt-3 shadow-lg"
            style={{ paddingBottom: Math.max(insets.bottom, 10) }}
          >
            <View className="flex-row items-end rounded-[24px] border border-slate-200 bg-[#F7FAF8] p-2 shadow-sm">
              <TextInput
                value={input}
                onChangeText={setInput}
                onSubmitEditing={() => send()}
                blurOnSubmit={false}
                multiline
                placeholder="Ask about a paper, topic, or question..."
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
            <Text className="pt-2 text-center text-[10px] text-slate-400">
              On-device RAG - model-routed tools - SQLite memory
            </Text>
          </View>
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    </SafeAreaView>
  );
}

function MessageCard({ message }: { message: ChatMessage }) {
  if (!message.content.trim()) return null;
  const user = message.role === 'user';
  return (
    <View className={`flex-row items-end gap-2.5 ${user ? 'justify-end' : 'justify-start'}`}>
      {!user && <BotAvatar />}
      <View className="max-w-[82%]">
        <View
          className={`rounded-[22px] px-4 py-3 shadow-sm ${user ? 'rounded-br-md bg-forest' : 'rounded-bl-md border border-white bg-white'}`}
        >
          <RichMarkdown inverted={user}>{message.content}</RichMarkdown>
          {message.toolCalls?.map((t, i) => (
            <View
              key={`${t.name}-${i}`}
              className={`mt-3 flex-row items-center gap-1.5 border-t pt-2 ${user ? 'border-white/20' : 'border-line'}`}
            >
              <Ionicons name="construct-outline" size={12} color={user ? '#DDF1E8' : '#668078'} />
              <Text className={`text-[10px] ${user ? 'text-mint' : 'text-slate-500'}`}>
                {t.name}
                {t.resultCount !== undefined
                  ? ` - ${t.resultCount} result${t.resultCount === 1 ? '' : 's'}`
                  : ''}
              </Text>
            </View>
          ))}
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
function ThinkingBubble() {
  return (
    <View className="flex-row items-end gap-2.5">
      <BotAvatar />
      <View className="rounded-[22px] rounded-bl-md border border-white bg-white px-4 py-3 shadow-sm">
        <TypingDots />
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
              { translateY: value.interpolate({ inputRange: [0.35, 1], outputRange: [0, -3] }) },
            ],
          }}
        />
      ))}
    </View>
  );
}
function BotAvatar({ large = false }: { large?: boolean }) {
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
            <Text className="text-xs font-medium text-forest">128d MRL</Text>
          </View>
          <Text className="mt-1 text-xs text-slate-500">Google - quantized ONNX package</Text>
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
        <Text className="mt-4 text-center text-[10px] leading-4 text-slate-400">
          Web downloads and unpacks the complete quantized model. Keep this tab open during the
          first 170 MB download.
        </Text>
      </View>
    </SafeAreaView>
  );
}
function formatTime(value: number) {
  if (!value) return '';
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(
    new Date(value),
  );
}
function pause(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function id() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
