import { useState } from 'react';
import XiaoNuan from '../components/XiaoNuan';
import RecordModal from '../components/RecordModal';
import InsightCard from '../components/InsightCard';
import { api } from '../api';
import type { MoodRecord, InsightReport } from '../types';

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
  const weekDay = weekDays[now.getDay()];
  return `${year}年${month}月${day}日 星期${weekDay}`;
}

export default function Home() {
  const [modalOpen, setModalOpen] = useState(false);
  const [feedback, setFeedback] = useState('今天过得怎么样？随时可以和我聊聊～');
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [dailyInsight, setDailyInsight] = useState<InsightReport | null>(null);
  const [weeklyInsight, setWeeklyInsight] = useState<InsightReport | null>(null);
  const [dailyLoading, setDailyLoading] = useState(false);
  const [weeklyLoading, setWeeklyLoading] = useState(false);
  const [insightError, setInsightError] = useState('');

  const handleRecordCreated = (record: MoodRecord) => {
    setFeedback(record.ai_immediate_feedback || '记录成功！继续保持对自己情绪的关注～');
  };

  const handleDailyInsight = async () => {
    setDailyLoading(true);
    setInsightError('');
    try {
      const report = await api.getDailyInsight();
      setDailyInsight(report);
    } catch (err) {
      setInsightError(err instanceof Error ? err.message : '获取总结失败');
    } finally {
      setDailyLoading(false);
    }
  };

  const handleWeeklyInsight = async () => {
    setWeeklyLoading(true);
    setInsightError('');
    try {
      const report = await api.getWeeklyInsight();
      setWeeklyInsight(report);
    } catch (err) {
      setInsightError(err instanceof Error ? err.message : '获取总结失败');
    } finally {
      setWeeklyLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 pt-8">
      {/* Greeting */}
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-gray-800">{getGreeting()}</h1>
        <p className="text-sm text-gray-500 mt-1">{getDateString()}</p>
      </div>

      {/* XiaoNuan character */}
      <div className="flex justify-center mb-4">
        <XiaoNuan size={120} />
      </div>

      {/* Speech bubble */}
      <div className="relative mx-6 mb-8">
        <div className="bg-white rounded-2xl shadow-md p-4 text-center">
          <p className="text-gray-600 text-sm leading-relaxed">{feedback}</p>
        </div>
        <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-white shadow-md rotate-45" />
      </div>

      {/* Record button */}
      <div className="flex justify-center mb-8">
        <button
          onClick={() => setModalOpen(true)}
          className="w-16 h-16 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 text-white shadow-lg hover:shadow-xl hover:scale-105 flex items-center justify-center transition-all duration-300"
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        </button>
      </div>
      <p className="text-center text-sm text-gray-500 -mt-4 mb-6">开始记录</p>

      {/* Insights section */}
      <div className="mb-8">
        <button
          onClick={() => setInsightsOpen(!insightsOpen)}
          className="w-full flex items-center justify-between px-4 py-3 bg-white rounded-2xl shadow-sm text-gray-700 font-medium hover:bg-gray-50 transition-all duration-300"
        >
          <span>查看分析总结</span>
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            className={`transition-transform duration-300 ${insightsOpen ? 'rotate-180' : ''}`}
          >
            <path d="M6 8l4 4 4-4" />
          </svg>
        </button>

        {insightsOpen && (
          <div className="mt-3 space-y-3 transition-all duration-300">
            <div className="flex gap-3">
              <button
                onClick={handleDailyInsight}
                disabled={dailyLoading}
                className="flex-1 py-2.5 rounded-xl bg-orange-50 text-orange-600 font-medium text-sm hover:bg-orange-100 disabled:opacity-50 transition-all duration-300"
              >
                今日总结
              </button>
              <button
                onClick={handleWeeklyInsight}
                disabled={weeklyLoading}
                className="flex-1 py-2.5 rounded-xl bg-orange-50 text-orange-600 font-medium text-sm hover:bg-orange-100 disabled:opacity-50 transition-all duration-300"
              >
                本周总结
              </button>
            </div>

            {insightError && (
              <p className="text-sm text-red-500 text-center">{insightError}</p>
            )}

            <InsightCard report={dailyInsight} loading={dailyLoading} type="daily" />
            <InsightCard report={weeklyInsight} loading={weeklyLoading} type="weekly" />
          </div>
        )}
      </div>

      {/* Record Modal */}
      <RecordModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onRecordCreated={handleRecordCreated}
      />
    </div>
  );
}
