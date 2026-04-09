import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import type { MoodRecord, PlannedActivity } from '../types';

// ── helpers ──────────────────────────────────────────────────────────────────

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
  return `${year}年${month}月${day}日 星期${weekDays[date.getDay()]}`;
}

function toDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getHour(timestamp: string): number {
  return new Date(timestamp).getHours();
}

const HOURS = Array.from({ length: 18 }, (_, i) => i + 6); // 6:00 – 23:00

// ── score slider ──────────────────────────────────────────────────────────────

function ScoreSlider({ label, value, onChange, accent }: {
  label: string; value: number; onChange: (v: number) => void; accent: 'orange' | 'blue';
}) {
  const color = accent === 'orange' ? 'text-orange-500' : 'text-blue-500';
  return (
    <div className="mb-4">
      <div className="flex justify-between items-center mb-1.5">
        <span className="text-sm text-gray-600">{label}</span>
        <span className={`text-xl font-bold ${color}`}>{value}</span>
      </div>
      <input
        type="range" min={0} max={10} step={1} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full cursor-pointer"
        style={{ accentColor: accent === 'orange' ? '#f97316' : '#3b82f6' }}
      />
      <div className="flex justify-between text-xs text-gray-400 mt-0.5">
        <span>0 没感觉</span><span>10 非常强烈</span>
      </div>
    </div>
  );
}

// ── modal state type ──────────────────────────────────────────────────────────

type ModalState =
  | { type: 'menu'; item: PlannedActivity }
  | { type: 'completing'; item: PlannedActivity }
  | { type: 'completed'; feedback: string }
  | { type: 'incomplete_menu'; item: PlannedActivity }
  | { type: 'breakdown_result'; steps: string[]; item: PlannedActivity }
  | { type: 'reschedule'; item: PlannedActivity };

// ── planned activity card ─────────────────────────────────────────────────────

