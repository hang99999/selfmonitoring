import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  useWindowDimensions, PanResponder,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Polyline, Circle, Line, Text as SvgText, Polygon, G, Rect } from 'react-native-svg';
import { api } from '../../src/api';
import { AppLanguage, translateDomainName, useLanguage } from '../../src/i18n';
import { useUserId } from '../../src/userStore';
import type { DayStats, WeekStats, MonthStats, DomainRadarItem, MoodRecord, PlannedActivity } from '../../src/types';

// ── Assessment scales ─────────────────────────────────────────────────────────

type Severity = 'green' | 'yellow' | 'orange' | 'red';
interface Interpretation { level: string; severity: Severity; desc: string; advice: string[]; }
interface Scale {
  id: string; name: string; subtitle: string; emoji: string;
  timeframe: string; questions: string[]; options: string[];
  maxScore: number;
  displayScore: (raw: number) => number;
  interpret: (raw: number) => Interpretation;
  en: {
    subtitle: string;
    timeframe: string;
    questions: string[];
    options: string[];
    interpret: (raw: number) => Interpretation;
  };
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
      if (s <= 4) return { level: '无或极少抑郁症状', severity: 'green', desc: '目前没有明显的抑郁相关症状，建议继续保持健康的生活习惯。', advice: ['维持规律的作息和运动', '保持社交联系和有意义的活动', '定期关注自己的情绪状态'] };
      if (s <= 9) return { level: '轻微抑郁症状', severity: 'yellow', desc: '存在一些轻微的抑郁相关症状，可以先通过日常行动和支持资源改善状态。', advice: ['增加令自己有愉悦感的活动（行为激活）', '规律运动，每天至少30分钟', '与信任的人多交流分享'] };
      if (s <= 14) return { level: '中度抑郁症状', severity: 'orange', desc: '存在中度抑郁相关症状，对日常生活可能已有一定影响，建议进一步寻求支持。', advice: ['建议联系 App 研究团队，说明你的测评结果和近期状态', '告知家人或亲密朋友你的状态', '必要时可向医院心理科或精神科咨询'] };
      if (s <= 19) return { level: '中重度抑郁症状', severity: 'red', desc: '存在较明显的抑郁相关症状，日常生活可能受到明显影响，建议尽快获得人工支持。', advice: ['请尽快联系 App 研究团队或专业心理健康服务', '不要独自承受，告诉身边信任的人', '如果有立即伤害自己的风险，请联系当地急救或前往急诊'] };
      return { level: '重度抑郁症状', severity: 'red', desc: '存在严重抑郁相关症状，建议立即寻求人工支持和专业帮助。', advice: ['请立即联系 App 研究团队，并尽快联系精神科医生或前往医院', '请让身边的人陪伴你，不要独处', '如果处于立即危险中，请联系当地急救或前往最近急诊'] };
    },
    en: {
      subtitle: 'Depression screening scale',
      timeframe: 'Over the last 2 weeks, how often have you been bothered by any of the following problems?',
      questions: [
        'Little interest or pleasure in doing things',
        'Feeling down, depressed, or hopeless',
        'Trouble falling or staying asleep, or sleeping too much',
        'Feeling tired or having little energy',
        'Poor appetite or overeating',
        'Feeling bad about yourself — or that you are a failure or have let yourself or your family down',
        'Trouble concentrating on things, such as reading the newspaper or watching television',
        'Moving or speaking so slowly that other people could have noticed? Or the opposite — being so fidgety or restless that you have been moving around a lot more than usual',
        'Thoughts that you would be better off dead or of hurting yourself in some way',
      ],
      options: ['Not at all', 'Several days', 'More than half the days', 'Nearly every day'],
      interpret: (s) => {
        if (s <= 4) return { level: 'None-minimal depression symptoms', severity: 'green', desc: 'Your score is in the none-minimal range. Keep maintaining healthy routines and meaningful activities.', advice: ['Maintain regular sleep and activity routines', 'Stay connected with supportive people', 'Keep noticing changes in your mood'] };
        if (s <= 9) return { level: 'Mild depression symptoms', severity: 'yellow', desc: 'Your score is in the mild range. Daily action and support resources may help improve your current state.', advice: ['Add activities that bring pleasure or meaning', 'Try regular movement, even in small amounts', 'Talk with someone you trust'] };
        if (s <= 14) return { level: 'Moderate depression symptoms', severity: 'orange', desc: 'Your score is in the moderate range. Consider seeking additional support.', advice: ['Contact the app research team about your result and recent state', 'Tell a trusted person how you are doing', 'Consider consulting a mental-health professional'] };
        if (s <= 19) return { level: 'Moderately severe depression symptoms', severity: 'red', desc: 'Your score suggests more significant symptoms. Please seek human support soon.', advice: ['Contact the app research team or a mental-health service', 'Do not carry this alone; tell someone you trust', 'If you may hurt yourself soon, contact emergency services or go to an emergency department'] };
        return { level: 'Severe depression symptoms', severity: 'red', desc: 'Your score is in the severe range. Please seek human and professional support as soon as possible.', advice: ['Contact the app research team and consider urgent professional help', 'Ask someone nearby to stay with you', 'If you are in immediate danger, contact emergency services or go to the nearest emergency department'] };
      },
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
      if (s <= 4) return { level: '极少焦虑症状', severity: 'green', desc: '目前焦虑相关症状较少，建议继续维持当前的放松和自我照顾习惯。', advice: ['继续维持当前的放松习惯', '练习正念或冥想有助于长期保持', '关注生活中令你有意义感的事'] };
      if (s <= 9) return { level: '轻微焦虑症状', severity: 'yellow', desc: '存在轻微焦虑相关症状，可以先通过一些日常方法缓解。', advice: ['尝试腹式呼吸或渐进式肌肉放松', '减少咖啡因和碎片化刷手机的习惯', '把担忧写下来，区分可控与不可控的事'] };
      if (s <= 14) return { level: '中度焦虑症状', severity: 'orange', desc: '存在中度焦虑相关症状，建议积极寻求人工支持。', advice: ['建议联系 App 研究团队，说明你的测评结果和近期困扰', '认知行为疗法（CBT）对焦虑有良好效果，可考虑专业咨询', '与家人或朋友分享你的感受'] };
      return { level: '重度焦虑症状', severity: 'red', desc: '存在明显焦虑相关症状，建议尽快获得人工支持和专业帮助。', advice: ['请尽快联系 App 研究团队或专业心理健康服务', '告诉身边信任的人你的状态', '焦虑症状是可以被支持和改善的，请不要独自承受'] };
    },
    en: {
      subtitle: 'Anxiety screening scale',
      timeframe: 'Over the last 2 weeks, how often have you been bothered by the following problems?',
      questions: [
        'Feeling nervous, anxious or on edge',
        'Not being able to stop or control worrying',
        'Worrying too much about different things',
        'Trouble relaxing',
        'Being so restless that it is hard to sit still',
        'Becoming easily annoyed or irritable',
        'Feeling afraid as if something awful might happen',
      ],
      options: ['Not at all', 'Several days', 'More than half the days', 'Nearly every day'],
      interpret: (s) => {
        if (s <= 4) return { level: 'Minimal anxiety symptoms', severity: 'green', desc: 'Your score is in the minimal range. Keep maintaining relaxation and self-care habits.', advice: ['Keep using helpful relaxation habits', 'Mindfulness or breathing practice may help over time', 'Stay connected with meaningful activities'] };
        if (s <= 9) return { level: 'Mild anxiety symptoms', severity: 'yellow', desc: 'Your score is in the mild range. Some daily strategies may help reduce anxiety.', advice: ['Try slow breathing or progressive muscle relaxation', 'Reduce caffeine and fragmented phone use if helpful', 'Write worries down and separate controllable from uncontrollable concerns'] };
        if (s <= 14) return { level: 'Moderate anxiety symptoms', severity: 'orange', desc: 'Your score is in the moderate range. Consider seeking human support.', advice: ['Contact the app research team about your result and recent worries', 'CBT can be helpful for anxiety; consider professional consultation', 'Share your feelings with family or friends'] };
        return { level: 'Severe anxiety symptoms', severity: 'red', desc: 'Your score suggests significant anxiety symptoms. Please seek support soon.', advice: ['Contact the app research team or a mental-health service', 'Tell someone you trust how you are doing', 'Anxiety can be supported and improved; you do not have to handle it alone'] };
      },
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
      if (pct >= 68) return { level: '幸福感良好', severity: 'green', desc: `幸福感指数 ${pct}/100，整体心理状态较积极，建议继续保持。`, advice: ['继续维持带来幸福感的活动和人际关系', '将好的习惯和经验分享给身边的人'] };
      if (pct >= 50) return { level: '幸福感尚可', severity: 'yellow', desc: `幸福感指数 ${pct}/100，整体尚可，但仍有一些值得照顾和改善的空间。`, advice: ['尝试增加日常中令你感到快乐的小事', '关注睡眠质量和规律作息'] };
      if (pct > 28) return { level: '幸福感偏低', severity: 'orange', desc: `幸福感指数 ${pct}/100，提示近期幸福感偏低，建议进一步关注当前情绪状态。`, advice: ['进行行为激活，计划并执行有意义的活动', '建议联系 App 研究团队，说明你的测评结果和近期状态'] };
      return { level: '幸福感明显偏低', severity: 'red', desc: `幸福感指数 ${pct}/100，提示近期幸福感明显偏低，建议尽快获得人工支持。`, advice: ['请联系 App 研究团队或专业心理健康服务', '如果同时有强烈绝望感或伤害自己的念头，请联系当地急救或前往急诊'] };
    },
    en: {
      subtitle: 'Well-being index',
      timeframe: 'Please indicate for each of the five statements which is closest to how you have been feeling over the last two weeks.',
      questions: [
        'I have felt cheerful and in good spirits',
        'I have felt calm and relaxed',
        'I have felt active and vigorous',
        'I woke up feeling fresh and rested',
        'My daily life has been filled with things that interest me',
      ],
      options: ['At no time', 'Some of the time', 'Less than half of the time', 'More than half of the time', 'Most of the time', 'All of the time'],
      interpret: (s) => {
        const pct = s * 4;
        if (pct >= 68) return { level: 'Good well-being', severity: 'green', desc: `WHO-5 score ${pct}/100. Your recent well-being appears relatively positive.`, advice: ['Keep maintaining activities and relationships that support well-being', 'Share helpful routines and experiences with people around you'] };
        if (pct >= 50) return { level: 'Fair well-being', severity: 'yellow', desc: `WHO-5 score ${pct}/100. Overall well-being is fair, with some room for care and improvement.`, advice: ['Try adding small daily moments that feel pleasant', 'Pay attention to sleep quality and regular routines'] };
        if (pct > 28) return { level: 'Low well-being', severity: 'orange', desc: `WHO-5 score ${pct}/100. This suggests lower recent well-being and is worth further attention.`, advice: ['Use behavioral activation: plan and carry out meaningful activities', 'Consider contacting the app research team about your result and recent state'] };
        return { level: 'Very low well-being', severity: 'red', desc: `WHO-5 score ${pct}/100. This suggests very low recent well-being. Please seek human support soon.`, advice: ['Contact the app research team or a mental-health service', 'If you also feel hopeless or may hurt yourself, contact emergency services or go to an emergency department'] };
      },
    },
  },
];

