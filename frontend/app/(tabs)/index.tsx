import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  Modal, TextInput, Pressable, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import XiaoNuan from '../../components/XiaoNuan';
import RecordModal from '../../components/RecordModal';
import { api } from '../../src/api';
import { AppLanguage, translateDomainName, useLanguage } from '../../src/i18n';
import { useUserId } from '../../src/userStore';
import type { Activity, LifeDomain, TreatmentProgressData, Supporter } from '../../src/types';

function getGreeting(t: ReturnType<typeof useLanguage>['t']): string {
  const h = new Date().getHours();
  if (h < 12) return t('greetingMorning');
  if (h < 18) return t('greetingAfternoon');
  return t('greetingEvening');
}

function getDateString(language: AppLanguage): string {
  const now = new Date();
  if (language === 'en') {
    return now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  }
  const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
  return `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 星期${weekDays[now.getDay()]}`;
}

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ── Plan Modal ────────────────────────────────────────────────────────────────
function PlanModal({ visible, onClose, userId }: { visible: boolean; onClose: () => void; userId: string }) {
  const { language, t } = useLanguage();
  const [name, setName] = useState('');
  const [selectedDate, setSelectedDate] = useState(toDateStr(new Date()));
  const [allDay, setAllDay] = useState(true);
  const [selectedHour, setSelectedHour] = useState(9);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [libraryActivities, setLibraryActivities] = useState<Activity[]>([]);
  const [domains, setDomains] = useState<LifeDomain[]>([]);
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);
  const [selectedDomainId, setSelectedDomainId] = useState<string | null>(null);
  const [supporters, setSupporters] = useState<Supporter[]>([]);
  const [selectedSupporterIds, setSelectedSupporterIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (visible) {
      api.getSupporters(userId).then(setSupporters).catch(() => {});
      api.getDomains(userId).then(setDomains).catch(() => {});
    }
  }, [visible, userId]);

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

  const toggleSupporter = (id: string) => {
    setSelectedSupporterIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else if (next.size < 3) { next.add(id); }
      return next;
    });
  };

  const dateOptions = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() + i);
    const labels = language === 'en' ? ['Today', 'Tomorrow', 'Later'] : ['今天', '明天', '后天'];
    const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
    return {
      date: toDateStr(d),
      label: i < 3
        ? labels[i]
        : language === 'en'
          ? d.toLocaleDateString('en-US', { weekday: 'short' })
          : `周${weekDays[d.getDay()]}`,
    };
  });

  const handleSubmit = async () => {
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    try {
      const planned = await api.createPlanned({
        activity_name: name.trim(),
        scheduled_date: selectedDate,
        scheduled_time: allDay ? undefined : `${String(selectedHour).padStart(2, '0')}:00`,
        activity_id: selectedActivity?.id,
        life_domain_id: selectedActivity?.life_domain_id ?? selectedDomainId ?? undefined,
        value_id: selectedActivity?.value_id,
        user_id: userId,
      });
      await Promise.all(
        [...selectedSupporterIds].map(sid => api.addActivitySupporter(planned.id, sid))
      );
      setDone(true);
      setTimeout(() => {
        setDone(false); setName(''); setAllDay(true); setSelectedHour(9);
        setSelectedActivity(null); setSelectedDomainId(null);
        setSelectedSupporterIds(new Set());
        onClose();
      }, 1600);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable className="flex-1" onPress={onClose} />
      <ScrollView
        className="bg-white rounded-t-3xl"
        bounces={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 40 }}
      >
        {done ? (
          <View className="items-center py-10">
            <Text className="text-5xl mb-3">📅</Text>
            <Text className="font-semibold text-gray-800 text-lg">{t('plannedAdded')}</Text>
          </View>
        ) : (
          <>
            <Text className="text-lg font-bold text-gray-800 mb-5">{t('planOneActivity')}</Text>

            <Text className="text-sm font-medium text-gray-600 mb-2">{t('activityName')}</Text>
            <TextInput
              value={name}
              onChangeText={handleNameChange}
              placeholder={t('activityNamePlaceholder')}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-800 mb-1"
              placeholderTextColor="#9ca3af"
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
                    : libraryActivities.map(a => (
                        <TouchableOpacity
                          key={a.id}
                          onPress={() => chooseActivity(a)}
                          className="px-3 py-2.5 border-b border-gray-100"
                        >
                          <Text className="text-sm text-gray-700">{a.name}</Text>
                        </TouchableOpacity>
                      ))
                  }
                </ScrollView>
              </View>
            )}

            {domains.length > 0 && (
              <>
                <Text className="text-sm font-medium text-gray-600 mb-2">{t('lifeDomainOptional')}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-5">
                  <View className="flex-row gap-2">
                    <TouchableOpacity
                      onPress={() => chooseDomain(null)}
                      className="px-3 py-2 rounded-xl border"
                      style={{
                        backgroundColor: selectedDomainId === null ? '#6366f1' : '#fff',
                        borderColor: selectedDomainId === null ? '#6366f1' : '#e5e7eb',
                      }}
                    >
                      <Text style={{ color: selectedDomainId === null ? '#fff' : '#4b5563' }} className="text-sm font-medium">
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
                        <Text style={{ color: selectedDomainId === domain.id ? '#fff' : '#4b5563' }} className="text-sm font-medium">
                          {translateDomainName(domain.name, language)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </>
            )}

            <Text className="text-sm font-medium text-gray-600 mb-2">{t('date')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-5">
              <View className="flex-row gap-2">
                {dateOptions.map(opt => (
                  <TouchableOpacity
                    key={opt.date}
                    onPress={() => setSelectedDate(opt.date)}
                    className={`px-3 py-2 rounded-xl border ${
                      selectedDate === opt.date
                        ? 'bg-indigo-500 border-indigo-500'
                        : 'bg-white border-gray-200'
                    }`}
                  >
                    <Text className={`text-sm font-medium ${selectedDate === opt.date ? 'text-white' : 'text-gray-600'}`}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <Text className="text-sm font-medium text-gray-600 mb-2">{t('time')}</Text>
            <View className="flex-row gap-2 mb-3">
              {[true, false].map(isAllDay => (
                <TouchableOpacity
                  key={String(isAllDay)}
                  onPress={() => setAllDay(isAllDay)}
                  className="px-4 py-2 rounded-xl border"
                  style={{ backgroundColor: allDay === isAllDay ? '#6366f1' : '#fff', borderColor: allDay === isAllDay ? '#6366f1' : '#e5e7eb' }}
                >
                  <Text style={{ color: allDay === isAllDay ? '#fff' : '#4b5563' }} className="text-sm font-medium">
                    {isAllDay ? t('allDay') : t('specificTime')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {!allDay && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-5">
                <View className="flex-row gap-2">
                  {Array.from({ length: 17 }, (_, i) => i + 6).map(h => (
                    <TouchableOpacity
                      key={h}
                      onPress={() => setSelectedHour(h)}
                      className="px-3 py-2 rounded-xl border"
                      style={{ backgroundColor: selectedHour === h ? '#6366f1' : '#fff', borderColor: selectedHour === h ? '#6366f1' : '#e5e7eb' }}
                    >
                      <Text style={{ color: selectedHour === h ? '#fff' : '#4b5563' }} className="text-sm font-medium">
                        {h}:00
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            )}
            {allDay && <View className="mb-5" />}

            {supporters.length > 0 && (
              <>
                <Text className="text-sm font-medium text-gray-600 mb-1">{t('seekSupportOptional')}</Text>
                <Text className="text-xs text-gray-400 mb-2">{t('seekSupportHint')}</Text>
                <View className="flex-row flex-wrap gap-2 mb-5">
                  {supporters.map(s => {
                    const selected = selectedSupporterIds.has(s.id);
                    return (
                      <TouchableOpacity
                        key={s.id}
                        onPress={() => toggleSupporter(s.id)}
                        className="px-3 py-1.5 rounded-full border"
                        style={{
                          backgroundColor: selected ? '#f97316' : '#fff',
                          borderColor: selected ? '#f97316' : '#e5e7eb',
                        }}
                      >
                        <Text style={{ color: selected ? '#fff' : '#6b7280' }} className="text-sm">
                          {s.name}{s.relationship ? ` · ${s.relationship}` : ''}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}

            <TouchableOpacity
              onPress={handleSubmit}
              disabled={!name.trim() || submitting}
              className="w-full py-4 bg-indigo-500 rounded-2xl items-center"
            >
              {submitting
                ? <ActivityIndicator color="white" />
                : <Text className="text-white font-semibold text-base">{t('confirmPlan')}</Text>
              }
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </Modal>
  );
}

// ── Phase card ────────────────────────────────────────────────────────────────

const PHASE_CONVERSATION: Record<string, string> = {
  intro:        '了解行为激活的原理，开始观察自己的活动与情绪',
  setup:        '探索对你真正重要的事，建立有意义的活动库',
  first_review: '回顾上周执行情况，一起找出障碍和解决方法',
  review_cycle: '每周：回顾进度 → 调整计划 → 安排新的一周',
};

const PHASE_CONVERSATION_EN: Record<string, string> = {
  intro:        'Learn the basics of behavioral activation and start noticing activities and mood',
  setup:        'Explore what matters to you and build a meaningful activity library',
  first_review: 'Review last week, identify obstacles, and find practical next steps',
  review_cycle: 'Weekly rhythm: review progress, adjust plans, and schedule the next week',
};

function phaseLabel(phase: string, cycle: number | null | undefined, language: AppLanguage) {
  if (language !== 'en') return null;
  if (phase === 'intro') return 'Week 1 · Start monitoring';
  if (phase === 'setup') return 'Week 2 · Values × Activities × Plans';
  if (phase === 'first_review') return 'Week 3 · First review';
  if (phase === 'review_cycle') return `Review cycle · Round ${cycle ?? 1}`;
  return null;
}

function criterionLabel(c: TreatmentProgressData['criteria'][number], language: AppLanguage) {
  if (language !== 'en') return c.label;
  const target = c.target ?? 1;
  const labels: Record<string, string> = {
    records: `Submit at least ${target} activity record${target > 1 ? 's' : ''}`,
    values: `Add at least ${target} value${target > 1 ? 's' : ''}`,
    activities: `Add at least ${target} activit${target > 1 ? 'ies' : 'y'} to the library`,
    planned: `Schedule at least ${target} planned activit${target > 1 ? 'ies' : 'y'}`,
    completed: `Complete at least ${target} planned activit${target > 1 ? 'ies' : 'y'}`,
  };
  return labels[c.key] ?? c.label;
}

function PhaseCard({ data, onStartSession, onOpenChat, onAdvance }: {
  data: TreatmentProgressData;
  onStartSession: () => void;
  onOpenChat: () => void;
  onAdvance: () => Promise<void>;
}) {
  const { language, t } = useLanguage();
  const [expanded, setExpanded] = useState(true);
  const [advancing, setAdvancing] = useState(false);
  const doneCriteria = data.criteria.filter(c => c.done).length;
  const totalCriteria = data.criteria.length;
  const canManualAdvance = data.manual_advance_enabled && data.can_advance && data.phase !== 'review_cycle';
  const hasTaskRequirement = data.tasks_required !== false;
  const phaseDays = data.days_required === null
    ? data.phase_days
    : Math.min(data.phase_days, data.days_required);
  const requirementParts = [t('phaseRequirementConversation')];
  if (hasTaskRequirement) requirementParts.push(t('phaseRequirementTasks'));
  const requirementText = data.days_required === null
    ? language === 'en'
      ? `${requirementParts.join(' and ')} ${t('phaseRequirementNoDays')}`
      : `${requirementParts.join('、')}${t('phaseRequirementNoDays')}`
    : language === 'en'
      ? `${requirementParts.join(' and ')}, plus ${phaseDays}/${data.days_required} days, before moving to the next phase`
      : `${requirementParts.join('、')}，并经过 ${phaseDays}/${data.days_required} 天后，可进入下一阶段`;

  const handleAdvance = async () => {
    setAdvancing(true);
    try { await onAdvance(); } finally { setAdvancing(false); }
  };

  return (
    <View className="w-full bg-white rounded-2xl border border-orange-100 mb-6 overflow-hidden">
      {/* Header */}
      <TouchableOpacity
        onPress={() => setExpanded(e => !e)}
        activeOpacity={0.7}
        className="flex-row items-center px-5 pt-4 pb-3 gap-2"
      >
        <View className="w-2 h-2 rounded-full bg-orange-400" />
        <Text className="flex-1 text-xs font-semibold text-orange-500">{phaseLabel(data.phase, data.review_cycle_count, language) ?? data.phase_label}</Text>
        {totalCriteria > 0 && (
          <Text className="text-xs text-gray-400 mr-1">{doneCriteria}/{totalCriteria}</Text>
        )}
        <Text className="text-gray-300 text-xs">{expanded ? '▲' : '▼'}</Text>
      </TouchableOpacity>

      {expanded && (
        <View className="px-4 pb-4 gap-3">
          {/* 本阶段会话 */}
          <View className="bg-orange-50 rounded-xl border border-orange-100 px-4 py-3">
            <Text className="text-[11px] font-semibold text-orange-400 mb-1">{t('phaseConversation')}</Text>
            <Text className="text-xs text-gray-500 leading-relaxed mb-3">
              {(language === 'en' ? PHASE_CONVERSATION_EN : PHASE_CONVERSATION)[data.phase]}
            </Text>
            {data.phase_session_done ? (
              <Text className="text-xs text-green-500 font-medium">✓ {t('completed')}</Text>
            ) : (
              <TouchableOpacity
                onPress={onStartSession}
                activeOpacity={0.85}
                className="py-2.5 bg-orange-500 rounded-xl items-center"
              >
                <Text className="text-white text-xs font-semibold">{t('startPhaseChat')}</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* 本阶段任务 */}
          {data.criteria.length > 0 && (
            <View className="bg-gray-50 rounded-xl border border-gray-100 px-4 py-3">
              <Text className="text-[11px] font-semibold text-gray-400 mb-2">{t('phaseTasks')}</Text>
              <View className="gap-2">
                {data.criteria.map(c => (
                  <View key={c.key} className="flex-row items-center gap-2">
                    <View className={`w-4 h-4 rounded-full items-center justify-center ${c.done ? 'bg-green-400' : 'bg-gray-200'}`}>
                      {c.done && <Text className="text-white text-[9px] font-bold">✓</Text>}
                    </View>
                    <Text className={`text-xs flex-1 ${c.done ? 'text-gray-400 line-through' : 'text-gray-600'}`}>
                      {criterionLabel(c, language)}
                    </Text>
                    {c.target !== undefined && c.target > 1 && (
                      <Text className="text-xs text-gray-400">{c.current}/{c.target}</Text>
                    )}
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* 进入下一阶段 */}
          {data.phase !== 'review_cycle' && (
            <View className="bg-gray-50 rounded-xl border border-gray-100 px-4 py-3">
              {canManualAdvance ? (
                <TouchableOpacity
                  onPress={handleAdvance}
                  disabled={advancing}
                  activeOpacity={0.85}
                  className="py-2.5 bg-indigo-500 rounded-xl items-center"
                >
                  <Text className="text-white text-xs font-semibold">
                    {advancing ? t('processing') : t('advancePhase')}
                  </Text>
                </TouchableOpacity>
              ) : (
                <Text className="text-xs text-gray-400 leading-relaxed">{requirementText}</Text>
              )}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

// ── Crisis modal ──────────────────────────────────────────────────────────────
function CrisisModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { language, t } = useLanguage();
  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View className="flex-1 bg-black/50 justify-center px-4">
        <View className="bg-red-50 rounded-3xl p-8">
          <View className="w-14 h-14 mx-auto mb-5 rounded-full bg-red-100 items-center justify-center">
            <Text className="text-2xl">⚠️</Text>
          </View>
          <Text className="text-xl font-bold text-red-800 text-center mb-3">{t('crisisTitle')}</Text>
          {[
            [language === 'en' ? 'National mental health support hotline' : '全国心理援助热线', '400-161-9995'],
            [language === 'en' ? 'Beijing crisis intervention center' : '北京心理危机干预中心', '010-82951332'],
            [language === 'en' ? 'Lifeline' : '生命热线', '400-821-1215'],
          ].map(([label, num]) => (
            <View key={num} className="px-4 py-3 bg-white rounded-2xl flex-row justify-between items-center mb-2">
              <Text className="text-sm text-gray-500">{label}</Text>
              <Text className="font-bold text-red-600">{num}</Text>
            </View>
          ))}
          <Text className="text-sm text-red-700 text-center my-4">{t('crisisEmergency')}</Text>
          <TouchableOpacity onPress={onClose} className="w-full py-3 rounded-full bg-red-500 items-center">
            <Text className="text-white font-medium">{t('crisisAcknowledge')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ── Home ──────────────────────────────────────────────────────────────────────
export default function HomeScreen() {
  const userId = useUserId();
  const { language, t } = useLanguage();
  const [recordVisible, setRecordVisible] = useState(false);
  const [planVisible, setPlanVisible] = useState(false);
  const [crisisVisible, setCrisisVisible] = useState(false);
  const [feedback, setFeedback] = useState(t('defaultFeedback'));
  const [treatmentProgress, setTreatmentProgress] = useState<TreatmentProgressData | null>(null);
  const [progressLoading, setProgressLoading] = useState(true);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressRetryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;

    const loadProgress = async () => {
      try {
        const progress = await api.getTreatmentProgress(userId);
        if (!cancelled) {
          setTreatmentProgress(progress);
          setProgressLoading(false);
        }
      } catch {
        attempts += 1;
        if (!cancelled && attempts < 6) {
          progressRetryRef.current = setTimeout(loadProgress, Math.min(1000 * attempts, 5000));
        } else if (!cancelled) {
          setProgressLoading(false);
        }
      }
    };

    setProgressLoading(true);
    loadProgress();

    return () => {
      cancelled = true;
      if (progressRetryRef.current) clearTimeout(progressRetryRef.current);
    };
  }, [userId]);

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    const refreshProgress = async () => {
      try {
        const progress = await api.getTreatmentProgress(userId);
        if (!cancelled) setTreatmentProgress(progress);
      } catch { /* keep existing progress */ }
      finally {
        if (!cancelled) setProgressLoading(false);
      }
    };

    refreshProgress();
    return () => { cancelled = true; };
  }, [userId]));

  useEffect(() => () => { if (pollRef.current) clearTimeout(pollRef.current); }, []);

  useEffect(() => {
    setFeedback(t('defaultFeedback'));
  }, [language, t]);

  const handleRecordSubmitted = (recordId: string) => {
    setFeedback(t('xiaonuanThinking'));
    let attempts = 0;
    const poll = async () => {
      try {
        const rec = await api.getRecord(recordId);
        if (rec.risk_level === 'crisis') { setFeedback(t('defaultFeedback')); setCrisisVisible(true); return; }
        if (rec.ai_immediate_feedback) {
          setFeedback(rec.ai_immediate_feedback);
          pollRef.current = setTimeout(() => setFeedback(t('defaultFeedback')), 600_000);
          return;
        }
      } catch { /* keep polling */ }
      attempts++;
      if (attempts < 30) pollRef.current = setTimeout(poll, 2000);
      else setFeedback(t('recordSavedFallback'));
    };
    pollRef.current = setTimeout(poll, 1500);
  };

  return (
    <SafeAreaView className="flex-1 bg-orange-50">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 32, paddingBottom: 32, alignItems: 'center' }}
        showsVerticalScrollIndicator={false}
      >
        {/* Greeting */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <Text className="text-2xl font-bold text-gray-800">{getGreeting(t)}</Text>
          <TouchableOpacity onPress={() => router.push('/profile')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={{ fontSize: 24 }}>👤</Text>
          </TouchableOpacity>
        </View>
        <Text className="text-sm text-gray-500 mt-1 mb-8">{getDateString(language)}</Text>

        {/* Speech bubble */}
        <View className="bg-white rounded-2xl shadow-sm px-5 py-4 w-full mb-0">
          <Text className="text-gray-600 text-sm leading-relaxed text-center">{feedback}</Text>
        </View>
        {/* Bubble tail */}
        <View style={{ width: 0, height: 0, borderLeftWidth: 9, borderRightWidth: 9, borderTopWidth: 10, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: 'white' }} />

        {/* XiaoNuan — tap to chat */}
        <TouchableOpacity
          onPress={() => router.push('/chatbot')}
          activeOpacity={0.8}
          className="mt-2 mb-5"
        >
          <XiaoNuan size={120} />
        </TouchableOpacity>

        {/* Action buttons */}
        <View className="flex-row justify-center gap-16 mb-8">
          <View className="items-center">
            <TouchableOpacity
              onPress={() => setRecordVisible(true)}
              className="w-16 h-16 rounded-full bg-orange-500 items-center justify-center shadow-lg"
            >
              <Text className="text-white text-2xl">✏️</Text>
            </TouchableOpacity>
            <Text className="text-xs text-gray-500 mt-2">{t('recordActivity')}</Text>
          </View>
          <View className="items-center">
            <TouchableOpacity
              onPress={() => setPlanVisible(true)}
              className="w-16 h-16 rounded-full bg-indigo-500 items-center justify-center shadow-lg"
            >
              <Text className="text-white text-2xl">📅</Text>
            </TouchableOpacity>
            <Text className="text-xs text-gray-500 mt-2">{t('planActivity')}</Text>
          </View>
        </View>

        {/* Phase card */}
        {progressLoading && !treatmentProgress && (
          <View className="w-full items-center py-3 mb-4">
            <ActivityIndicator color="#f97316" />
          </View>
        )}
        {treatmentProgress && (
          <PhaseCard
            data={treatmentProgress}
            onStartSession={() => router.push(`/chatbot?intent=phase:${treatmentProgress.phase}`)}
            onOpenChat={() => router.push('/chatbot')}
            onAdvance={async () => {
              const result = await api.advancePhase(userId);
              if (result.ok) {
                const updated = await api.getTreatmentProgress(userId);
                setTreatmentProgress(updated);
              }
            }}
          />
        )}
      </ScrollView>

      <RecordModal
        visible={recordVisible}
        onClose={() => setRecordVisible(false)}
        onRecordSubmitted={handleRecordSubmitted}
        userId={userId}
      />
      <PlanModal visible={planVisible} onClose={() => setPlanVisible(false)} userId={userId} />
      <CrisisModal visible={crisisVisible} onClose={() => setCrisisVisible(false)} />
    </SafeAreaView>
  );
}
