import { useState, useEffect } from 'react';
import { api } from '../api';
import type { MoodRecord } from '../types';

const POSITIVE_EMOTIONS = ['平静', '愉快', '充实', '感恩'];
const ANXIOUS_EMOTIONS = ['焦虑'];
const SAD_EMOTIONS = ['低落', '悲伤'];

function getEmotionColor(emotion: string): string {
  if (POSITIVE_EMOTIONS.includes(emotion)) return 'border-green-300 bg-green-50';
  if (ANXIOUS_EMOTIONS.includes(emotion)) return 'border-orange-300 bg-orange-50';
  if (SAD_EMOTIONS.includes(emotion)) return 'border-red-300 bg-red-50';
  return 'border-blue-300 bg-blue-50';
}

function getEmotionBadgeColor(emotion: string): string {
  if (POSITIVE_EMOTIONS.includes(emotion)) return 'bg-green-100 text-green-700';
  if (ANXIOUS_EMOTIONS.includes(emotion)) return 'bg-orange-100 text-orange-700';
  if (SAD_EMOTIONS.includes(emotion)) return 'bg-red-100 text-red-700';
  return 'bg-blue-100 text-blue-700';
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
  const weekDay = weekDays[date.getDay()];
  return `${year}年${month}月${day}日 星期${weekDay}`;
}

function toDateStr(date: Date): string {
  return date.toISOString().split('T')[0];
}

function getHour(timestamp: string): number {
  return new Date(timestamp).getHours();
}

const HOURS = Array.from({ length: 18 }, (_, i) => i + 6); // 6:00 - 23:00

export default function Timeline() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [records, setRecords] = useState<MoodRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const fetchRecords = async () => {
      setLoading(true);
      setError('');
      try {
        const data = await api.listRecords(toDateStr(selectedDate));
        setRecords(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : '加载失败');
        setRecords([]);
      } finally {
        setLoading(false);
      }
    };
    fetchRecords();
  }, [selectedDate]);

  const prevDay = () => {
    setSelectedDate(prev => {
      const d = new Date(prev);
      d.setDate(d.getDate() - 1);
      return d;
    });
  };

  const nextDay = () => {
    setSelectedDate(prev => {
      const d = new Date(prev);
      d.setDate(d.getDate() + 1);
      if (d > new Date()) return prev;
      return d;
    });
  };

  const isToday = toDateStr(selectedDate) === toDateStr(new Date());

  // Group records by hour
  const recordsByHour: Record<number, MoodRecord[]> = {};
  records.forEach(r => {
    const hour = getHour(r.timestamp);
    if (!recordsByHour[hour]) recordsByHour[hour] = [];
    recordsByHour[hour].push(r);
  });

  return (
    <div className="max-w-md mx-auto px-4 pt-6">
      {/* Date selector */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={prevDay}
          className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center text-gray-600 hover:bg-gray-50 transition-all duration-300"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M12 4l-6 6 6 6" />
          </svg>
        </button>

        <div className="text-center">
          <h2 className="text-lg font-bold text-gray-800">{formatDate(selectedDate)}</h2>
          {isToday && <span className="text-xs text-orange-500 font-medium">今天</span>}
        </div>

        <button
          onClick={nextDay}
          disabled={isToday}
          className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-300"
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

      {/* Error */}
      {error && (
        <div className="text-center py-12">
          <p className="text-red-500 text-sm">{error}</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && records.length === 0 && (
        <div className="text-center py-16">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-orange-50 flex items-center justify-center">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#F97316" strokeWidth="1.5" strokeLinecap="round">
              <path d="M12 8v4l3 3" />
              <circle cx="12" cy="12" r="10" />
            </svg>
          </div>
          <p className="text-gray-500">这一天还没有记录</p>
          <p className="text-gray-400 text-sm mt-1">回到主页开始记录心情吧</p>
        </div>
      )}

      {/* Timeline */}
      {!loading && !error && records.length > 0 && (
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-[52px] top-0 bottom-0 w-px bg-gray-200" />

          {HOURS.map(hour => {
            const hourRecords = recordsByHour[hour];
            if (!hourRecords) {
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
                  {hourRecords.map(record => (
                    <div
                      key={record.id}
                      onClick={() => setExpandedId(expandedId === record.id ? null : record.id)}
                      className={`p-3 rounded-2xl border-l-4 cursor-pointer transition-all duration-300 ${getEmotionColor(record.emotion_type)} hover:shadow-md`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-700">{record.activity}</span>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getEmotionBadgeColor(record.emotion_type)}`}>
                            {record.emotion_type}
                          </span>
                          <span className="text-xs text-gray-500 font-bold">{record.emotion_intensity}</span>
                        </div>
                      </div>

                      {/* Expanded content */}
                      {expandedId === record.id && (
                        <div className="mt-3 pt-3 border-t border-gray-200/50 space-y-2 transition-all duration-300">
                          <div>
                            <span className="text-xs text-gray-500">原始记录：</span>
                            <p className="text-sm text-gray-600 mt-0.5">{record.raw_text}</p>
                          </div>
                          <div>
                            <span className="text-xs text-gray-500">想法：</span>
                            <p className="text-sm text-gray-600 mt-0.5">{record.thought}</p>
                          </div>
                          {record.cognitive_distortion && (
                            <div>
                              <span className="text-xs text-gray-500">认知偏差：</span>
                              <p className="text-sm text-amber-600 mt-0.5">{record.cognitive_distortion}</p>
                            </div>
                          )}
                          <div className="p-2 bg-white/60 rounded-xl">
                            <span className="text-xs text-gray-500">小暖的话：</span>
                            <p className="text-sm text-gray-600 mt-0.5 italic">{record.ai_immediate_feedback}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
