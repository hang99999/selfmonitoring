import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, isAiAccessRequiredError } from '../../src/api';
import { useUserId } from '../../src/userStore';
import type { MoodRecord, PlannedActivity, PlannedActivitySupporter } from '../../src/types';
import RecordModal from '../../components/RecordModal';

// ── helpers ──────────────────────────────────────────────────────────────────

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDate(date: Date): string {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
  return `${month}月${day}日 星期${weekDays[date.getDay()]}`;
}

function getHour(timestamp: string): number {
  return new Date(timestamp).getHours();
}

const HOURS = Array.from({ length: 18 }, (_, i) => i + 6); // 6:00–23:00

// ── score row ─────────────────────────────────────────────────────────────────

const SCORES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

function ScoreRow({ label, value, onChange, activeColor }: {
  label: string; value: number; onChange: (v: number) => void; activeColor: string;
}) {
  return (
    <View className="mb-4">
      <Text className="text-sm font-medium text-gray-600 mb-2">{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View className="flex-row gap-2">
          {SCORES.map(s => {
            const active = value === s;
            return (
              <TouchableOpacity
                key={s}
                onPress={() => onChange(s)}
                style={{ backgroundColor: active ? activeColor : '#fff', borderColor: active ? activeColor : '#e5e7eb' }}
                className="w-10 h-10 rounded-xl items-center justify-center border"
              >
                <Text style={{ color: active ? '#fff' : '#6b7280' }} className="text-sm font-medium">{s}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

// ── complete modal ────────────────────────────────────────────────────────────

function CompleteModal({ item, onDone, onCancel }: {
  item: PlannedActivity;
  onDone: (pleasure: number, importance: number) => Promise<void>;
  onCancel: () => void;
}) {
  const [pleasure, setPleasure] = useState(5);
  const [importance, setImportance] = useState(5);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    await onDone(pleasure, importance);
    setLoading(false);
  };

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onCancel}>
      <View className="flex-1 justify-end bg-black/40">
        <View className="bg-white rounded-t-3xl px-6 pt-6 pb-10">
          <Text className="text-lg font-bold text-gray-800 mb-1">完成活动</Text>
          <Text className="text-sm text-gray-400 mb-5">
            太棒了！为「<Text className="text-gray-700 font-medium">{item.activity_name}</Text>」评个分吧
          </Text>
          <ScoreRow label="愉悦度（有多享受？）" value={pleasure} onChange={setPleasure} activeColor="#f97316" />
          <ScoreRow label="重要性（对你有多重要？）" value={importance} onChange={setImportance} activeColor="#6366f1" />
          <TouchableOpacity
            onPress={submit}
            disabled={loading}
            className="w-full py-4 bg-orange-500 rounded-2xl items-center mt-2"
          >
            {loading ? <ActivityIndicator color="white" /> : <Text className="text-white font-semibold">确认完成</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={onCancel} className="mt-3 items-center">
            <Text className="text-gray-400 text-sm">取消</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ── incomplete modal ──────────────────────────────────────────────────────────

type IncompleteStep = 'menu' | 'breakdown' | 'reschedule';

function IncompleteModal({ item, onClose, onReload }: {
  item: PlannedActivity;
  onClose: () => void;
  onReload: () => void;
}) {
  const [step, setStep] = useState<IncompleteStep>('menu');
  const [steps, setSteps] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState('');

  const rescheduleDays = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() + i + 1);
    const str = toDateStr(d);
    const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
    return { date: str, label: `${d.getMonth() + 1}/${d.getDate()} 周${weekDays[d.getDay()]}` };
  });

  const handleBreakdown = async () => {
    setLoading(true);
    try {
      const res = await api.breakdownActivity(item.id);
      setSteps(res.steps || []);
    } catch (error) {
      if (isAiAccessRequiredError(error)) {
        setSteps(['这个 AI 拆解功能需要先解锁或开通会员。']);
      } else {
        setSteps(['先做3次深呼吸，放松一下', `把"${item.activity_name}"想成只做1分钟`, '先开始那1分钟，完成再决定下一步']);
      }
    } finally {
      setLoading(false);
      setStep('breakdown');
    }
  };

  const handleReschedule = async () => {
    if (!rescheduleDate) return;
    setLoading(true);
    try {
      await api.rescheduleActivity(item.id, rescheduleDate);
      onReload();
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/40">
        <View className="bg-white rounded-t-3xl px-6 pt-6 pb-10">
          {step === 'menu' && (
            <>
              <Text className="text-lg font-bold text-gray-800 mb-1">未完成</Text>
              <Text className="text-sm text-gray-400 mb-5">
                「<Text className="text-gray-700 font-medium">{item.activity_name}</Text>」怎么了？
              </Text>
              <TouchableOpacity onPress={handleBreakdown} className="w-full py-4 bg-indigo-50 rounded-2xl items-center mb-3">
                <Text className="text-indigo-600 font-semibold">🧩 帮我拆分成小步骤</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setStep('reschedule')} className="w-full py-4 bg-gray-50 rounded-2xl items-center mb-3">
                <Text className="text-gray-600 font-semibold">📅 改到其他日期</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onClose} className="mt-1 items-center">
                <Text className="text-gray-400 text-sm">取消</Text>
              </TouchableOpacity>
            </>
          )}

          {step === 'breakdown' && (
            <>
              <Text className="text-lg font-bold text-gray-800 mb-4">拆分步骤</Text>
              {loading
                ? <ActivityIndicator color="#f97316" />
                : steps.map((s, i) => (
                  <View key={i} className="flex-row mb-3">
                    <View className="w-6 h-6 rounded-full bg-orange-100 items-center justify-center mr-3 mt-0.5">
                      <Text className="text-xs text-orange-500 font-bold">{i + 1}</Text>
                    </View>
                    <Text className="text-sm text-gray-700 flex-1 leading-relaxed">{s}</Text>
                  </View>
                ))
              }
              <TouchableOpacity onPress={onClose} className="mt-4 w-full py-4 bg-orange-500 rounded-2xl items-center">
                <Text className="text-white font-semibold">好的，我来试试</Text>
              </TouchableOpacity>
            </>
          )}

          {step === 'reschedule' && (
            <>
              <Text className="text-lg font-bold text-gray-800 mb-4">改期</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-5">
                <View className="flex-row gap-2">
                  {rescheduleDays.map(({ date, label }) => (
                    <TouchableOpacity
                      key={date}
                      onPress={() => setRescheduleDate(date)}
                      className={`px-4 py-3 rounded-xl border ${rescheduleDate === date ? 'bg-indigo-500 border-indigo-500' : 'bg-white border-gray-200'}`}
                    >
                      <Text className={`text-sm font-medium ${rescheduleDate === date ? 'text-white' : 'text-gray-600'}`}>{label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
              <TouchableOpacity
                onPress={handleReschedule}
                disabled={!rescheduleDate || loading}
                className="w-full py-4 bg-indigo-500 rounded-2xl items-center"
                style={{ opacity: !rescheduleDate ? 0.4 : 1 }}
              >
                {loading ? <ActivityIndicator color="white" /> : <Text className="text-white font-semibold">确认改期</Text>}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setStep('menu')} className="mt-3 items-center">
                <Text className="text-gray-400 text-sm">返回</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export default function TimelineScreen() {
  const userId = useUserId();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [records, setRecords] = useState<MoodRecord[]>([]);
  const [planned, setPlanned] = useState<PlannedActivity[]>([]);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);

  // modal states
  const [completeFor, setCompleteFor] = useState<PlannedActivity | null>(null);
  const [incompleteFor, setIncompleteFor] = useState<PlannedActivity | null>(null);
  const [recordFor, setRecordFor] = useState<PlannedActivity | null>(null);
  const [supportersByActivity, setSupportersByActivity] = useState<Record<string, PlannedActivitySupporter[]>>({});

  const dateStr = toDateStr(selectedDate);
  const todayStr = toDateStr(new Date());
  const isToday = dateStr === todayStr;
  const isFuture = selectedDate > new Date() && !isToday;
  const isEditable = isToday || isFuture;

  const reload = () => setTick(t => t + 1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [recs, plans] = await Promise.all([
        api.listRecords(dateStr, userId),
        api.getPlanned(dateStr, userId),
      ]);
      setRecords(recs);
      setPlanned(plans);
      if (plans.length > 0) {
        const assocResults = await Promise.all(
          plans.map(p => api.getActivitySupporters(p.id).catch(() => []))
        );
        const map: Record<string, PlannedActivitySupporter[]> = {};
        plans.forEach((p, i) => { map[p.id] = assocResults[i]; });
        setSupportersByActivity(map);
      } else {
        setSupportersByActivity({});
      }
    } catch {
      setRecords([]); setPlanned([]);
    } finally {
      setLoading(false);
    }
  }, [dateStr, tick]);

  useEffect(() => { load(); }, [load]);

  const prevDay = () => setSelectedDate(d => { const n = new Date(d); n.setDate(n.getDate() - 1); return n; });
  const nextDay = () => {
    const max = new Date(); max.setDate(max.getDate() + 30);
    setSelectedDate(d => {
      const n = new Date(d); n.setDate(n.getDate() + 1);
      return n > max ? d : n;
    });
  };

  // group by hour
  const recordsByHour: Record<number, MoodRecord[]> = {};
  records.forEach(r => {
    const h = getHour(r.timestamp);
    (recordsByHour[h] ??= []).push(r);
  });

  const plannedByHour: Record<number, PlannedActivity[]> = {};
  const allDayPlanned: PlannedActivity[] = [];
  planned.forEach(p => {
    if (p.scheduled_time) {
      const h = parseInt(p.scheduled_time.split(':')[0], 10);
      (plannedByHour[h] ??= []).push(p);
    } else {
      allDayPlanned.push(p);
    }
  });

  const hasContent = records.length > 0 || planned.length > 0;

  // handle complete planned activity
  const handleCompleteScores = async (p: PlannedActivity, pleasure: number, importance: number) => {
    try {
      const rec = await api.submitManualRecord({
        user_id: userId,
        activity: p.activity_name,
        pleasure_score: pleasure,
        importance_score: importance,
        planned_activity_id: p.id,
      });
      await api.completePlanned(p.id, rec.id).catch(() => {});
      setCompleteFor(null);
      reload();
    } catch (error) {
      Alert.alert(
        '提示',
        isAiAccessRequiredError(error)
          ? '需要先解锁或开通会员，才能使用 AI 记录解析。'
          : '提交失败，请稍后重试',
      );
    }
  };

  // handle planned card tap
  const handlePlannedTap = (p: PlannedActivity) => {
    if (p.completed) return;
    if (isEditable) {
      // show full record modal (free text)
      setRecordFor(p);
    } else {
      // past, incomplete → offer breakdown/reschedule
      setIncompleteFor(p);
    }
  };

  const handleDelete = (p: PlannedActivity) => {
    Alert.alert('删除计划', `删除「${p.activity_name}」？`, [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: () => api.deletePlanned(p.id).then(reload) },
    ]);
  };

  return (
    <SafeAreaView className="flex-1 bg-orange-50">
      {/* Date navigation */}
      <View className="flex-row items-center justify-between px-4 pt-4 pb-2">
        <TouchableOpacity
          onPress={prevDay}
          className="w-10 h-10 rounded-full bg-white shadow-sm items-center justify-center"
        >
          <Text className="text-gray-600 text-lg">‹</Text>
        </TouchableOpacity>

        <View className="items-center">
          <Text className="text-base font-bold text-gray-800">{formatDate(selectedDate)}</Text>
          {isToday && <Text className="text-xs text-orange-500 font-medium">今天</Text>}
          {isFuture && <Text className="text-xs text-indigo-500 font-medium">计划日</Text>}
        </View>

        <TouchableOpacity
          onPress={nextDay}
          className="w-10 h-10 rounded-full bg-white shadow-sm items-center justify-center"
        >
          <Text className="text-gray-600 text-lg">›</Text>
        </TouchableOpacity>
      </View>

      {loading && (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#f97316" />
        </View>
      )}

      {!loading && !hasContent && (
        <View className="flex-1 items-center justify-center">
          <Text className="text-4xl mb-3">📅</Text>
          <Text className="text-gray-500 text-sm">
            {isFuture ? '还没有计划的活动' : '这一天还没有记录'}
          </Text>
          <Text className="text-gray-400 text-xs mt-1">
            {isFuture ? '回到主页点「计划活动」来安排' : '回到主页开始记录'}
          </Text>
        </View>
      )}

      {!loading && hasContent && (
        <ScrollView className="flex-1 px-4" showsVerticalScrollIndicator={false}>
          {/* All-day planned */}
          {allDayPlanned.length > 0 && (
            <View className="mb-4 mt-3">
              <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">全天计划</Text>
              {allDayPlanned.map(p => (
                <PlannedCard key={p.id} item={p} isEditable={isEditable} supporters={supportersByActivity[p.id] ?? []} onTap={() => handlePlannedTap(p)} onDelete={() => handleDelete(p)} />
              ))}
            </View>
          )}

          {/* Hourly timeline */}
          <View className="mt-2">
            {HOURS.map(hour => {
              const recs = recordsByHour[hour] || [];
              const plans = plannedByHour[hour] || [];
              if (recs.length === 0 && plans.length === 0) {
                return (
                  <View key={hour} className="flex-row" style={{ minHeight: 40 }}>
                    <View className="w-12 items-end pr-3 pt-1">
                      <Text className="text-xs text-gray-300">{String(hour).padStart(2, '0')}</Text>
                    </View>
                    <View className="flex-1 border-l border-gray-100 pl-3" />
                  </View>
                );
              }
              return (
                <View key={hour} className="flex-row mb-1">
                  <View className="w-12 items-end pr-3 pt-2">
                    <Text className="text-xs text-gray-400 font-medium">{String(hour).padStart(2, '0')}</Text>
                  </View>
                  <View className="flex-1 border-l border-orange-200 pl-3 pb-2">
                    {recs.map(r => (
                      <View key={r.id} className="bg-white rounded-xl px-3 py-2 mb-1 shadow-sm border-l-4 border-orange-400">
                        <Text className="text-sm font-medium text-gray-700">{r.activity || '活动记录'}</Text>
                        {r.thought ? <Text className="text-xs text-gray-400 mt-0.5">{r.thought}</Text> : null}
                        {(r.pleasure_score || r.importance_score) ? (
                          <View className="flex-row gap-3 mt-1">
                            {r.pleasure_score ? <Text className="text-xs text-orange-500">愉悦 {r.pleasure_score}</Text> : null}
                            {r.importance_score ? <Text className="text-xs text-indigo-500">重要 {r.importance_score}</Text> : null}
                          </View>
                        ) : null}
                      </View>
                    ))}
                    {plans.map(p => (
                      <PlannedCard key={p.id} item={p} isEditable={isEditable} supporters={supportersByActivity[p.id] ?? []} onTap={() => handlePlannedTap(p)} onDelete={() => handleDelete(p)} />
                    ))}
                  </View>
                </View>
              );
            })}
          </View>
          <View className="h-8" />
        </ScrollView>
      )}

      {/* Modals */}
      {completeFor && (
        <CompleteModal
          item={completeFor}
          onDone={(pl, im) => handleCompleteScores(completeFor, pl, im)}
          onCancel={() => setCompleteFor(null)}
        />
      )}

      {incompleteFor && (
        <IncompleteModal
          item={incompleteFor}
          onClose={() => setIncompleteFor(null)}
          onReload={reload}
        />
      )}

      {recordFor && (
        <RecordModal
          visible={!!recordFor}
          onClose={() => setRecordFor(null)}
          plannedActivityId={recordFor.id}
          plannedActivityName={recordFor.activity_name}
          userId={userId}
          onRecordSubmitted={async (id) => {
            await api.completePlanned(recordFor.id, id).catch(() => {});
            setRecordFor(null);
            reload();
          }}
        />
      )}
    </SafeAreaView>
  );
}

// ── planned card ──────────────────────────────────────────────────────────────

function PlannedCard({ item, isEditable, supporters, onTap, onDelete }: {
  item: PlannedActivity; isEditable: boolean;
  supporters: PlannedActivitySupporter[];
  onTap: () => void; onDelete: () => void;
}) {
  const isPastDue = !item.completed && !isEditable;
  return (
    <TouchableOpacity
      onPress={item.completed ? undefined : onTap}
      className={`rounded-2xl px-3 py-2.5 mb-1.5 border-l-4 ${
        item.completed
          ? 'bg-green-50 border-green-300 opacity-70'
          : isPastDue
          ? 'bg-red-50 border-red-300'
          : 'bg-indigo-50 border-indigo-300'
      }`}
    >
      <View className="flex-row items-center justify-between">
        <Text className={`text-sm font-medium flex-1 mr-2 ${item.completed ? 'text-gray-400 line-through' : 'text-gray-700'}`}>
          {item.activity_name}
        </Text>
        <View className="flex-row items-center gap-2">
          <View className={`px-2 py-0.5 rounded-full ${item.completed ? 'bg-green-100' : isPastDue ? 'bg-red-100' : 'bg-indigo-100'}`}>
            <Text className={`text-xs font-medium ${item.completed ? 'text-green-700' : isPastDue ? 'text-red-600' : 'text-indigo-700'}`}>
              {item.completed ? '✅ 完成' : isPastDue ? '⚠️ 未完成' : '⏳ 待完成'}
            </Text>
          </View>
          {!item.completed && (
            <TouchableOpacity onPress={onDelete} className="p-1">
              <Text className="text-gray-300 text-base">✕</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
      {supporters.length > 0 && (
        <View className="flex-row flex-wrap gap-1 mt-1.5">
          {supporters.map(s => (
            <View key={s.id} className="bg-orange-100 px-2 py-0.5 rounded-full">
              <Text className="text-xs text-orange-600">{s.supporter_name ?? '支持者'}</Text>
            </View>
          ))}
        </View>
      )}
    </TouchableOpacity>
  );
}
