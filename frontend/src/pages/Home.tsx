import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import XiaoNuan from '../components/XiaoNuan';
import RecordModal from '../components/RecordModal';
import { api } from '../api';
import type { Activity } from '../types';

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return '早上好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

function getDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
  return `${year}年${month}月${day}日 星期${weekDays[now.getDay()]}`;
}

function toDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDayLabel(date: Date, index: number): string {
  if (index === 0) return '今天';
  if (index === 1) return '明天';
  if (index === 2) return '后天';
  const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
  return `周${weekDays[date.getDay()]}`;
}

// ── Plan Activity Modal ──────────────────────────────────────────────────────
function PlanActivityModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [activityName, setActivityName] = useState('');
  const [selectedDate, setSelectedDate] = useState(toDateStr(new Date()));
  const [allDay, setAllDay] = useState(true);
  const [selectedHour, setSelectedHour] = useState(9);
  const [showLibrary, setShowLibrary] = useState(false);
  const [libraryActivities, setLibraryActivities] = useState<Activity[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  const dateOptions = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() + i);
    return { date: toDateStr(d), label: formatDayLabel(d, i) };
  });

  const handleSubmit = async () => {
    if (!activityName.trim() || submitting) return;
    setSubmitting(true);
    try {
      await api.createPlanned({
        activity_name: activityName.trim(),
        scheduled_date: selectedDate,
        scheduled_time: allDay ? undefined : `${String(selectedHour).padStart(2, '0')}:00`,
      });
      setSuccess(true);
      setTimeout(() => onClose(), 1800);
    } finally {
      setSubmitting(false);
    }
  };

  // Open modal initializer via effect is handled by isOpen check above
  // (could use useEffect but keeping simple)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="fixed inset-0 bg-black/50" onClick={() => !submitting && onClose()} />
      <div className="relative w-full max-w-md bg-white rounded-3xl px-6 pt-6 pb-8 shadow-2xl" onClick={e => e.stopPropagation()}>
        {success ? (
          <div className="text-center py-10">
            <div className="text-5xl mb-4">📅</div>
            <p className="text-gray-800 font-semibold text-lg">已加入日程！</p>
            <p className="text-sm text-gray-500 mt-1">在日程页面可以查看和管理</p>
          </div>
        ) : (
          <>
            <h2 className="text-lg font-bold text-gray-800 mb-5">计划一项活动</h2>
            <div className="mb-5">
              <label className="text-sm font-medium text-gray-600 mb-2 block">活动名称</label>
              <input
                type="text" value={activityName}
                onChange={e => setActivityName(e.target.value)}
                placeholder="例如：出门散步30分钟"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                onKeyDown={e => e.key === 'Enter' && !showLibrary && handleSubmit()}
              />
              <button onClick={() => { setShowLibrary(v => !v); if (!showLibrary) api.getActivities().then(setLibraryActivities).catch(() => {}); }} className="text-xs text-indigo-500 mt-1.5 hover:underline">
                {showLibrary ? '▾ 收起活动库' : '▸ 从活动库选取'}
              </button>
              {showLibrary && (
                <div className="mt-2 max-h-40 overflow-y-auto rounded-xl border border-gray-200 divide-y divide-gray-100">
                  {libraryActivities.length === 0
                    ? <p className="text-xs text-gray-400 px-3 py-3 text-center">活动库为空，先去活动库添加吧</p>
                    : libraryActivities.map(a => (
                        <button key={a.id} onClick={() => { setActivityName(a.name); setShowLibrary(false); }} className="w-full text-left px-3 py-2.5 text-sm text-gray-700 hover:bg-indigo-50">{a.name}</button>
                      ))
                  }
                </div>
              )}
            </div>
            <div className="mb-5">
              <label className="text-sm font-medium text-gray-600 mb-2 block">日期</label>
              <div className="flex gap-2 flex-wrap">
                {dateOptions.map(opt => (
                  <button key={opt.date} onClick={() => setSelectedDate(opt.date)}
                    className={`px-3 py-2 rounded-xl text-sm font-medium border transition-all ${selectedDate === opt.date ? 'bg-indigo-500 text-white border-indigo-500' : 'bg-white text-gray-600 border-gray-200 hover:bg-indigo-50'}`}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="mb-6">
              <label className="text-sm font-medium text-gray-600 mb-2 block">时间</label>
              <div className="flex gap-2">
                {[true, false].map(isAllDay => (
                  <button key={String(isAllDay)} onClick={() => setAllDay(isAllDay)}
                    className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${allDay === isAllDay ? 'bg-indigo-500 text-white border-indigo-500' : 'bg-white text-gray-600 border-gray-200'}`}>
                    {isAllDay ? '全天' : '指定时间'}
                  </button>
                ))}
              </div>
              {!allDay && (
                <select value={selectedHour} onChange={e => setSelectedHour(Number(e.target.value))}
                  className="mt-2 px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-700 focus:outline-none">
                  {Array.from({ length: 17 }, (_, i) => i + 6).map(h => <option key={h} value={h}>{h}:00</option>)}
                </select>
              )}
            </div>
            <button onClick={handleSubmit} disabled={!activityName.trim() || submitting}
              className="w-full py-3.5 bg-indigo-500 text-white font-semibold rounded-2xl disabled:opacity-50 hover:bg-indigo-600 active:scale-95 transition-all">
              {submitting ? '计划中...' : '确定计划'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

const DEFAULT_GREETING = '今天过得怎么样？随时可以和我聊聊～';

// ── Main Home Page ────────────────────────────────────────────────────────────
export default function Home() {
  const navigate = useNavigate();
  const [modalOpen, setModalOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [feedback, setFeedback] = useState(DEFAULT_GREETING);
  const [showCrisis, setShowCrisis] = useState(false);
  const pollTimer = useRef<number | null>(null);
  const resetTimer = useRef<number | null>(null);

  // Clean up timers on unmount
  useEffect(() => () => {
    if (pollTimer.current) clearTimeout(pollTimer.current);
    if (resetTimer.current) clearTimeout(resetTimer.current);
  }, []);

  const handleRecordSubmitted = (recordId: string) => {
    setFeedback('小暖正在思考...');

    let attempts = 0;
    const MAX = 30; // 60s max

    const poll = async () => {
      try {
        const rec = await api.getRecord(recordId);
        if (rec.risk_level === 'crisis') {
          setFeedback(DEFAULT_GREETING);
          setShowCrisis(true);
          return;
        }
        if (rec.ai_immediate_feedback) {
          setFeedback(rec.ai_immediate_feedback);
          // Auto-reset after 90 seconds
          resetTimer.current = window.setTimeout(() => setFeedback(DEFAULT_GREETING), 600_000);
          return;
        }
      } catch { /* ignore, keep polling */ }
      attempts++;
      if (attempts < MAX) {
        pollTimer.current = window.setTimeout(poll, 2_000);
      } else {
        setFeedback('记录成功！继续保持对自己的关注～');
        resetTimer.current = window.setTimeout(() => setFeedback(DEFAULT_GREETING), 600_000);
      }
    };

    pollTimer.current = window.setTimeout(poll, 1_500);
  };

  return (
    <div className="max-w-md mx-auto px-4 pt-8 pb-24 flex flex-col min-h-[calc(100vh-5rem)]">
      {/* Greeting */}
      <div className="text-center mb-6 mt-auto">
        <h1 className="text-2xl font-bold text-gray-800">{getGreeting()}</h1>
        <p className="text-sm text-gray-500 mt-1">{getDateString()}</p>
      </div>

      {/* Speech bubble (above character) */}
      <div className="mx-4 mb-0">
        <div className="bg-white rounded-2xl shadow-md px-5 py-4 text-center">
          <p className="text-gray-600 text-sm leading-relaxed">{feedback}</p>
        </div>
        {/* Downward-pointing tail toward character */}
        <div className="flex justify-center">
          <div className="w-0 h-0"
            style={{
              borderLeft: '9px solid transparent',
              borderRight: '9px solid transparent',
              borderTop: '10px solid white',
              filter: 'drop-shadow(0 2px 1px rgba(0,0,0,0.06))',
            }}
          />
        </div>
      </div>

      {/* XiaoNuan character (below bubble) — click to open chatbot */}
      <div className="flex justify-center mb-6">
        <button
          onClick={() => navigate('/chatbot')}
          className="rounded-full active:scale-95 hover:scale-105 transition-transform duration-200 focus:outline-none"
          aria-label="和小暖聊天"
        >
          <XiaoNuan size={120} />
        </button>
      </div>
      <p className="text-center text-xs text-gray-400 -mt-4 mb-6">点击和我聊聊</p>

      {/* Action buttons: Record + Plan */}
      <div className="flex justify-center items-start gap-12 mb-10">
        <div className="flex flex-col items-center">
          <button
            onClick={() => setModalOpen(true)}
            className="w-16 h-16 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 text-white shadow-lg hover:shadow-xl hover:scale-105 flex items-center justify-center transition-all duration-300"
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>
          <p className="text-xs text-gray-500 mt-2">记录活动</p>
        </div>

        <div className="flex flex-col items-center">
          <button
            onClick={() => setPlanOpen(true)}
            className="w-16 h-16 rounded-full bg-gradient-to-br from-indigo-400 to-indigo-600 text-white shadow-lg hover:shadow-xl hover:scale-105 flex items-center justify-center transition-all duration-300"
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
              <line x1="8" y1="14" x2="8" y2="14" strokeWidth="3" strokeLinecap="round" />
              <line x1="12" y1="14" x2="12" y2="14" strokeWidth="3" strokeLinecap="round" />
              <line x1="16" y1="14" x2="16" y2="14" strokeWidth="3" strokeLinecap="round" />
            </svg>
          </button>
          <p className="text-xs text-gray-500 mt-2">计划活动</p>
        </div>
      </div>

      <div className="mb-auto" />

      {/* Modals */}
      <RecordModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onRecordSubmitted={handleRecordSubmitted}
      />
      <PlanActivityModal isOpen={planOpen} onClose={() => setPlanOpen(false)} />

      {/* Crisis overlay */}
      {showCrisis && (
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
              onClick={() => setShowCrisis(false)}
              className="w-full py-3 rounded-full bg-red-500 text-white font-medium hover:bg-red-600 transition-colors"
            >
              我知道了
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