function scaleText(scale: Scale, language: AppLanguage) {
  return language === 'en'
    ? {
        subtitle: scale.en.subtitle,
        timeframe: scale.en.timeframe,
        questions: scale.en.questions,
        options: scale.en.options,
        interpret: scale.en.interpret,
      }
    : {
        subtitle: scale.subtitle,
        timeframe: scale.timeframe,
        questions: scale.questions,
        options: scale.options,
        interpret: scale.interpret,
      };
}

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
  const userId = useUserId();
  const { language, t } = useLanguage();
  const [step, setStep] = useState<AStep>({ type: 'list' });

  const start = (scale: Scale) => setStep({ type: 'taking', scale, answers: [], current: 0 });

  const handleAnswer = (value: number) => {
    if (step.type !== 'taking') return;
    const localized = scaleText(step.scale, language);
    const newAnswers = [...step.answers, value];
    if (newAnswers.length === localized.questions.length) {
      const score = newAnswers.reduce((a, b) => a + b, 0);
      const interp = localized.interpret(score);
      api.saveAssessmentResult({
        user_id: userId,
        scale_type: step.scale.id,
        score,
        display_score: step.scale.displayScore(score),
        severity_level: interp.level,
        answers: newAnswers,
      }).catch(err => console.warn('Failed to save assessment result', err));
      setStep({ type: 'result', scale: step.scale, score, answers: newAnswers });
    } else {
      setStep({ ...step, answers: newAnswers, current: step.current + 1 });
    }
  };

  if (step.type === 'list') {
    return (
      <View>
        <Text className="text-sm text-gray-500 mb-4 leading-relaxed">{t('assessmentsIntro')}</Text>
        {SCALES.map(scale => {
          const localized = scaleText(scale, language);
          return (
            <TouchableOpacity
              key={scale.id}
              onPress={() => start(scale)}
              className="w-full rounded-2xl p-4 mb-3 flex-row items-center"
              style={cardStyle}
            >
              <Text className="text-3xl mr-3">{scale.emoji}</Text>
              <View className="flex-1">
                <Text className="font-bold text-gray-800">{scale.name}</Text>
                <Text className="text-sm text-gray-500">{localized.subtitle}</Text>
              </View>
              <View className="bg-gray-100 px-2 py-1 rounded-lg">
                <Text className="text-xs text-gray-500">{localized.questions.length} {t('questionsCount')}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
        <Text className="text-xs text-gray-400 text-center mt-2">
          {t('assessmentSupportHint')}
        </Text>
      </View>
    );
  }

  if (step.type === 'taking') {
    const { scale, current } = step;
    const localized = scaleText(scale, language);
    const progress = Math.round((current / localized.questions.length) * 100);
    return (
      <View>
        <View className="flex-row items-center mb-5">
          <TouchableOpacity onPress={() => setStep({ type: 'list' })} className="mr-3">
            <Text className="text-gray-400 text-sm">{t('assessmentBack')}</Text>
          </TouchableOpacity>
          <View className="flex-1">
            <View className="flex-row justify-between mb-1">
              <Text className="text-xs text-gray-400">{scale.name}</Text>
              <Text className="text-xs text-gray-400">
                {t('assessmentQuestionProgress')
                  .replace('{current}', String(current + 1))
                  .replace('{total}', String(localized.questions.length))}
              </Text>
            </View>
            <View className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <View className="h-1.5 bg-orange-400 rounded-full" style={{ width: `${progress}%` }} />
            </View>
          </View>
        </View>

        <Text className="text-xs text-gray-400 mb-2">{localized.timeframe}</Text>
        <Text className="text-base font-bold text-gray-800 mb-5 leading-snug">
          {localized.questions[current]}
        </Text>

        {localized.options.map((opt, i) => (
          <TouchableOpacity
            key={i}
            onPress={() => handleAnswer(i)}
            className="w-full flex-row items-center px-4 py-3.5 rounded-xl border border-gray-200 bg-white mb-2"
          >
            <View className="w-5 h-5 rounded-full border-2 border-gray-300 mr-3" />
            <Text className="text-sm text-gray-700 flex-1">{opt}</Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  }

  if (step.type === 'result') {
    const { scale, score, answers } = step;
    const localized = scaleText(scale, language);
    const displayScore = scale.displayScore(score);
    const interp = localized.interpret(score);
    const style = SEVERITY_COLOR[interp.severity];
    const maxDisplay = scale.id === 'WHO5' ? 100 : scale.maxScore;
    const hasSelfHarmNote = scale.id === 'PHQ9' && answers[8] > 0;

    return (
      <View>
        <TouchableOpacity onPress={() => setStep({ type: 'list' })} className="mb-5">
          <Text className="text-gray-400 text-sm">{t('assessmentBackToList')}</Text>
        </TouchableOpacity>

        <View className="items-center mb-5">
          <View
            style={{ backgroundColor: style.bg, borderColor: style.border }}
            className="w-28 h-28 rounded-full border-2 items-center justify-center mb-3"
          >
            <Text style={{ color: style.text }} className="text-4xl font-bold">{displayScore}</Text>
            <Text style={{ color: style.text }} className="text-xs opacity-75">/ {maxDisplay}</Text>
          </View>
          <Text className="text-xs text-gray-400 mb-2">{scale.name} {localized.subtitle}</Text>
          <View style={{ backgroundColor: style.bg }} className="px-4 py-1.5 rounded-full">
            <Text style={{ color: style.text }} className="font-semibold text-sm">{interp.level}</Text>
          </View>
        </View>

        <Text className="text-sm text-gray-600 leading-relaxed mb-4 text-center">{interp.desc}</Text>

        <View className="bg-gray-50 rounded-2xl p-4 mb-4">
          <Text className="text-sm font-semibold text-gray-700 mb-2">{t('assessmentAdvice')}</Text>
          {interp.advice.map((a, i) => (
            <View key={i} className="flex-row mb-1.5">
              <Text className="text-orange-400 font-bold mr-2">-</Text>
              <Text className="text-sm text-gray-600 flex-1 leading-relaxed">{a}</Text>
            </View>
          ))}
        </View>

        {hasSelfHarmNote && (
          <View className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-4">
            <Text className="text-sm font-bold text-red-700 mb-1">{t('assessmentImportantHelpTitle')}</Text>
            <Text className="text-sm text-red-600 mb-2">{t('assessmentSelfHarmIntro')}</Text>
            <Text className="text-sm font-medium text-red-700">- {t('assessmentSelfHarmTeam')}</Text>
            <Text className="text-sm font-medium text-red-700">- {t('assessmentSelfHarmTrusted')}</Text>
            <Text className="text-sm font-medium text-red-700">- {t('assessmentSelfHarmEmergency')}</Text>
          </View>
        )}

        <Text className="text-xs text-gray-400 text-center mb-5">
          {t('assessmentDisclaimer')}
        </Text>

        <View className="flex-row gap-3">
          <TouchableOpacity onPress={() => start(scale)} className="flex-1 py-3 bg-gray-100 rounded-2xl items-center">
            <Text className="text-gray-700 font-medium text-sm">{t('retakeAssessment')}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setStep({ type: 'list' })} className="flex-1 py-3 bg-orange-500 rounded-2xl items-center">
            <Text className="text-white font-medium text-sm">{t('otherAssessments')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return null;
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

function getCurrentMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
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
  const { t } = useLanguage();
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
          <Text className="text-xs text-gray-400">{t('pleasureAxis')}</Text>
        </View>
        <View className="flex-row items-center gap-1.5">
          <View style={{ width: 12, height: 2, backgroundColor: '#818cf8', borderRadius: 1 }} />
          <Text className="text-xs text-gray-400">{t('importanceAxis')}</Text>
        </View>
      </View>
    </View>
  );
}

function MoodLineChart({ data, showEvery = 1 }: { data: ChartPoint[]; showEvery?: number }) {
  const { t } = useLanguage();
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
      <Text className="text-xs text-gray-400 text-center mt-1">{t('dailyMoodChartLabel')}</Text>
    </View>
  );
}

function DailyMoodCard({
  value, saving, onSelect,
}: { value: number | null; saving: boolean; onSelect: (score: number) => void }) {
  const { t } = useLanguage();
  const [trackWidth, setTrackWidth] = useState(1);
  const [draftScore, setDraftScore] = useState(value ?? 5);

  useEffect(() => {
    if (value != null) setDraftScore(value);
  }, [value]);

  const clampScore = (score: number) => Math.max(0, Math.min(10, score));
  const scoreFromX = (x: number) => {
    const safeX = Math.max(0, Math.min(trackWidth, x));
    return clampScore(Math.round((safeX / trackWidth) * 10));
  };
  const saveScore = (score: number) => {
    if (saving) return;
    setDraftScore(score);
    onSelect(score);
  };
  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => !saving,
    onMoveShouldSetPanResponder: () => !saving,
    onPanResponderGrant: evt => setDraftScore(scoreFromX(evt.nativeEvent.locationX)),
    onPanResponderMove: evt => setDraftScore(scoreFromX(evt.nativeEvent.locationX)),
    onPanResponderRelease: evt => saveScore(scoreFromX(evt.nativeEvent.locationX)),
  });
  const progress = (draftScore / 10) * 100;
  const thumbLeft = Math.max(0, Math.min(trackWidth - 28, (progress / 100) * trackWidth - 14));

  return (
    <View className="bg-white rounded-2xl p-4 mb-4">
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-sm font-semibold text-gray-700">{t('todayMoodTitle')}</Text>
        <Text className="text-sm font-bold text-orange-500">{value != null ? `${draftScore}/10` : `${t('unsavedScore')} · ${draftScore}/10`}</Text>
      </View>
      <Text className="text-xs text-gray-400 mb-3">{t('moodScaleHint')}</Text>
      <View
        className="py-3"
        onLayout={event => setTrackWidth(Math.max(1, event.nativeEvent.layout.width))}
        {...panResponder.panHandlers}
      >
        <View className="h-3 bg-gray-100 rounded-full overflow-hidden">
          <View className="h-3 bg-orange-400 rounded-full" style={{ width: `${progress}%` }} />
        </View>
        <View
          className="absolute top-1 w-7 h-7 rounded-full bg-white border-2 border-orange-400"
          style={{ left: thumbLeft }}
        />
        <View className="flex-row justify-between mt-3">
          {[0, 2, 4, 6, 8, 10].map(score => (
            <TouchableOpacity key={score} disabled={saving} onPress={() => saveScore(score)}>
              <Text className={`text-xs ${draftScore === score ? 'text-orange-500 font-bold' : 'text-gray-400'}`}>{score}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      {saving && <Text className="text-xs text-gray-400 mt-2">{t('saving')}</Text>}
    </View>
  );
}

// Pleasure x Importance Scatter
interface ScatterRecord {
  activity?: string;
  timestamp: string;
  pleasure_score?: number | null;
  importance_score?: number | null;
  planned_activity_id?: string | null;
}

function PlanListSection({
  plannedActivities, completedPlansWithoutPoint = [],
}: {
  plannedActivities: PlannedActivity[];
  completedPlansWithoutPoint?: PlannedActivity[];
}) {
  const { t } = useLanguage();
  if (plannedActivities.length === 0) return null;
  const incompletePlans = plannedActivities.filter(p => !p.completed);

  return (
    <View className="border-t border-gray-100 pt-3 mt-1">
      <Text className="text-xs font-semibold text-gray-500 mb-2">{t('plannedActivitiesSection')}</Text>
      <View className="flex-row flex-wrap gap-2 mb-2">
        <View className="px-2 py-1 rounded-lg bg-green-50">
          <Text className="text-xs text-green-700">{t('completedCount').replace('{count}', String(plannedActivities.filter(p => p.completed).length))}</Text>
        </View>
        <View className="px-2 py-1 rounded-lg bg-gray-50">
          <Text className="text-xs text-gray-500">{t('incompleteCount').replace('{count}', String(incompletePlans.length))}</Text>
        </View>
      </View>
      {incompletePlans.length > 0 ? incompletePlans.map(plan => (
        <View key={plan.id} className="flex-row items-center mb-1.5">
          <Text className="text-xs text-gray-600 flex-1" numberOfLines={1}>{plan.activity_name}</Text>
          <Text className="text-xs text-gray-400">{plan.scheduled_date}</Text>
        </View>
      )) : (
        <Text className="text-xs text-gray-300 mb-1.5">{t('noIncompletePlans')}</Text>
      )}
      {completedPlansWithoutPoint.length > 0 && (
        <Text className="text-xs text-gray-400 mt-2">
          {t('completedPlansNoScore').replace('{count}', String(completedPlansWithoutPoint.length))}
        </Text>
      )}
    </View>
  );
}

function PleasureImportanceScatter({
  records, plannedActivities = [],
}: {
  records: ScatterRecord[];
  plannedActivities?: PlannedActivity[];
}) {
  const { t } = useLanguage();
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
  const completedPlanIds = new Set(plannedActivities.filter(p => p.completed).map(p => p.id));
  const completedPlansWithoutPoint = plannedActivities.filter(
    p => p.completed && !scored.some(({ record }) => record.planned_activity_id === p.id),
  );

  const clamp = (v: number) => Math.max(0, Math.min(10, v));
  const xOf = (v: number) => PL + (clamp(v) / 10) * innerW;
  const yOf = (v: number) => PT + innerH - (clamp(v) / 10) * innerH;

  const quadrants = [
    { key: 'highBoth', label: t('highPleasureHighImportance'), color: '#16a34a' },
    { key: 'pleasantLowImportance', label: t('highPleasureLowImportance'), color: '#f97316' },
    { key: 'lowPleasureImportant', label: t('lowPleasureHighImportance'), color: '#6366f1' },
    { key: 'lowBoth', label: t('lowPleasureLowImportance'), color: '#9ca3af' },
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
      <View>
        <View className="items-center justify-center py-8">
          <Text className="text-sm text-gray-400">{t('scatterEmpty')}</Text>
        </View>
        <PlanListSection plannedActivities={plannedActivities} completedPlansWithoutPoint={plannedActivities.filter(p => p.completed)} />
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

        <SvgText x={PL + innerW / 2} y={chartH - 2} fontSize={10} fill="#6b7280" textAnchor="middle">{t('pleasureAxis')}</SvgText>
        <SvgText x={12} y={PT + innerH / 2} fontSize={10} fill="#6b7280" textAnchor="middle" rotation="-90" origin={`12, ${PT + innerH / 2}`}>{t('importanceAxis')}</SvgText>

        <SvgText x={PL + innerW * 0.25} y={PT + 14} fontSize={9} fill="#6366f1" textAnchor="middle">{t('lowPleasureHighImportance')}</SvgText>
        <SvgText x={PL + innerW * 0.75} y={PT + 14} fontSize={9} fill="#16a34a" textAnchor="middle">{t('highPleasureHighImportance')}</SvgText>
        <SvgText x={PL + innerW * 0.25} y={PT + innerH - 8} fontSize={9} fill="#9ca3af" textAnchor="middle">{t('lowPleasureLowImportance')}</SvgText>
        <SvgText x={PL + innerW * 0.75} y={PT + innerH - 8} fontSize={9} fill="#f97316" textAnchor="middle">{t('highPleasureLowImportance')}</SvgText>

        {scored.map(({ record, index }) => {
          const x = xOf(record.pleasure_score ?? 0);
          const y = yOf(record.importance_score ?? 0);
          const isCompletedPlan = !!record.planned_activity_id && completedPlanIds.has(record.planned_activity_id);
          return (
            <G key={`${record.timestamp}-${index}`}>
              <Circle cx={x} cy={y} r={8} fill="#fb923c" opacity={0.22} />
              {isCompletedPlan && <Circle cx={x} cy={y} r={8.5} fill="none" stroke="#16a34a" strokeWidth={2} />}
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
            {grouped[q.key].length > 0 ? grouped[q.key].map(({ record, index }) => {
              const isCompletedPlan = !!record.planned_activity_id && completedPlanIds.has(record.planned_activity_id);
              return (
                <View key={`${record.timestamp}-legend-${index}`} className="flex-row items-center mb-1.5">
                  <Text className="text-xs font-bold text-orange-500 w-5">{index}</Text>
                  <Text className="text-xs text-gray-600 flex-1" numberOfLines={1}>{record.activity || t('activityFallback')}</Text>
                  {isCompletedPlan && <Text className="text-[10px] text-green-700 bg-green-50 px-1.5 py-0.5 rounded-md mr-1">{t('completedPlan')}</Text>}
                  <Text className="text-xs text-gray-400 ml-2">{t('pleasureShort')} {record.pleasure_score} · {t('importanceShort')} {record.importance_score}</Text>
                </View>
              );
            }) : (
              <Text className="text-xs text-gray-300 mb-1.5">{t('noActivities')}</Text>
            )}
          </View>
        ))}
      </View>

      <PlanListSection plannedActivities={plannedActivities} completedPlansWithoutPoint={completedPlansWithoutPoint} />
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

const DOMAIN_SHORT_EN: Record<string, string> = {
  '亲密关系': 'Close\nrelationships',
  '教育与职业': 'Education\ncareer',
  '休闲兴趣': 'Leisure\ninterests',
  '自我关怀': 'Self\ncare',
  '日常责任': 'Daily\nresponsibilities',
  '其他': 'Other',
};

function RadarChart({ data }: { data: DomainRadarItem[] }) {
  const { language } = useLanguage();
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
          const label = language === 'en'
            ? (DOMAIN_SHORT_EN[d.domain_name] ?? translateDomainName(d.domain_name, language))
            : (DOMAIN_SHORT[d.domain_name] ?? d.domain_name);
          const lines = label.split('\n');
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
  const { t } = useLanguage();
  const [mainTab, setMainTab] = useState<MainTab>('stats');
  const [statsTab, setStatsTab] = useState<StatsTab>('today');
  const [dayStats, setDayStats] = useState<DayStats | null>(null);
  const [weekStats, setWeekStats] = useState<WeekStats | null>(null);
  const [weekRecords, setWeekRecords] = useState<MoodRecord[]>([]);
  const [monthStats, setMonthStats] = useState<MonthStats | null>(null);
  const [plannedActivities, setPlannedActivities] = useState<PlannedActivity[]>([]);
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
        const today = formatLocalDate(new Date());
        const [stats, plans] = await Promise.all([
          api.getStatsToday(userId),
          api.getPlanned(today, userId).catch(() => []),
        ]);
        setDayStats(stats);
        setPlannedActivities(plans);
        setTodayMoodScore(stats.daily_mood_score ?? null);
      } else if (statsTab === 'week') {
        const { startDate, endDate } = getCurrentWeekRange();
        const [stats, records, plans] = await Promise.all([
          api.getStatsWeek(userId),
          api.listRecordsRange(startDate, endDate, userId),
          api.listPlannedRange(startDate, endDate, userId).catch(() => []),
        ]);
        setWeekStats(stats);
        setWeekRecords(records.slice().reverse());
        setPlannedActivities(plans);
      } else {
        const { startDate, endDate } = getCurrentMonthRange();
        const [stats, plans] = await Promise.all([
          api.getStatsMonth(userId),
          api.listPlannedRange(startDate, endDate, userId).catch(() => []),
        ]);
        setMonthStats(stats);
        setPlannedActivities(plans);
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

  const mainTabs: { key: MainTab; label: string }[] = [
    { key: 'stats', label: t('dataTab') },
    { key: 'assessment', label: t('assessmentTab') },
  ];

  return (
    <SafeAreaView className="flex-1 bg-orange-50">
      <ScrollView className="flex-1 px-4" showsVerticalScrollIndicator={false}>
        <Text className="text-xl font-bold text-gray-800 mt-6 mb-4">{t('reflectTitle')}</Text>

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
              {([
                ['today', t('statsToday')],
                ['week', t('statsWeek')],
                ['month', t('statsMonth')],
              ] as [StatsTab, string][]).map(([tab, label]) => (
                <TouchableOpacity
                  key={tab}
                  onPress={() => setStatsTab(tab)}
                  className={`px-4 py-1.5 rounded-full ${statsTab === tab ? 'bg-orange-500' : 'bg-white'}`}
                >
                  <Text className={`text-sm font-medium ${statsTab === tab ? 'text-white' : 'text-gray-500'}`}>
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
                    { label: t('activityEntries'), value: dayStats.count, unit: '', color: '#f97316' },
                    { label: t('avgPleasure'), value: dayStats.avg_pleasure?.toFixed(1) ?? '—', unit: '/10', color: '#6366f1' },
                    { label: t('avgImportance'), value: dayStats.avg_importance?.toFixed(1) ?? '—', unit: '/10', color: '#22c55e' },
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
                    <Text className="text-sm font-semibold text-gray-700">{t('todayActivityDistribution')}</Text>
                    <Text className="text-xs font-semibold text-orange-500">
                      {todayMoodScore != null ? `${t('overallMood')} ${todayMoodScore}/10` : t('overallMoodUnrated')}
                    </Text>
                  </View>
                  <Text className="text-xs text-gray-400 mb-3">{t('chartHint')} {t('completedPlanOutlineHint')}</Text>
                  <PleasureImportanceScatter records={dayStats.records} plannedActivities={plannedActivities} />
                </View>

                {radarData && (
                  <View className="bg-white rounded-2xl p-4 mb-4">
                    <Text className="text-sm font-semibold text-gray-700 mb-1">{t('lifeDomainDistribution')}</Text>
                    <Text className="text-xs text-gray-400 mb-3">{t('todayDomainsCovered')}</Text>
                    <RadarChart data={radarData} />
                  </View>
                )}
              </View>
            )}

            {!loading && statsTab === 'week' && weekStats && (
              <View>
                <View className="flex-row gap-3 mb-5">
                  {[
                    { label: t('weekRecords'), value: weekStats.total_count, unit: '', color: '#f97316' },
                    { label: t('avgPleasure'), value: weekStats.avg_pleasure?.toFixed(1) ?? '—', unit: '/10', color: '#6366f1' },
                    { label: t('avgImportance'), value: weekStats.avg_importance?.toFixed(1) ?? '—', unit: '/10', color: '#22c55e' },
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
                  <Text className="text-sm font-semibold text-gray-700 mb-1">{t('weekActivityDistribution')}</Text>
                  <Text className="text-xs text-gray-400 mb-3">
                    {t('weekBaHint')}
                  </Text>
                  <PleasureImportanceScatter records={weekRecords} plannedActivities={plannedActivities} />
                </View>

                {radarData && (
                  <View className="bg-white rounded-2xl p-4 mb-4">
                    <Text className="text-sm font-semibold text-gray-700 mb-1">{t('lifeDomainDistribution')}</Text>
                    <Text className="text-xs text-gray-400 mb-3">{t('weekDomainsCovered')}</Text>
                    <RadarChart data={radarData} />
                  </View>
                )}
              </View>
            )}

            {!loading && statsTab === 'month' && monthStats && (
              <View>
                <View className="flex-row gap-3 mb-5">
                  {[
                    { label: t('monthRecords'), value: monthStats.total_count, unit: '', color: '#f97316' },
                    { label: t('avgPleasure'), value: monthStats.avg_pleasure?.toFixed(1) ?? '—', unit: '/10', color: '#6366f1' },
                    { label: t('avgImportance'), value: monthStats.avg_importance?.toFixed(1) ?? '—', unit: '/10', color: '#22c55e' },
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
                  <Text className="text-sm font-semibold text-gray-700 mb-1">{t('monthlyMoodTrend')}</Text>
                  <Text className="text-xs text-gray-400 mb-3">{t('monthlyMoodTrendHint')}</Text>
                  <MoodLineChart
                    data={monthStats.daily_data.map(day => ({
                      label: `${new Date(day.date + 'T00:00:00').getMonth() + 1}/${new Date(day.date + 'T00:00:00').getDate()}`,
                      mood: day.daily_mood_score,
                    }))}
                    showEvery={5}
                  />
                </View>

                {plannedActivities.length > 0 && (
                  <View className="bg-white rounded-2xl p-4 mb-4">
                    <Text className="text-sm font-semibold text-gray-700 mb-1">{t('monthlyPlannedActivities')}</Text>
                    <Text className="text-xs text-gray-400 mb-3">{t('monthlyPlannedHint')}</Text>
                    <PlanListSection plannedActivities={plannedActivities} />
                  </View>
                )}

                {radarData && (
                  <View className="bg-white rounded-2xl p-4 mb-4">
                    <Text className="text-sm font-semibold text-gray-700 mb-1">{t('lifeDomainDistribution')}</Text>
                    <Text className="text-xs text-gray-400 mb-3">{t('monthDomainsCovered')}</Text>
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
