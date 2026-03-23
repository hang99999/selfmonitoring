import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { api } from '../api';
import type { DayStats, WeekStats, MonthStats } from '../types';

type ActiveTab = 'today' | 'week' | 'month';

const EMOTION_COLORS: Record<string, string> = {
  焦虑: '#F59E0B',
  低落: '#EF4444',
  悲伤: '#EF4444',
  愉快: '#10B981',
  平静: '#10B981',
  愤怒: '#F43F5E',
  充实: '#059669',
  感恩: '#14B8A6',
};

function getColor(emotion: string): string {
  return EMOTION_COLORS[emotion] || '#3B82F6';
}

function getEmotionBadgeClass(emotion: string): string {
  const map: Record<string, string> = {
    焦虑: 'bg-amber-100 text-amber-700',
    低落: 'bg-red-100 text-red-700',
    悲伤: 'bg-red-100 text-red-700',
    愉快: 'bg-green-100 text-green-700',
    平静: 'bg-green-100 text-green-700',
    愤怒: 'bg-rose-100 text-rose-700',
    充实: 'bg-emerald-100 text-emerald-700',
    感恩: 'bg-teal-100 text-teal-700',
  };
  return map[emotion] || 'bg-blue-100 text-blue-700';
}

export default function History() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('today');
  const [dayStats, setDayStats] = useState<DayStats | null>(null);
  const [weekStats, setWeekStats] = useState<WeekStats | null>(null);
  const [monthStats, setMonthStats] = useState<MonthStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true);
      setError('');
      setExpandedIndex(null);
      try {
        if (activeTab === 'today') {
          const data = await api.getStatsToday();
          setDayStats(data);
        } else if (activeTab === 'week') {
          const data = await api.getStatsWeek();
          setWeekStats(data);
        } else {
          const data = await api.getStatsMonth();
          setMonthStats(data);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : '加载失败');
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, [activeTab]);

  const tabs: { key: ActiveTab; label: string }[] = [
    { key: 'today', label: '今日' },
    { key: 'week', label: '本周' },
    { key: 'month', label: '本月' },
  ];

  // Prepare chart data
  const getChartData = () => {
    if (activeTab === 'today' && dayStats) {
      return dayStats.records.map(r => ({
        time: new Date(r.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
        intensity: r.emotion_intensity,
        emotion: r.emotion_type,
      }));
    }
    if (activeTab === 'week' && weekStats) {
      return weekStats.daily_data.map(d => ({
        time: d.date.slice(5), // MM-DD
        intensity: d.avg_intensity,
        emotion: d.dominant_emotion,
        count: d.count,
      }));
    }
    if (activeTab === 'month' && monthStats) {
      return monthStats.daily_data.map(d => ({
        time: d.date.slice(5),
        intensity: d.avg_intensity,
        emotion: d.dominant_emotion,
        count: d.count,
      }));
    }
    return [];
  };

  const chartData = getChartData();

  // Stats values
  const getStatsValues = () => {
    if (activeTab === 'today' && dayStats) {
      const emotions = dayStats.records.map(r => r.emotion_type);
      const mostCommon = emotions.length > 0
        ? Object.entries(emotions.reduce((acc, e) => ({ ...acc, [e]: (acc[e] || 0) + 1 }), {} as Record<string, number>))
            .sort((a, b) => b[1] - a[1])[0]?.[0] || '-'
        : '-';
      return {
        count: dayStats.count,
        avgIntensity: dayStats.avg_intensity.toFixed(1),
        mostCommon,
        distribution: null as Record<string, number> | null,
      };
    }
    if (activeTab === 'week' && weekStats) {
      const mostCommon = Object.entries(weekStats.emotion_distribution)
        .sort((a, b) => b[1] - a[1])[0]?.[0] || '-';
      return {
        count: weekStats.total_count,
        avgIntensity: weekStats.avg_intensity.toFixed(1),
        mostCommon,
        distribution: weekStats.emotion_distribution,
      };
    }
    if (activeTab === 'month' && monthStats) {
      const mostCommon = Object.entries(monthStats.emotion_distribution)
        .sort((a, b) => b[1] - a[1])[0]?.[0] || '-';
      return {
        count: monthStats.total_count,
        avgIntensity: monthStats.avg_intensity.toFixed(1),
        mostCommon,
        distribution: monthStats.emotion_distribution,
      };
    }
    return { count: 0, avgIntensity: '0', mostCommon: '-', distribution: null };
  };

  const stats = getStatsValues();

  return (
    <div className="max-w-md mx-auto px-4 pt-6">
      {/* Tab selector */}
      <div className="flex bg-gray-100 rounded-2xl p-1 mb-6">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all duration-300 ${
              activeTab === tab.key
                ? 'bg-white text-orange-500 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-orange-200 border-t-orange-500 rounded-full animate-spin" />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="text-center py-12">
          <p className="text-red-500 text-sm">{error}</p>
        </div>
      )}

      {/* Content */}
      {!loading && !error && (
        <>
          {/* Chart */}
          {chartData.length > 0 ? (
            <div className="bg-white rounded-2xl shadow-md p-4 mb-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">情绪强度变化</h3>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData}>
                  <XAxis
                    dataKey="time"
                    tick={{ fontSize: 11, fill: '#9CA3AF' }}
                    axisLine={{ stroke: '#E5E7EB' }}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[1, 10]}
                    tick={{ fontSize: 11, fill: '#9CA3AF' }}
                    axisLine={{ stroke: '#E5E7EB' }}
                    tickLine={false}
                    width={30}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: '12px',
                      border: 'none',
                      boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                      fontSize: '12px',
                    }}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    formatter={(value: any, _name: any, props: any) => [
                      `${value} (${props?.payload?.emotion || ''})`,
                      '强度',
                    ]}
                  />
                  <Line
                    type="monotone"
                    dataKey="intensity"
                    stroke="#F97316"
                    strokeWidth={2.5}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    dot={(props: any) => {
                      const { cx, cy, payload, index } = props;
                      const color = getColor(payload?.emotion || '');
                      return (
                        <circle
                          key={index}
                          cx={cx ?? 0}
                          cy={cy ?? 0}
                          r={4}
                          fill={color}
                          stroke="white"
                          strokeWidth={2}
                        />
                      );
                    }}
                    activeDot={{ r: 6, stroke: '#F97316', strokeWidth: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="text-center py-8 mb-6">
              <p className="text-gray-400 text-sm">暂无数据</p>
            </div>
          )}

          {/* Stats cards */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="bg-white rounded-2xl shadow-sm p-3 text-center">
              <p className="text-2xl font-bold text-orange-500">{stats.count}</p>
              <p className="text-xs text-gray-500 mt-1">记录次数</p>
            </div>
            <div className="bg-white rounded-2xl shadow-sm p-3 text-center">
              <p className="text-2xl font-bold text-orange-500">{stats.avgIntensity}</p>
              <p className="text-xs text-gray-500 mt-1">平均强度</p>
            </div>
            <div className="bg-white rounded-2xl shadow-sm p-3 text-center">
              <p className={`text-lg font-bold ${getEmotionBadgeClass(stats.mostCommon).split(' ')[1] || 'text-gray-700'}`}>
                {stats.mostCommon}
              </p>
              <p className="text-xs text-gray-500 mt-1">最常见情绪</p>
            </div>
          </div>

          {/* Emotion distribution (for week/month) */}
          {stats.distribution && Object.keys(stats.distribution).length > 0 && (
            <div className="bg-white rounded-2xl shadow-md p-4 mb-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">情绪分布</h3>
              <div className="flex flex-wrap gap-2">
                {Object.entries(stats.distribution)
                  .sort((a, b) => b[1] - a[1])
                  .map(([emotion, count]) => (
                    <span
                      key={emotion}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium ${getEmotionBadgeClass(emotion)}`}
                    >
                      {emotion} {count}次
                    </span>
                  ))}
              </div>
            </div>
          )}

          {/* Record list (today) */}
          {activeTab === 'today' && dayStats && dayStats.records.length > 0 && (
            <div className="bg-white rounded-2xl shadow-md p-4 mb-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">今日记录</h3>
              <div className="space-y-2">
                {dayStats.records.map((record, i) => (
                  <div
                    key={i}
                    onClick={() => setExpandedIndex(expandedIndex === i ? null : i)}
                    className="p-3 rounded-xl bg-gray-50 cursor-pointer hover:bg-gray-100 transition-all duration-300"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">
                        {new Date(record.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getEmotionBadgeClass(record.emotion_type)}`}>
                          {record.emotion_type}
                        </span>
                        <span className="text-xs text-gray-500">强度 {record.emotion_intensity}</span>
                      </div>
                    </div>
                    {expandedIndex === i && (
                      <div className="mt-2 pt-2 border-t border-gray-200 text-sm text-gray-500">
                        情绪类型: {record.emotion_type}，强度: {record.emotion_intensity}/10
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Daily data list (week/month) */}
          {(activeTab === 'week' || activeTab === 'month') && (
            <>
              {activeTab === 'week' && weekStats && weekStats.daily_data.length > 0 && (
                <div className="bg-white rounded-2xl shadow-md p-4 mb-6">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">每日概况</h3>
                  <div className="space-y-2">
                    {weekStats.daily_data.map((day, i) => (
                      <div
                        key={i}
                        onClick={() => setExpandedIndex(expandedIndex === i ? null : i)}
                        className="p-3 rounded-xl bg-gray-50 cursor-pointer hover:bg-gray-100 transition-all duration-300"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-600">{day.date}</span>
                          <div className="flex items-center gap-2">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getEmotionBadgeClass(day.dominant_emotion)}`}>
                              {day.dominant_emotion}
                            </span>
                            <span className="text-xs text-gray-500">{day.count}条</span>
                          </div>
                        </div>
                        {expandedIndex === i && (
                          <div className="mt-2 pt-2 border-t border-gray-200 text-sm text-gray-500">
                            平均强度: {day.avg_intensity.toFixed(1)}/10，记录 {day.count} 条
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {activeTab === 'month' && monthStats && monthStats.daily_data.length > 0 && (
                <div className="bg-white rounded-2xl shadow-md p-4 mb-6">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">每日概况</h3>
                  <div className="space-y-2">
                    {monthStats.daily_data.map((day, i) => (
                      <div
                        key={i}
                        onClick={() => setExpandedIndex(expandedIndex === i ? null : i)}
                        className="p-3 rounded-xl bg-gray-50 cursor-pointer hover:bg-gray-100 transition-all duration-300"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-600">{day.date}</span>
                          <div className="flex items-center gap-2">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getEmotionBadgeClass(day.dominant_emotion)}`}>
                              {day.dominant_emotion}
                            </span>
                            <span className="text-xs text-gray-500">{day.count}条</span>
                          </div>
                        </div>
                        {expandedIndex === i && (
                          <div className="mt-2 pt-2 border-t border-gray-200 text-sm text-gray-500">
                            平均强度: {day.avg_intensity.toFixed(1)}/10，记录 {day.count} 条
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