function PlannedCard({
  item, isEditable, onClick,
}: {
  item: PlannedActivity; isEditable: boolean; onClick: () => void;
}) {
  const isPastDue = !item.completed && !isEditable;

  return (
    <div
      onClick={isEditable || isPastDue ? onClick : undefined}
      className={`p-3 rounded-2xl border-l-4 transition-all duration-300 ${
        item.completed
          ? 'border-green-300 bg-green-50 opacity-70'
          : isPastDue
          ? 'border-red-300 bg-red-50 cursor-pointer hover:shadow-md'
          : 'border-indigo-300 bg-indigo-50 cursor-pointer hover:shadow-md'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-gray-700 flex-1 min-w-0 truncate">
          {item.activity_name}
        </span>
        <span className={`flex-shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${
          item.completed
            ? 'bg-green-100 text-green-700'
            : isPastDue
            ? 'bg-red-100 text-red-600'
            : 'bg-indigo-100 text-indigo-700'
        }`}>
          {item.completed ? '✅ 已完成' : isPastDue ? '⚠️ 未完成' : '⏳ 待完成'}
        </span>
      </div>
      {(isEditable || isPastDue) && !item.completed && (
        <p className="text-xs text-gray-400 mt-1">点击标记完成状态</p>
      )}
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export default function Timeline() {
  const navigate = useNavigate();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [records, setRecords] = useState<MoodRecord[]>([]);
  const [planned, setPlanned] = useState<PlannedActivity[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  // modal state
  const [modal, setModal] = useState<ModalState | null>(null);
  const [pleasure, setPleasure] = useState(5);
  const [importance, setImportance] = useState(5);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const reload = () => setTick(t => t + 1);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api.listRecords(toDateStr(selectedDate)),
      api.getPlanned(toDateStr(selectedDate)),
    ])
      .then(([recs, plans]) => {
        if (!cancelled) { setRecords(recs); setPlanned(plans); }
      })
      .catch(() => {
        if (!cancelled) { setRecords([]); setPlanned([]); }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [selectedDate, tick]);

  // date navigation
  const prevDay = () =>
    setSelectedDate(prev => { const d = new Date(prev); d.setDate(d.getDate() - 1); return d; });

  const nextDay = () =>
    setSelectedDate(prev => {
      const d = new Date(prev);
      d.setDate(d.getDate() + 1);
      const max = new Date(); max.setDate(max.getDate() + 30);
      return d > max ? prev : d;
    });

  const isToday = toDateStr(selectedDate) === toDateStr(new Date());
  const isFuture = selectedDate > new Date();
  const isEditable = isToday || isFuture; // can interact with planned on today/future

  // group data by hour
  const recordsByHour: Record<number, MoodRecord[]> = {};
  records.forEach(r => {
    const h = getHour(r.timestamp);
    (recordsByHour[h] ??= []).push(r);
  });

  const plannedByHour: Record<number, PlannedActivity[]> = {};
  const allDayPlanned: PlannedActivity[] = [];
  planned.forEach(p => {
    if (p.scheduled_time) {
      const h = parseInt(p.scheduled_time.split(':')[0], 10);
      (plannedByHour[h] ??= []).push(p);
    } else {
      allDayPlanned.push(p);
    }
  });

  const hasContent = records.length > 0 || planned.length > 0;

  // ── handlers ──────────────────────────────────────────────────────────────

  const openMenu = (item: PlannedActivity) => {
    setPleasure(5); setImportance(5);
    setModal({ type: 'menu', item });
  };

  const handleCompleteSubmit = async () => {
    if (modal?.type !== 'completing') return;
    setActionLoading(true);
    try {
      const text = `我完成了计划中的活动：${modal.item.activity_name}`;
      const record = await api.submitRecord(text, 'default_user', modal.item.id);
      await api.confirmRecord(record.id, { pleasure_score: pleasure, importance_score: importance });
      setModal({ type: 'completed', feedback: record.ai_immediate_feedback || '太棒了！你完成了今天的计划！' });
      reload();
    } catch {
      setModal(null);
    } finally {
      setActionLoading(false);
    }
  };

  const handleBreakdown = async () => {
    if (modal?.type !== 'incomplete_menu') return;
    const item = modal.item;
    setActionLoading(true);
    try {
      const result = await api.breakdownActivity(item.id);
      setModal({ type: 'breakdown_result', steps: result.steps || [], item });
    } catch {
      setModal({
        type: 'breakdown_result',
        steps: ['先做3次深呼吸，放松一下', `把"${item.activity_name}"想成只做1分钟`, '先开始那1分钟，完成再决定下一步'],
        item,
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleReschedule = async () => {
    if (modal?.type !== 'reschedule' || !rescheduleDate) return;
    setActionLoading(true);
    try {
      await api.rescheduleActivity(modal.item.id, rescheduleDate);
      setModal(null);
      reload();
    } finally {
      setActionLoading(false);
    }
  };

  // next 14 days for reschedule picker (excluding today)
  const rescheduleDays = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() + i + 1);
    const str = toDateStr(d);
    const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
    return { date: str, label: `${d.getMonth() + 1}/${d.getDate()} 周${weekDays[d.getDay()]}` };
  });

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-md mx-auto px-4 pt-6 pb-28">
      {/* Date nav */}
      <div className="flex items-center justify-between mb-5">
        <button
          onClick={prevDay}
          className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center text-gray-600 hover:bg-gray-50 transition-all"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M12 4l-6 6 6 6" />
          </svg>
        </button>

        <div className="text-center">
          <h2 className="text-lg font-bold text-gray-800">{formatDate(selectedDate)}</h2>
          {isToday && <span className="text-xs text-orange-500 font-medium">今天</span>}
          {isFuture && <span className="text-xs text-indigo-500 font-medium">计划日</span>}
        </div>

        <button
          onClick={nextDay}
          className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center text-gray-600 hover:bg-gray-50 transition-all"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M8 4l6 6-6 6" />
          </svg>
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-orange-200 border-t-orange-500 rounded-full animate-spin" />
        </div>
      )}

      {/* Empty state */}
      {!loading && !hasContent && (
        <div className="text-center py-16">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-orange-50 flex items-center justify-center">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#F97316" strokeWidth="1.5" strokeLinecap="round">
              <path d="M12 8v4l3 3" /><circle cx="12" cy="12" r="10" />
            </svg>
          </div>
          <p className="text-gray-500">{isFuture ? '还没有计划的活动' : '这一天还没有记录'}</p>
          <p className="text-gray-400 text-sm mt-1">
            {isFuture ? '回到主页点"计划活动"来安排吧' : '回到主页开始记录心情吧'}
          </p>
        </div>
      )}

      {/* Content */}
      {!loading && hasContent && (
        <>
          {/* All-day planned */}
          {allDayPlanned.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">全天计划</p>
              <div className="space-y-2">
                {allDayPlanned.map(p => (
                  <PlannedCard
                    key={p.id}
                    item={p}
                    isEditable={isEditable}
                    onClick={() => !p.completed && openMenu(p)}
                  />
                ))}
              </div>
              <div className="mt-4 border-t border-gray-100" />
            </div>
          )}

          {/* Hour timeline */}
          <div className="relative">
            <div className="absolute left-[52px] top-0 bottom-0 w-px bg-gray-200" />

            {HOURS.map(hour => {
              const hourRecords = recordsByHour[hour];
              const hourPlanned = plannedByHour[hour];
              const hasAnything = hourRecords || hourPlanned;

              if (!hasAnything) {
                return (
                  <div key={hour} className="flex items-start min-h-[32px]">
                    <div className="w-[52px] flex-shrink-0 text-right pr-3">
                      <span className="text-xs text-gray-300">{hour}:00</span>
                    </div>
                    <div className="w-2 h-2 rounded-full bg-gray-200 flex-shrink-0 -ml-1 mt-1" />
                  </div>
                );
              }

              return (
                <div key={hour} className="flex items-start mb-3">
                  <div className="w-[52px] flex-shrink-0 text-right pr-3">
                    <span className="text-xs text-gray-500 font-medium">{hour}:00</span>
                  </div>
                  <div className="w-3 h-3 rounded-full bg-orange-400 flex-shrink-0 -ml-1.5 mt-1.5 z-10" />
                  <div className="flex-1 ml-3 space-y-2">
                    {/* Planned items first */}
                    {hourPlanned?.map(p => (
                      <PlannedCard
                        key={p.id}
                        item={p}
                        isEditable={isEditable}
                        onClick={() => !p.completed && openMenu(p)}
                      />
                    ))}
                    {/* Records */}
                    {hourRecords?.map(record => (
                      <div
                        key={record.id}
                        onClick={() => setExpandedId(expandedId === record.id ? null : record.id)}
                        className="p-3 rounded-2xl border-l-4 border-orange-300 bg-orange-50 cursor-pointer hover:shadow-md transition-all duration-300"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium text-gray-700 flex-1 min-w-0 truncate">
                            {record.activity || '记录'}
                          </span>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {record.pleasure_score != null && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium">
                                愉悦 {Math.round(record.pleasure_score)}
                              </span>
                            )}
                            {record.importance_score != null && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                                重要 {Math.round(record.importance_score)}
                              </span>
                            )}
                          </div>
                        </div>

                        {expandedId === record.id && (
                          <div className="mt-3 pt-3 border-t border-orange-200/60 space-y-2">
                            {record.raw_text && (
                              <div>
                                <span className="text-xs text-gray-400">原始记录：</span>
                                <p className="text-sm text-gray-600 mt-0.5">{record.raw_text}</p>
                              </div>
                            )}
                            {record.thought && (
                              <div>
                                <span className="text-xs text-gray-400">想法：</span>
                                <p className="text-sm text-gray-600 mt-0.5">{record.thought}</p>
                              </div>
                            )}
                            {record.ai_immediate_feedback && (
                              <div className="p-2 bg-white/70 rounded-xl">
                                <span className="text-xs text-gray-400">小暖说：</span>
                                <p className="text-sm text-gray-600 mt-0.5 italic">{record.ai_immediate_feedback}</p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ── Bottom sheet modal ────────────────────────────────────────────── */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="fixed inset-0 bg-black/50"
            onClick={() => !actionLoading && setModal(null)}
          />
          <div
            className="relative w-full max-w-md bg-white rounded-3xl px-6 pt-6 pb-8 shadow-2xl max-h-[85vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >

            {/* ── menu ── */}
            {modal.type === 'menu' && (
              <>
                <p className="text-xs text-gray-400 mb-1">计划活动</p>
                <h3 className="text-base font-bold text-gray-800 mb-1">{modal.item.activity_name}</h3>
                {modal.item.scheduled_time && (
                  <p className="text-sm text-gray-500 mb-5">🕐 {modal.item.scheduled_time}</p>
                )}
                <div className="space-y-3">
                  <button
                    onClick={() => setModal({ type: 'completing', item: modal.item })}
                    className="w-full py-3.5 bg-green-500 text-white font-semibold rounded-2xl hover:bg-green-600 active:scale-95 transition-all"
                  >
                    ✅ 我完成了！
                  </button>
                  <button
                    onClick={() => setModal({ type: 'incomplete_menu', item: modal.item })}
                    className="w-full py-3.5 bg-gray-100 text-gray-700 font-semibold rounded-2xl hover:bg-gray-200 active:scale-95 transition-all"
                  >
                    ❌ 没有完成
                  </button>
                  <button
                    onClick={() => setModal(null)}
                    className="w-full py-3 text-gray-400 text-sm"
                  >
                    取消
                  </button>
                </div>
              </>
            )}

            {/* ── completing (score sliders) ── */}
            {modal.type === 'completing' && (
              <>
                <h3 className="text-base font-bold text-gray-800 mb-1">棒！记录一下你的感受</h3>
                <p className="text-sm text-gray-500 mb-5">{modal.item.activity_name}</p>
                <ScoreSlider label="完成这件事的愉悦感" value={pleasure} onChange={setPleasure} accent="orange" />
                <ScoreSlider label="这件事对我的重要性" value={importance} onChange={setImportance} accent="blue" />
                <button
                  onClick={handleCompleteSubmit}
                  disabled={actionLoading}
                  className="w-full py-3.5 bg-orange-500 text-white font-semibold rounded-2xl disabled:opacity-60 hover:bg-orange-600 active:scale-95 transition-all mt-2"
                >
                  {actionLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      正在记录...
                    </span>
                  ) : '提交记录'}
                </button>
                <button onClick={() => setModal(null)} className="w-full py-3 text-gray-400 text-sm mt-1">取消</button>
              </>
            )}

            {/* ── completed feedback ── */}
            {modal.type === 'completed' && (
              <div className="text-center py-4">
                <div className="text-5xl mb-4">🌟</div>
                <h3 className="text-base font-bold text-gray-800 mb-3">小暖说</h3>
                <p className="text-sm text-gray-600 leading-relaxed bg-orange-50 rounded-2xl p-4 text-left italic">
                  {modal.feedback}
                </p>
                <button
                  onClick={() => setModal(null)}
                  className="mt-5 w-full py-3 bg-orange-500 text-white font-semibold rounded-2xl hover:bg-orange-600 transition-all"
                >
                  收到，谢谢！
                </button>
              </div>
            )}

            {/* ── incomplete menu ── */}
            {modal.type === 'incomplete_menu' && (
              <>
                <h3 className="text-base font-bold text-gray-800 mb-1">没能完成也没关系 💙</h3>
                <p className="text-sm text-gray-500 mb-5">我们一起想想怎么办：</p>
                <div className="space-y-3">
                  <button
                    onClick={handleBreakdown}
                    disabled={actionLoading}
                    className="w-full py-3.5 bg-indigo-50 text-indigo-700 font-medium rounded-2xl hover:bg-indigo-100 active:scale-95 transition-all text-left px-4"
                  >
                    {actionLoading ? (
                      <span className="flex items-center gap-2">
                        <span className="w-4 h-4 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                        AI 正在拆解...
                      </span>
                    ) : (
                      <>
                        <span className="block text-sm font-semibold">🔧 帮我拆解成更小步骤</span>
                        <span className="block text-xs text-indigo-500 mt-0.5">AI 引导逐步完成</span>
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => setModal({ type: 'reschedule', item: modal.item })}
                    className="w-full py-3.5 bg-yellow-50 text-yellow-700 font-medium rounded-2xl hover:bg-yellow-100 active:scale-95 transition-all text-left px-4"
                  >
                    <span className="block text-sm font-semibold">📅 没时间/忘了，帮我改期</span>
                    <span className="block text-xs text-yellow-600 mt-0.5">重新安排到合适的时间</span>
                  </button>
                  <button
                    onClick={() => { setModal(null); navigate('/activities'); }}
                    className="w-full py-3.5 bg-gray-50 text-gray-700 font-medium rounded-2xl hover:bg-gray-100 active:scale-95 transition-all text-left px-4"
                  >
                    <span className="block text-sm font-semibold">🔄 这个活动不适合我，换一个</span>
                    <span className="block text-xs text-gray-500 mt-0.5">去活动库选择更适合的活动</span>
                  </button>
                  <button
                    onClick={() => setModal(null)}
                    className="w-full py-3 text-gray-400 text-sm"
                  >
                    暂时跳过
                  </button>
                </div>
              </>
            )}

            {/* ── breakdown result ── */}
            {modal.type === 'breakdown_result' && (
              <>
                <h3 className="text-base font-bold text-gray-800 mb-1">拆解建议 🔧</h3>
                <p className="text-sm text-gray-500 mb-4">{modal.item.activity_name}</p>
                <div className="space-y-2 mb-5">
                  {modal.steps.map((step, i) => (
                    <div key={i} className="flex gap-3 p-3 bg-indigo-50 rounded-xl">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-500 text-white text-xs font-bold flex items-center justify-center">
                        {i + 1}
                      </span>
                      <p className="text-sm text-gray-700">{step}</p>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-400 text-center mb-4">你也可以寻求家人或朋友的帮助，行动不必孤单。</p>
                <button
                  onClick={() => setModal(null)}
                  className="w-full py-3 bg-indigo-500 text-white font-semibold rounded-2xl hover:bg-indigo-600 transition-all"
                >
                  好的，我来试试！
                </button>
              </>
            )}

            {/* ── reschedule ── */}
            {modal.type === 'reschedule' && (
              <>
                <h3 className="text-base font-bold text-gray-800 mb-1">改期 📅</h3>
                <p className="text-sm text-gray-500 mb-4">选择新的日期：</p>
                <div className="flex flex-wrap gap-2 mb-5">
                  {rescheduleDays.map(opt => (
                    <button
                      key={opt.date}
                      onClick={() => setRescheduleDate(opt.date)}
                      className={`px-3 py-2 rounded-xl text-sm font-medium border transition-all ${
                        rescheduleDate === opt.date
                          ? 'bg-yellow-500 text-white border-yellow-500'
                          : 'bg-white text-gray-600 border-gray-200 hover:bg-yellow-50'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <button
                  onClick={handleReschedule}
                  disabled={!rescheduleDate || actionLoading}
                  className="w-full py-3.5 bg-yellow-500 text-white font-semibold rounded-2xl disabled:opacity-50 hover:bg-yellow-600 transition-all"
                >
                  {actionLoading ? '改期中...' : '确认改期'}
                </button>
                <button onClick={() => setModal(null)} className="w-full py-3 text-gray-400 text-sm mt-1">取消</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
