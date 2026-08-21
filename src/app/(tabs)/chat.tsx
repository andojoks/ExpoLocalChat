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
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
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
import type { AgentContext, ChatMessage, ContextUsage, ConversationSummary } from '@/domain/types';
import { localTutorErrorMessage } from '@/ai/local-error';
import { MessageCard } from '@/components/chat/message-card';
import { SuggestionChips } from '@/components/chat/suggestion-chips';
import { WelcomeHero } from '@/components/chat/welcome-hero';
import { useFloatingTabClearance } from '@/components/app-tab-bar';
import { BRAND_BLUE, BRAND_HEADER_GRADIENT } from '@/theme/brand';
import { useTheme } from '@/theme/ThemeProvider';
import { INPUT_CARET, inputFocusChrome, useInputFocus } from '@/components/ui/input-focus';
import { LABEL_TEXT_ANDROID } from '@/components/ui/app-text';

const emptyUsage: ContextUsage = { usedTokens: 0, maxTokens: 2048, percent: 0, full: false };
/** Stay pinned only when the user is this close to the newest messages (px). */
const NEAR_BOTTOM_PX = 140;
/** How many newest messages to show initially / load per upward page. */
const MESSAGE_PAGE = 24;

export default function Chat() {
  const { colors, isDark } = useTheme();
  const db = useSQLiteContext();
  const list = useRef<FlatList>(null);
  const insets = useSafeAreaInsets();
  const tabClearance = useFloatingTabClearance(8);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [context, setContext] = useState<AgentContext>({});
  const [contextUsage, setContextUsage] = useState<ContextUsage>(emptyUsage);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const composerFocus = useInputFocus();
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

  const requestScrollToBottom = useCallback((force = false) => {
    if (!force && !stickToBottomRef.current) return;
    if (scrollTimer.current) return;
    scrollTimer.current = setTimeout(() => {
      scrollTimer.current = null;
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
    stickToBottomRef.current = contentOffset.y <= NEAR_BOTTOM_PX;
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
      setModel({ kind: 'downloading', progress: 0.02, label: 'Fetching chat model…' });
      await downloadChatModel((label, progress) => {
        setModel({
          kind: 'downloading',
          progress: Math.min(0.5, progress * 0.5),
          label,
        });
      });
      setModel({ kind: 'downloading', progress: 0.5, label: 'Fetching embedding model…' });
      const downloaded = await downloadModel((status) => {
        if (status.kind === 'downloading') {
          setModel({
            kind: 'downloading',
            progress: 0.5 + status.progress * 0.5,
            label: status.label,
          });
          return;
        }
        setModel(status);
      });
      const p = downloaded.manifest.mock ? new HashEmbeddingProvider() : createPlatformProvider();
      await p.initialize(downloaded.path);
      setProvider(p);
    } catch (error) {
      setModel({ kind: 'missing', progress: 0, label: 'Ready when you are' });
      setDownloadError(
        error instanceof Error
          ? `Download failed: ${error.message}`
          : 'Download failed. Tap Retry to resume, or it will restart if resume fails.',
      );
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
            streamed += token;
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
      const assistant: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        content: answer.content,
        toolCalls: answer.toolCalls,
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
      return <MessageCard message={item} thinking={thinking} phase={thinking ? phase : null} />;
    },
    [busy, streamingText, phase],
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
  const activeTitle =
    conversations.find((c) => c.id === conversationId)?.title || 'Study chat';

  return (
    <View className="flex-1 bg-canvas">
      <StatusBar style="light" />
      <View className="flex-1" style={{ paddingBottom: keyboardHeight > 0 ? keyboardHeight : 0 }}>
        <LinearGradient
          colors={[...BRAND_HEADER_GRADIENT]}
          locations={[0, 0.5, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            paddingTop: insets.top + 8,
            paddingBottom: 14,
            paddingHorizontal: 12,
          }}
        >
          <View
            pointerEvents="none"
            className="absolute -right-16 -top-8 h-40 w-40 rounded-full"
            style={{ backgroundColor: 'rgba(255,255,255,0.12)' }}
          />
          <View className="flex-row items-center gap-1">
            <Pressable
              onPress={() => setMenuOpen(true)}
              hitSlop={12}
              className="h-10 w-10 items-center justify-center rounded-full"
              style={{ backgroundColor: 'rgba(255,255,255,0.12)' }}
            >
              <Ionicons name="menu" size={20} color="#F8FAFC" />
            </Pressable>
            <View className="min-w-0 flex-1 px-1.5">
              <Text
                className="text-xl font-black text-white"
                numberOfLines={1}
                style={[LABEL_TEXT_ANDROID, { lineHeight: 28 }]}
              >
                Chat
              </Text>
              <Text
                className="mt-0.5 text-[12px] text-white/75"
                numberOfLines={1}
                style={LABEL_TEXT_ANDROID}
              >
                {activeTitle}
              </Text>
            </View>
            <Pressable
              onPress={() => setFull((x) => !x)}
              hitSlop={8}
              accessibilityLabel={full ? 'Detailed answers on' : 'Detailed answers off'}
              className="h-10 w-10 items-center justify-center rounded-full"
              style={{
                backgroundColor: full ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.08)',
              }}
            >
              <Ionicons
                name="sparkles"
                size={18}
                color={full ? '#FFFFFF' : 'rgba(255,255,255,0.45)'}
              />
            </Pressable>
            <Pressable
              onPress={() => void startNewChat()}
              hitSlop={8}
              accessibilityLabel="New chat"
              className="h-10 w-10 items-center justify-center rounded-full"
              style={{ backgroundColor: 'rgba(255,255,255,0.12)' }}
            >
              <Ionicons name="create-outline" size={20} color="#F8FAFC" />
            </Pressable>
          </View>
        </LinearGradient>

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
          className="px-4 pt-3"
          style={{
            backgroundColor: colors.surface,
            borderTopWidth: 1,
            borderTopColor: colors.line,
            paddingBottom: keyboardHeight > 0 ? 10 : tabClearance,
          }}
        >
          <View
            collapsable={false}
            className="flex-row items-end p-2"
            style={inputFocusChrome(composerFocus.focused, colors, {
              isDark,
              radius: 22,
              backgroundColor: colors.surfaceMuted,
            })}
          >
            <TextInput
              {...INPUT_CARET}
              value={input}
              onChangeText={setInput}
              onFocus={composerFocus.onFocus}
              onBlur={composerFocus.onBlur}
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
              placeholderTextColor={colors.subtle}
              onContentSizeChange={(e) =>
                setInputHeight(Math.min(132, Math.max(46, e.nativeEvent.contentSize.height)))
              }
              style={{ height: inputHeight }}
              className="flex-1 px-3 py-3 text-[15px] leading-5 text-ink"
            />
            <Pressable
              disabled={!input.trim() || busy}
              onPress={() => send()}
              className="mb-0.5 h-11 w-11 items-center justify-center"
              style={{
                borderRadius: 16,
                backgroundColor: input.trim() && !busy ? BRAND_BLUE : colors.controlOff,
              }}
            >
              <Ionicons
                name={busy ? 'hourglass-outline' : 'arrow-up'}
                size={21}
                color={input.trim() && !busy ? 'white' : colors.subtle}
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
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
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
    <View className="absolute inset-0 z-50 flex-row" style={{ backgroundColor: colors.overlay }}>
      <View
        className="h-full w-[82%] max-w-sm px-4 pb-6"
        style={{
          backgroundColor: colors.canvas,
          paddingTop: insets.top + 12,
        }}
      >
        <View className="mb-5 flex-row items-center justify-between">
          <Text
            className="text-2xl font-black tracking-tight text-ink"
            style={[LABEL_TEXT_ANDROID, { letterSpacing: -0.4 }]}
          >
            Study chats
          </Text>
          <Pressable
            onPress={onClose}
            hitSlop={10}
            className="h-10 w-10 items-center justify-center rounded-full bg-surface"
            style={{ borderWidth: 1, borderColor: colors.line }}
          >
            <Ionicons name="close" size={20} color={colors.ink} />
          </Pressable>
        </View>
        <Pressable
          onPress={onNew}
          className="mb-4 flex-row items-center justify-center gap-2 py-3.5"
          style={{ borderRadius: 18, backgroundColor: BRAND_BLUE }}
        >
          <Ionicons name="add" size={18} color="white" />
          <Text
            numberOfLines={1}
            className="font-bold text-white"
            style={[LABEL_TEXT_ANDROID, { flexShrink: 0 }]}
          >
            Start new chat
          </Text>
        </Pressable>
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ gap: 10, paddingBottom: 24 }}
          renderItem={({ item }) => {
            const active = item.id === activeId;
            return (
              <View
                className="flex-row items-stretch overflow-hidden"
                style={{
                  borderRadius: 20,
                  borderWidth: 1,
                  borderColor: active ? colors.selectedBorder : colors.line,
                  backgroundColor: active ? colors.selectedBg : colors.surface,
                }}
              >
                <Pressable onPress={() => onSelect(item.id)} className="min-w-0 flex-1 px-4 py-3.5">
                  <Text numberOfLines={1} className="font-bold text-ink" style={LABEL_TEXT_ANDROID}>
                    {item.title}
                  </Text>
                  <Text numberOfLines={2} className="mt-1 text-xs leading-4 text-muted">
                    {item.lastMessage || 'No messages yet'}
                  </Text>
                  <Text className="mt-2 text-[10px] font-medium text-subtle">
                    {item.messageCount} messages · {formatDate(item.updatedAt)}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setPendingDelete(item)}
                  accessibilityLabel={`Delete chat ${item.title}`}
                  className="items-center justify-center px-3.5"
                  style={{ borderLeftWidth: 1, borderLeftColor: colors.line }}
                >
                  <Ionicons name="trash-outline" size={18} color={colors.danger} />
                </Pressable>
              </View>
            );
          }}
        />
      </View>
      <Pressable onPress={onClose} className="flex-1" />

      {pendingDelete && (
        <View className="absolute inset-0 z-50 items-center justify-center bg-black/40 px-6">
          <View
            className="w-full max-w-sm bg-surface p-5"
            style={{
              borderRadius: 24,
              borderWidth: 1,
              borderColor: colors.line,
            }}
          >
            <Text className="text-lg font-black text-ink">Delete this chat?</Text>
            <Text className="mt-2 text-sm leading-5 text-muted">
              “{pendingDelete.title || 'Untitled chat'}” will be removed permanently.
            </Text>
            <View className="mt-5 flex-row gap-2">
              <Pressable
                disabled={deleting}
                onPress={() => setPendingDelete(null)}
                className="flex-1 py-3.5 bg-surface-muted"
                style={{ borderRadius: 16 }}
              >
                <Text
                  numberOfLines={1}
                  className="font-bold text-muted"
                  style={{ width: '100%', textAlign: 'center', flexShrink: 0 }}
                >
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                disabled={deleting}
                onPress={() => void confirmDelete()}
                className="flex-1 py-3.5"
                style={{ borderRadius: 16, backgroundColor: colors.danger }}
              >
                <Text
                  numberOfLines={1}
                  className="font-bold text-white"
                  style={{ width: '100%', textAlign: 'center', flexShrink: 0 }}
                >
                  {deleting ? 'Deleting…' : 'Delete'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

function ContextFullBanner({ onNewChat }: { onNewChat: () => void }) {
  const { colors } = useTheme();
  return (
    <View
      className="px-4 py-3"
      style={{
        borderBottomWidth: 1,
        borderBottomColor: colors.warning,
        backgroundColor: colors.warningBg,
      }}
    >
      <Text className="text-sm font-bold" style={{ color: colors.warning }}>This chat is getting long</Text>
      <Text className="mt-1 text-xs leading-4" style={{ color: colors.warning }}>
        Start a new chat to keep answers focused.
      </Text>
      <Pressable
        onPress={onNewChat}
        className="mt-2 self-start px-3 py-1.5"
        style={{ borderRadius: 14, backgroundColor: colors.warning }}
      >
        <Text className="text-xs font-bold text-white">Start new chat</Text>
      </Pressable>
    </View>
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
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const tabClearance = useFloatingTabClearance(8);
  const downloading = status.kind === 'downloading';

  return (
    <View className="flex-1 bg-canvas">
      <StatusBar style="light" />
      <LinearGradient
        colors={[...BRAND_HEADER_GRADIENT]}
        locations={[0, 0.5, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          paddingTop: insets.top + 8,
          paddingBottom: 16,
          paddingHorizontal: 14,
        }}
      >
        <Text
          className="pl-1.5 text-2xl font-black text-white"
          style={[LABEL_TEXT_ANDROID, { lineHeight: 32 }]}
        >
          Chat
        </Text>
        <Text className="mt-0.5 pl-1.5 text-[12px] text-white/75" style={LABEL_TEXT_ANDROID}>
          One-time setup
        </Text>
      </LinearGradient>

      <View
        className="flex-1 items-center justify-center px-6"
        style={{ paddingBottom: tabClearance }}
      >
        <View
          className="w-full max-w-md bg-surface px-5 py-6"
          style={{
            borderRadius: 24,
            borderWidth: 1,
            borderColor: colors.line,
          }}
        >
          <View
            className="mb-4 h-12 w-12 items-center justify-center"
            style={{ borderRadius: 16, backgroundColor: BRAND_BLUE }}
          >
            <Ionicons name="cloud-download-outline" size={24} color="white" />
          </View>
          <Text
            className="text-[22px] font-black tracking-tight text-ink"
            style={[LABEL_TEXT_ANDROID, { letterSpacing: -0.3 }]}
          >
            Download agent data
          </Text>
          <Text className="mt-2 text-[14px] leading-6 text-muted">
            Get the study assistant ready on this device. This only needs to happen once.
          </Text>
          {downloading ? (
            <View className="mt-6">
              <View className="h-2 overflow-hidden rounded-full bg-line">
                <View
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max(4, status.progress * 100)}%`,
                    backgroundColor: BRAND_BLUE,
                  }}
                />
              </View>
              <Text className="mt-3 text-sm text-muted">{status.label}</Text>
            </View>
          ) : null}
          {!!message && !downloading ? (
            <Text className="mt-5 text-sm" style={{ color: colors.danger }}>{message}</Text>
          ) : null}
          <Pressable
            disabled={downloading}
            onPress={onDownload}
            className="mt-6 py-4"
            style={{
              borderRadius: 18,
              backgroundColor: downloading ? colors.controlOff : BRAND_BLUE,
            }}
          >
            <Text
              numberOfLines={1}
              className="font-bold text-white"
              style={{ width: '100%', textAlign: 'center', flexShrink: 0 }}
            >
              {downloading ? 'Downloading…' : message ? 'Retry' : 'Download'}
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

