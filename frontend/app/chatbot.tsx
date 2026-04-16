import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  KeyboardAvoidingView, Platform, Modal, Pressable,
  ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import XiaoNuan from '../components/XiaoNuan';
import RecordModal from '../components/RecordModal';
import { api } from '../src/api';
import { useUserId } from '../src/userStore';
import type { ChatMessage, ChatSession, UserState, TreatmentProgressData } from '../src/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(isoString: string) {
  const d = new Date(isoString);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  return `${month}月${day}日`;
}

// ── Crisis modal ──────────────────────────────────────────────────────────────
function CrisisModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View className="flex-1 bg-black/50 justify-center px-4">
        <View className="bg-red-50 rounded-3xl p-8">
          <Text className="text-xl font-bold text-red-800 text-center mb-4">我们很关心你的安全</Text>
          {[['全国心理援助热线', '400-161-9995'], ['北京心理危机干预中心', '010-82951332'], ['生命热线', '400-821-1215']].map(([label, num]) => (
            <View key={num} className="px-4 py-3 bg-white rounded-2xl flex-row justify-between mb-2">
              <Text className="text-sm text-gray-500">{label}</Text>
              <Text className="font-bold text-red-600">{num}</Text>
            </View>
          ))}
          <Text className="text-sm text-red-700 text-center my-4">如正处于危险中，请立即拨打 120</Text>
          <TouchableOpacity onPress={onClose} className="py-3 bg-red-500 rounded-full items-center">
            <Text className="text-white font-medium">我知道了</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ── Activity banner ───────────────────────────────────────────────────────────
