import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, ScrollView,
  KeyboardAvoidingView, Platform, Modal, Pressable,
  ActivityIndicator, Alert, useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import Svg, { Circle, G, Line, Rect, Text as SvgText } from 'react-native-svg';
import XiaoNuan from '../components/XiaoNuan';
import RecordModal from '../components/RecordModal';
import { api, isAiAccessRequiredError } from '../src/api';
import { AppLanguage, translateDomainName, useLanguage } from '../src/i18n';
import { useUserId } from '../src/userStore';
import type {
  ChatMessage, ChatSession, TreatmentProgressData, LifeDomain,
  MoodRecord, Value, Activity, PlannedActivity,
} from '../src/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(isoString: string, language: AppLanguage) {
  const d = new Date(isoString);
  if (language === 'en') {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  const month = d.getMonth() + 1;
  const day = d.getDate();
  return `${month}月${day}日`;
}

// ── Crisis modal ──────────────────────────────────────────────────────────────
function CrisisModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { language, t } = useLanguage();
  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View className="flex-1 bg-black/50 justify-center px-4">
        <View className="bg-red-50 rounded-3xl p-8">
          <Text className="text-xl font-bold text-red-800 text-center mb-4">{t('crisisTitle')}</Text>
          {[
            [language === 'en' ? 'National mental health support hotline' : '全国统一心理援助热线', '12356'],
            [language === 'en' ? 'Beijing crisis intervention center' : '北京心理危机干预中心', '010-82951332'],
            [language === 'en' ? 'Hope 24 hotline' : '希望24热线', '400-161-9995'],
            [language === 'en' ? 'Lifeline China (10 AM-10 PM)' : 'Lifeline China（10:00-22:00）', '400-821-1215'],
          ].map(([label, num]) => (
            <View key={num} className="px-4 py-3 bg-white rounded-2xl flex-row justify-between mb-2">
              <Text className="text-sm text-gray-500">{label}</Text>
              <Text className="font-bold text-red-600">{num}</Text>
            </View>
          ))}
          <Text className="text-sm text-red-700 text-center my-4">{t('crisisEmergency')}</Text>
          <TouchableOpacity onPress={onClose} className="py-3 bg-red-500 rounded-full items-center">
            <Text className="text-white font-medium">{t('crisisAcknowledge')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ── Activity banner ───────────────────────────────────────────────────────────
function ActivityBanner({
  name, type, onRecord, onPlan, onDismiss,
}: { name: string; type: 'completed' | 'planned'; onRecord: () => void; onPlan: () => void; onDismiss: () => void }) {
  const { language, t } = useLanguage();
  return (
    <View className="mx-4 mb-2 bg-orange-50 border border-orange-200 rounded-2xl px-4 py-3 flex-row items-center gap-3">
      <Text className="text-lg">📋</Text>
      <Text className="flex-1 text-xs text-orange-700 font-medium">
        {type === 'completed'
          ? language === 'en' ? `${t('askRecordActivity')} "${name}"?` : `${t('askRecordActivity')}「${name}」吗？`
          : language === 'en' ? `${t('askPlanActivity')} "${name}" ${t('addToScheduleQuestion')}` : `${t('askPlanActivity')}「${name}」${t('addToScheduleQuestion')}`}
      </Text>
      <TouchableOpacity
        onPress={type === 'completed' ? onRecord : onPlan}
        className={`px-3 py-1.5 rounded-xl ${type === 'completed' ? 'bg-orange-500' : 'bg-indigo-500'}`}
      >
        <Text className="text-white text-xs font-medium">{type === 'completed' ? t('record') : t('plan')}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onDismiss}>
        <Text className="text-gray-400 text-sm">✕</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Quick plan modal ──────────────────────────────────────────────────────────
function QuickPlanModal({ defaultName, onClose }: { defaultName: string; onClose: () => void }) {
  const userId = useUserId();
  const { language, t } = useLanguage();
  const [name, setName] = useState(defaultName);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [libraryActivities, setLibraryActivities] = useState<Activity[]>([]);
  const [domains, setDomains] = useState<LifeDomain[]>([]);
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);
  const [selectedDomainId, setSelectedDomainId] = useState<string | null>(null);
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const [date, setDate] = useState(fmt(tomorrow));

  useEffect(() => {
    api.getDomains(userId).then(setDomains).catch(() => {});
  }, [userId]);

  const handleNameChange = (text: string) => {
    setName(text);
    setSelectedActivity(null);
  };

  const chooseActivity = (activity: Activity) => {
    setName(activity.name);
    setSelectedActivity(activity);
    setSelectedDomainId(activity.life_domain_id ?? null);
    setShowLibrary(false);
  };

  const chooseDomain = (domainId: string | null) => {
    setSelectedDomainId(domainId);
    if (selectedActivity && selectedActivity.life_domain_id !== domainId) {
      setSelectedActivity(null);
    }
  };

  const submit = async () => {
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    try {
      await api.createPlanned({
        activity_name: name.trim(),
        scheduled_date: date,
        activity_id: selectedActivity?.id,
        life_domain_id: selectedActivity?.life_domain_id ?? selectedDomainId ?? undefined,
        value_id: selectedActivity?.value_id,
        user_id: userId,
      });
      setDone(true);
      setTimeout(onClose, 1500);
    } finally { setSubmitting(false); }
  };

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <Pressable className="flex-1" onPress={onClose} />
      <View className="bg-white rounded-t-3xl px-6 pt-6 pb-10">
        {done ? (
          <View className="items-center py-8">
            <Text className="text-4xl mb-2">📅</Text>
            <Text className="font-semibold text-gray-800">{t('plannedAdded')}</Text>
          </View>
        ) : (
          <>
            <Text className="font-bold text-gray-800 text-base mb-4">{t('planThisActivity')}</Text>
            <TextInput value={name} onChangeText={handleNameChange} autoFocus
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-800 mb-4"
            />
            <TouchableOpacity
              onPress={() => {
                setShowLibrary(v => !v);
                if (!showLibrary) api.getActivities(userId).then(setLibraryActivities).catch(() => {});
              }}
            >
              <Text className="text-xs text-indigo-500 mb-3">
                {showLibrary ? t('collapseLibrary') : t('chooseFromLibrary')}
              </Text>
            </TouchableOpacity>
            {showLibrary && (
              <View className="border border-gray-200 rounded-xl mb-4 max-h-32 overflow-hidden">
                <ScrollView>
                  {libraryActivities.length === 0
                    ? <Text className="text-xs text-gray-400 px-3 py-3 text-center">{t('emptyActivityLibrary')}</Text>
                    : libraryActivities.map(activity => (
                        <TouchableOpacity
                          key={activity.id}
                          onPress={() => chooseActivity(activity)}
                          className="px-3 py-2.5 border-b border-gray-100"
                        >
                          <Text className="text-sm text-gray-700">{activity.name}</Text>
                        </TouchableOpacity>
                      ))
                  }
                </ScrollView>
              </View>
            )}
            {domains.length > 0 && (
              <>
                <Text className="text-xs font-medium text-gray-500 mb-2">{t('lifeDomainOptional')}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4">
                  <View className="flex-row gap-2">
                    <TouchableOpacity
                      onPress={() => chooseDomain(null)}
                      className="px-3 py-2 rounded-xl border"
                      style={{
                        backgroundColor: selectedDomainId === null ? '#6366f1' : '#fff',
                        borderColor: selectedDomainId === null ? '#6366f1' : '#e5e7eb',
                      }}
                    >
                      <Text style={{ color: selectedDomainId === null ? '#fff' : '#4b5563' }} className="text-xs font-medium">
                        {t('other')}
                      </Text>
                    </TouchableOpacity>
                    {domains.map(domain => (
                      <TouchableOpacity
                        key={domain.id}
                        onPress={() => chooseDomain(domain.id)}
                        className="px-3 py-2 rounded-xl border"
                        style={{
                          backgroundColor: selectedDomainId === domain.id ? '#6366f1' : '#fff',
                          borderColor: selectedDomainId === domain.id ? '#6366f1' : '#e5e7eb',
                        }}
                      >
                        <Text style={{ color: selectedDomainId === domain.id ? '#fff' : '#4b5563' }} className="text-xs font-medium">
                          {translateDomainName(domain.name, language)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </>
            )}
            <View className="flex-row gap-2 mb-5">
              {[fmt(new Date()), fmt(tomorrow)].map(d => (
                <TouchableOpacity key={d} onPress={() => setDate(d)}
                  className={`px-4 py-2 rounded-xl border ${date === d ? 'bg-indigo-500 border-indigo-500' : 'bg-white border-gray-200'}`}>
                  <Text className={`text-sm font-medium ${date === d ? 'text-white' : 'text-gray-600'}`}>
                    {d === fmt(new Date()) ? t('today') : language === 'en' ? 'Tomorrow' : '明天'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity onPress={submit} disabled={!name.trim() || submitting}
              className="w-full py-4 bg-indigo-500 rounded-2xl items-center">
              {submitting ? <ActivityIndicator color="white" /> : <Text className="text-white font-semibold">{t('ok')}</Text>}
            </TouchableOpacity>
          </>
        )}
      </View>
    </Modal>
  );
}

// ── Typing dots ───────────────────────────────────────────────────────────────
function TypingDots() {
  return (
    <View className="flex-row items-end gap-2 mb-4">
      <XiaoNuan size={32} />
      <View className="bg-white rounded-2xl rounded-bl px-4 py-3 shadow-sm flex-row gap-1 items-center">
        {[0, 1, 2].map(i => (
          <View key={i} className="w-1.5 h-1.5 bg-gray-400 rounded-full" />
        ))}
      </View>
    </View>
  );
}

// ── Message bubble ────────────────────────────────────────────────────────────
function Bubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === 'user';
  return (
    <View className={`flex-row items-end gap-2 mb-4 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {!isUser && <XiaoNuan size={32} />}
      <View
        className={`max-w-[75%] px-4 py-3 rounded-2xl ${
          isUser ? 'bg-orange-500 rounded-br-sm' : 'bg-white shadow-sm rounded-bl-sm'
        }`}
      >
        <Text className={`text-sm leading-relaxed ${isUser ? 'text-white' : 'text-gray-700'}`}>
          {msg.content}
        </Text>
      </View>
    </View>
  );
}

// ── S2 inline cards ──────────────────────────────────────────────────────────

type S2ActionMessage = (msg: string) => void;

function S2ScatterCard({
  progress, userId, includePlans = false, title,
}: {
  progress: TreatmentProgressData | null;
  userId: string;
  includePlans?: boolean;
  title?: string;
}) {
  const { t } = useLanguage();
  const [records, setRecords] = useState<MoodRecord[]>([]);
  const [plans, setPlans] = useState<PlannedActivity[]>([]);
  const [loading, setLoading] = useState(false);
  const { width } = useWindowDimensions();

  useEffect(() => {
    if (!progress?.phase_scatter_start_date || !progress.phase_scatter_end_date) return;
    setLoading(true);
    const start = progress.phase_scatter_start_date;
    const end = progress.phase_scatter_end_date;
    Promise.all([
      api.listRecordsRange(start, end, userId, 80).catch(() => []),
      includePlans ? api.listPlannedRange(start, end, userId).catch(() => []) : Promise.resolve([]),
    ])
      .then(([nextRecords, nextPlans]) => {
        setRecords(nextRecords);
        setPlans(nextPlans);
      })
      .catch(() => {
        setRecords([]);
        setPlans([]);
      })
      .finally(() => setLoading(false));
  }, [progress?.phase_scatter_start_date, progress?.phase_scatter_end_date, userId, includePlans]);

  const chartW = Math.max(280, width - 64);
  const chartH = 250;
  const PL = 34, PR = 18, PT = 24, PB = 34;
  const innerW = chartW - PL - PR;
  const innerH = chartH - PT - PB;
  const scored = records
    .filter(r => r.pleasure_score != null && r.importance_score != null)
    .map((record, index) => ({ record, index: index + 1 }));
  const completedPlanIds = new Set(plans.filter(p => p.completed).map(p => p.id));
  const incompletePlans = plans.filter(p => !p.completed);
  const completedPlansWithoutPoint = plans.filter(
    p => p.completed && !scored.some(({ record }) => record.planned_activity_id === p.id),
  );

  const clamp = (v: number) => Math.max(0, Math.min(10, v));
  const xOf = (v: number) => PL + (clamp(v) / 10) * innerW;
  const yOf = (v: number) => PT + innerH - (clamp(v) / 10) * innerH;
  const quadrants = [
    { key: 'highBoth', label: t('highPleasureHighImportance'), color: '#16a34a' },
    { key: 'importantOnly', label: t('lowPleasureHighImportance'), color: '#6366f1' },
    { key: 'pleasantOnly', label: t('highPleasureLowImportance'), color: '#f97316' },
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
    else if (pleasure < 5 && importance >= 5) grouped.importantOnly.push(item);
    else if (pleasure >= 5 && importance < 5) grouped.pleasantOnly.push(item);
    else grouped.lowBoth.push(item);
  });

  return (
    <View className="bg-white rounded-2xl border border-orange-100 px-4 py-4 mb-3">
      <Text className="text-xs font-semibold text-orange-500 mb-1">{title ?? t('previousPhaseDistribution')}</Text>
      <Text className="text-xs text-gray-400 mb-3">
        {t('chartHint')}{includePlans ? ` ${t('completedPlanOutlineHint')}` : ''}
      </Text>
      {loading ? (
        <View className="py-8 items-center"><ActivityIndicator color="#f97316" /></View>
      ) : scored.length === 0 ? (
        <View className="py-8 items-center">
          <Text className="text-sm text-gray-400">{t('noScoredRecords')}</Text>
        </View>
      ) : (
        <>
          <Svg width={chartW} height={chartH}>
            <Rect x={PL} y={PT} width={innerW} height={innerH} fill="#f9fafb" />
            <Rect x={xOf(5)} y={PT} width={innerW / 2} height={innerH / 2} fill="#ecfdf5" opacity={0.75} />
            <Rect x={PL} y={PT} width={innerW / 2} height={innerH / 2} fill="#eef2ff" opacity={0.58} />
            <Rect x={xOf(5)} y={yOf(5)} width={innerW / 2} height={innerH / 2} fill="#fff7ed" opacity={0.7} />
            <Rect x={PL} y={yOf(5)} width={innerW / 2} height={innerH / 2} fill="#f9fafb" opacity={0.76} />
            {[0, 5, 10].map(v => (
              <G key={v}>
                <Line x1={xOf(v)} y1={PT} x2={xOf(v)} y2={PT + innerH} stroke="#e5e7eb" strokeWidth={v === 5 ? 1.4 : 1} />
                <Line x1={PL} y1={yOf(v)} x2={PL + innerW} y2={yOf(v)} stroke="#e5e7eb" strokeWidth={v === 5 ? 1.4 : 1} />
                <SvgText x={xOf(v)} y={chartH - 12} fontSize={9} fill="#9ca3af" textAnchor="middle">{v}</SvgText>
                <SvgText x={PL - 8} y={yOf(v) + 3} fontSize={9} fill="#9ca3af" textAnchor="end">{v}</SvgText>
              </G>
            ))}
            <SvgText x={PL + innerW / 2} y={chartH - 2} fontSize={10} fill="#6b7280" textAnchor="middle">{t('pleasureShort')}</SvgText>
            <SvgText x={12} y={PT + innerH / 2} fontSize={10} fill="#6b7280" textAnchor="middle" rotation="-90" origin={`12, ${PT + innerH / 2}`}>{t('importanceShort')}</SvgText>
            <SvgText x={PL + innerW * 0.25} y={PT + 14} fontSize={9} fill="#6366f1" textAnchor="middle">{t('lowPleasureHighImportance')}</SvgText>
            <SvgText x={PL + innerW * 0.75} y={PT + 14} fontSize={9} fill="#16a34a" textAnchor="middle">{t('highPleasureHighImportance')}</SvgText>
            <SvgText x={PL + innerW * 0.25} y={PT + innerH - 8} fontSize={9} fill="#9ca3af" textAnchor="middle">{t('lowPleasureLowImportance')}</SvgText>
            <SvgText x={PL + innerW * 0.75} y={PT + innerH - 8} fontSize={9} fill="#f97316" textAnchor="middle">{t('highPleasureLowImportance')}</SvgText>
            {scored.map(({ record, index }) => {
              const x = xOf(record.pleasure_score ?? 0);
              const y = yOf(record.importance_score ?? 0);
              const isCompletedPlan = !!record.planned_activity_id && completedPlanIds.has(record.planned_activity_id);
              return (
                <G key={`${record.id}-${index}`}>
                  <Circle cx={x} cy={y} r={7} fill="#fb923c" opacity={0.2} />
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
                    <View key={`${record.id}-legend-${index}`} className="flex-row items-center mb-1.5">
                      <Text className="text-xs font-bold text-orange-500 w-5">{index}</Text>
                      <Text className="text-xs text-gray-600 flex-1" numberOfLines={1}>{record.activity || t('activity')}</Text>
                      {isCompletedPlan && <Text className="text-[10px] text-green-700 bg-green-50 px-1.5 py-0.5 rounded-md mr-1">{t('completedPlan')}</Text>}
                      <Text className="text-xs text-gray-400">{t('pleasureShort')} {record.pleasure_score} · {t('importanceShort')} {record.importance_score}</Text>
                    </View>
                  );
                }) : (
                  <Text className="text-xs text-gray-300 mb-1.5">{t('noActivities')}</Text>
                )}
              </View>
            ))}
          </View>
        </>
      )}
      {includePlans && !loading && (
        <View className="border-t border-gray-100 pt-3 mt-1">
          <Text className="text-xs font-semibold text-gray-500 mb-2">{t('incompletePlans')}</Text>
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
      )}
    </View>
  );
}

function S2DomainCard({
  userId, selected, onSelect, onSubmitMessage,
}: { userId: string; selected: LifeDomain | null; onSelect: (d: LifeDomain) => void; onSubmitMessage: S2ActionMessage }) {
  const { language, t } = useLanguage();
  const [domains, setDomains] = useState<LifeDomain[]>([]);

  useEffect(() => {
    api.getDomains(userId).then(setDomains).catch(() => setDomains([]));
  }, [userId]);

  const choose = (domain: LifeDomain) => {
    onSelect(domain);
    const displayName = translateDomainName(domain.name, language);
    onSubmitMessage(language === 'en'
      ? `I want to start with the "${displayName}" life domain`
      : `我想先从「${domain.name}」这个生活领域开始`);
  };

  return (
    <View className="bg-white rounded-2xl border border-indigo-100 px-4 py-4 mb-3">
      <Text className="text-xs font-semibold text-indigo-500 mb-1">{t('chooseLifeDomain')}</Text>
      <Text className="text-xs text-gray-400 mb-3">{t('chooseLifeDomainHint')}</Text>
      <View className="flex-row flex-wrap gap-2">
        {domains.map(d => {
          const active = selected?.id === d.id;
          return (
            <TouchableOpacity
              key={d.id}
              onPress={() => choose(d)}
              className="px-3 py-2 rounded-xl border"
              style={{ backgroundColor: active ? '#6366f1' : '#fff', borderColor: active ? '#6366f1' : '#e5e7eb' }}
            >
              <Text style={{ color: active ? '#fff' : '#4b5563' }} className="text-sm font-medium">{translateDomainName(d.name, language)}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function S2ValueCard({
  userId, domain, savedValue, onSaved, onSubmitMessage, onProgressRefresh,
}: {
  userId: string;
  domain: LifeDomain | null;
  savedValue: Value | null;
  onSaved: (v: Value) => void;
  onSubmitMessage: S2ActionMessage;
  onProgressRefresh: () => void;
}) {
  const { language, t } = useLanguage();
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!domain || !text.trim() || saving) return;
    setSaving(true);
    try {
      const value = await api.createValue(domain.id, text.trim(), userId);
      onSaved(value);
      onProgressRefresh();
      onSubmitMessage(language === 'en'
        ? `[Value entered] Domain: ${translateDomainName(domain.name, language)}. Value: ${text.trim()}`
        : `【已填写价值观】领域：${domain.name}，价值观：${text.trim()}`);
      setText('');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View className="bg-white rounded-2xl border border-indigo-100 px-4 py-4 mb-3" style={{ opacity: domain ? 1 : 0.5 }}>
      <Text className="text-xs font-semibold text-indigo-500 mb-1">{t('writeValue')}</Text>
      <Text className="text-xs text-gray-400 mb-3">{domain ? `${t('currentDomain')}: ${translateDomainName(domain.name, language)}` : t('chooseDomainFirst')}</Text>
      {savedValue ? (
        <View className="bg-indigo-50 rounded-xl px-3 py-3">
          <Text className="text-xs text-indigo-400 mb-1">{t('saved')}</Text>
          <Text className="text-sm text-gray-700">{savedValue.content}</Text>
        </View>
      ) : (
        <>
          <TextInput
            value={text}
            onChangeText={setText}
            editable={!!domain && !saving}
            placeholder={language === 'en' ? 'For example: taking care of my body and energy' : '例如：照顾好自己的身体和状态'}
            placeholderTextColor="#9ca3af"
            multiline
            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-800 mb-3"
            style={{ minHeight: 44, maxHeight: 96, textAlignVertical: 'top' }}
          />
          <TouchableOpacity
            onPress={submit}
            disabled={!domain || !text.trim() || saving}
            className="w-full py-3 bg-indigo-500 rounded-xl items-center"
            style={{ opacity: (!domain || !text.trim() || saving) ? 0.4 : 1 }}
          >
            {saving ? <ActivityIndicator color="white" /> : <Text className="text-white font-semibold text-sm">{t('saveValue')}</Text>}
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

function S2ActivityCard({
  userId, domain, value, savedActivity, onSaved, onSubmitMessage, onProgressRefresh,
}: {
  userId: string;
  domain: LifeDomain | null;
  value: Value | null;
  savedActivity: Activity | null;
  onSaved: (a: Activity) => void;
  onSubmitMessage: S2ActionMessage;
  onProgressRefresh: () => void;
}) {
  const { language, t } = useLanguage();
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!text.trim() || !domain || !value || saving) return;
    setSaving(true);
    try {
      const activity = await api.createActivity({
        name: text.trim(),
        life_domain_id: domain.id,
        value_id: value.id,
        user_id: userId,
      });
      onSaved(activity);
      onProgressRefresh();
      onSubmitMessage(language === 'en'
        ? `[Activity entered] ${text.trim()} (domain: ${translateDomainName(domain.name, language)})`
        : `【已填写活动】${text.trim()}（领域：${domain.name}）`);
      setText('');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View className="bg-white rounded-2xl border border-orange-100 px-4 py-4 mb-3" style={{ opacity: value ? 1 : 0.5 }}>
      <Text className="text-xs font-semibold text-orange-500 mb-1">{t('addStartableActivity')}</Text>
      <Text className="text-xs text-gray-400 mb-3">{t('startableActivityHint')}</Text>
      {savedActivity ? (
        <View className="bg-orange-50 rounded-xl px-3 py-3">
          <Text className="text-xs text-orange-400 mb-1">{t('addedToLibrary')}</Text>
          <Text className="text-sm text-gray-700">{savedActivity.name}</Text>
        </View>
      ) : (
        <>
          <TextInput
            value={text}
            onChangeText={setText}
            editable={!!value && !saving}
            placeholder={language === 'en' ? 'For example: walk for 15 minutes tomorrow evening' : '例如：明天晚上散步15分钟'}
            placeholderTextColor="#9ca3af"
            multiline
            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-800 mb-3"
            style={{ minHeight: 44, maxHeight: 96, textAlignVertical: 'top' }}
          />
          <TouchableOpacity
            onPress={submit}
            disabled={!value || !text.trim() || saving}
            className="w-full py-3 bg-orange-500 rounded-xl items-center"
            style={{ opacity: (!value || !text.trim() || saving) ? 0.4 : 1 }}
          >
            {saving ? <ActivityIndicator color="white" /> : <Text className="text-white font-semibold text-sm">{t('addToLibrary')}</Text>}
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

function S2InlineFlow({
  progress, userId, phaseStep, onSubmitMessage, onProgressRefresh,
}: {
  progress: TreatmentProgressData | null;
  userId: string;
  phaseStep: number;
  onSubmitMessage: S2ActionMessage;
  onProgressRefresh: () => void;
}) {
  const { language, t } = useLanguage();
  const { height } = useWindowDimensions();
  const [selectedDomain, setSelectedDomain] = useState<LifeDomain | null>(null);
  const [savedValue, setSavedValue] = useState<Value | null>(null);
  const [savedActivity, setSavedActivity] = useState<Activity | null>(null);
  const [expanded, setExpanded] = useState(true);
  const showScatter = phaseStep <= 0;
  const showSetupCards = phaseStep >= 1;
  const maxPanelHeight = Math.max(170, Math.min(320, Math.round(height * 0.36)));

  if (!showScatter && !showSetupCards) return null;

  let title = t('previousPhaseDistribution');
  let detail = t('chartHint');
  let content: React.ReactNode = <S2ScatterCard progress={progress} userId={userId} />;

  if (showSetupCards) {
    if (!selectedDomain) {
      title = t('chooseLifeDomain');
      detail = t('chooseLifeDomainHint');
      content = (
        <S2DomainCard
          userId={userId}
          selected={selectedDomain}
          onSelect={(d) => {
            setSelectedDomain(d);
            setSavedValue(null);
            setSavedActivity(null);
            setExpanded(true);
          }}
          onSubmitMessage={onSubmitMessage}
        />
      );
    } else if (!savedValue) {
      title = t('writeValue');
      detail = `${t('currentDomain')}: ${translateDomainName(selectedDomain.name, language)}`;
      content = (
        <S2ValueCard
          userId={userId}
          domain={selectedDomain}
          savedValue={savedValue}
          onSaved={(value) => {
            setSavedValue(value);
            setExpanded(true);
          }}
          onSubmitMessage={onSubmitMessage}
          onProgressRefresh={onProgressRefresh}
        />
      );
    } else if (!savedActivity) {
      title = t('addStartableActivity');
      detail = savedValue.content;
      content = (
        <S2ActivityCard
          userId={userId}
          domain={selectedDomain}
          value={savedValue}
          savedActivity={savedActivity}
          onSaved={(activity) => {
            setSavedActivity(activity);
            setExpanded(true);
          }}
          onSubmitMessage={onSubmitMessage}
          onProgressRefresh={onProgressRefresh}
        />
      );
    } else {
      title = t('nextStep');
      detail = savedActivity.name;
      content = (
        <View className="bg-green-50 rounded-2xl border border-green-100 px-4 py-3 mb-3">
          <Text className="text-xs font-semibold text-green-600 mb-1">{t('nextStep')}</Text>
          <Text className="text-xs text-gray-600 leading-relaxed">{t('activityInLibraryNext')}</Text>
        </View>
      );
    }
  }

  return (
    <View className="px-3 py-2 bg-orange-50 border-b border-orange-100">
      <TouchableOpacity
        onPress={() => setExpanded(v => !v)}
        activeOpacity={0.85}
        className="bg-white rounded-2xl border border-orange-100 px-4 py-3 flex-row items-center gap-3"
      >
        <View className="flex-1">
          <Text className="text-xs font-semibold text-orange-500 mb-1">{title}</Text>
          <Text className="text-xs text-gray-500" numberOfLines={1}>{detail}</Text>
        </View>
        <Text className="text-xs font-semibold text-orange-500">
          {expanded ? (language === 'en' ? 'Hide' : '收起') : (language === 'en' ? 'Open' : '展开')}
        </Text>
      </TouchableOpacity>

      {expanded && (
        <View className="mt-2" style={{ maxHeight: maxPanelHeight }}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {content}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

function S3InlineFlow({
  progress, userId, phaseStep,
}: {
  progress: TreatmentProgressData | null;
  userId: string;
  phaseStep: number;
}) {
  const { t } = useLanguage();
  const showReviewCard = phaseStep <= 0;

  if (!showReviewCard) return null;

  return (
    <View className="mt-1 mb-2">
      <S2ScatterCard
        progress={progress}
        userId={userId}
        includePlans
        title={t('currentPhaseReview')}
      />
    </View>
  );
}

// ── Treatment Progress Card ───────────────────────────────────────────────────

const INTENT_LABELS: Record<string, string> = {
  'phase:intro':                        '阶段1 · 启动监测',
  'phase:setup':                        '阶段2 · 价值观 × 活动 × 计划',
  'phase:first_review':                 '阶段3 · 首次回顾',
  'phase:review_cycle':                 '阶段回顾',
  'trigger:monitoring_troubleshoot':    '监测疏通',
  'trigger:life_area_balance':          '生活领域平衡',
  'trigger:support_contract_review':    '支持者复习',
  'trigger:values_review':              '价值观复习',
  'trigger:first_plan_completed_celebration': '首次计划完成',
  'trigger:plan_completed_7_celebration':     '计划完成 7 次',
};

const TRIGGER_PREVIEWS: Record<string, string> = {
  monitoring_troubleshoot:  '好几天没看到你的记录了，发生什么了吗？',
  life_area_balance:        '最近你的活动大多集中在某个领域。下次计划时，可以试着给一个被忽略的领域安排一个活动。',
  support_contract_review:  '你用这个 App 已经有一段时间了，可以看看支持者是否还合适，或是否需要新增一位支持者。',
  values_review:            '你之前填写的价值观和活动可以偶尔回头看看。也许可以更新一下。',
  first_plan_completed_celebration: '你完成了第一个计划活动。恭喜你：你已经开始把计划带进真实生活了。',
  plan_completed_7_celebration: '你已经完成了 7 次计划活动。能坚持下来，你真的很棒！你也可以回头看看，哪些活动更容易开始，哪些做完后更有帮助。',
};

const CONVERSATION_TRIGGERS = new Set(['monitoring_troubleshoot']);

function getIntentLabel(intent: string, language: AppLanguage, t: ReturnType<typeof useLanguage>['t']) {
  const labels: Record<string, string> = {
    'phase:intro': 'Phase 1 · Intro',
    'phase:setup': 'Phase 2 · Values × Activities × Plans',
    'phase:first_review': 'Phase 3 · First review',
    'phase:review_cycle': t('currentWeekReview'),
    'trigger:monitoring_troubleshoot': 'Monitoring check-in',
    'trigger:life_area_balance': 'Life domain balance',
    'trigger:support_contract_review': 'Support review',
    'trigger:values_review': 'Values review',
    'trigger:first_plan_completed_celebration': 'First plan completed',
    'trigger:plan_completed_7_celebration': '7 plans completed',
  };
  return language === 'en' ? (labels[intent] ?? intent) : (INTENT_LABELS[intent] ?? intent);
}

function getPhaseHeaderLabel(data: TreatmentProgressData, language: AppLanguage, t: ReturnType<typeof useLanguage>['t']) {
  if (language !== 'en') return data.phase_label;
  const intent = data.phase === 'review_cycle' ? 'phase:review_cycle' : `phase:${data.phase}`;
  return getIntentLabel(intent, language, t);
}

function getTriggerPreview(trigger: string, language: AppLanguage) {
  const previews: Record<string, string> = {
    monitoring_troubleshoot: 'I have not seen records for a few days. What has been happening?',
    life_area_balance: 'Recent activities are concentrated in one domain. Next time, try adding one activity from a neglected domain.',
    support_contract_review: 'You have used the app for a while. It may be worth checking whether your supporters still fit, or whether to add someone new.',
    values_review: 'It may help to revisit your values and activities from time to time, and update them if needed.',
    first_plan_completed_celebration: 'You completed your first planned activity. You are starting to bring plans into real life.',
    plan_completed_7_celebration: 'You have completed 7 planned activities. That persistence matters. You can look back and see what is easiest to start and what helps most.',
  };
  return language === 'en' ? (previews[trigger] ?? trigger) : (TRIGGER_PREVIEWS[trigger] ?? trigger);
}

function TreatmentProgressCard({
  data, userId, onPhaseChanged, onStartIntent,
}: { data: TreatmentProgressData; userId: string; onPhaseChanged: () => void; onStartIntent: (intent: string) => void }) {
  const { language, t } = useLanguage();
  const [showDev, setShowDev] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [pendingTrigger, setPendingTrigger] = useState<string | null>(null);

  const switchPhase = async (phase: string, cycleCount = 1) => {
    setSwitching(true);
    try {
      await api.debugSetPhase(userId, phase, 7, cycleCount);
      setShowDev(false);
      onPhaseChanged();
    } catch { /* ignore */ } finally {
      setSwitching(false);
    }
  };

  const setTrigger = async (trigger: string | null) => {
    try {
      await api.debugSetTrigger(userId, trigger);
      setPendingTrigger(trigger);
    } catch { /* ignore */ }
  };

  const criteriaCount = data.criteria.length;
  const doneCriteria = data.criteria.filter(c => c.done).length;
  const isForever = data.phase === 'review_cycle';

  const summaryText = isForever
    ? language === 'en' ? `Cycle ${data.review_cycle_count} · ongoing` : `第 ${data.review_cycle_count} 轮 · 持续执行中`
    : data.days_until_eligible > 0
      ? language === 'en' ? `${doneCriteria}/${criteriaCount} done · ${data.days_until_eligible} days left` : `${doneCriteria}/${criteriaCount} 项完成 · 还差 ${data.days_until_eligible} 天`
      : data.criteria_met
        ? language === 'en' ? 'Ready to advance' : '条件已达成，等待推进'
        : language === 'en' ? `${doneCriteria}/${criteriaCount} done` : `${doneCriteria}/${criteriaCount} 项完成`;

  return (
    <View className="mx-4 mt-2 mb-1 bg-white border border-orange-100 rounded-2xl overflow-hidden">
      {/* Lightweight header — long-press for dev panel */}
      <TouchableOpacity
        onLongPress={() => setShowDev(v => !v)}
        delayLongPress={800}
        activeOpacity={0.9}
        className="flex-row items-center px-4 py-2.5 gap-2"
      >
        <View className="w-2 h-2 rounded-full bg-orange-400" />
        <Text className="flex-1 text-xs font-medium text-gray-700">{getPhaseHeaderLabel(data, language, t)}</Text>
        {data.active_trigger && (
          <View className="w-2 h-2 rounded-full bg-blue-400 mr-1" />
        )}
        <Text className="text-xs text-gray-400 mr-1">{summaryText}</Text>
      </TouchableOpacity>

      {/* Trigger preview */}
      {data.active_trigger && getTriggerPreview(data.active_trigger, language) && (
        <View className="px-4 pb-2.5 flex-row items-center gap-2">
          <Text className="text-xs text-blue-500 flex-1">
            {language === 'en' ? 'Xiao Nuan' : '小暖'}: {getTriggerPreview(data.active_trigger, language)}
          </Text>
          {CONVERSATION_TRIGGERS.has(data.active_trigger) && (
            <TouchableOpacity
              onPress={() => onStartIntent(`trigger:${data.active_trigger}`)}
              className="px-3 py-1 bg-blue-500 rounded-lg"
            >
              <Text className="text-xs text-white font-medium">{t('startChat')}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
      {!data.active_trigger && (data.recently_triggered ?? []).length > 0 && (
        <View className="px-4 pb-2.5">
          <Text className="text-xs text-gray-400">{t('todayTopicDone')}</Text>
        </View>
      )}

      {/* Dev panel (long-press to reveal) */}
      {showDev && (
        <View className="px-4 py-3 bg-gray-50 border-t border-dashed border-gray-200 gap-2">
          <Text className="text-[10px] text-gray-400 font-medium mb-1">
            {language === 'en' ? 'Developer mode · switch phase' : '🛠 开发者模式 · 切换阶段'}
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {[
              { label: language === 'en' ? 'Phase 1' : '阶段1',  phase: 'intro' },
              { label: language === 'en' ? 'Phase 2' : '阶段2',  phase: 'setup' },
              { label: language === 'en' ? 'Phase 3' : '阶段3',  phase: 'first_review' },
              { label: language === 'en' ? 'Review cycle' : '执行循环', phase: 'review_cycle' },
            ].map(({ label, phase }) => (
              <TouchableOpacity
                key={phase}
                onPress={() => switchPhase(phase)}
                disabled={switching || data.phase === phase}
                className={`px-3 py-1.5 rounded-xl border ${
                  data.phase === phase
                    ? 'bg-orange-100 border-orange-300'
                    : 'bg-white border-gray-200'
                }`}
              >
                <Text className={`text-xs font-medium ${
                  data.phase === phase ? 'text-orange-600' : 'text-gray-500'
                }`}>
                  {data.phase === phase ? `● ${label}` : label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {switching && <Text className="text-[10px] text-gray-400">{language === 'en' ? 'Switching...' : '切换中…'}</Text>}

          <Text className="text-[10px] text-gray-400 font-medium mt-2 mb-1">
            {language === 'en' ? 'Trigger message / chat' : '触发消息 / 对话'}
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {[
              { label: language === 'en' ? 'Monitoring' : '监测疏通',    trigger: 'monitoring_troubleshoot' },
              { label: language === 'en' ? 'Domain balance' : '领域平衡',    trigger: 'life_area_balance' },
              { label: language === 'en' ? 'Support review' : '支持者复习',  trigger: 'support_contract_review' },
              { label: language === 'en' ? 'Values review' : '价值观复习',  trigger: 'values_review' },
              { label: language === 'en' ? 'First completed' : '首次完成',    trigger: 'first_plan_completed_celebration' },
              { label: language === 'en' ? '7 completed' : '完成7次',     trigger: 'plan_completed_7_celebration' },
            ].map(({ label, trigger }) => (
              <TouchableOpacity
                key={trigger}
                onPress={() => setTrigger(pendingTrigger === trigger ? null : trigger)}
                className={`px-3 py-1.5 rounded-xl border ${
                  pendingTrigger === trigger
                    ? 'bg-blue-100 border-blue-300'
                    : 'bg-white border-gray-200'
                }`}
              >
                <Text className={`text-xs font-medium ${
                  pendingTrigger === trigger ? 'text-blue-600' : 'text-gray-500'
                }`}>
                  {pendingTrigger === trigger ? `● ${label}` : label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {pendingTrigger && (
            <Text className="text-[10px] text-blue-400">{language === 'en' ? 'Set: ' : '已设置：'}{pendingTrigger}</Text>
          )}
        </View>
      )}
    </View>
  );
}

// ── History Modal ─────────────────────────────────────────────────────────────
function HistoryModal({
  visible, userId, onClose,
}: { visible: boolean; userId: string; onClose: () => void }) {
  const { language, t } = useLanguage();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [selected, setSelected] = useState<ChatSession | null>(null);
  const [sessionMsgs, setSessionMsgs] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setSelected(null);
    setLoading(true);
    api.listSessions(userId)
      .then(setSessions)
      .catch(() => setSessions([]))
      .finally(() => setLoading(false));
  }, [visible, userId]);

  const openSession = async (s: ChatSession) => {
    setSelected(s);
    setLoading(true);
    try {
      const msgs = await api.getSessionMessages(s.id, userId);
      setSessionMsgs(msgs.map(m => ({ role: m.role, content: m.content })));
    } catch {
      setSessionMsgs([]);
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => setSelected(null);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView className="flex-1 bg-white">
        {/* Header */}
        <View className="flex-row items-center px-4 py-3 border-b border-gray-100">
          {selected ? (
            <TouchableOpacity onPress={handleBack} className="p-2 -ml-2 mr-1">
              <Text className="text-gray-500 text-lg">←</Text>
            </TouchableOpacity>
          ) : null}
          <Text className="flex-1 font-semibold text-gray-800 text-base">
            {selected
              ? (selected.title ?? formatDate(selected.created_at, language))
              : t('chatHistory')}
          </Text>
          <TouchableOpacity onPress={onClose} className="p-2 -mr-2">
            <Text className="text-gray-400 text-xl">✕</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color="#f97316" />
          </View>
        ) : selected ? (
          // Read-only message view
          <FlatList
            data={sessionMsgs}
            keyExtractor={(_, i) => String(i)}
            contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
            ListEmptyComponent={
              <View className="items-center pt-16">
                <Text className="text-gray-400 text-sm">{t('noMessagesInChat')}</Text>
              </View>
            }
            renderItem={({ item }) => <Bubble msg={item} />}
          />
        ) : (
          // Session list
          <FlatList
            data={sessions}
            keyExtractor={s => String(s.id)}
            contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
            ListEmptyComponent={
              <View className="items-center pt-16">
                <XiaoNuan size={56} />
                <Text className="text-gray-400 text-sm mt-4">{t('noChatHistory')}</Text>
              </View>
            }
            renderItem={({ item: s }) => (
              <TouchableOpacity
                onPress={() => openSession(s)}
                className="bg-gray-50 rounded-2xl px-4 py-4 mb-3 active:opacity-70"
              >
                <Text className="font-medium text-gray-800 mb-1" numberOfLines={1}>
                  {s.title ?? t('conversation')}
                </Text>
                <Text className="text-xs text-gray-400" numberOfLines={1}>
                  {formatDate(s.created_at, language)}
                  {s.preview ? `  ·  ${s.preview}` : ''}
                </Text>
              </TouchableOpacity>
            )}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

// ── Main Chatbot ──────────────────────────────────────────────────────────────
export default function ChatbotScreen() {
  const userId = useUserId();
  const { language, t } = useLanguage();
  const { intent: intentParam } = useLocalSearchParams<{ intent?: string }>();

  const [treatmentProgress, setTreatmentProgress] = useState<TreatmentProgressData | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(null);
  const [currentIntent, setCurrentIntent] = useState<string | null>(null);
  const [currentPhaseStep, setCurrentPhaseStep] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [showCrisis, setShowCrisis] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [detectedActivity, setDetectedActivity] = useState<{ type: 'completed' | 'planned'; name: string } | null>(null);
  const [pendingActivityName, setPendingActivityName] = useState('');
  const [showRecord, setShowRecord] = useState(false);
  const [showPlan, setShowPlan] = useState(false);
  const listRef = useRef<FlatList>(null);
  const lastAutoScrolledItemCount = useRef(0);

  // ── Core send ───────────────────────────────────────────────────────────────
  const _sendMessage = useCallback(async (text: string, sessionIdOverride?: number) => {
    const sid = sessionIdOverride ?? currentSessionId;
    if (!sid) return;

    if (text.trim()) {
      setMessages(prev => [...prev, { role: 'user', content: text.trim() }]);
      setInput('');
    }
    setLoading(true);

    try {
      const res = await api.sendChatMessage(sid, text.trim(), userId);
      if (res.is_crisis) setShowCrisis(true);
      setMessages(prev => [...prev, { role: 'assistant', content: res.reply }]);
      if (res.detected_activity) setDetectedActivity(res.detected_activity);
      if (typeof res.phase_step === 'number') setCurrentPhaseStep(res.phase_step);
    } catch (error) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: isAiAccessRequiredError(error) ? t('aiChatAccessMessage') : t('networkRetry'),
      }]);
    } finally {
      setLoading(false);
    }
  }, [currentSessionId, userId, t]);

  // ── Initialization ──────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [state, progress] = await Promise.all([
          api.getChatbotState(userId),
          api.getTreatmentProgress(userId).catch(() => null),
        ]);
        if (cancelled) return;
        setTreatmentProgress(progress);

        // Get or create a session
        let session = await api.getCurrentSession(userId);
        if (!session) {
          session = await api.createChatSession(userId);
        }
        if (cancelled) return;
        setCurrentSessionId(session.id);
        setCurrentIntent(session.session_intent ?? null);
        setCurrentPhaseStep(session.phase_step ?? 0);

        // Load existing messages
        const dbMsgs = await api.getSessionMessages(session.id, userId);
        if (cancelled) return;
        const msgs: ChatMessage[] = dbMsgs.map(m => ({ role: m.role, content: m.content }));
        setMessages(msgs);
        setInitializing(false);

        // Only trigger opening message for first-ever conversation (onboarding)
        if (msgs.length === 0 && state.is_first_conversation) {
          if (cancelled) return;
          setLoading(true);
          try {
            const res = await api.sendChatMessage(session.id, '', userId);
            if (cancelled) return;
            if (res.is_crisis) setShowCrisis(true);
            setMessages([{ role: 'assistant', content: res.reply }]);
            if (res.detected_activity) setDetectedActivity(res.detected_activity);
            if (typeof res.phase_step === 'number') setCurrentPhaseStep(res.phase_step);
          } catch (error) {
            setMessages([{
              role: 'assistant',
              content: isAiAccessRequiredError(error) ? t('aiChatAccessMessage') : t('networkRetry'),
            }]);
          } finally {
            setLoading(false);
          }
        }
      } catch {
        if (!cancelled) setInitializing(false);
      }
    })();

    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Start intent conversation ────────────────────────────────────────────────
  const handleStartIntent = async (intent: string) => {
    try {
      const requestedPhase = intent.startsWith('phase:') ? intent.replace('phase:', '') : null;
      if (requestedPhase) {
        const progress = await api.getTreatmentProgress(userId).catch(() => null);
        if (progress) {
          setTreatmentProgress(progress);
          if (progress.phase !== requestedPhase) {
            Alert.alert(t('tip'), language === 'en' ? 'This phase is no longer active.' : '这个阶段已经不是当前阶段。');
            return;
          }
          if (progress.phase_session_done) {
            Alert.alert(t('tip'), language === 'en' ? 'This phase conversation is already completed.' : '本阶段对话已完成。');
            return;
          }
        }
      }
      let session = intent.startsWith('phase:')
        ? await api.getCurrentSession(userId, intent).catch(() => null)
        : null;
      const isResuming = !!session;
      if (!session) {
        session = await api.createChatSession(userId);
      }
      setCurrentSessionId(session.id);
      setCurrentIntent(intent);
      setCurrentPhaseStep(session.phase_step ?? 0);
      setDetectedActivity(null);
      const progress = await api.getTreatmentProgress(userId).catch(() => null);
      setTreatmentProgress(progress);
      const dbMsgs = await api.getSessionMessages(session.id, userId).catch(() => []);
      const msgs: ChatMessage[] = dbMsgs.map(m => ({ role: m.role, content: m.content }));
      setMessages(msgs);
      if (isResuming && msgs.length > 0) return;
      setLoading(true);
      try {
        const res = await api.sendChatMessage(session.id, '', userId, intent);
        if (res.is_crisis) setShowCrisis(true);
        setMessages(prev => [...prev, { role: 'assistant', content: res.reply }]);
        if (res.detected_activity) setDetectedActivity(res.detected_activity);
        if (typeof res.phase_step === 'number') setCurrentPhaseStep(res.phase_step);
      } catch (error) {
        setMessages([{
          role: 'assistant',
          content: isAiAccessRequiredError(error) ? t('aiChatAccessMessage') : t('networkRetry'),
        }]);
      } finally {
        setLoading(false);
      }
    } catch {
      Alert.alert(t('tip'), t('createChatFailed'));
    }
  };

  // Auto-start intent session when navigated from home page with ?intent=
  useEffect(() => {
    if (intentParam && !initializing) {
      handleStartIntent(intentParam);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intentParam, initializing]);

  // ── New conversation ────────────────────────────────────────────────────────
  const handleNewConversation = async () => {
    try {
      const session = await api.createChatSession(userId);
      setCurrentSessionId(session.id);
      setCurrentIntent(null);
      setCurrentPhaseStep(0);
      setMessages([]);
      setDetectedActivity(null);

      const progress = await api.getTreatmentProgress(userId).catch(() => null);
      setTreatmentProgress(progress);

    } catch {
      Alert.alert(t('tip'), t('createChatFailed'));
    }
  };

  const companionName = language === 'en' ? 'Xiao Nuan' : '小暖';
  const allItems: (ChatMessage | 'typing')[] = loading ? [...messages, 'typing'] : messages;

  useEffect(() => {
    if (initializing) return;
    if (allItems.length > lastAutoScrolledItemCount.current) {
      const timer = setTimeout(() => {
        listRef.current?.scrollToEnd({ animated: true });
      }, 80);
      lastAutoScrolledItemCount.current = allItems.length;
      return () => clearTimeout(timer);
    }
    lastAutoScrolledItemCount.current = allItems.length;
  }, [allItems.length, initializing]);
  const phaseListHeader = (() => {
    if (currentIntent === 'phase:setup') {
      return (
        <View className="mb-2">
          <S2InlineFlow
            progress={treatmentProgress}
            userId={userId}
            phaseStep={currentPhaseStep}
            onSubmitMessage={_sendMessage}
            onProgressRefresh={() => api.getTreatmentProgress(userId).then(setTreatmentProgress).catch(() => {})}
          />
        </View>
      );
    }

    if (currentIntent === 'phase:first_review') {
      return (
        <View className="mb-2">
          <S3InlineFlow
            progress={treatmentProgress}
            userId={userId}
            phaseStep={currentPhaseStep}
          />
        </View>
      );
    }

    if (currentIntent === 'phase:review_cycle') {
      return (
        <View className="mb-2">
          <S2ScatterCard
            progress={treatmentProgress}
            userId={userId}
            includePlans
            title={t('currentWeekReview')}
          />
        </View>
      );
    }

    return null;
  })();

  return (
    <SafeAreaView className="flex-1 bg-orange-50" edges={['top', 'bottom']}>
      {/* Header */}
      <View className="flex-row items-center gap-3 px-4 py-3 bg-white border-b border-gray-100">
        <TouchableOpacity onPress={() => router.back()} className="p-2 -ml-1">
          <Text className="text-gray-500 text-lg">←</Text>
        </TouchableOpacity>
        <XiaoNuan size={36} />
        <View className="flex-1">
          <Text className="font-semibold text-gray-800 text-sm">{companionName}</Text>
          {currentIntent ? (
            <Text className="text-xs text-blue-400" numberOfLines={1}>
              {getIntentLabel(currentIntent, language, t)}
            </Text>
          ) : (
            <Text className="text-xs text-gray-400">{t('behaviorActivationPartner')}</Text>
          )}
        </View>
        {/* History button */}
        <TouchableOpacity
          onPress={() => setShowHistory(true)}
          className="px-3 py-1.5 rounded-xl bg-gray-100"
        >
          <Text className="text-xs text-gray-500">{t('history')}</Text>
        </TouchableOpacity>
        {/* New conversation button */}
        <TouchableOpacity
          onPress={handleNewConversation}
          className="px-3 py-1.5 rounded-xl bg-orange-100 ml-1"
        >
          <Text className="text-xs text-orange-600 font-medium">{t('newChat')}</Text>
        </TouchableOpacity>
      </View>

      {/* Treatment progress card */}
      {!initializing && treatmentProgress && (
        <TreatmentProgressCard
          data={treatmentProgress}
          userId={userId}
          onPhaseChanged={() =>
            api.getTreatmentProgress(userId).then(setTreatmentProgress).catch(() => {})
          }
          onStartIntent={handleStartIntent}
        />
      )}

      {/* Body */}
      {initializing ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#f97316" />
        </View>
      ) : (
        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}
        >
          <FlatList
            ref={listRef}
            data={allItems}
            keyExtractor={(_, i) => String(i)}
            contentContainerStyle={{ padding: 16, paddingBottom: 16 }}
            ListHeaderComponent={phaseListHeader}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <View className="items-center pt-16">
                <XiaoNuan size={64} />
                <Text className="text-gray-400 text-sm mt-4">{t('chatEmptyPrompt')}</Text>
              </View>
            }
            renderItem={({ item }) =>
              item === 'typing' ? <TypingDots /> : <Bubble msg={item as ChatMessage} />
            }
          />

          {detectedActivity && (
            <ActivityBanner
              name={detectedActivity.name}
              type={detectedActivity.type}
              onRecord={() => { setPendingActivityName(detectedActivity.name); setDetectedActivity(null); setShowRecord(true); }}
              onPlan={() => { setPendingActivityName(detectedActivity.name); setDetectedActivity(null); setShowPlan(true); }}
              onDismiss={() => setDetectedActivity(null)}
            />
          )}

          <View className="flex-row items-end gap-2 px-4 py-3 bg-white border-t border-gray-100">
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder={t('chatPlaceholder')}
              placeholderTextColor="#9ca3af"
              multiline
              className="flex-1 bg-gray-100 rounded-2xl px-4 py-3 text-sm text-gray-800"
              style={{ maxHeight: 120, textAlignVertical: 'top' }}
              editable={!loading}
              onSubmitEditing={() => { if (input.trim() && !loading) _sendMessage(input); }}
              blurOnSubmit={false}
            />
            <TouchableOpacity
              onPress={() => { if (input.trim() && !loading) _sendMessage(input); }}
              disabled={!input.trim() || loading}
              className="w-11 h-11 rounded-full bg-orange-500 items-center justify-center"
              style={{ opacity: (!input.trim() || loading) ? 0.4 : 1 }}
            >
              <Text className="text-white text-base">↑</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      )}

      <CrisisModal visible={showCrisis} onClose={() => setShowCrisis(false)} />

      <HistoryModal
        visible={showHistory}
        userId={userId}
        onClose={() => setShowHistory(false)}
      />

      {showRecord && (
        <RecordModal
          visible={showRecord}
          onClose={() => { setShowRecord(false); setPendingActivityName(''); }}
          onRecordSubmitted={() => { setShowRecord(false); setPendingActivityName(''); }}
          prefillActivity={pendingActivityName}
          userId={userId}
        />
      )}
      {showPlan && (
        <QuickPlanModal
          defaultName={pendingActivityName}
          onClose={() => { setShowPlan(false); setPendingActivityName(''); }}
        />
      )}
    </SafeAreaView>
  );
}
