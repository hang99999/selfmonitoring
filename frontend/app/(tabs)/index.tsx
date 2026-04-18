import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  Modal, TextInput, Pressable, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import XiaoNuan from '../../components/XiaoNuan';
import RecordModal from '../../components/RecordModal';
import { api } from '../../src/api';
import { useUserId } from '../../src/userStore';
import type { Activity, TreatmentProgressData, Supporter } from '../../src/types';

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return '早上好';
  if (h < 18) return '下午好';
  return '晚上好';
}

function getDateString(): string {
  const now = new Date();
  const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
  return `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 星期${weekDays[now.getDay()]}`;
}

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ── Plan Modal ────────────────────────────────────────────────────────────────
function PlanModal({ visible, onClose, userId }: { visible: boolean; onClose: () => void; userId: string }) {
  const [name, setName] = useState('');
  const [selectedDate, setSelectedDate] = useState(toDateStr(new Date()));
  const [allDay, setAllDay] = useState(true);
  const [selectedHour, setSelectedHour] = useState(9);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [libraryActivities, setLibraryActivities] = useState<Activity[]>([]);
  const [supporters, setSupporters] = useState<Supporter[]>([]);
  const [selectedSupporterIds, setSelectedSupporterIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (visible) {
      api.getSupporters(userId).then(setSupporters).catch(() => {});
    }
  }, [visible, userId]);

  const toggleSupporter = (id: string) => {
    setSelectedSupporterIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else if (next.size < 3) { next.add(id); }
      return next;
    });
  };

  const dateOptions = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() + i);
    const labels = ['今天', '明天', '后天'];
    const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
    return { date: toDateStr(d), label: labels[i] ?? `周${weekDays[d.getDay()]}` };
  });

  const handleSubmit = async () => {
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    try {
      const planned = await api.createPlanned({
        activity_name: name.trim(),
        scheduled_date: selectedDate,
        scheduled_time: allDay ? undefined : `${String(selectedHour).padStart(2, '0')}:00`,
        user_id: userId,
      });
      await Promise.all(
        [...selectedSupporterIds].map(sid => api.addActivitySupporter(planned.id, sid))
      );
      setDone(true);
      setTimeout(() => {
        setDone(false); setName(''); setAllDay(true); setSelectedHour(9);
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
            <Text className="font-semibold text-gray-800 text-lg">已加入日程！</Text>
          </View>
        ) : (
          <>
            <Text className="text-lg font-bold text-gray-800 mb-5">计划一项活动</Text>

            <Text className="text-sm font-medium text-gray-600 mb-2">活动名称</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="例如：出门散步30分钟"
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
                {showLibrary ? '▾ 收起活动库' : '▸ 从活动库选取'}
              </Text>
            </TouchableOpacity>
            {showLibrary && (
              <View className="border border-gray-200 rounded-xl mb-4 max-h-32 overflow-hidden">
                <ScrollView>
                  {libraryActivities.length === 0
                    ? <Text className="text-xs text-gray-400 px-3 py-3 text-center">活动库为空</Text>
                    : libraryActivities.map(a => (
                        <TouchableOpacity
                          key={a.id}
                          onPress={() => { setName(a.name); setShowLibrary(false); }}
                          className="px-3 py-2.5 border-b border-gray-100"
                        >
                          <Text className="text-sm text-gray-700">{a.name}</Text>
                        </TouchableOpacity>
                      ))
                  }
                </ScrollView>
              </View>
            )}

            <Text className="text-sm font-medium text-gray-600 mb-2">日期</Text>
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

            <Text className="text-sm font-medium text-gray-600 mb-2">时间</Text>
            <View className="flex-row gap-2 mb-3">
              {[true, false].map(isAllDay => (
                <TouchableOpacity
                  key={String(isAllDay)}
                  onPress={() => setAllDay(isAllDay)}
                  className="px-4 py-2 rounded-xl border"
                  style={{ backgroundColor: allDay === isAllDay ? '#6366f1' : '#fff', borderColor: allDay === isAllDay ? '#6366f1' : '#e5e7eb' }}
                >
                  <Text style={{ color: allDay === isAllDay ? '#fff' : '#4b5563' }} className="text-sm font-medium">
                    {isAllDay ? '全天' : '指定时间'}
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
                <Text className="text-sm font-medium text-gray-600 mb-1">寻求支持（可选）</Text>
                <Text className="text-xs text-gray-400 mb-2">选择可以帮助你完成这项活动的人，最多3位</Text>
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
                : <Text className="text-white font-semibold text-base">确定计划</Text>
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

function PhaseCard({ data, onPress }: { data: TreatmentProgressData; onPress: () => void }) {
  const [expanded, setExpanded] = useState(true);
  const isOngoing = data.phase === 'review_cycle';
  const doneCriteria = data.criteria.filter(c => c.done).length;
  const totalCriteria = data.criteria.length;

  return (
    <View className="w-full bg-white rounded-2xl border border-orange-100 mb-6 overflow-hidden">
      {/* Header row — always visible, tap to expand */}
      <TouchableOpacity
        onPress={() => setExpanded(e => !e)}
        activeOpacity={0.7}
        className="flex-row items-center px-5 pt-4 pb-3 gap-2"
      >
        <View className="w-2 h-2 rounded-full bg-orange-400" />
        <Text className="flex-1 text-xs font-semibold text-orange-500">{data.phase_label}</Text>
        {totalCriteria > 0 && (
          <Text className="text-xs text-gray-400 mr-1">{doneCriteria}/{totalCriteria}</Text>
        )}
        <Text className="text-gray-300 text-xs">{expanded ? '▲' : '▼'}</Text>
      </TouchableOpacity>

      {/* Description — always visible */}
      <Text className="text-sm text-gray-600 leading-relaxed px-5 pb-4">
        {PHASE_CONVERSATION[data.phase]}
      </Text>

      {/* Criteria — only when expanded */}
      {expanded && data.criteria.length > 0 && (
        <View className="px-5 pb-4 border-t border-gray-50 pt-3 gap-2">
          <Text className="text-xs font-medium text-gray-400 mb-1">本阶段任务</Text>
          {data.criteria.map(c => (
            <View key={c.key} className="flex-row items-center gap-2">
              <View className={`w-4 h-4 rounded-full items-center justify-center ${c.done ? 'bg-green-400' : 'bg-gray-200'}`}>
                {c.done && <Text className="text-white text-[9px] font-bold">✓</Text>}
              </View>
              <Text className={`text-xs flex-1 ${c.done ? 'text-gray-400 line-through' : 'text-gray-600'}`}>
                {c.label}
              </Text>
              {c.target !== undefined && c.target > 1 && (
                <Text className="text-xs text-gray-400">{c.current}/{c.target}</Text>
              )}
            </View>
          ))}
        </View>
      )}

      {/* CTA */}
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.85}
        className="mx-5 mb-4 py-3 bg-orange-500 rounded-xl items-center"
      >
        <Text className="text-white text-sm font-semibold">
          {isOngoing ? '和小暖聊聊 →' : '开始本阶段对话 →'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Crisis modal ──────────────────────────────────────────────────────────────
function CrisisModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View className="flex-1 bg-black/50 justify-center px-4">
        <View className="bg-red-50 rounded-3xl p-8">
          <View className="w-14 h-14 mx-auto mb-5 rounded-full bg-red-100 items-center justify-center">
            <Text className="text-2xl">⚠️</Text>
          </View>
          <Text className="text-xl font-bold text-red-800 text-center mb-3">我们很关心你的安全</Text>
          {[['全国心理援助热线', '400-161-9995'], ['北京心理危机干预中心', '010-82951332'], ['生命热线', '400-821-1215']].map(([label, num]) => (
            <View key={num} className="px-4 py-3 bg-white rounded-2xl flex-row justify-between items-center mb-2">
              <Text className="text-sm text-gray-500">{label}</Text>
              <Text className="font-bold text-red-600">{num}</Text>
            </View>
          ))}
          <Text className="text-sm text-red-700 text-center my-4">如正处于危险中，请立即拨打 120</Text>
          <TouchableOpacity onPress={onClose} className="w-full py-3 rounded-full bg-red-500 items-center">
            <Text className="text-white font-medium">我知道了</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ── Home ──────────────────────────────────────────────────────────────────────
const DEFAULT_MSG = '今天过得怎么样？随时可以和我聊聊～';

export default function HomeScreen() {
  const router = useRouter();
  const userId = useUserId();
  const [recordVisible, setRecordVisible] = useState(false);
  const [planVisible, setPlanVisible] = useState(false);
  const [crisisVisible, setCrisisVisible] = useState(false);
  const [feedback, setFeedback] = useState(DEFAULT_MSG);
  const [treatmentProgress, setTreatmentProgress] = useState<TreatmentProgressData | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useFocusEffect(useCallback(() => {
    api.getTreatmentProgress(userId).then(setTreatmentProgress).catch(() => {});
  }, [userId]));

  useEffect(() => () => { if (pollRef.current) clearTimeout(pollRef.current); }, []);

  const handleRecordSubmitted = (recordId: string) => {
    setFeedback('小暖正在思考...');
    let attempts = 0;
    const poll = async () => {
      try {
        const rec = await api.getRecord(recordId);
        if (rec.risk_level === 'crisis') { setFeedback(DEFAULT_MSG); setCrisisVisible(true); return; }
        if (rec.ai_immediate_feedback) {
          setFeedback(rec.ai_immediate_feedback);
          pollRef.current = setTimeout(() => setFeedback(DEFAULT_MSG), 600_000);
          return;
        }
      } catch { /* keep polling */ }
      attempts++;
      if (attempts < 30) pollRef.current = setTimeout(poll, 2000);
      else setFeedback('记录成功！继续保持对自己的关注～');
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
          <Text className="text-2xl font-bold text-gray-800">{getGreeting()}</Text>
          <TouchableOpacity onPress={() => router.push('/profile')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={{ fontSize: 24 }}>👤</Text>
          </TouchableOpacity>
        </View>
        <Text className="text-sm text-gray-500 mt-1 mb-8">{getDateString()}</Text>

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
            <Text className="text-xs text-gray-500 mt-2">记录活动</Text>
          </View>
          <View className="items-center">
            <TouchableOpacity
              onPress={() => setPlanVisible(true)}
              className="w-16 h-16 rounded-full bg-indigo-500 items-center justify-center shadow-lg"
            >
              <Text className="text-white text-2xl">📅</Text>
            </TouchableOpacity>
            <Text className="text-xs text-gray-500 mt-2">计划活动</Text>
          </View>
        </View>

        {/* Phase card */}
        {treatmentProgress && (
          <PhaseCard
            data={treatmentProgress}
            onPress={() => router.push('/chatbot')}
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
