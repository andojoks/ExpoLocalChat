import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Keyboard,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
  type ListRenderItem,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';
import { Ionicons } from '@expo/vector-icons';
import {
  createConversation,
  deleteConversation,
  ensureConversation,
  listConversations,
  loadConversation,
  saveMessage,
  updateConversationTitle,
} from '@/db/database';
import {
  HashEmbeddingProvider,
  type EmbeddingProvider,
  type EmbeddingStatus,
} from '@/ai/embeddings/embedding';
import { createPlatformProvider } from '@/ai/embeddings/platform-provider';
import { downloadModel, getModelState } from '@/ai/embeddings/model-manager';
import { downloadChatModel } from '@/ai/chat-provider';
import { QuestionBankAgent, type AgentPhase } from '@/ai/agent';
import { createChatModelFromEnv } from '@/ai/models/factory';
import {
  generateConversationTitle,
  isDefaultConversationTitle,
} from '@/ai/conversation-title';
import type { AgentContext, AgentTiming, ChatMessage, ContextUsage, ConversationSummary } from '@/domain/types';
import { localTutorErrorMessage } from '@/ai/local-error';
import { MessageCard } from '@/components/chat/message-card';
import { SuggestionChips } from '@/components/chat/suggestion-chips';
import { WelcomeHero } from '@/components/chat/welcome-hero';
import { useFloatingTabClearance } from '@/components/app-tab-bar';

const emptyUsage: ContextUsage = { usedTokens: 0, maxTokens: 2048, percent: 0, full: false };
/** Stay pinned only when the user is this close to the newest messages (px). */
const NEAR_BOTTOM_PX = 140;
/** How many newest messages to show initially / load per upward page. */
const MESSAGE_PAGE = 24;

