import type { InsightReport } from '../types';

interface Props {
  report: InsightReport | null;
  loading: boolean;
  type: 'daily' | 'weekly';
}

const EMOTION_COLORS: Record<string, string> = {
  焦虑: 'bg-amber-100 text-amber-700 border-amber-200',
  低落: 'bg-red-100 text-red-700 border-red-200',
  悲伤: 'bg-red-100 text-red-700 border-red-200',
  愉快: 'bg-green-100 text-green-700 border-green-200',
  平静: 'bg-green-100 text-green-700 border-green-200',
  愤怒: 'bg-rose-100 text-rose-700 border-rose-200',
  充实: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  感恩: 'bg-teal-100 text-teal-700 border-teal-200',
};

function getEmotionColor(emotion: string) {
  return EMOTION_COLORS[emotion] || 'bg-blue-100 text-blue-700 border-blue-200';
}

export default function InsightCard({ report, loading, type }: Props) {
  if (loading) {
    return (
      <div className="mt-4 p-6 bg-white rounded-2xl shadow-md animate-pulse">
        <div className="h-4 bg-gray-200 rounded w-1/3 mb-4" />
        <div className="space-y-2">
          <div className="h-3 bg-gray-200 rounded w-full" />
          <div className="h-3 bg-gray-200 rounded w-5/6" />
          <div className="h-3 bg-gray-200 rounded w-4/6" />
        </div>
      </div>
    );
  }

  if (!report) return null;

  return (
    <div className="mt-4 p-6 bg-white rounded-2xl shadow-md transition-all duration-300">
      <h3 className="text-lg font-bold text-gray-800 mb-3">
        {type === 'daily' ? '今日总结' : '本周总结'}
      </h3>

      <p className="text-gray-600 text-sm leading-relaxed whitespace-pre-line">
        {report.content}
      </p>

      {/* Patterns (for weekly) */}
      {type === 'weekly' && report.patterns && report.patterns.length > 0 && (
        <div className="mt-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-2">情绪模式</h4>
          <div className="space-y-2">
            {report.patterns.map((pattern, i) => (
              <div
                key={i}
                className={`p-3 rounded-xl border ${getEmotionColor(pattern.emotion)}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-sm">{pattern.trigger}</span>
                  <span className="text-xs opacity-75">出现 {pattern.frequency} 次</span>
                </div>
                <p className="text-xs opacity-80">{pattern.insight}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CBT Suggestions (for weekly) */}
      {type === 'weekly' && report.cbt_suggestions && report.cbt_suggestions.length > 0 && (
        <div className="mt-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-2">CBT 建议</h4>
          <ol className="space-y-2">
            {report.cbt_suggestions.map((suggestion, i) => (
              <li key={i} className="flex gap-2 text-sm text-gray-600">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-xs font-bold">
                  {i + 1}
                </span>
                <span>{suggestion}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
