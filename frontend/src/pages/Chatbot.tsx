import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import XiaoNuan from '../components/XiaoNuan';
import RecordModal from '../components/RecordModal';
import { api } from '../api';
import type { ChatMessage, UserState } from '../types';

// ── Crisis overlay ────────────────────────────────────────────────────────────
function CrisisOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative w-full max-w-md bg-red-50 rounded-3xl p-8 shadow-2xl text-center">
        <div className="w-14 h-14 mx-auto mb-5 rounded-full bg-red-100 flex items-center justify-center">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-red-800 mb-3">我们很关心你的安全</h2>
        <div className="space-y-2 mb-6 text-left">
          {[
            ['全国心理援助热线', '400-161-9995'],
            ['北京心理危机干预中心', '010-82951332'],
            ['生命热线', '400-821-1215'],
          ].map(([label, num]) => (
            <div key={num} className="px-4 py-3 bg-white rounded-2xl flex justify-between items-center">
              <span className="text-sm text-gray-500">{label}</span>
              <span className="font-bold text-red-600">{num}</span>
            </div>
          ))}
        </div>
        <p className="text-sm text-red-700 mb-6">如正处于危险中，请立即拨打 120 或联系身边信任的人</p>
        <button
          onClick={onClose}
          className="w-full py-3 rounded-full bg-red-500 text-white font-medium hover:bg-red-600 transition-colors"
        >
          我知道了
        </button>
      </div>
    </div>
  );
}

