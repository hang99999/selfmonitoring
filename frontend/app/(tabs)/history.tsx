import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Polyline, Circle, Line, Text as SvgText, Polygon, G, Rect } from 'react-native-svg';
import { api } from '../../src/api';
import { useUserId } from '../../src/userStore';
import type { DayStats, WeekStats, MonthStats, DomainRadarItem, MoodRecord } from '../../src/types';

// ── Assessment scales ─────────────────────────────────────────────────────────

type Severity = 'green' | 'yellow' | 'orange' | 'red';
interface Interpretation { level: string; severity: Severity; desc: string; advice: string[]; }
interface Scale {
  id: string; name: string; subtitle: string; emoji: string;
  timeframe: string; questions: string[]; options: string[];
  maxScore: number;
  displayScore: (raw: number) => number;
  interpret: (raw: number) => Interpretation;
}

const SCALES: Scale[] = [
  {
    id: 'PHQ9', name: 'PHQ-9', subtitle: '抑郁筛查量表', emoji: '🌧️',
    timeframe: '过去两周，您有多少时间受到以下症状的困扰？',
    questions: [
      '做事时提不起劲或没有兴趣', '感到心情低落、沮丧或绝望',
      '入睡困难、睡不安稳或睡眠过多', '感觉疲倦或没有活力',
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
      if (s <= 9) return { level: '轻微抑郁', severity: 'yellow', desc: '存在一些轻微抑郁症状，建议积极行动改善状态。', advice: ['增加令自己有愉悦感的活动（行为激活）', '规律运动，每天至少30分钟', '与信任的人多交流分享'] };
      if (s <= 14) return { level: '中度抑郁', severity: 'orange', desc: '存在中度抑郁症状，对日常生活可能已有一定影响。', advice: ['建议寻求心理咨询师的专业支持', '告知家人或亲密朋友你的状态', '可向医院心理科或精神科咨询'] };
      if (s <= 19) return { level: '中重度抑郁', severity: 'red', desc: '存在较明显的抑郁症状，日常生活受到明显影响。', advice: ['请尽快预约心理科或精神科医生', '不要独自承受，告诉身边信任的人', '危机时拨打心理援助热线：400-161-9995'] };
      return { level: '重度抑郁', severity: 'red', desc: '存在严重抑郁症状，需要立即寻求专业帮助。', advice: ['请立即联系精神科医生或前往医院', '危机援助热线：400-161-9995 / 400-821-1215', '请让身边的人陪伴你'] };
    },
  },
  {
    id: 'GAD7', name: 'GAD-7', subtitle: '焦虑筛查量表', emoji: '🌀',
    timeframe: '过去两周，您有多少时间受到以下症状的困扰？',
    questions: [
      '感觉紧张、焦虑或烦躁', '不能停止或无法控制担忧', '对各种各样的事情过度担忧',
      '很难放松下来', '由于不安而无法静坐', '变得容易烦恼或急躁',
      '感到似乎将有可怕的事情发生而害怕',
    ],
    options: ['完全没有', '有几天', '超过一周', '几乎每天'],
    maxScore: 21,
    displayScore: s => s,
    interpret: (s) => {
      if (s <= 4) return { level: '极少焦虑', severity: 'green', desc: '目前焦虑水平在正常范围内。', advice: ['继续维持当前的放松习惯', '练习正念或冥想有助于长期保持', '关注生活中令你有意义感的事'] };
      if (s <= 9) return { level: '轻微焦虑', severity: 'yellow', desc: '存在轻微焦虑症状，可以通过一些方式改善。', advice: ['尝试腹式呼吸或渐进式肌肉放松', '减少咖啡因和碎片化刷手机的习惯', '把担忧写下来，区分可控与不可控的事'] };
      if (s <= 14) return { level: '中度焦虑', severity: 'orange', desc: '存在中度焦虑症状，建议积极寻求支持。', advice: ['建议预约心理咨询', '认知行为疗法（CBT）对焦虑有良好效果', '与家人或朋友分享你的感受'] };
      return { level: '重度焦虑', severity: 'red', desc: '存在明显焦虑症状，请尽快寻求专业帮助。', advice: ['建议尽快就医（精神科/心理科）', '告诉身边信任的人你的状态', '焦虑是可以治疗的，请不要独自承受'] };
    },
  },
  {
    id: 'WHO5', name: 'WHO-5', subtitle: '幸福感指数', emoji: '🌱',
    timeframe: '过去两周，以下描述有多少时间符合您的感受？',
    questions: [
      '我感到开心且情绪良好', '我感到平静且放松', '我感到活力充沛且精神饱满',
      '睡醒后我感到清爽且充分休息', '我的日常生活充满乐趣',
    ],
    options: ['完全没有', '偶尔', '有时候', '超过半数时间', '大部分时间', '所有时间'],
    maxScore: 25,
    displayScore: s => s * 4,
    interpret: (s) => {
      const pct = s * 4;
      if (pct >= 68) return { level: '幸福感良好', severity: 'green', desc: `幸福感指数 ${pct}/100，整体心理状态积极良好，继续保持！`, advice: ['继续维持带来幸福感的活动和人际关系', '将好的习惯和经验分享给身边的人'] };
      if (pct >= 52) return { level: '幸福感尚可', severity: 'yellow', desc: `幸福感指数 ${pct}/100，整体还不错，但有一些值得改善的空间。`, advice: ['尝试增加日常中令你感到快乐的小事', '关注睡眠质量和规律作息'] };
      if (pct >= 28) return { level: '幸福感偏低', severity: 'orange', desc: `幸福感指数 ${pct}/100，建议关注并改善当前的情绪状态。`, advice: ['进行行为激活，计划并执行有意义的活动', '考虑咨询专业心理咨询师'] };
      return { level: '幸福感较差', severity: 'red', desc: `幸福感指数 ${pct}/100，建议寻求专业心理健康支持。`, advice: ['请预约心理咨询或精神科评估', '心理援助热线：400-161-9995'] };
    },
  },
];