function ActivityBanner({
  name, type, onRecord, onPlan, onDismiss,
}: { name: string; type: 'completed' | 'planned'; onRecord: () => void; onPlan: () => void; onDismiss: () => void }) {
  return (
    <View className="mx-4 mb-2 bg-orange-50 border border-orange-200 rounded-2xl px-4 py-3 flex-row items-center gap-3">
      <Text className="text-lg">📋</Text>
      <Text className="flex-1 text-xs text-orange-700 font-medium">
        {type === 'completed' ? `要记录「${name}」吗？` : `要把「${name}」加入日程吗？`}
      </Text>
      <TouchableOpacity
        onPress={type === 'completed' ? onRecord : onPlan}
        className={`px-3 py-1.5 rounded-xl ${type === 'completed' ? 'bg-orange-500' : 'bg-indigo-500'}`}
      >
        <Text className="text-white text-xs font-medium">{type === 'completed' ? '记录' : '计划'}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onDismiss}>
        <Text className="text-gray-400 text-sm">✕</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Quick plan modal ──────────────────────────────────────────────────────────
function QuickPlanModal({ defaultName, onClose }: { defaultName: string; onClose: () => void }) {
  const userId = useUserId();
  const [name, setName] = useState(defaultName);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const [date, setDate] = useState(fmt(tomorrow));

  const submit = async () => {
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    try {
      await api.createPlanned({ activity_name: name.trim(), scheduled_date: date, user_id: userId });
      setDone(true);
      setTimeout(onClose, 1500);
    } finally { setSubmitting(false); }
  };

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <Pressable className="flex-1" onPress={onClose} />
      <View className="bg-white rounded-t-3xl px-6 pt-6 pb-10">
        {done ? (
          <View className="items-center py-8">
            <Text className="text-4xl mb-2">📅</Text>
            <Text className="font-semibold text-gray-800">已加入日程！</Text>
          </View>
        ) : (
          <>
            <Text className="font-bold text-gray-800 text-base mb-4">计划这项活动</Text>
            <TextInput value={name} onChangeText={setName} autoFocus
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-800 mb-4"
            />
            <View className="flex-row gap-2 mb-5">
              {[fmt(new Date()), fmt(tomorrow)].map(d => (
                <TouchableOpacity key={d} onPress={() => setDate(d)}
                  className={`px-4 py-2 rounded-xl border ${date === d ? 'bg-indigo-500 border-indigo-500' : 'bg-white border-gray-200'}`}>
                  <Text className={`text-sm font-medium ${date === d ? 'text-white' : 'text-gray-600'}`}>
                    {d === fmt(new Date()) ? '今天' : '明天'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity onPress={submit} disabled={!name.trim() || submitting}
              className="w-full py-4 bg-indigo-500 rounded-2xl items-center">
              {submitting ? <ActivityIndicator color="white" /> : <Text className="text-white font-semibold">确定</Text>}
            </TouchableOpacity>
          </>
        )}
      </View>
    </Modal>
  );
}

// ── Name setup ────────────────────────────────────────────────────────────────
function NameSetup({ onConfirm }: { onConfirm: (name: string) => void }) {
  const [name, setName] = useState('');
  return (
    <View className="flex-1 items-center justify-center px-8">
      <XiaoNuan size={96} />
      <Text className="text-xl font-bold text-gray-800 mt-5 mb-2">给我起个名字吧</Text>
      <Text className="text-sm text-gray-500 text-center mb-8 leading-relaxed">
        我会陪你一起做行为激活练习。{'\n'}你可以叫我任何你喜欢的名字。
      </Text>
      <TextInput
        value={name} onChangeText={setName} autoFocus
        placeholder="例如：小暖、小橙、阿暖……"
        placeholderTextColor="#9ca3af"
        className="w-full max-w-xs px-4 py-3 border border-gray-200 rounded-2xl text-sm text-center text-gray-800 mb-4"
        onSubmitEditing={() => name.trim() && onConfirm(name.trim())}
      />
      <TouchableOpacity onPress={() => name.trim() && onConfirm(name.trim())} disabled={!name.trim()}
        className="w-full max-w-xs py-4 bg-orange-500 rounded-2xl items-center mb-3">
        <Text className="text-white font-semibold">就叫这个</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => onConfirm('小暖')}>
        <Text className="text-sm text-gray-400">跳过，用默认名字"小暖"</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Typing dots ───────────────────────────────────────────────────────────────
function TypingDots() {
  return (
    <View className="flex-row items-end gap-2 mb-4">
      <XiaoNuan size={32} />
      <View className="bg-white rounded-2xl rounded-bl px-4 py-3 shadow-sm flex-row gap-1 items-center">
        {[0, 1, 2].map(i => (
          <View key={i} className="w-1.5 h-1.5 bg-gray-400 rounded-full" />
        ))}
      </View>
    </View>
  );
}

// ── Message bubble ────────────────────────────────────────────────────────────
function Bubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === 'user';
  return (
    <View className={`flex-row items-end gap-2 mb-4 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {!isUser && <XiaoNuan size={32} />}
      <View
        className={`max-w-[75%] px-4 py-3 rounded-2xl ${
          isUser ? 'bg-orange-500 rounded-br-sm' : 'bg-white shadow-sm rounded-bl-sm'
        }`}
      >
        <Text className={`text-sm leading-relaxed ${isUser ? 'text-white' : 'text-gray-700'}`}>
          {msg.content}
        </Text>
      </View>
    </View>
  );
}

// ── Treatment Progress Card ───────────────────────────────────────────────────
function TreatmentProgressCard({ data }: { data: TreatmentProgressData }) {
  const [expanded, setExpanded] = useState(false);

  const criteriaCount = data.criteria.length;
  const doneCriteria = data.criteria.filter(c => c.done).length;
  const isForever = data.phase === 'review_cycle';

  const summaryText = isForever
    ? `第 ${data.review_cycle_count} 周 · 持续执行中`
    : data.days_until_eligible > 0
      ? `${doneCriteria}/${criteriaCount} 项完成 · 还差 ${data.days_until_eligible} 天`
      : data.criteria_met
        ? '条件已达成，等待推进'
        : `${doneCriteria}/${criteriaCount} 项完成`;

  return (
    <TouchableOpacity
      onPress={() => setExpanded(e => !e)}
      activeOpacity={0.8}
      className="mx-4 mt-2 mb-1 bg-white border border-orange-100 rounded-2xl overflow-hidden"
    >
      {/* Collapsed header — always visible */}
      <View className="flex-row items-center px-4 py-2.5 gap-2">
        <View className="w-2 h-2 rounded-full bg-orange-400" />
        <Text className="flex-1 text-xs font-medium text-gray-700">{data.phase_label}</Text>
        <Text className="text-xs text-gray-400 mr-1">{summaryText}</Text>
        <Text className="text-gray-300 text-xs">{expanded ? '▲' : '▼'}</Text>
      </View>

      {/* Expanded detail */}
      {expanded && (
        <View className="px-4 pb-3 border-t border-orange-50 pt-2 gap-2">
          {/* Criteria list */}
          {data.criteria.map(c => (
            <View key={c.key} className="flex-row items-center gap-2">
              <View className={`w-4 h-4 rounded-full items-center justify-center ${c.done ? 'bg-green-400' : 'bg-gray-200'}`}>
                {c.done && <Text className="text-white text-[9px] font-bold">✓</Text>}
              </View>
              <Text className={`text-xs flex-1 ${c.done ? 'text-gray-400 line-through' : 'text-gray-600'}`}>
                {c.label}
              </Text>
              {c.target !== undefined && c.target > 1 && (
                <Text className="text-xs text-gray-400">{c.current}/{c.target}</Text>
              )}
            </View>
          ))}

          {isForever ? (
            <Text className="text-xs text-gray-400 mt-1">
              已进入持续执行阶段 · 每7天进入新一轮回顾
            </Text>
          ) : data.days_until_eligible > 0 ? (
            <Text className="text-xs text-orange-400 mt-1">
              本阶段已进行 {data.phase_days} 天，还需 {data.days_until_eligible} 天才能进入下一阶段
            </Text>
          ) : data.criteria_met ? (
            <Text className="text-xs text-green-500 mt-1">所有条件已达成，即将进入下一阶段</Text>
          ) : (
            <Text className="text-xs text-gray-400 mt-1">时间条件已满足，完成以上条件后自动进入下一阶段</Text>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

// ── History Modal ─────────────────────────────────────────────────────────────
function HistoryModal({
  visible, userId, onClose,
}: { visible: boolean; userId: string; onClose: () => void }) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [selected, setSelected] = useState<ChatSession | null>(null);
  const [sessionMsgs, setSessionMsgs] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setSelected(null);
    setLoading(true);
    api.listSessions(userId)
      .then(setSessions)
      .catch(() => setSessions([]))
      .finally(() => setLoading(false));
  }, [visible, userId]);

  const openSession = async (s: ChatSession) => {
    setSelected(s);
    setLoading(true);
    try {
      const msgs = await api.getSessionMessages(s.id, userId);
      setSessionMsgs(msgs.map(m => ({ role: m.role, content: m.content })));
    } catch {
      setSessionMsgs([]);
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => setSelected(null);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView className="flex-1 bg-white">
        {/* Header */}
        <View className="flex-row items-center px-4 py-3 border-b border-gray-100">
          {selected ? (
            <TouchableOpacity onPress={handleBack} className="p-2 -ml-2 mr-1">
              <Text className="text-gray-500 text-lg">←</Text>
            </TouchableOpacity>
          ) : null}
          <Text className="flex-1 font-semibold text-gray-800 text-base">
            {selected
              ? (selected.title ?? formatDate(selected.created_at))
              : '历史对话'}
          </Text>
          <TouchableOpacity onPress={onClose} className="p-2 -mr-2">
            <Text className="text-gray-400 text-xl">✕</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color="#f97316" />
          </View>
        ) : selected ? (
          // Read-only message view
          <FlatList
            data={sessionMsgs}
            keyExtractor={(_, i) => String(i)}
            contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
            ListEmptyComponent={
              <View className="items-center pt-16">
                <Text className="text-gray-400 text-sm">这次对话没有消息记录</Text>
              </View>
            }
            renderItem={({ item }) => <Bubble msg={item} />}
          />
        ) : (
          // Session list
          <FlatList
            data={sessions}
            keyExtractor={s => String(s.id)}
            contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
            ListEmptyComponent={
              <View className="items-center pt-16">
                <XiaoNuan size={56} />
                <Text className="text-gray-400 text-sm mt-4">还没有历史对话</Text>
              </View>
            }
            renderItem={({ item: s }) => (
              <TouchableOpacity
                onPress={() => openSession(s)}
                className="bg-gray-50 rounded-2xl px-4 py-4 mb-3 active:opacity-70"
              >
                <Text className="font-medium text-gray-800 mb-1" numberOfLines={1}>
                  {s.title ?? '对话'}
                </Text>
                <Text className="text-xs text-gray-400" numberOfLines={1}>
                  {formatDate(s.created_at)}
                  {s.preview ? `  ·  ${s.preview}` : ''}
                </Text>
              </TouchableOpacity>
            )}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

// ── Main Chatbot ──────────────────────────────────────────────────────────────
export default function ChatbotScreen() {
  const router = useRouter();
  const userId = useUserId();

  const [userState, setUserState] = useState<UserState | null>(null);
  const [treatmentProgress, setTreatmentProgress] = useState<TreatmentProgressData | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [needsName, setNeedsName] = useState(false);
  const [showCrisis, setShowCrisis] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [detectedActivity, setDetectedActivity] = useState<{ type: 'completed' | 'planned'; name: string } | null>(null);
  const [showRecord, setShowRecord] = useState(false);
  const [showPlan, setShowPlan] = useState(false);
  const listRef = useRef<FlatList>(null);

  // ── Core send ───────────────────────────────────────────────────────────────
  const _sendMessage = useCallback(async (text: string, sessionIdOverride?: number) => {
    const sid = sessionIdOverride ?? currentSessionId;
    if (!sid) return;

    if (text.trim()) {
      setMessages(prev => [...prev, { role: 'user', content: text.trim() }]);
      setInput('');
    }
    setLoading(true);

    try {
      const res = await api.sendChatMessage(sid, text.trim(), userId);
      if (res.is_crisis) setShowCrisis(true);
      setMessages(prev => [...prev, { role: 'assistant', content: res.reply }]);
      if (res.detected_activity) setDetectedActivity(res.detected_activity);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: '网络出了点问题，稍后再试试？' }]);
    } finally {
      setLoading(false);
    }
  }, [currentSessionId, userId]);

  // ── Initialization ──────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [state, progress] = await Promise.all([
          api.getChatbotState(userId),
          api.getTreatmentProgress(userId).catch(() => null),
        ]);
        if (cancelled) return;
        setUserState(state);
        setTreatmentProgress(progress);

        // First-ever launch: ask for companion name
        if (state.companion_name === '小暖' && state.is_first_conversation) {
          setNeedsName(true);
          setInitializing(false);
          return;
        }

        // Get or create a session
        let session = await api.getCurrentSession(userId);
        if (!session) {
          session = await api.createChatSession(userId);
        }
        if (cancelled) return;
        setCurrentSessionId(session.id);

        // Load existing messages
        const dbMsgs = await api.getSessionMessages(session.id, userId);
        if (cancelled) return;
        const msgs: ChatMessage[] = dbMsgs.map(m => ({ role: m.role, content: m.content }));
        setMessages(msgs);
        setInitializing(false);

        // Only trigger opening message for a brand-new (empty) session
        if (msgs.length === 0 && (state.active_triggers.length > 0 || state.is_first_conversation)) {
          if (cancelled) return;
          setLoading(true);
          try {
            const res = await api.sendChatMessage(session.id, '', userId);
            if (cancelled) return;
            if (res.is_crisis) setShowCrisis(true);
            setMessages([{ role: 'assistant', content: res.reply }]);
            if (res.detected_activity) setDetectedActivity(res.detected_activity);
          } catch {
            setMessages([{ role: 'assistant', content: '网络出了点问题，稍后再试试？' }]);
          } finally {
            setLoading(false);
          }
        }
      } catch {
        if (!cancelled) setInitializing(false);
      }
    })();

    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Name confirm ────────────────────────────────────────────────────────────
  const handleNameConfirm = async (name: string) => {
    await api.setCompanionName(name, userId).catch(() => {});
    const state = await api.getChatbotState(userId);
    setUserState(state);
    setNeedsName(false);

    let session = await api.getCurrentSession(userId);
    if (!session) session = await api.createChatSession(userId);
    setCurrentSessionId(session.id);
    setMessages([]);
    setInitializing(false);

    if (state.active_triggers.length > 0 || state.is_first_conversation) {
      setLoading(true);
      try {
        const res = await api.sendChatMessage(session.id, '', userId);
        if (res.is_crisis) setShowCrisis(true);
        setMessages([{ role: 'assistant', content: res.reply }]);
        if (res.detected_activity) setDetectedActivity(res.detected_activity);
      } catch {
        setMessages([{ role: 'assistant', content: '网络出了点问题，稍后再试试？' }]);
      } finally {
        setLoading(false);
      }
    }
  };

  // ── New conversation ────────────────────────────────────────────────────────
  const handleNewConversation = async () => {
    try {
      const session = await api.createChatSession(userId);
      setCurrentSessionId(session.id);
      setMessages([]);
      setDetectedActivity(null);

      const [state, progress] = await Promise.all([
        api.getChatbotState(userId),
        api.getTreatmentProgress(userId).catch(() => null),
      ]);
      setUserState(state);
      setTreatmentProgress(progress);

      if (state.active_triggers.length > 0) {
        setLoading(true);
        try {
          const res = await api.sendChatMessage(session.id, '', userId);
          if (res.is_crisis) setShowCrisis(true);
          setMessages([{ role: 'assistant', content: res.reply }]);
          if (res.detected_activity) setDetectedActivity(res.detected_activity);
        } catch {
          setMessages([{ role: 'assistant', content: '网络出了点问题，稍后再试试？' }]);
        } finally {
          setLoading(false);
        }
      }
    } catch {
      Alert.alert('提示', '无法创建新对话，请重试');
    }
  };

  const companionName = userState?.companion_name ?? '小暖';
  const allItems: (ChatMessage | 'typing')[] = loading ? [...messages, 'typing'] : messages;

  return (
    <SafeAreaView className="flex-1 bg-orange-50" edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center gap-3 px-4 py-3 bg-white border-b border-gray-100">
        <TouchableOpacity onPress={() => router.back()} className="p-2 -ml-1">
          <Text className="text-gray-500 text-lg">←</Text>
        </TouchableOpacity>
        <XiaoNuan size={36} />
        <View className="flex-1">
          <Text className="font-semibold text-gray-800 text-sm">{companionName}</Text>
          <Text className="text-xs text-gray-400">行为激活伙伴</Text>
        </View>
        {/* History button */}
        <TouchableOpacity
          onPress={() => setShowHistory(true)}
          className="px-3 py-1.5 rounded-xl bg-gray-100"
        >
          <Text className="text-xs text-gray-500">历史</Text>
        </TouchableOpacity>
        {/* New conversation button */}
        <TouchableOpacity
          onPress={handleNewConversation}
          className="px-3 py-1.5 rounded-xl bg-orange-100 ml-1"
        >
          <Text className="text-xs text-orange-600 font-medium">新对话</Text>
        </TouchableOpacity>
      </View>

      {/* Treatment progress card */}
      {!initializing && !needsName && treatmentProgress && (
        <TreatmentProgressCard data={treatmentProgress} />
      )}

      {/* Body */}
      {initializing ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#f97316" />
        </View>
      ) : needsName ? (
        <NameSetup onConfirm={handleNameConfirm} />
      ) : (
        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}
        >
          <FlatList
            ref={listRef}
            data={allItems}
            keyExtractor={(_, i) => String(i)}
            contentContainerStyle={{ padding: 16, paddingBottom: 8 }}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
            ListEmptyComponent={
              <View className="items-center pt-16">
                <XiaoNuan size={64} />
                <Text className="text-gray-400 text-sm mt-4">嗨，有什么想聊的吗？</Text>
              </View>
            }
            renderItem={({ item }) =>
              item === 'typing' ? <TypingDots /> : <Bubble msg={item as ChatMessage} />
            }
          />

          {detectedActivity && (
            <ActivityBanner
              name={detectedActivity.name}
              type={detectedActivity.type}
              onRecord={() => { setDetectedActivity(null); setShowRecord(true); }}
              onPlan={() => { setDetectedActivity(null); setShowPlan(true); }}
              onDismiss={() => setDetectedActivity(null)}
            />
          )}

          <View className="flex-row items-end gap-2 px-4 py-3 bg-white border-t border-gray-100">
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder="说说你的想法…"
              placeholderTextColor="#9ca3af"
              multiline
              className="flex-1 bg-gray-100 rounded-2xl px-4 py-3 text-sm text-gray-800"
              style={{ maxHeight: 120 }}
              editable={!loading}
              onSubmitEditing={() => { if (input.trim() && !loading) _sendMessage(input); }}
              blurOnSubmit={false}
            />
            <TouchableOpacity
              onPress={() => { if (input.trim() && !loading) _sendMessage(input); }}
              disabled={!input.trim() || loading}
              className="w-11 h-11 rounded-full bg-orange-500 items-center justify-center"
              style={{ opacity: (!input.trim() || loading) ? 0.4 : 1 }}
            >
              <Text className="text-white text-base">↑</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      )}

      <CrisisModal visible={showCrisis} onClose={() => setShowCrisis(false)} />

      <HistoryModal
        visible={showHistory}
        userId={userId}
        onClose={() => setShowHistory(false)}
      />

      {showRecord && (
        <RecordModal
          visible={showRecord}
          onClose={() => setShowRecord(false)}
          onRecordSubmitted={() => setShowRecord(false)}
          prefillActivity={detectedActivity?.name}
        />
      )}
      {showPlan && (
        <QuickPlanModal
          defaultName={detectedActivity?.name ?? ''}
          onClose={() => setShowPlan(false)}
        />
      )}
    </SafeAreaView>
  );
}