export default function Chat() {
  const db = useSQLiteContext();
  const list = useRef<FlatList>(null);
  const insets = useSafeAreaInsets();
  const tabClearance = useFloatingTabClearance(8);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
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
    label: 'Checking…',
  });
  const [downloadError, setDownloadError] = useState('');
  const [conversationId, setConversationId] = useState('');
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  /** Newest-first window size for inverted list (lazy-loads older upward). */
  const [visibleCount, setVisibleCount] = useState(MESSAGE_PAGE);

  const chatModel = useMemo(() => createChatModelFromEnv(), []);
  const agent = useMemo(
    () => (provider ? new QuestionBankAgent(db, provider, chatModel) : null),
    [db, provider, chatModel],
  );
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const streamFlushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingStream = useRef({ id: '', text: '' });
  /** When false, content growth / streaming must not yank scroll back to the end. */
  const stickToBottomRef = useRef(true);
  const listOffsetRef = useRef(0);
  /** Skip stick-to-bottom while debug expand compensates scroll. */
  const suppressPinRef = useRef(false);

  const requestScrollToBottom = useCallback((force = false) => {
    if (suppressPinRef.current) return;
    if (!force && !stickToBottomRef.current) return;
    if (scrollTimer.current) return;
    scrollTimer.current = setTimeout(() => {
      scrollTimer.current = null;
      if (suppressPinRef.current) return;
      if (!force && !stickToBottomRef.current) return;
      // Inverted list: offset 0 is the newest messages (visual bottom).
      listOffsetRef.current = 0;
      list.current?.scrollToOffset({ offset: 0, animated: false });
    }, 80);
  }, []);

  const onListScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset } = event.nativeEvent;
    listOffsetRef.current = contentOffset.y;
    // Inverted: y≈0 means viewing the newest end.
    if (!suppressPinRef.current) {
      stickToBottomRef.current = contentOffset.y <= NEAR_BOTTOM_PX;
    }
  }, []);

  /** Keep the reply text on screen when agent-debug body grows (inverted list). */
  const onDebugExpandBy = useCallback((deltaPx: number) => {
    if (!(deltaPx > 0)) return;
    stickToBottomRef.current = false;
    suppressPinRef.current = true;
    const next = Math.max(0, listOffsetRef.current + deltaPx);
    listOffsetRef.current = next;
    list.current?.scrollToOffset({ offset: next, animated: false });
    requestAnimationFrame(() => {
      suppressPinRef.current = false;
    });
  }, []);

  const flushStreamingMessage = useCallback(() => {
    streamFlushTimer.current = null;
    const { id: assistantId, text } = pendingStream.current;
    if (!assistantId) return;
    setMessages((current) => {
      const index = current.findIndex((item) => item.id === assistantId);
      if (index < 0) return current;
      const prev = current[index];
      if (prev.content === text) return current;
      const next = current.slice();
      next[index] = { ...prev, content: text };
      return next;
    });
    requestScrollToBottom();
  }, [requestScrollToBottom]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (event) => {
      setKeyboardHeight(event.endCoordinates.height);
      if (stickToBottomRef.current) {
        setTimeout(() => list.current?.scrollToOffset({ offset: 0, animated: false }), 50);
      }
    });
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
      if (scrollTimer.current) clearTimeout(scrollTimer.current);
      if (streamFlushTimer.current) clearTimeout(streamFlushTimer.current);
    };
  }, []);

  useEffect(() => {
    (async () => {
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
    setMessages(saved.messages);
    setVisibleCount(MESSAGE_PAGE);
    setContext(saved.context);
    setContextUsage(estimateUsage(saved.messages));
    setSuggestions([]);
    setMenuOpen(false);
    stickToBottomRef.current = true;
    requestScrollToBottom(true);
  }

  async function refreshConversationList() {
    setConversations(await listConversations(db));
  }

  async function startNewChat() {
    const newId = await createConversation(db, 'New study chat');
    await refreshConversationList();
    await openConversation(newId);
  }

  async function removeChat(id: string) {
    const wasActive = id === conversationId;
    await deleteConversation(db, id);
    const remaining = await listConversations(db);
    setConversations(remaining);
    if (!wasActive) return;
    if (remaining[0]?.id) {
      await openConversation(remaining[0].id);
      return;
    }
    const newId = await createConversation(db, 'New study chat');
    setConversations(await listConversations(db));
    await openConversation(newId);
  }

  async function prepare() {
    setDownloadError('');
    try {
      setModel({ kind: 'downloading', progress: 0.02, label: 'Preparing agent data…' });
      await downloadChatModel((label, progress) => {
        setModel({
          kind: 'downloading',
          progress: Math.min(0.45, progress * 0.45),
          label: label || 'Preparing agent data…',
        });
      });
      setModel({ kind: 'downloading', progress: 0.5, label: 'Almost ready…' });
      const downloaded = await downloadModel((status) => {
        if (status.kind === 'downloading') {
          setModel({
            kind: 'downloading',
            progress: 0.5 + status.progress * 0.5,
            label: 'Almost ready…',
          });
          return;
        }
        setModel(status);
      });
      const p = downloaded.manifest.mock ? new HashEmbeddingProvider() : createPlatformProvider();
      await p.initialize(downloaded.path);
      setProvider(p);
    } catch {
      setModel({ kind: 'missing', progress: 0, label: 'Ready when you are' });
      setDownloadError('Couldn’t download agent data. Check your connection and try again.');
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
    const startedAt = Date.now();
    let firstTokenAt: number | undefined;
    let streamedChars = 0;
    stickToBottomRef.current = true;
    const user: ChatMessage = { id: id(), role: 'user', content: text, createdAt: Date.now() };
    const assistantId = id();
    const history = [...messages, user];
    setMessages((current) => [
      ...current,
      user,
      { id: assistantId, role: 'assistant', content: '', createdAt: Date.now() },
    ]);
    requestScrollToBottom(true);
    const shouldNameChat =
      messages.length === 0 ||
      isDefaultConversationTitle(conversations.find((c) => c.id === conversationId)?.title);
    await saveMessage(db, conversationId, user, context);
    await refreshConversationList();
    if (shouldNameChat) {
      void (async () => {
        try {
          const title = await generateConversationTitle(chatModel, text);
          await updateConversationTitle(db, conversationId, title);
          await refreshConversationList();
        } catch {
          // Fallback title already applied in saveMessage.
        }
      })();
    }
    try {
      let streamed = '';
      const answer = await agent.invoke(
        {
          message: text,
          context,
          history,
          fullExplanation: full,
          userMessageId: user.id,
          assistantMessageId: assistantId,
        },
        {
          threadId: conversationId,
          onPhase: setPhase,
          onToken: (token) => {
            if (!token) return;
            const first = !streamed;
            if (!firstTokenAt) firstTokenAt = Date.now();
            streamed += token;
            streamedChars += token.length;
            // Flip footer once; avoid re-rendering the list parent on every token.
            if (first) setStreamingText('streaming');
            pendingStream.current = { id: assistantId, text: streamed };
            if (!streamFlushTimer.current) {
              streamFlushTimer.current = setTimeout(flushStreamingMessage, 120);
            }
          },
        },
      );
      if (streamFlushTimer.current) {
        clearTimeout(streamFlushTimer.current);
        streamFlushTimer.current = null;
      }
      flushStreamingMessage();
      setContext(answer.context);
      setContextUsage(answer.contextUsage);
      setSuggestions(answer.suggestions);
      if (!streamed.trim()) {
        // Avoid token-by-token markdown reparse for short complete replies (catalogue/list).
        if (answer.content.length < 320) {
          pendingStream.current = { id: assistantId, text: answer.content };
          flushStreamingMessage();
        } else {
          await animateAnswer(answer.content, assistantId);
        }
      }
      const completedAt = Date.now();
      const timing = buildAgentTiming({
        startedAt,
        firstTokenAt,
        completedAt,
        outputText: answer.content || streamed,
        streamedChars,
      });
      const assistant: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        content: answer.content,
        toolCalls: answer.toolCalls,
        agentDebug: answer.agentDebug,
        agentTiming: timing,
        createdAt: completedAt,
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
      requestScrollToBottom();
    }
  }
  async function animateAnswer(content: string, assistantId: string) {
    const chunks = content.split(/(?<=\s)/);
    let partial = '';
    for (const chunk of chunks) {
      partial += chunk;
      pendingStream.current = { id: assistantId, text: partial };
      if (!streamFlushTimer.current) {
        streamFlushTimer.current = setTimeout(flushStreamingMessage, 100);
      }
      await pause(40);
    }
    if (streamFlushTimer.current) {
      clearTimeout(streamFlushTimer.current);
      streamFlushTimer.current = null;
    }
    flushStreamingMessage();
  }

  const listData = useMemo(() => {
    // Newest first so inverted FlatList opens at the bottom and pages older upward.
    const newestFirst: ChatMessage[] = [];
    for (let i = messages.length - 1; i >= 0; i -= 1) newestFirst.push(messages[i]);
    return newestFirst.slice(0, visibleCount);
  }, [messages, visibleCount]);

  const loadOlderMessages = useCallback(() => {
    setVisibleCount((n) => Math.min(messages.length, n + MESSAGE_PAGE));
  }, [messages.length]);

  const renderMessage = useCallback<ListRenderItem<ChatMessage>>(
    ({ item, index }) => {
      // Inverted + newest-first: the trailing empty assistant is index 0.
      const thinking =
        busy &&
        !streamingText.trim() &&
        item.role === 'assistant' &&
        !item.content?.trim() &&
        index === 0;
      return (
        <MessageCard
          message={item}
          thinking={thinking}
          phase={thinking ? phase : null}
          onDebugExpandBy={onDebugExpandBy}
        />
      );
    },
    [busy, streamingText, phase, onDebugExpandBy],
  );
  const listContentStyle = useMemo(
    () => ({
      flexGrow: 1,
      paddingHorizontal: 16,
      paddingTop: 18,
      paddingBottom: 18,
    }),
    [],
  );
  const listSeparator = useCallback(() => <View style={{ height: 16 }} />, []);

  if (!provider) {
    return <ModelGate status={model} onDownload={prepare} message={downloadError} />;
  }

  const showStarters = messages.length === 0;

  return (
    <View className="flex-1 bg-[#EEF4F8]">
      <View className="flex-1" style={{ paddingBottom: keyboardHeight > 0 ? keyboardHeight : 0 }}>
        <View
          className="border-b border-line bg-white"
          style={{ paddingTop: insets.top }}
        >
          <View className="flex-row items-center gap-1 px-2 pb-3.5 pt-2">
            <IconButton icon="menu" onPress={() => setMenuOpen(true)} />
            <Text
              className="min-w-0 flex-1 text-xl font-black text-ink"
              numberOfLines={1}
              style={{ lineHeight: 28, includeFontPadding: false }}
            >
              Chat
            </Text>
            <Pressable
              onPress={() => setFull((x) => !x)}
              hitSlop={8}
              className={`h-10 w-10 items-center justify-center bg-transparent ${full ? '' : 'opacity-40'}`}
            >
              <Ionicons name="sparkles" size={20} color={full ? '#2563EB' : '#94A3B8'} />
            </Pressable>
            <IconButton icon="create-outline" onPress={() => void startNewChat()} />
          </View>
        </View>
        {contextUsage.full && <ContextFullBanner onNewChat={startNewChat} />}
        {messages.length === 0 ? (
          <WelcomeHero />
        ) : (
          <FlatList
            ref={list}
            className="flex-1"
            style={{ flex: 1 }}
            inverted
            data={listData}
            keyExtractor={(x) => x.id}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={listContentStyle}
            renderItem={renderMessage}
            ItemSeparatorComponent={listSeparator}
            onScroll={onListScroll}
            scrollEventThrottle={16}
            onContentSizeChange={() => {
              if (suppressPinRef.current) return;
              if (busy || streamingText.trim()) requestScrollToBottom();
            }}
            onEndReached={loadOlderMessages}
            onEndReachedThreshold={0.35}
            removeClippedSubviews={Platform.OS !== 'web'}
            windowSize={7}
            maxToRenderPerBatch={6}
            updateCellsBatchingPeriod={50}
            initialNumToRender={Math.min(MESSAGE_PAGE, 12)}
          />
        )}
        <SuggestionChips
          suggestions={suggestions}
          showStarters={showStarters}
          disabled={busy}
          onSelect={send}
        />
        <View
          className="border-t border-line bg-white px-4 pt-3"
          style={{
            paddingBottom: keyboardHeight > 0 ? 10 : tabClearance,
          }}
        >
          <View className="flex-row items-end rounded-2xl border border-line bg-[#F7FAF8] p-2">
            <TextInput
              value={input}
              onChangeText={setInput}
              multiline
              returnKeyType="send"
              enterKeyHint="send"
              submitBehavior="submit"
              blurOnSubmit={false}
              onSubmitEditing={() => {
                void send();
              }}
              onKeyPress={(event) => {
                if (Platform.OS !== 'web') return;
                const e = event as unknown as {
                  key?: string;
                  shiftKey?: boolean;
                  preventDefault?: () => void;
                  nativeEvent: { key?: string; shiftKey?: boolean };
                };
                const key = e.key ?? e.nativeEvent.key;
                const shift = e.shiftKey ?? e.nativeEvent.shiftKey;
                if (key === 'Enter' && !shift) {
                  e.preventDefault?.();
                  void send();
                }
              }}
              placeholder="Ask about a paper, topic, or question…"
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
              className={`mb-0.5 h-11 w-11 items-center justify-center rounded-xl ${input.trim() && !busy ? 'bg-forest' : 'bg-slate-200'}`}
            >
              <Ionicons
                name={busy ? 'hourglass-outline' : 'arrow-up'}
                size={21}
                color={input.trim() && !busy ? 'white' : '#92A19C'}
              />
            </Pressable>
          </View>
        </View>
      </View>
      {menuOpen && (
        <ChatDrawer
          conversations={conversations}
          activeId={conversationId}
          onClose={() => setMenuOpen(false)}
          onSelect={openConversation}
          onNew={startNewChat}
          onDelete={removeChat}
        />
      )}
    </View>
  );
}

function ChatDrawer({
  conversations,
  activeId,
  onClose,
  onSelect,
  onNew,
  onDelete,
}: {
  conversations: ConversationSummary[];
  activeId: string;
  onClose: () => void;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => Promise<void>;
}) {
  const [pendingDelete, setPendingDelete] = useState<ConversationSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function confirmDelete() {
    if (!pendingDelete || deleting) return;
    setDeleting(true);
    try {
      await onDelete(pendingDelete.id);
      setPendingDelete(null);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <View className="absolute inset-0 z-50 flex-row bg-black/25">
      <View className="h-full w-[82%] max-w-sm bg-[#FDFEFE] px-4 pb-6 pt-12 shadow-2xl">
        <View className="mb-4 flex-row items-center justify-between">
          <Text className="text-2xl font-black text-ink">Study chats</Text>
          <IconButton icon="close" onPress={onClose} />
        </View>
        <Pressable
          onPress={onNew}
          className="mb-4 flex-row items-center justify-center gap-2 rounded-md bg-forest py-3"
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
              <View
                className={`flex-row items-stretch overflow-hidden rounded-xl border ${active ? 'border-forest bg-[#DBEAFE]' : 'border-line bg-white'}`}
              >
                <Pressable onPress={() => onSelect(item.id)} className="min-w-0 flex-1 px-4 py-3">
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
                <Pressable
                  onPress={() => setPendingDelete(item)}
                  accessibilityLabel={`Delete chat ${item.title}`}
                  className="items-center justify-center border-l border-line/80 px-3.5"
                >
                  <Ionicons name="trash-outline" size={18} color="#B4534B" />
                </Pressable>
              </View>
            );
          }}
        />
      </View>
      <Pressable onPress={onClose} className="flex-1" />

      {pendingDelete && (
        <View className="absolute inset-0 z-50 items-center justify-center bg-black/40 px-6">
          <View className="w-full max-w-sm rounded-md border border-line bg-white p-5 shadow-2xl">
            <Text className="text-lg font-black text-ink">Delete this chat?</Text>
            <Text className="mt-2 text-sm leading-5 text-slate-600">
              “{pendingDelete.title || 'Untitled chat'}” will be removed permanently.
            </Text>
            <View className="mt-5 flex-row gap-2">
              <Pressable
                disabled={deleting}
                onPress={() => setPendingDelete(null)}
                className="flex-1 items-center rounded-md bg-slate-100 py-3"
              >
                <Text className="font-bold text-slate-600">Cancel</Text>
              </Pressable>
              <Pressable
                disabled={deleting}
                onPress={() => void confirmDelete()}
                className="flex-1 items-center rounded-md bg-[#B4534B] py-3"
              >
                <Text className="font-bold text-white">{deleting ? 'Deleting…' : 'Delete'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

function ContextFullBanner({ onNewChat }: { onNewChat: () => void }) {
  return (
    <View className="border-b border-amber-200 bg-amber-50 px-4 py-3">
      <Text className="text-sm font-bold text-amber-900">This chat is getting long</Text>
      <Text className="mt-1 text-xs leading-4 text-amber-800">
        Start a new chat to keep answers focused.
      </Text>
      <Pressable
        onPress={onNewChat}
        className="mt-2 self-start rounded-xl bg-amber-900 px-3 py-1.5"
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
      hitSlop={8}
      className="h-10 w-10 items-center justify-center bg-transparent"
    >
      <Ionicons name={icon} size={22} color="#0B1424" />
    </Pressable>
  );
}

function ModelGate({
  status,
  onDownload,
  message,
}: {
  status: EmbeddingStatus;
  onDownload: () => void;
  message: string;
}) {
  const insets = useSafeAreaInsets();
  const tabClearance = useFloatingTabClearance(8);
  const downloading = status.kind === 'downloading';

  return (
    <View
      className="flex-1 bg-[#EEF4F8]"
      style={{ paddingTop: insets.top, paddingBottom: tabClearance }}
    >
      <View className="flex-1 items-center justify-center px-6">
        <View className="w-full max-w-md">
          <View className="mb-5 h-14 w-14 items-center justify-center rounded-2xl bg-forest">
            <Ionicons name="cloud-download-outline" size={26} color="white" />
          </View>
          <Text className="text-3xl font-black tracking-tight text-ink">Download agent data</Text>
          <Text className="mt-3 text-[15px] leading-6 text-slate-600">
            Get the study assistant ready on this device. This only needs to happen once.
          </Text>
          {downloading ? (
            <View className="mt-8">
              <View className="h-2 overflow-hidden rounded-full bg-slate-200">
                <View
                  className="h-full rounded-full bg-forest"
                  style={{ width: `${Math.max(4, status.progress * 100)}%` }}
                />
              </View>
              <Text className="mt-3 text-sm text-slate-500">{status.label}</Text>
            </View>
          ) : null}
          {!!message && !downloading ? (
            <Text className="mt-6 text-sm text-rose-600">{message}</Text>
          ) : null}
          <Pressable
            disabled={downloading}
            onPress={onDownload}
            className={`mt-8 items-center rounded-md py-4 ${downloading ? 'bg-slate-300' : 'bg-forest'}`}
          >
            <Text className="font-bold text-white">
              {downloading ? 'Downloading…' : 'Download'}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
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

function buildAgentTiming(input: {
  startedAt: number;
  firstTokenAt?: number;
  completedAt: number;
  outputText: string;
  streamedChars: number;
}): AgentTiming {
  const elapsedMs = Math.max(1, input.completedAt - input.startedAt);
  const outputTokens = estimateOutputTokens(input.outputText || ''.padEnd(input.streamedChars));
  const activeMs = Math.max(1, input.completedAt - (input.firstTokenAt || input.startedAt));
  return {
    startedAt: input.startedAt,
    firstTokenAt: input.firstTokenAt,
    completedAt: input.completedAt,
    elapsedMs,
    firstTokenMs: input.firstTokenAt ? input.firstTokenAt - input.startedAt : undefined,
    outputTokens,
    tokensPerSecond: Number((outputTokens / (activeMs / 1000)).toFixed(2)),
  };
}

function estimateOutputTokens(text: string) {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const chars = Math.ceil(text.length / 4);
  return Math.max(1, Math.max(words, chars));
}
