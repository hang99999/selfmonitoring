import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { api } from '../api';
import InsightCard from '../components/InsightCard';
import type { DayStats, WeekStats, MonthStats, InsightReport } from '../types';

// ── Assessment scale definitions ─────────────────────────────────────────────

type Severity = 'green' | 'yellow' | 'orange' | 'red';

interface Interpretation {
  level: string;
  severity: Severity;
  desc: string;
  advice: string[];
}

interface Scale {
  id: string;
  name: string;
  subtitle: string;
  emoji: string;
  themeTag: string;  // tailwind classes for the card accent
  timeframe: string;
  questions: string[];
  options: string[];
  maxScore: number;
  displayScore: (raw: number) => number;
  interpret: (raw: number) => Interpretation;
}

const SCALES: Record<string, Scale> = {
  PHQ9: {
    id: 'PHQ9', name: 'PHQ-9', subtitle: '抑郁筛查量表', emoji: '🌧️',
    themeTag: 'bg-blue-50 border-blue-200 text-blue-700',
    timeframe: '过去两周，您有多少时间受到以下症状的困扰？',
    questions: [
      '做事时提不起劲或没有兴趣',
      '感到心情低落、沮丧或绝望',
      '入睡困难、睡不安稳或睡眠过多',
      '感觉疲倦或没有活力',
      '食欲不振或吃太多',
      '觉得自己很糟糕，或觉得自己是个失败的人，或让自己和家人失望',
      '对事物专注有困难，例如阅读或看视频时',
      '动作或说话变得迟缓，或正好相反，比平常更加烦躁坐立不安',
      '有不如死掉或用某种方式伤害自己的念头',
    ],
    options: ['完全没有', '有几天', '超过一周', '几乎每天'],
    maxScore: 27,
    displayScore: s => s,
    interpret: (s) => {
      if (s <= 4) return { level: '无或极少', severity: 'green', desc: '目前没有明显的抑郁症状，继续保持健康的生活习惯。', advice: ['维持规律的作息和运动', '保持社交联系和有意义的活动', '定期关注自己的情绪状态'] };
      if (s <= 9) return { level: '轻微抑郁', severity: 'yellow', desc: '存在一些轻微抑郁症状，建议积极行动改善状态。', advice: ['增加令自己有愉悦感的活动（行为激活）', '规律运动，每天至少30分钟', '与信任的人多交流分享', '如持续两周以上建议咨询专业人士'] };
      if (s <= 14) return { level: '中度抑郁', severity: 'orange', desc: '存在中度抑郁症状，对日常生活可能已有一定影响。', advice: ['建议寻求心理咨询师的专业支持', '告知家人或亲密朋友你的状态', '避免重大决策，给自己一些空间', '可向医院心理科或精神科咨询'] };
      if (s <= 19) return { level: '中重度抑郁', severity: 'red', desc: '存在较明显的抑郁症状，日常生活受到明显影响。', advice: ['请尽快预约心理科或精神科医生', '不要独自承受，告诉身边信任的人', '危机时拨打心理援助热线：400-161-9995'] };
      return { level: '重度抑郁', severity: 'red', desc: '存在严重抑郁症状，需要立即寻求专业帮助。', advice: ['请立即联系精神科医生或前往医院', '危机援助热线：400-161-9995 / 400-821-1215', '请让身边的人陪伴你'] };
    },
  },
  GAD7: {
    id: 'GAD7', name: 'GAD-7', subtitle: '焦虑筛查量表', emoji: '🌀',
    themeTag: 'bg-purple-50 border-purple-200 text-purple-700',
    timeframe: '过去两周，您有多少时间受到以下症状的困扰？',
    questions: [
      '感觉紧张、焦虑或烦躁',
      '不能停止或无法控制担忧',
      '对各种各样的事情过度担忧',
      '很难放松下来',
      '由于不安而无法静坐',
      '变得容易烦恼或急躁',
      '感到似乎将有可怕的事情发生而害怕',
    ],
    options: ['完全没有', '有几天', '超过一周', '几乎每天'],
    maxScore: 21,
    displayScore: s => s,
    interpret: (s) => {
      if (s <= 4) return { level: '极少焦虑', severity: 'green', desc: '目前焦虑水平在正常范围内。', advice: ['继续维持当前的放松习惯', '练习正念或冥想有助于长期保持', '关注生活中令你有意义感的事'] };
      if (s <= 9) return { level: '轻微焦虑', severity: 'yellow', desc: '存在轻微焦虑症状，可以通过一些方式改善。', advice: ['尝试腹式呼吸或渐进式肌肉放松', '减少咖啡因和碎片化刷手机的习惯', '把担忧写下来，区分可控与不可控的事', '规律运动对缓解焦虑效果显著'] };
      if (s <= 14) return { level: '中度焦虑', severity: 'orange', desc: '存在中度焦虑症状，建议积极寻求支持。', advice: ['建议预约心理咨询', '认知行为疗法（CBT）对焦虑有良好效果', '与家人或朋友分享你的感受', '避免逃避行为，它会让焦虑加重'] };
      return { level: '重度焦虑', severity: 'red', desc: '存在明显焦虑症状，请尽快寻求专业帮助。', advice: ['建议尽快就医（精神科/心理科）', '告诉身边信任的人你的状态', '焦虑是可以治疗的，请不要独自承受'] };
    },
  },
  WHO5: {
    id: 'WHO5', name: 'WHO-5', subtitle: '幸福感指数', emoji: '🌱',
    themeTag: 'bg-green-50 border-green-200 text-green-700',
    timeframe: '过去两周，以下描述有多少时间符合您的感受？',
    questions: [
      '我感到开心且情绪良好',
      '我感到平静且放松',
      '我感到活力充沛且精神饱满',
      '睡醒后我感到清爽且充分休息',
      '我的日常生活充满乐趣',
    ],
    options: ['完全没有', '偶尔', '有时候', '超过半数时间', '大部分时间', '所有时间'],
    maxScore: 25,
    displayScore: s => s * 4, // convert to 0-100
    interpret: (s) => {
      const pct = s * 4;
      if (pct >= 68) return { level: '幸福感良好', severity: 'green', desc: `幸福感指数 ${pct}/100，整体心理状态积极良好，继续保持！`, advice: ['继续维持带来幸福感的活动和人际关系', '将好的习惯和经验分享给身边的人', '定期回顾让你感到满足的事物'] };
      if (pct >= 52) return { level: '幸福感尚可', severity: 'yellow', desc: `幸福感指数 ${pct}/100，整体还不错，但有一些值得改善的空间。`, advice: ['尝试增加日常中令你感到快乐的小事', '关注睡眠质量和规律作息', '与亲近的人保持联系和交流'] };
      if (pct >= 28) return { level: '幸福感偏低', severity: 'orange', desc: `幸福感指数 ${pct}/100，建议关注并改善当前的情绪状态。`, advice: ['进行行为激活，计划并执行有意义的活动', '考虑咨询专业心理咨询师', '尝试建立支持性的社交关系'] };
      return { level: '幸福感较差', severity: 'red', desc: `幸福感指数 ${pct}/100，建议寻求专业心理健康支持。`, advice: ['请预约心理咨询或精神科评估', '告知身边信任的人你的状态', '心理援助热线：400-161-9995'] };
    },
  },
};