const SEVERITY_COLOR: Record<Severity, { bg: string; text: string; border: string }> = {
  green:  { bg: '#f0fdf4', text: '#15803d', border: '#86efac' },
  yellow: { bg: '#fefce8', text: '#a16207', border: '#fde047' },
  orange: { bg: '#fff7ed', text: '#c2410c', border: '#fdba74' },
  red:    { bg: '#fef2f2', text: '#b91c1c', border: '#fca5a5' },
};

// ── Assessment panel ──────────────────────────────────────────────────────────

type AStep =
  | { type: 'list' }
  | { type: 'taking'; scale: Scale; answers: number[]; current: number }
  | { type: 'result'; scale: Scale; score: number; answers: number[] };

function AssessmentPanel() {
  const [step, setStep] = useState<AStep>({ type: 'list' });

  const start = (scale: Scale) => setStep({ type: 'taking', scale, answers: [], current: 0 });

  const handleAnswer = (value: number) => {
    if (step.type !== 'taking') return;
    const newAnswers = [...step.answers, value];
    if (newAnswers.length === step.scale.questions.length) {
      const score = newAnswers.reduce((a, b) => a + b, 0);
      setStep({ type: 'result', scale: step.scale, score, answers: newAnswers });
    } else {
      setStep({ ...step, answers: newAnswers, current: step.current + 1 });
    }
  };

  if (step.type === 'list') {
    return (
      <View>
        <Text className="text-sm text-gray-500 mb-4 leading-relaxed">
          以下量表来自国际通用的心理健康筛查工具，每次约需 2-3 分钟。
          测评结果<Text className="font-semibold">仅供参考</Text>，不能替代专业诊断。
        </Text>
        {SCALES.map(scale => (
          <TouchableOpacity
            key={scale.id}
            onPress={() => start(scale)}
            className="w-full rounded-2xl p-4 mb-3 flex-row items-center"
            style={cardStyle}
          >
            <Text className="text-3xl mr-3">{scale.emoji}</Text>
            <View className="flex-1">
              <Text className="font-bold text-gray-800">{scale.name}</Text>
              <Text className="text-sm text-gray-500">{scale.subtitle}</Text>
            </View>
            <View className="bg-gray-100 px-2 py-1 rounded-lg">
              <Text className="text-xs text-gray-500">{scale.questions.length} 题</Text>
            </View>
          </TouchableOpacity>
        ))}
        <Text className="text-xs text-gray-400 text-center mt-2">
          如有心理困扰，请拨打援助热线 400-161-9995
        </Text>
      </View>
    );
  }

  if (step.type === 'taking') {
    const { scale, current } = step;
    const progress = Math.round((current / scale.questions.length) * 100);
    return (
      <View>
        <View className="flex-row items-center mb-5">
          <TouchableOpacity onPress={() => setStep({ type: 'list' })} className="mr-3">
            <Text className="text-gray-400 text-sm">← 返回</Text>
          </TouchableOpacity>
          <View className="flex-1">
            <View className="flex-row justify-between mb-1">
              <Text className="text-xs text-gray-400">{scale.name}</Text>
              <Text className="text-xs text-gray-400">第 {current + 1} / {scale.questions.length} 题</Text>
            </View>
            <View className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <View className="h-1.5 bg-orange-400 rounded-full" style={{ width: `${progress}%` }} />
            </View>
          </View>
        </View>

        <Text className="text-xs text-gray-400 mb-2">{scale.timeframe}</Text>
        <Text className="text-base font-bold text-gray-800 mb-5 leading-snug">
          {scale.questions[current]}
        </Text>

        {scale.options.map((opt, i) => (
          <TouchableOpacity
            key={i}
            onPress={() => handleAnswer(i)}
            className="w-full flex-row items-center px-4 py-3.5 rounded-xl border border-gray-200 bg-white mb-2"
          >
            <View className="w-5 h-5 rounded-full border-2 border-gray-300 mr-3" />
            <Text className="text-sm text-gray-700">{opt}</Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  }

  if (step.type === 'result') {
    const { scale, score, answers } = step;
    const displayScore = scale.displayScore(score);
    const interp = scale.interpret(score);
    const style = SEVERITY_COLOR[interp.severity];
    const maxDisplay = scale.id === 'WHO5' ? 100 : scale.maxScore;
    const hasSelfHarmNote = scale.id === 'PHQ9' && answers[8] > 0;

    return (
      <View>
        <TouchableOpacity onPress={() => setStep({ type: 'list' })} className="mb-5">
          <Text className="text-gray-400 text-sm">← 返回列表</Text>
        </TouchableOpacity>

        <View className="items-center mb-5">
          <View
            style={{ backgroundColor: style.bg, borderColor: style.border }}
            className="w-28 h-28 rounded-full border-2 items-center justify-center mb-3"
          >
            <Text style={{ color: style.text }} className="text-4xl font-bold">{displayScore}</Text>
            <Text style={{ color: style.text }} className="text-xs opacity-75">/ {maxDisplay}</Text>
          </View>
          <Text className="text-xs text-gray-400 mb-2">{scale.name} {scale.subtitle}</Text>
          <View style={{ backgroundColor: style.bg }} className="px-4 py-1.5 rounded-full">
            <Text style={{ color: style.text }} className="font-semibold text-sm">{interp.level}</Text>
          </View>
        </View>

        <Text className="text-sm text-gray-600 leading-relaxed mb-4 text-center">{interp.desc}</Text>

        <View className="bg-gray-50 rounded-2xl p-4 mb-4">
          <Text className="text-sm font-semibold text-gray-700 mb-2">建议</Text>
          {interp.advice.map((a, i) => (
            <View key={i} className="flex-row mb-1.5">
              <Text className="text-orange-400 font-bold mr-2">•</Text>
              <Text className="text-sm text-gray-600 flex-1 leading-relaxed">{a}</Text>
            </View>
          ))}
        </View>

        {hasSelfHarmNote && (
          <View className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-4">
            <Text className="text-sm font-bold text-red-700 mb-1">❤️ 重要：请寻求帮助</Text>
            <Text className="text-sm text-red-600 mb-2">你提到了有伤害自己的念头，请立即联系：</Text>
            <Text className="text-sm font-medium text-red-700">• 全国心理援助热线：400-161-9995</Text>
            <Text className="text-sm font-medium text-red-700">• 北京危机热线：010-82951332</Text>
            <Text className="text-sm font-medium text-red-700">• 24小时生命热线：400-821-1215</Text>
          </View>
        )}

        <Text className="text-xs text-gray-400 text-center mb-5">
          本测评仅供参考，不能替代专业诊断。如有困扰请咨询专业人士。
        </Text>

        <View className="flex-row gap-3">
          <TouchableOpacity onPress={() => start(scale)} className="flex-1 py-3 bg-gray-100 rounded-2xl items-center">
            <Text className="text-gray-700 font-medium text-sm">重新测评</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setStep({ type: 'list' })} className="flex-1 py-3 bg-orange-500 rounded-2xl items-center">
            <Text className="text-white font-medium text-sm">其他测评</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return null;
}

// ── Bar component ─────────────────────────────────────────────────────────────

function Bar({ value, max = 10, color = '#fb923c' }: { value: number | null | undefined; max?: number; color?: string }) {
  const pct = value ? Math.round((value / max) * 100) : 0;
  return (
    <View className="h-2 bg-gray-100 rounded-full flex-1">
      {pct > 0 && <View className="h-2 rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />}
    </View>
  );
}

const cardStyle = { backgroundColor: '#ffffff', elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 2, shadowOffset: { width: 0, height: 1 } };

function formatLocalDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getCurrentWeekRange() {
  const now = new Date();
  const start = new Date(now);
  const daysSinceMonday = (now.getDay() + 6) % 7;
  start.setDate(now.getDate() - daysSinceMonday);
  start.setHours(0, 0, 0, 0);
  return {
    start,
    end: now,
    startDate: formatLocalDate(start),
    endDate: formatLocalDate(now),
  };
}

// ── Line Chart ────────────────────────────────────────────────────────────────

interface ChartPoint { label: string; pleasure?: number | null; importance?: number | null; mood?: number | null; }

function LineChart({ data, showEvery = 1 }: { data: ChartPoint[]; showEvery?: number }) {
  const { width } = useWindowDimensions();
  const chartW = width - 64;
  const chartH = 170;
  const PL = 26, PR = 8, PT = 10, PB = 24;
  const innerW = chartW - PL - PR;
  const innerH = chartH - PB - PT;
  const n = data.length;
  if (n === 0) return null;

  const xOf = (i: number) => PL + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const yOf = (v: number) => PT + innerH - (v / 10) * innerH;

  const buildPath = (key: 'pleasure' | 'importance') =>
    data.reduce<string[]>((acc, p, i) => {
      const v = p[key];
      if (v != null) acc.push(`${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`);
      return acc;
    }, []).join(' ');

  const pleasurePath = buildPath('pleasure');
  const importancePath = buildPath('importance');
  const gridLines = [2, 4, 6, 8, 10];

  return (
    <View>
      <Svg width={chartW} height={chartH}>
        {gridLines.map(v => (
          <Line key={v} x1={PL} y1={yOf(v)} x2={chartW - PR} y2={yOf(v)}
            stroke="#f3f4f6" strokeWidth={1} />
        ))}
        {gridLines.map(v => (
          <SvgText key={v} x={PL - 4} y={yOf(v) + 4}
            fontSize={8} fill="#d1d5db" textAnchor="end">{v}</SvgText>
        ))}
        {data.map((p, i) => {
          if (i % showEvery !== 0 && i !== n - 1) return null;
          return (
            <SvgText key={i} x={xOf(i)} y={chartH - 4}
              fontSize={8} fill="#9ca3af" textAnchor="middle">{p.label}</SvgText>
          );
        })}
        {pleasurePath.length > 0 && (
          <Polyline points={pleasurePath} fill="none" stroke="#fb923c" strokeWidth={2} strokeLinejoin="round" />
        )}
        {importancePath.length > 0 && (
          <Polyline points={importancePath} fill="none" stroke="#818cf8" strokeWidth={2} strokeLinejoin="round" />
        )}
        {data.map((p, i) => (
          <G key={i}>
            {p.pleasure != null && <Circle cx={xOf(i)} cy={yOf(p.pleasure)} r={3} fill="#fb923c" />}
            {p.importance != null && <Circle cx={xOf(i)} cy={yOf(p.importance)} r={3} fill="#818cf8" />}
          </G>
        ))}
      </Svg>
      <View className="flex-row gap-4 justify-center mt-1 mb-1">
        <View className="flex-row items-center gap-1.5">
          <View style={{ width: 12, height: 2, backgroundColor: '#fb923c', borderRadius: 1 }} />
          <Text className="text-xs text-gray-400">愉悦感</Text>
        </View>
        <View className="flex-row items-center gap-1.5">
          <View style={{ width: 12, height: 2, backgroundColor: '#818cf8', borderRadius: 1 }} />
          <Text className="text-xs text-gray-400">重要性</Text>
        </View>
      </View>
    </View>
  );
}

function MoodLineChart({ data, showEvery = 1 }: { data: ChartPoint[]; showEvery?: number }) {
  const { width } = useWindowDimensions();
  const chartW = width - 64;
  const chartH = 170;
  const PL = 26, PR = 8, PT = 10, PB = 24;
  const innerW = chartW - PL - PR;
  const innerH = chartH - PB - PT;
  const n = data.length;
  if (n === 0) return null;

  const xOf = (i: number) => PL + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const yOf = (v: number) => PT + innerH - (v / 10) * innerH;
  const points = data.reduce<string[]>((acc, p, i) => {
    if (p.mood != null) acc.push(`${xOf(i).toFixed(1)},${yOf(p.mood).toFixed(1)}`);
    return acc;
  }, []).join(' ');
  const gridLines = [2, 4, 6, 8, 10];

  return (
    <View>
      <Svg width={chartW} height={chartH}>
        {gridLines.map(v => (
          <Line key={v} x1={PL} y1={yOf(v)} x2={chartW - PR} y2={yOf(v)}
            stroke="#f3f4f6" strokeWidth={1} />
        ))}
        {gridLines.map(v => (
          <SvgText key={v} x={PL - 4} y={yOf(v) + 4}
            fontSize={8} fill="#d1d5db" textAnchor="end">{v}</SvgText>
        ))}
        {data.map((p, i) => {
          if (i % showEvery !== 0 && i !== n - 1) return null;
          return (
            <SvgText key={i} x={xOf(i)} y={chartH - 4}
              fontSize={8} fill="#9ca3af" textAnchor="middle">{p.label}</SvgText>
          );
        })}
        {points.length > 0 && (
          <Polyline points={points} fill="none" stroke="#f97316" strokeWidth={2.5} strokeLinejoin="round" />
        )}
        {data.map((p, i) => (
          p.mood != null ? <Circle key={i} cx={xOf(i)} cy={yOf(p.mood)} r={3.5} fill="#f97316" /> : null
        ))}
      </Svg>
      <Text className="text-xs text-gray-400 text-center mt-1">每日总体情绪评分</Text>
    </View>
  );
}

function DailyMoodCard({
  value, saving, onSelect,
}: { value: number | null; saving: boolean; onSelect: (score: number) => void }) {
  return (
    <View className="bg-white rounded-2xl p-4 mb-4">
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-sm font-semibold text-gray-700">今日总体情绪</Text>
        <Text className="text-sm font-bold text-orange-500">{value != null ? `${value}/10` : '未评分'}</Text>
      </View>
      <Text className="text-xs text-gray-400 mb-3">0 表示最消极，10 表示最积极</Text>
      <View className="flex-row flex-wrap gap-2">
        {Array.from({ length: 11 }, (_, score) => (
          <TouchableOpacity
            key={score}
            onPress={() => onSelect(score)}
            disabled={saving}
            className={`w-9 h-9 rounded-full items-center justify-center border ${
              value === score ? 'bg-orange-500 border-orange-500' : 'bg-white border-gray-200'
            }`}
          >
            <Text className={`text-xs font-semibold ${value === score ? 'text-white' : 'text-gray-500'}`}>{score}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {saving && <Text className="text-xs text-gray-400 mt-2">保存中...</Text>}
    </View>
  );
}

// ── Pleasure × Importance Scatter ────────────────────────────────────────────

interface ScatterRecord {
  activity?: string;
  timestamp: string;
  pleasure_score?: number | null;
  importance_score?: number | null;
}

function PleasureImportanceScatter({ records }: { records: ScatterRecord[] }) {
  const { width } = useWindowDimensions();
  const chartW = width - 64;
  const chartH = 260;
  const PL = 34, PR = 18, PT = 24, PB = 34;
  const innerW = chartW - PL - PR;
  const innerH = chartH - PT - PB;
  const scored = records
    .filter(r => r.pleasure_score != null && r.importance_score != null)
    .map((record, index) => ({ record, index: index + 1 }));
  const gridLines = [0, 5, 10];

  const clamp = (v: number) => Math.max(0, Math.min(10, v));
  const xOf = (v: number) => PL + (clamp(v) / 10) * innerW;
  const yOf = (v: number) => PT + innerH - (clamp(v) / 10) * innerH;

  const quadrants = [
    { key: 'highBoth', label: '高愉悦高重要', color: '#16a34a' },
    { key: 'pleasantLowImportance', label: '高愉悦低重要', color: '#f97316' },
    { key: 'lowPleasureImportant', label: '低愉悦高重要', color: '#6366f1' },
    { key: 'lowBoth', label: '低愉悦低重要', color: '#9ca3af' },
  ] as const;

  const grouped = quadrants.reduce<Record<typeof quadrants[number]['key'], typeof scored>>((acc, q) => {
    acc[q.key] = [];
    return acc;
  }, {} as Record<typeof quadrants[number]['key'], typeof scored>);

  scored.forEach(item => {
    const pleasure = item.record.pleasure_score ?? 0;
    const importance = item.record.importance_score ?? 0;
    if (pleasure >= 5 && importance >= 5) grouped.highBoth.push(item);
    else if (pleasure >= 5 && importance < 5) grouped.pleasantLowImportance.push(item);
    else if (pleasure < 5 && importance >= 5) grouped.lowPleasureImportant.push(item);
    else grouped.lowBoth.push(item);
  });

  if (scored.length === 0) {
    return (
      <View className="items-center justify-center py-8">
        <Text className="text-sm text-gray-400">当前范围还没有可绘制的愉悦感和重要性评分</Text>
      </View>
    );
  }

  return (
    <View>
      <Svg width={chartW} height={chartH}>
        <Rect x={PL} y={PT} width={innerW} height={innerH} fill="#fff7ed" opacity={0.38} />
        <Rect x={xOf(5)} y={PT} width={innerW / 2} height={innerH / 2} fill="#ecfdf5" opacity={0.62} />
        <Rect x={PL} y={PT} width={innerW / 2} height={innerH / 2} fill="#eef2ff" opacity={0.46} />
        <Rect x={xOf(5)} y={yOf(5)} width={innerW / 2} height={innerH / 2} fill="#fff7ed" opacity={0.5} />
        <Rect x={PL} y={yOf(5)} width={innerW / 2} height={innerH / 2} fill="#f9fafb" opacity={0.76} />

        {gridLines.map(v => (
          <G key={`grid-${v}`}>
            <Line x1={xOf(v)} y1={PT} x2={xOf(v)} y2={PT + innerH} stroke="#e5e7eb" strokeWidth={v === 5 ? 1.4 : 1} />
            <Line x1={PL} y1={yOf(v)} x2={PL + innerW} y2={yOf(v)} stroke="#e5e7eb" strokeWidth={v === 5 ? 1.4 : 1} />
            <SvgText x={xOf(v)} y={chartH - 12} fontSize={9} fill="#9ca3af" textAnchor="middle">{v}</SvgText>
            <SvgText x={PL - 8} y={yOf(v) + 3} fontSize={9} fill="#9ca3af" textAnchor="end">{v}</SvgText>
          </G>
        ))}

        <SvgText x={PL + innerW / 2} y={chartH - 2} fontSize={10} fill="#6b7280" textAnchor="middle">愉悦感</SvgText>
        <SvgText x={12} y={PT + innerH / 2} fontSize={10} fill="#6b7280" textAnchor="middle" rotation="-90" origin={`12, ${PT + innerH / 2}`}>重要性</SvgText>

        <SvgText x={PL + innerW * 0.25} y={PT + 14} fontSize={9} fill="#6366f1" textAnchor="middle">低愉悦高重要</SvgText>
        <SvgText x={PL + innerW * 0.75} y={PT + 14} fontSize={9} fill="#16a34a" textAnchor="middle">高愉悦高重要</SvgText>
        <SvgText x={PL + innerW * 0.25} y={PT + innerH - 8} fontSize={9} fill="#9ca3af" textAnchor="middle">低愉悦低重要</SvgText>
        <SvgText x={PL + innerW * 0.75} y={PT + innerH - 8} fontSize={9} fill="#f97316" textAnchor="middle">高愉悦低重要</SvgText>

        {scored.map(({ record, index }) => {
          const x = xOf(record.pleasure_score ?? 0);
          const y = yOf(record.importance_score ?? 0);
          return (
            <G key={`${record.timestamp}-${index}`}>
              <Circle cx={x} cy={y} r={8} fill="#fb923c" opacity={0.22} />
              <Circle cx={x} cy={y} r={4.5} fill="#f97316" />
              <SvgText x={x} y={y - 10} fontSize={9} fill="#374151" textAnchor="middle" fontWeight="bold">{index}</SvgText>
            </G>
          );
        })}
      </Svg>

      <View className="flex-row flex-wrap gap-2 mb-3">
        {quadrants.map(q => (
          <View key={q.key} className="px-2 py-1 rounded-lg bg-gray-50 flex-row items-center">
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: q.color }} />
            <Text className="text-xs text-gray-500 ml-1">{q.label} {grouped[q.key].length}</Text>
          </View>
        ))}
      </View>

      <View className="border-t border-gray-100 pt-3">
        {quadrants.map(q => (
          <View key={`${q.key}-records`} className="mb-2">
            <Text className="text-xs font-semibold text-gray-500 mb-1">{q.label}</Text>
            {grouped[q.key].length > 0 ? grouped[q.key].map(({ record, index }) => (
              <View key={`${record.timestamp}-legend-${index}`} className="flex-row items-center mb-1.5">
                <Text className="text-xs font-bold text-orange-500 w-5">{index}</Text>
                <Text className="text-xs text-gray-600 flex-1" numberOfLines={1}>{record.activity || '活动'}</Text>
                <Text className="text-xs text-gray-400 ml-2">愉悦 {record.pleasure_score} · 重要 {record.importance_score}</Text>
              </View>
            )) : (
              <Text className="text-xs text-gray-300 mb-1.5">暂无活动</Text>
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

// ── Radar Chart ──────────────────────────────────────────────────────────────

// Short display labels for axes (to fit tight spaces)
const DOMAIN_SHORT: Record<string, string> = {
  '亲密关系': '亲密\n关系',
  '教育与职业': '教育\n职业',
  '休闲兴趣': '休闲\n兴趣',
  '自我关怀': '自我\n关怀',
  '日常责任': '日常\n责任',
  '其他': '其他',
};

function RadarChart({ data }: { data: DomainRadarItem[] }) {
  const { width } = useWindowDimensions();
  const size = Math.min(width - 64, 260);
  const cx = size / 2;
  const cy = size / 2;
  const R = size / 2 - 38;           // axis radius
  const N = data.length;
  if (N === 0) return null;

  const maxCount = Math.max(...data.map(d => d.count), 1);
  const rings = [0.25, 0.5, 0.75, 1.0];
  const RING_COLOR = '#f3f4f6';
  const AXIS_COLOR = '#e5e7eb';
  const DATA_FILL = 'rgba(249,115,22,0.15)';
  const DATA_STROKE = '#f97316';

  const angle = (i: number) => (i * 2 * Math.PI) / N - Math.PI / 2;
  const px = (i: number, r: number) => cx + r * Math.cos(angle(i));
  const py = (i: number, r: number) => cy + r * Math.sin(angle(i));

  const ringPoints = (ratio: number) =>
    Array.from({ length: N }, (_, i) => `${px(i, R * ratio).toFixed(1)},${py(i, R * ratio).toFixed(1)}`).join(' ');

  const dataPoints = data
    .map((d, i) => {
      const r = (d.count / maxCount) * R;
      return `${px(i, r).toFixed(1)},${py(i, r).toFixed(1)}`;
    })
    .join(' ');

  return (
    <View style={{ alignItems: 'center' }}>
      <Svg width={size} height={size}>
        {/* Grid rings */}
        {rings.map(ratio => (
          <Polygon key={ratio} points={ringPoints(ratio)} fill="none" stroke={RING_COLOR} strokeWidth={1} />
        ))}
        {/* Axis lines */}
        {data.map((_, i) => (
          <Line key={i} x1={cx} y1={cy} x2={px(i, R)} y2={py(i, R)} stroke={AXIS_COLOR} strokeWidth={1} />
        ))}
        {/* Data polygon */}
        {maxCount > 0 && (
          <Polygon points={dataPoints} fill={DATA_FILL} stroke={DATA_STROKE} strokeWidth={2} />
        )}
        {/* Data dots + count labels */}
        {data.map((d, i) => {
          const r = (d.count / maxCount) * R;
          const dotX = px(i, r);
          const dotY = py(i, r);
          return (
            <G key={i}>
              {d.count > 0 && <Circle cx={dotX} cy={dotY} r={3.5} fill={DATA_STROKE} />}
              {d.count > 0 && (
                <SvgText
                  x={px(i, r + 10)}
                  y={py(i, r + 10) + 4}
                  fontSize={9}
                  fill="#f97316"
                  textAnchor="middle"
                  fontWeight="bold"
                >
                  {d.count}
                </SvgText>
              )}
            </G>
          );
        })}
        {/* Axis labels */}
        {data.map((d, i) => {
          const lx = px(i, R + 22);
          const ly = py(i, R + 22);
          const cos = Math.cos(angle(i));
          const anchor = cos > 0.3 ? 'start' : cos < -0.3 ? 'end' : 'middle';
          const lines = (DOMAIN_SHORT[d.domain_name] ?? d.domain_name).split('\n');
          const lineH = 11;
          const offsetY = lines.length > 1 ? -(lineH / 2) : 0;
          return lines.map((line, li) => (
            <SvgText
              key={`${i}-${li}`}
              x={lx}
              y={ly + offsetY + li * lineH + 4}
              fontSize={9}
              fill="#6b7280"
              textAnchor={anchor}
            >
              {line}
            </SvgText>
          ));
        })}
      </Svg>
    </View>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

type MainTab = 'stats' | 'assessment';
type StatsTab = 'today' | 'week' | 'month';

export default function HistoryScreen() {
  const userId = useUserId();
  const [mainTab, setMainTab] = useState<MainTab>('stats');
  const [statsTab, setStatsTab] = useState<StatsTab>('today');
  const [dayStats, setDayStats] = useState<DayStats | null>(null);
  const [weekStats, setWeekStats] = useState<WeekStats | null>(null);
  const [weekRecords, setWeekRecords] = useState<MoodRecord[]>([]);
  const [monthStats, setMonthStats] = useState<MonthStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [todayMoodScore, setTodayMoodScore] = useState<number | null>(null);
  const [savingMood, setSavingMood] = useState(false);
  const [radarData, setRadarData] = useState<DomainRadarItem[] | null>(null);

  const loadStats = useCallback(async () => {
    setLoading(true);
    setRadarData(null);
    try {
      // Stats and radar fetched independently — radar failure won't break the charts
      const period = statsTab === 'today' ? 'day' : statsTab === 'week' ? 'week' : 'month';
      if (statsTab === 'today') {
        const stats = await api.getStatsToday(userId);
        setDayStats(stats);
        setTodayMoodScore(stats.daily_mood_score ?? null);
      } else if (statsTab === 'week') {
        const { startDate, endDate } = getCurrentWeekRange();
        const [stats, records] = await Promise.all([
          api.getStatsWeek(userId),
          api.listRecordsRange(startDate, endDate, userId),
        ]);
        setWeekStats(stats);
        setWeekRecords(records.slice().reverse());
      } else {
        setMonthStats(await api.getStatsMonth(userId));
      }
      api.getDomainRadar(period, userId).then(setRadarData).catch(() => {});
    } finally { setLoading(false); }
  }, [statsTab, userId]);

  useEffect(() => {
    if (mainTab === 'stats') loadStats();
  }, [mainTab, statsTab, loadStats]);

  const handleMoodSelect = async (score: number) => {
    if (savingMood) return;
    setSavingMood(true);
    const date = formatLocalDate(new Date());
    try {
      const saved = await api.setDailyMood(date, score, userId);
      setTodayMoodScore(saved.mood_score);
      setDayStats(prev => prev ? { ...prev, daily_mood_score: saved.mood_score } : prev);
    } finally {
      setSavingMood(false);
    }
  };

  const weekDays = ['日', '一', '二', '三', '四', '五', '六'];

  const mainTabs: { key: MainTab; label: string }[] = [
    { key: 'stats', label: '📊 数据' },
    { key: 'assessment', label: '📋 测评' },
  ];

  return (
    <SafeAreaView className="flex-1 bg-orange-50">
      <ScrollView className="flex-1 px-4" showsVerticalScrollIndicator={false}>
        <Text className="text-xl font-bold text-gray-800 mt-6 mb-4">反思</Text>

        {/* Main tab selector */}
        <View className="flex-row bg-gray-100 rounded-2xl p-1 mb-6">
          {mainTabs.map(t => (
            <TouchableOpacity
              key={t.key}
              onPress={() => setMainTab(t.key)}
              className="flex-1 py-2 rounded-xl items-center"
              style={mainTab === t.key ? { backgroundColor: '#ffffff', elevation: 1 } : {}}
            >
              <Text className={`text-xs font-medium ${mainTab === t.key ? 'text-orange-500' : 'text-gray-400'}`}>
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── 数据 tab ── */}
        {mainTab === 'stats' && (
          <>
            <View className="flex-row gap-2 mb-5">
              {([['today', '今日'], ['week', '本周'], ['month', '本月']] as [StatsTab, string][]).map(([t, label]) => (
                <TouchableOpacity
                  key={t}
                  onPress={() => setStatsTab(t)}
                  className={`px-4 py-1.5 rounded-full ${statsTab === t ? 'bg-orange-500' : 'bg-white'}`}
                >
                  <Text className={`text-sm font-medium ${statsTab === t ? 'text-white' : 'text-gray-500'}`}>
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {loading && <ActivityIndicator size="large" color="#f97316" style={{ marginTop: 40 }} />}

            {!loading && statsTab === 'today' && dayStats && (
              <View>
                <View className="flex-row gap-3 mb-5">
                  {[
                    { label: '今日记录', value: dayStats.count, unit: '条', color: '#f97316' },
                    { label: '平均愉悦度', value: dayStats.avg_pleasure?.toFixed(1) ?? '—', unit: '/10', color: '#6366f1' },
                    { label: '平均重要性', value: dayStats.avg_importance?.toFixed(1) ?? '—', unit: '/10', color: '#22c55e' },
                  ].map(card => (
                    <View key={card.label} className="flex-1 rounded-2xl px-2 py-4 items-center" style={cardStyle}>
                      <Text style={{ color: card.color }} className="text-xl font-bold">
                        {card.value}<Text className="text-xs font-normal text-gray-400">{card.unit}</Text>
                      </Text>
                      <Text className="text-xs text-gray-500 mt-1 text-center">{card.label}</Text>
                    </View>
                  ))}
                </View>

                <DailyMoodCard value={todayMoodScore} saving={savingMood} onSelect={handleMoodSelect} />

                <View className="bg-white rounded-2xl p-4 mb-4">
                  <View className="flex-row items-center justify-between mb-1">
                    <Text className="text-sm font-semibold text-gray-700">今日活动分布</Text>
                    <Text className="text-xs font-semibold text-orange-500">
                      {todayMoodScore != null ? `总体情绪 ${todayMoodScore}/10` : '总体情绪未评分'}
                    </Text>
                  </View>
                  <Text className="text-xs text-gray-400 mb-3">每个点代表一条活动记录，位置由愉悦感和重要性评分决定</Text>
                  <PleasureImportanceScatter records={dayStats.records} />
                </View>

                {dayStats.records.length > 0 && (
                  <View className="bg-white rounded-2xl p-4 mb-4">
                    <Text className="text-sm font-semibold text-gray-700 mb-3">今日记录</Text>
                    {dayStats.records.map((r, i) => (
                      <View key={i} className="mb-3 pb-3 border-b border-gray-50 last:border-0">
                        <View className="flex-row justify-between mb-1">
                          <Text className="text-sm font-medium text-gray-800 flex-1 mr-2">{r.activity || '活动'}</Text>
                          <Text className="text-xs text-gray-400">
                            {new Date(r.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                          </Text>
                        </View>
                        {r.thought && <Text className="text-xs text-gray-500 mb-1">{r.thought}</Text>}
                        <View className="flex-row gap-4">
                          {r.pleasure_score != null && (
                            <View className="flex-row items-center gap-1.5 flex-1">
                              <Text className="text-xs text-orange-500">愉悦</Text>
                              <Bar value={r.pleasure_score} color="#fb923c" />
                              <Text className="text-xs text-gray-400 w-5">{r.pleasure_score}</Text>
                            </View>
                          )}
                          {r.importance_score != null && (
                            <View className="flex-row items-center gap-1.5 flex-1">
                              <Text className="text-xs text-indigo-500">重要</Text>
                              <Bar value={r.importance_score} color="#818cf8" />
                              <Text className="text-xs text-gray-400 w-5">{r.importance_score}</Text>
                            </View>
                          )}
                        </View>
                      </View>
                    ))}
                  </View>
                )}


                {radarData && (
                  <View className="bg-white rounded-2xl p-4 mb-4">
                    <Text className="text-sm font-semibold text-gray-700 mb-1">生活领域分布</Text>
                    <Text className="text-xs text-gray-400 mb-3">今日活动覆盖的领域</Text>
                    <RadarChart data={radarData} />
                  </View>
                )}
              </View>
            )}

            {!loading && statsTab === 'week' && weekStats && (
              <View>
                <View className="flex-row gap-3 mb-5">
                  {[
                    { label: '本周记录', value: weekStats.total_count, unit: '条', color: '#f97316' },
                    { label: '平均愉悦度', value: weekStats.avg_pleasure?.toFixed(1) ?? '—', unit: '/10', color: '#6366f1' },
                    { label: '平均重要性', value: weekStats.avg_importance?.toFixed(1) ?? '—', unit: '/10', color: '#22c55e' },
                  ].map(card => (
                    <View key={card.label} className="flex-1 rounded-2xl px-2 py-4 items-center" style={cardStyle}>
                      <Text style={{ color: card.color }} className="text-xl font-bold">
                        {card.value}<Text className="text-xs font-normal text-gray-400">{card.unit}</Text>
                      </Text>
                      <Text className="text-xs text-gray-500 mt-1 text-center">{card.label}</Text>
                    </View>
                  ))}
                </View>

                <View className="bg-white rounded-2xl p-4 mb-4">
                  <Text className="text-sm font-semibold text-gray-700 mb-1">本周活动分布</Text>
                  <Text className="text-xs text-gray-400 mb-3">
                    你可以增加愉悦且重要的活动，并平衡高愉悦低重要和低愉悦高重要的活动，减少低愉悦低重要的活动。
                  </Text>
                  <PleasureImportanceScatter records={weekRecords} />
                </View>

                {radarData && (
                  <View className="bg-white rounded-2xl p-4 mb-4">
                    <Text className="text-sm font-semibold text-gray-700 mb-1">生活领域分布</Text>
                    <Text className="text-xs text-gray-400 mb-3">本周活动覆盖的领域 · BATD-R 建议多领域均衡</Text>
                    <RadarChart data={radarData} />
                  </View>
                )}
              </View>
            )}

            {!loading && statsTab === 'month' && monthStats && (
              <View>
                <View className="flex-row gap-3 mb-5">
                  {[
                    { label: '本月记录', value: monthStats.total_count, unit: '条', color: '#f97316' },
                    { label: '平均愉悦度', value: monthStats.avg_pleasure?.toFixed(1) ?? '—', unit: '/10', color: '#6366f1' },
                    { label: '平均重要性', value: monthStats.avg_importance?.toFixed(1) ?? '—', unit: '/10', color: '#22c55e' },
                  ].map(card => (
                    <View key={card.label} className="flex-1 rounded-2xl px-2 py-4 items-center" style={cardStyle}>
                      <Text style={{ color: card.color }} className="text-xl font-bold">
                        {card.value}<Text className="text-xs font-normal text-gray-400">{card.unit}</Text>
                      </Text>
                      <Text className="text-xs text-gray-500 mt-1 text-center">{card.label}</Text>
                    </View>
                  ))}
                </View>

                <View className="bg-white rounded-2xl p-4 mb-4">
                  <Text className="text-sm font-semibold text-gray-700 mb-1">本月总体情绪趋势</Text>
                  <Text className="text-xs text-gray-400 mb-3">基于每天填写的 0-10 总体情绪评分</Text>
                  <MoodLineChart
                    data={monthStats.daily_data.map(day => ({
                      label: `${new Date(day.date + 'T00:00:00').getMonth() + 1}/${new Date(day.date + 'T00:00:00').getDate()}`,
                      mood: day.daily_mood_score,
                    }))}
                    showEvery={5}
                  />
                </View>

                {radarData && (
                  <View className="bg-white rounded-2xl p-4 mb-4">
                    <Text className="text-sm font-semibold text-gray-700 mb-1">生活领域分布</Text>
                    <Text className="text-xs text-gray-400 mb-3">本月活动覆盖的领域 · BATD-R 建议多领域均衡</Text>
                    <RadarChart data={radarData} />
                  </View>
                )}
              </View>
            )}
          </>
        )}

        {/* ── 测评 tab ── */}
        {mainTab === 'assessment' && <AssessmentPanel />}

        <View className="h-8" />
      </ScrollView>
    </SafeAreaView>
  );
}