// ── Activity detection prompt ─────────────────────────────────────────────────
function ActivityDetectedBanner({
  name,
  type,
  onRecord,
  onPlan,
  onDismiss,
}: {
  name: string;
  type: 'completed' | 'planned';
  onRecord: () => void;
  onPlan: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="mx-4 mb-2 bg-orange-50 border border-orange-200 rounded-2xl px-4 py-3 flex items-center gap-3">
      <span className="text-orange-400 text-lg">📋</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-orange-700 font-medium">
          {type === 'completed' ? `要记录「${name}」吗？` : `要把「${name}」加入日程吗？`}
        </p>
      </div>
      <div className="flex gap-2 shrink-0">
        {type === 'completed' ? (
          <button
            onClick={onRecord}
            className="text-xs px-3 py-1.5 bg-orange-500 text-white rounded-xl font-medium hover:bg-orange-600 transition-colors"
          >
            记录
          </button>
        ) : (
          <button
            onClick={onPlan}
            className="text-xs px-3 py-1.5 bg-indigo-500 text-white rounded-xl font-medium hover:bg-indigo-600 transition-colors"
          >
            计划
          </button>
        )}
        <button
          onClick={onDismiss}
          className="text-xs px-2 py-1.5 text-gray-400 hover:text-gray-600 transition-colors"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

// ── Plan activity modal (inline, minimal) ─────────────────────────────────────
function QuickPlanModal({
  defaultName,
  onClose,
}: {
  defaultName: string;
  onClose: () => void;
}) {
  const [name, setName] = useState(defaultName);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const [selectedDate, setSelectedDate] = useState(fmt(tomorrow));

  const submit = async () => {
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    try {
      await api.createPlanned({ activity_name: name.trim(), scheduled_date: selectedDate });
      setDone(true);
      setTimeout(onClose, 1500);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center px-4 pb-6">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white rounded-3xl px-6 pt-6 pb-8 shadow-2xl">
        {done ? (
          <div className="text-center py-6">
            <p className="text-2xl mb-2">📅</p>
            <p className="font-semibold text-gray-800">已加入日程！</p>
          </div>
        ) : (
          <>
            <h3 className="text-base font-bold text-gray-800 mb-4">计划这项活动</h3>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
            <div className="flex gap-2 mb-5">
              {[fmt(today), fmt(tomorrow)].map(d => (
                <button
                  key={d}
                  onClick={() => setSelectedDate(d)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
                    selectedDate === d
                      ? 'bg-indigo-500 text-white border-indigo-500'
                      : 'bg-white text-gray-600 border-gray-200'
                  }`}
                >
                  {d === fmt(today) ? '今天' : '明天'}
                </button>
              ))}
            </div>
            <button
              onClick={submit}
              disabled={!name.trim() || submitting}
              className="w-full py-3 bg-indigo-500 text-white font-semibold rounded-2xl disabled:opacity-50 hover:bg-indigo-600 transition-all"
            >
              {submitting ? '添加中...' : '确定'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Name setup screen ─────────────────────────────────────────────────────────
function NameSetupScreen({ onConfirm }: { onConfirm: (name: string) => void }) {
  const [name, setName] = useState('');

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
      <XiaoNuan size={96} />
      <h2 className="text-xl font-bold text-gray-800 mt-5 mb-2">给我起个名字吧</h2>
      <p className="text-sm text-gray-500 mb-8 leading-relaxed">
        我会陪你一起做行为激活练习。<br />你可以叫我任何你喜欢的名字。
      </p>
      <input
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="例如：小暖、小橙、阿暖……"
        className="w-full max-w-xs px-4 py-3 border border-gray-200 rounded-2xl text-sm text-center focus:outline-none focus:ring-2 focus:ring-orange-300 mb-4"
        onKeyDown={e => e.key === 'Enter' && name.trim() && onConfirm(name.trim())}
        autoFocus
      />
      <button
        onClick={() => name.trim() && onConfirm(name.trim())}
        disabled={!name.trim()}
        className="w-full max-w-xs py-3.5 bg-orange-500 text-white font-semibold rounded-2xl disabled:opacity-40 hover:bg-orange-600 transition-all"
      >
        就叫这个
      </button>
      <button
        onClick={() => onConfirm('小暖')}
        className="mt-3 text-sm text-gray-400 hover:text-gray-600 transition-colors"
      >
        跳过，用默认名字"小暖"
      </button>
    </div>
  );
}

// ── Message bubble ────────────────────────────────────────────────────────────
function MessageBubble({ msg, companionName }: { msg: ChatMessage; companionName: string }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex items-end gap-2 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {!isUser && (
        <div className="shrink-0 mb-1">
          <XiaoNuan size={32} />
        </div>
      )}
      <div
        className={`max-w-[75%] px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
          isUser
            ? 'bg-orange-500 text-white rounded-br-sm'
            : 'bg-white text-gray-700 shadow-sm rounded-bl-sm'
        }`}
      >
        {msg.content}
      </div>
    </div>
  );
}

// ── Typing indicator ──────────────────────────────────────────────────────────
function TypingIndicator({ companionName }: { companionName: string }) {
  return (
    <div className="flex items-end gap-2">
      <div className="shrink-0 mb-1">
        <XiaoNuan size={32} />
      </div>
      <div className="bg-white shadow-sm rounded-2xl rounded-bl-sm px-4 py-3">
        <div className="flex gap-1 items-center h-4">
          {[0, 1, 2].map(i => (
            <span
              key={i}
              className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main Chatbot page ─────────────────────────────────────────────────────────
export default function Chatbot() {
  const navigate = useNavigate();
  const [userState, setUserState] = useState<UserState | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [showCrisis, setShowCrisis] = useState(false);
  const [detectedActivity, setDetectedActivity] = useState<{
    type: 'completed' | 'planned';
    name: string;
  } | null>(null);
  const [showRecordModal, setShowRecordModal] = useState(false);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [needsName, setNeedsName] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  }, []);

  // Init: load state, decide if name setup needed, send first message if triggered
  useEffect(() => {
    (async () => {
      try {
        const state = await api.getChatbotState();
        setUserState(state);

        // If companion name is default and it's the first conversation, show name setup
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

  const _startSession = async (state: UserState) => {
    setInitializing(false);

    // If there's an active trigger OR it's first conversation, send an empty
    // "start" message so the chatbot opens with a proactive first message
    if (state.active_triggers.length > 0 || state.is_first_conversation) {
      await _sendMessage('', state, []);
    }
  };

  const handleNameConfirm = async (name: string) => {
    await api.setCompanionName(name);
    const state = await api.getChatbotState();
    setUserState(state);
    setNeedsName(false);
    await _startSession(state);
  };

  const _sendMessage = async (
    text: string,
    stateOverride?: UserState,
    messagesOverride?: ChatMessage[],
  ) => {
    const state = stateOverride ?? userState;
    const current = messagesOverride ?? messages;

    const nextMessages: ChatMessage[] =
      text.trim()
        ? [...current, { role: 'user', content: text.trim() }]
        : current;

    if (text.trim()) {
      setMessages(nextMessages);
      setInput('');
    }
    setLoading(true);
    scrollToBottom();

    try {
      const res = await api.sendChatMessage(nextMessages);

      if (res.is_crisis) {
        setShowCrisis(true);
      }

      const withReply: ChatMessage[] = [
        ...nextMessages,
        { role: 'assistant', content: res.reply },
      ];
      setMessages(withReply);

      if (res.detected_activity) {
        setDetectedActivity(res.detected_activity);
      }
    } finally {
      setLoading(false);
      scrollToBottom();
      inputRef.current?.focus();
    }
  };

  const handleSend = () => {
    if (!input.trim() || loading) return;
    _sendMessage(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const companionName = userState?.companion_name ?? '小暖';

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-screen bg-gradient-to-b from-orange-50 to-white max-w-md mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-safe pt-4 pb-3 bg-white/80 backdrop-blur border-b border-gray-100 shrink-0">
        <button
          onClick={() => navigate('/')}
          className="p-2 -ml-1 rounded-xl text-gray-500 hover:bg-gray-100 transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
        </button>
        <XiaoNuan size={36} />
        <div>
          <p className="font-semibold text-gray-800 text-sm leading-tight">{companionName}</p>
          <p className="text-xs text-gray-400">行为激活伙伴</p>
        </div>
      </div>

      {/* Body */}
      {initializing ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex gap-1">
            {[0, 1, 2].map(i => (
              <span
                key={i}
                className="w-2 h-2 bg-orange-300 rounded-full animate-bounce"
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </div>
        </div>
      ) : needsName ? (
        <NameSetupScreen onConfirm={handleNameConfirm} />
      ) : (
        <>
          {/* Message list */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            {messages.length === 0 && !loading && (
              <div className="text-center pt-12">
                <XiaoNuan size={64} />
                <p className="text-gray-400 text-sm mt-4">
                  嗨，有什么想聊的吗？
                </p>
              </div>
            )}
            {messages.map((msg, i) => (
              <MessageBubble key={i} msg={msg} companionName={companionName} />
            ))}
            {loading && <TypingIndicator companionName={companionName} />}
            <div ref={bottomRef} />
          </div>

          {/* Activity detection banner */}
          {detectedActivity && (
            <ActivityDetectedBanner
              name={detectedActivity.name}
              type={detectedActivity.type}
              onRecord={() => { setDetectedActivity(null); setShowRecordModal(true); }}
              onPlan={() => { setDetectedActivity(null); setShowPlanModal(true); }}
              onDismiss={() => setDetectedActivity(null)}
            />
          )}

          {/* Input */}
          <div className="px-4 pb-safe pb-6 pt-2 bg-white/80 backdrop-blur border-t border-gray-100 shrink-0">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="说说你的想法…"
                rows={1}
                className="flex-1 resize-none px-4 py-3 bg-gray-100 rounded-2xl text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-300 leading-relaxed"
                style={{ maxHeight: '120px', overflowY: 'auto' }}
                disabled={loading}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || loading}
                className="w-11 h-11 rounded-full bg-orange-500 text-white flex items-center justify-center disabled:opacity-40 hover:bg-orange-600 active:scale-95 transition-all shrink-0"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z" />
                </svg>
              </button>
            </div>
          </div>
        </>
      )}

      {/* Overlays */}
      {showCrisis && <CrisisOverlay onClose={() => setShowCrisis(false)} />}

      {showRecordModal && (
        <RecordModal
          isOpen={showRecordModal}
          onClose={() => setShowRecordModal(false)}
          onRecordSubmitted={() => setShowRecordModal(false)}
        />
      )}

      {showPlanModal && (
        <QuickPlanModal
          defaultName={detectedActivity?.name ?? ''}
          onClose={() => setShowPlanModal(false)}
        />
      )}
    </div>
  );
}