const SEVERITY_STYLE: Record<Severity, { bg: string; text: string; border: string }> = {
  green:  { bg: 'bg-green-100',  text: 'text-green-700',  border: 'border-green-300'  },
  yellow: { bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-300' },
  orange: { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-300' },
  red:    { bg: 'bg-red-100',    text: 'text-red-700',    border: 'border-red-300'    },
};

// ── Assessment panel ──────────────────────────────────────────────────────────

type AStep =
  | { type: 'list' }
  | { type: 'taking'; id: string; answers: number[]; current: number }
  | { type: 'result'; id: string; score: number; answers: number[] };

function AssessmentPanel() {
  const [step, setStep] = useState<AStep>({ type: 'list' });

  const startScale = (id: string) =>
    setStep({ type: 'taking', id, answers: [], current: 0 });

  const handleAnswer = (value: number) => {
    if (step.type !== 'taking') return;
    const scale = SCALES[step.id];
    const newAnswers = [...step.answers, value];
    if (newAnswers.length === scale.questions.length) {
      const score = newAnswers.reduce((a, b) => a + b, 0);
      setStep({ type: 'result', id: step.id, score, answers: newAnswers });
    } else {
      setStep({ ...step, answers: newAnswers, current: step.current + 1 });
    }
  };

  // ── Scale list ──
  if (step.type === 'list') {
    return (
      <div>
        <p className="text-sm text-gray-500 mb-5 leading-relaxed">
          以下量表来自国际通用的心理健康筛查工具，每次约需 2-3 分钟。
          测评结果<strong>仅供参考</strong>，不能替代专业诊断。
        </p>
        <div className="space-y-3">
          {Object.values(SCALES).map(scale => (
            <button
              key={scale.id}
              onClick={() => startScale(scale.id)}
              className={`w-full text-left p-4 rounded-2xl border-2 transition-all hover:shadow-md active:scale-95 ${scale.themeTag}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{scale.emoji}</span>
                  <div>
                    <p className="font-bold text-gray-800">{scale.name}</p>
                    <p className="text-sm text-gray-500">{scale.subtitle}</p>
                  </div>
                </div>
                <span className="text-xs font-medium bg-white/70 px-2 py-1 rounded-lg text-gray-600 flex-shrink-0">
                  {scale.questions.length} 题
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-2">点击开始 →</p>
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-400 text-center mt-6">如有心理困扰，请拨打援助热线 400-161-9995</p>
      </div>
    );
  }

  // ── Taking a scale ──
  if (step.type === 'taking') {
    const scale = SCALES[step.id];
    const progress = (step.current / scale.questions.length) * 100;

    return (
      <div>
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => setStep({ type: 'list' })} className="text-gray-400 hover:text-gray-600 text-sm">
            ← 返回
          </button>
          <div className="flex-1">
            <div className="flex justify-between text-xs text-gray-400 mb-1">
              <span>{scale.name}</span>
              <span>第 {step.current + 1} / {scale.questions.length} 题</span>
            </div>
            <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-1.5 bg-orange-400 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </div>

        {/* Timeframe hint */}
        <p className="text-xs text-gray-400 mb-2">{scale.timeframe}</p>

        {/* Question */}
        <h3 className="text-lg font-bold text-gray-800 mb-6 leading-snug">
          {scale.questions[step.current]}
        </h3>

        {/* Options */}
        <div className="space-y-2">
          {scale.options.map((opt, i) => (
            <button
              key={i}
              onClick={() => handleAnswer(i)}
              className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border border-gray-200 bg-white hover:bg-orange-50 hover:border-orange-300 active:bg-orange-100 transition-all text-left"
            >
              <span className="w-6 h-6 rounded-full border-2 border-gray-300 flex-shrink-0 transition-all" />
              <span className="text-sm text-gray-700">{opt}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── Result ──
  if (step.type === 'result') {
    const scale = SCALES[step.id];
    const displayScore = scale.displayScore(step.score);
    const interpretation = scale.interpret(step.score);
    const style = SEVERITY_STYLE[interpretation.severity];
    const maxDisplay = scale.id === 'WHO5' ? 100 : scale.maxScore;
    const hasSelfHarmNote = scale.id === 'PHQ9' && step.answers[8] > 0;

    return (
      <div>
        <button onClick={() => setStep({ type: 'list' })} className="text-gray-400 hover:text-gray-600 text-sm mb-5 block">
          ← 返回列表
        </button>

        {/* Score display */}
        <div className="text-center mb-6">
          <div className={`inline-flex flex-col items-center justify-center w-28 h-28 rounded-full ${style.bg} border-2 ${style.border} mb-3`}>
            <span className={`text-4xl font-bold ${style.text}`}>{displayScore}</span>
            <span className={`text-xs ${style.text} opacity-75`}>/ {maxDisplay}</span>
          </div>
          <p className="text-xs text-gray-400 mb-2">{scale.name} {scale.subtitle}</p>
          <span className={`inline-block px-4 py-1.5 rounded-full font-semibold text-sm ${style.bg} ${style.text}`}>
            {interpretation.level}
          </span>
        </div>

        {/* Description */}
        <p className="text-sm text-gray-600 leading-relaxed mb-4 text-center">{interpretation.desc}</p>

        {/* Advice */}
        <div className="bg-gray-50 rounded-2xl p-4 mb-4">
          <p className="text-sm font-semibold text-gray-700 mb-2">建议</p>
          <ul className="space-y-1.5">
            {interpretation.advice.map((a, i) => (
              <li key={i} className="flex gap-2 text-sm text-gray-600">
                <span className="text-orange-400 flex-shrink-0 font-bold">•</span>
                <span>{a}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* PHQ-9 Q9 safety note */}
        {hasSelfHarmNote && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-4">
            <p className="text-sm font-bold text-red-700 mb-2">❤️ 重要：请寻求帮助</p>
            <p className="text-sm text-red-600 mb-2">你提到了有伤害自己的念头。这非常重要，请立即联系：</p>
            <p className="text-sm font-medium text-red-700">• 全国心理援助热线：400-161-9995</p>
            <p className="text-sm font-medium text-red-700">• 北京危机热线：010-82951332</p>
            <p className="text-sm font-medium text-red-700">• 24小时危机热线：400-821-1215</p>
          </div>
        )}

        {/* Disclaimer */}
        <p className="text-xs text-gray-400 text-center mb-5">
          本测评仅供参考，不能替代专业诊断。如有困扰请咨询专业人士。
        </p>

        {/* Actions */}
        <div className="flex gap-3">
          <button onClick={() => startScale(step.id)} className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-2xl font-medium text-sm hover:bg-gray-200 transition-all">
            重新测评
          </button>
          <button onClick={() => setStep({ type: 'list' })} className="flex-1 py-3 bg-orange-500 text-white rounded-2xl font-medium text-sm hover:bg-orange-600 transition-all">
            其他测评
          </button>
        </div>
      </div>
    );
  }

  return null;
}

// ── Main History (反思) component ─────────────────────────────────────────────

type MainTab = 'stats' | 'summary' | 'assessment';
type StatsTab = 'today' | 'week' | 'month';

export default function History() {
  const [mainTab, setMainTab] = useState<MainTab>('stats');
  const [statsTab, setStatsTab] = useState<StatsTab>('today');

  // Stats state
  const [dayStats, setDayStats] = useState<DayStats | null>(null);
  const [weekStats, setWeekStats] = useState<WeekStats | null>(null);
  const [monthStats, setMonthStats] = useState<MonthStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState('');
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  // Summary state
  const [dailyInsight, setDailyInsight] = useState<InsightReport | null>(null);
  const [weeklyInsight, setWeeklyInsight] = useState<InsightReport | null>(null);
  const [dailyLoading, setDailyLoading] = useState(false);
  const [weeklyLoading, setWeeklyLoading] = useState(false);
  const [insightError, setInsightError] = useState('');

  // Fetch stats when stats tab changes
  useEffect(() => {
    if (mainTab !== 'stats') return;
    let cancelled = false;
    const fetch = async () => {
      setStatsLoading(true);
      setStatsError('');
      setExpandedIndex(null);
      try {
        if (statsTab === 'today') { const d = await api.getStatsToday(); if (!cancelled) setDayStats(d); }
        else if (statsTab === 'week') { const d = await api.getStatsWeek(); if (!cancelled) setWeekStats(d); }
        else { const d = await api.getStatsMonth(); if (!cancelled) setMonthStats(d); }
      } catch { if (!cancelled) setStatsError('加载失败'); }
      finally { if (!cancelled) setStatsLoading(false); }
    };
    fetch();
    return () => { cancelled = true; };
  }, [statsTab, mainTab]);

  const handleDailyInsight = async () => {
    setDailyLoading(true); setInsightError('');
    try { setDailyInsight(await api.getDailyInsight()); }
    catch (err) { setInsightError(err instanceof Error ? err.message : '获取失败'); }
    finally { setDailyLoading(false); }
  };

  const handleWeeklyInsight = async () => {
    setWeeklyLoading(true); setInsightError('');
    try { setWeeklyInsight(await api.getWeeklyInsight()); }
    catch (err) { setInsightError(err instanceof Error ? err.message : '获取失败'); }
    finally { setWeeklyLoading(false); }
  };

  // Chart data
  const chartData = (() => {
    if (statsTab === 'today' && dayStats) {
      return dayStats.records.map(r => ({
        time: new Date(r.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
        愉悦度: r.pleasure_score ?? null,
        重要性: r.importance_score ?? null,
      }));
    }
    if (statsTab === 'week' && weekStats) {
      return weekStats.daily_data.filter(d => d.count > 0).map(d => ({
        time: d.date.slice(5),
        愉悦度: d.avg_pleasure ?? null,
        重要性: d.avg_importance ?? null,
      }));
    }
    if (statsTab === 'month' && monthStats) {
      return monthStats.daily_data.filter(d => d.count > 0).map(d => ({
        time: d.date.slice(5),
        愉悦度: d.avg_pleasure ?? null,
        重要性: d.avg_importance ?? null,
      }));
    }
    return [];
  })();

  const stats = (() => {
    if (statsTab === 'today' && dayStats) return { count: dayStats.count, avgPleasure: (dayStats.avg_pleasure ?? 0).toFixed(1), avgImportance: (dayStats.avg_importance ?? 0).toFixed(1) };
    if (statsTab === 'week' && weekStats) return { count: weekStats.total_count, avgPleasure: (weekStats.avg_pleasure ?? 0).toFixed(1), avgImportance: (weekStats.avg_importance ?? 0).toFixed(1) };
    if (statsTab === 'month' && monthStats) return { count: monthStats.total_count, avgPleasure: (monthStats.avg_pleasure ?? 0).toFixed(1), avgImportance: (monthStats.avg_importance ?? 0).toFixed(1) };
    return { count: 0, avgPleasure: '0', avgImportance: '0' };
  })();

  const hasData = !statsError && chartData.length > 0;

  const mainTabs: { key: MainTab; label: string }[] = [
    { key: 'stats', label: '📊 数据' },
    { key: 'summary', label: '💡 总结' },
    { key: 'assessment', label: '📋 测评' },
  ];

  const statsTabs: { key: StatsTab; label: string }[] = [
    { key: 'today', label: '今日' },
    { key: 'week', label: '本周' },
    { key: 'month', label: '本月' },
  ];

  return (
    <div className="max-w-md mx-auto px-4 pt-6 pb-24">
      {/* Page title */}
      <h1 className="text-2xl font-bold text-gray-800 mb-4">反思</h1>

      {/* Main tab selector */}
      <div className="flex bg-gray-100 rounded-2xl p-1 mb-6">
        {mainTabs.map(t => (
          <button key={t.key} onClick={() => setMainTab(t.key)}
            className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${mainTab === t.key ? 'bg-white text-orange-500 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── 数据 tab ── */}
      {mainTab === 'stats' && (
        <>
          {/* Stats sub-tabs */}
          <div className="flex gap-1 mb-5">
            {statsTabs.map(t => (
              <button key={t.key} onClick={() => setStatsTab(t.key)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${statsTab === t.key ? 'bg-orange-500 text-white' : 'text-gray-500 hover:text-gray-700'}`}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Loading */}
          {statsLoading && (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-4 border-orange-200 border-t-orange-500 rounded-full animate-spin" />
            </div>
          )}

          {/* No data */}
          {!statsLoading && !hasData && (
            <div className="text-center py-16">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-orange-50 flex items-center justify-center">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#F97316" strokeWidth="1.5" strokeLinecap="round">
                  <rect x="3" y="12" width="4" height="9" rx="0.5" /><rect x="10" y="7" width="4" height="14" rx="0.5" /><rect x="17" y="3" width="4" height="18" rx="0.5" />
                </svg>
              </div>
              <p className="text-gray-500">{statsTab === 'today' ? '今天还没有记录' : statsTab === 'week' ? '本周还没有记录' : '本月还没有记录'}</p>
              <p className="text-gray-400 text-sm mt-1">回到主页开始记录吧</p>
            </div>
          )}

          {/* Chart */}
          {!statsLoading && hasData && (
            <>
              <div className="bg-white rounded-2xl shadow-md p-4 mb-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">愉悦度 & 重要性趋势</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={chartData}>
                    <XAxis dataKey="time" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={{ stroke: '#E5E7EB' }} tickLine={false} />
                    <YAxis domain={[0, 10]} tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={{ stroke: '#E5E7EB' }} tickLine={false} width={24} />
                    <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', fontSize: '12px' }} />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                    <Line type="monotone" dataKey="愉悦度" stroke="#F97316" strokeWidth={2.5} dot={{ r: 4, fill: '#F97316', stroke: 'white', strokeWidth: 2 }} activeDot={{ r: 6 }} connectNulls={false} />
                    <Line type="monotone" dataKey="重要性" stroke="#3B82F6" strokeWidth={2.5} dot={{ r: 4, fill: '#3B82F6', stroke: 'white', strokeWidth: 2 }} activeDot={{ r: 6 }} connectNulls={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Stats cards */}
              <div className="grid grid-cols-3 gap-3 mb-5">
                <div className="bg-white rounded-2xl shadow-sm p-3 text-center">
                  <p className="text-2xl font-bold text-orange-500">{stats.count}</p>
                  <p className="text-xs text-gray-500 mt-1">记录次数</p>
                </div>
                <div className="bg-white rounded-2xl shadow-sm p-3 text-center">
                  <p className="text-2xl font-bold text-orange-500">{stats.avgPleasure}</p>
                  <p className="text-xs text-gray-500 mt-1">平均愉悦度</p>
                </div>
                <div className="bg-white rounded-2xl shadow-sm p-3 text-center">
                  <p className="text-2xl font-bold text-blue-500">{stats.avgImportance}</p>
                  <p className="text-xs text-gray-500 mt-1">平均重要性</p>
                </div>
              </div>

              {/* Today records list */}
              {statsTab === 'today' && dayStats && dayStats.records.length > 0 && (
                <div className="bg-white rounded-2xl shadow-md p-4 mb-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">今日记录</h3>
                  <div className="space-y-2">
                    {dayStats.records.map((r, i) => (
                      <div key={i} onClick={() => setExpandedIndex(expandedIndex === i ? null : i)}
                        className="p-3 rounded-xl bg-gray-50 cursor-pointer hover:bg-gray-100 transition-all">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-600">{new Date(r.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>
                          <div className="flex gap-2">
                            <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium">愉悦 {(r.pleasure_score ?? 0).toFixed(0)}</span>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">重要 {(r.importance_score ?? 0).toFixed(0)}</span>
                          </div>
                        </div>
                        {r.activity && <p className="text-xs text-gray-500 mt-1 truncate">{r.activity}</p>}
                        {expandedIndex === i && (
                          <div className="mt-2 pt-2 border-t border-gray-200 text-sm text-gray-500 space-y-1">
                            <p>活动：{r.activity || '-'}</p>
                            <p>愉悦度：{(r.pleasure_score ?? 0).toFixed(1)} / 10</p>
                            <p>重要性：{(r.importance_score ?? 0).toFixed(1)} / 10</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Week/month list */}
              {(statsTab === 'week' || statsTab === 'month') && (() => {
                const data = statsTab === 'week' ? weekStats?.daily_data : monthStats?.daily_data;
                return data?.filter(d => d.count > 0).map((day, i) => (
                  <div key={i} onClick={() => setExpandedIndex(expandedIndex === i ? null : i)}
                    className="mb-2 p-3 rounded-xl bg-white shadow-sm cursor-pointer hover:bg-gray-50 transition-all">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">{day.date}</span>
                      <div className="flex gap-2">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium">愉悦 {day.avg_pleasure?.toFixed(1) ?? '-'}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">重要 {day.avg_importance?.toFixed(1) ?? '-'}</span>
                        <span className="text-xs text-gray-500">{day.count}条</span>
                      </div>
                    </div>
                  </div>
                ));
              })()}
            </>
          )}
        </>
      )}

      {/* ── 总结 tab ── */}
      {mainTab === 'summary' && (
        <div>
          <p className="text-sm text-gray-500 mb-5">让 AI 帮你回顾今天或本周的行为与情绪模式。</p>
          <div className="flex gap-3 mb-4">
            <button onClick={handleDailyInsight} disabled={dailyLoading}
              className="flex-1 py-3 rounded-xl bg-orange-50 text-orange-600 font-medium text-sm hover:bg-orange-100 disabled:opacity-50 transition-all">
              {dailyLoading ? '生成中...' : '今日总结'}
            </button>
            <button onClick={handleWeeklyInsight} disabled={weeklyLoading}
              className="flex-1 py-3 rounded-xl bg-orange-50 text-orange-600 font-medium text-sm hover:bg-orange-100 disabled:opacity-50 transition-all">
              {weeklyLoading ? '生成中...' : '本周总结'}
            </button>
          </div>
          {insightError && <p className="text-sm text-red-500 text-center mb-3">{insightError}</p>}
          {!dailyInsight && !weeklyInsight && !dailyLoading && !weeklyLoading && (
            <div className="text-center py-12 text-gray-400">
              <p className="text-4xl mb-3">💡</p>
              <p className="text-sm">点击上方按钮生成 AI 总结</p>
              <p className="text-xs mt-1">需要有记录数据才能生成</p>
            </div>
          )}
          <InsightCard report={dailyInsight} loading={dailyLoading} type="daily" />
          <InsightCard report={weeklyInsight} loading={weeklyLoading} type="weekly" />
        </div>
      )}

      {/* ── 测评 tab ── */}
      {mainTab === 'assessment' && (
        <AssessmentPanel />
      )}
    </div>
  );
}
