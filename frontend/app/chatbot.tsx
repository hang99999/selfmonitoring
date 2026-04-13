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
import type { ChatMessage, UserState } from '../src/types';


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

// ── Main Chatbot ──────────────────────────────────────────────────────────────
export default function ChatbotScreen() {
  const router = useRouter();
  const userId = useUserId();
  const [userState, setUserState] = useState<UserState | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [needsName, setNeedsName] = useState(false);
  const [showCrisis, setShowCrisis] = useState(false);
  const [detectedActivity, setDetectedActivity] = useState<{ type: 'completed' | 'planned'; name: string } | null>(null);
  const [showRecord, setShowRecord] = useState(false);
  const [showPlan, setShowPlan] = useState(false);
  const listRef = useRef<FlatList>(null);

  const scrollToEnd = useCallback(() => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
  }, []);

  const _sendMessage = useCallback(async (text: string, stateOverride?: UserState, msgsOverride?: ChatMessage[]) => {
    const state = stateOverride ?? userState;
    const current = msgsOverride ?? messages;
    const next: ChatMessage[] = text.trim() ? [...current, { role: 'user', content: text.trim() }] : current;

    if (text.trim()) { setMessages(next); setInput(''); }
    setLoading(true);
    scrollToEnd();

    try {
      const res = await api.sendChatMessage(next, userId);
      if (res.is_crisis) setShowCrisis(true);
      const withReply = [...next, { role: 'assistant' as const, content: res.reply }];
      setMessages(withReply);
      if (res.detected_activity) setDetectedActivity(res.detected_activity);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: '网络出了点问题，稍后再试试？' }]);
    } finally {
      setLoading(false);
      scrollToEnd();
    }
  }, [userState, messages, scrollToEnd]);

  const _startSession = useCallback(async (state: UserState) => {
    setInitializing(false);
    if (state.active_triggers.length > 0 || state.is_first_conversation) {
      await _sendMessage('', state, []);
    }
  }, [_sendMessage]);

  useEffect(() => {
    (async () => {
      try {
        const state = await api.getChatbotState(userId);
        setUserState(state);
        if (state.companion_name === '小暖' && state.is_first_conversation) {
          setNeedsName(true);
          setInitializing(false);
          return;
        }
        await _startSession(state);
      } catch {
        setInitializing(false);
      }
    })();
  }, []);

  const handleNameConfirm = async (name: string) => {
    await api.setCompanionName(name, userId).catch(() => {});
    const state = await api.getChatbotState(userId);
    setUserState(state);
    setNeedsName(false);
    await _startSession(state);
  };

  const companionName = userState?.companion_name ?? '小暖';

  const allItems: (ChatMessage | 'typing')[] = loading
    ? [...messages, 'typing']
    : messages;

  return (
    <SafeAreaView className="flex-1 bg-orange-50" edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center gap-3 px-4 py-3 bg-white border-b border-gray-100">
        <TouchableOpacity onPress={() => router.back()} className="p-2 -ml-1">
          <Text className="text-gray-500 text-lg">←</Text>
        </TouchableOpacity>
        <XiaoNuan size={36} />
        <View>
          <Text className="font-semibold text-gray-800 text-sm">{companionName}</Text>
          <Text className="text-xs text-gray-400">行为激活伙伴</Text>
        </View>
      </View>

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
            onContentSizeChange={scrollToEnd}
            ListEmptyComponent={
              <View className="items-center pt-16">
                <XiaoNuan size={64} />
                <Text className="text-gray-400 text-sm mt-4">嗨，有什么想聊的吗？</Text>
              </View>
            }
            renderItem={({ item }) =>
              item === 'typing'
                ? <TypingDots />
                : <Bubble msg={item as ChatMessage} />
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
