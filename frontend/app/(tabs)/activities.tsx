import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  Modal, Pressable, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { api } from '../../src/api';
import { useUserId } from '../../src/userStore';
import type { LifeDomain, Value, Activity, Supporter } from '../../src/types';

// ── Add Value Modal ───────────────────────────────────────────────────────────
function AddValueModal({
  visible, domainId, onClose, onAdded,
}: { visible: boolean; domainId: string; onClose: () => void; onAdded: () => void }) {
  const userId = useUserId();
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (!text.trim() || saving) return;
    setSaving(true);
    try { await api.createValue(domainId, text.trim(), userId); onAdded(); onClose(); setText(''); }
    finally { setSaving(false); }
  };
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1" onPress={onClose} />
      <View className="bg-white rounded-t-3xl px-6 pt-6 pb-10">
        <Text className="text-base font-bold text-gray-800 mb-4">添加价值观</Text>
        <TextInput
          value={text} onChangeText={setText} autoFocus
          placeholder="例如：做一个关心家人的人"
          placeholderTextColor="#9ca3af"
          className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-800 mb-4"
        />
        <TouchableOpacity onPress={submit} disabled={!text.trim() || saving}
          className="w-full py-4 bg-orange-500 rounded-2xl items-center">
          {saving ? <ActivityIndicator color="white" /> : <Text className="text-white font-semibold">添加</Text>}
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

// ── Add Activity Modal ────────────────────────────────────────────────────────
function AddActivityModal({
  visible, domainId, valueId, onClose, onAdded,
}: { visible: boolean; domainId: string; valueId: string | null; onClose: () => void; onAdded: () => void }) {
  const userId = useUserId();
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (!text.trim() || saving) return;
    setSaving(true);
    try {
      await api.createActivity({ name: text.trim(), life_domain_id: domainId, value_id: valueId ?? undefined, user_id: userId });
      onAdded(); onClose(); setText('');
    } finally { setSaving(false); }
  };
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1" onPress={onClose} />
      <View className="bg-white rounded-t-3xl px-6 pt-6 pb-10">
        <Text className="text-base font-bold text-gray-800 mb-4">添加活动</Text>
        <TextInput
          value={text} onChangeText={setText} autoFocus
          placeholder="例如：每周二晚陪妈妈打一通电话"
          placeholderTextColor="#9ca3af"
          className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-800 mb-4"
        />
        <TouchableOpacity onPress={submit} disabled={!text.trim() || saving}
          className="w-full py-4 bg-indigo-500 rounded-2xl items-center">
          {saving ? <ActivityIndicator color="white" /> : <Text className="text-white font-semibold">添加</Text>}
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function ActivitiesScreen() {
  const router = useRouter();
  const userId = useUserId();
  const [domains, setDomains] = useState<LifeDomain[]>([]);
  const [values, setValues] = useState<Value[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [supporters, setSupporters] = useState<Supporter[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [addValueFor, setAddValueFor] = useState<string | null>(null);
  const [addActivityFor, setAddActivityFor] = useState<{ domainId: string; valueId: string | null } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [d, v, a, s] = await Promise.all([
        api.getDomains(userId), api.getValues(userId),
        api.getActivities(userId), api.getSupporters(userId),
      ]);
      setDomains(d); setValues(v); setActivities(a); setSupporters(s);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <SafeAreaView className="flex-1 bg-orange-50 items-center justify-center">
      <ActivityIndicator size="large" color="#f97316" />
    </SafeAreaView>
  );

  return (
    <SafeAreaView className="flex-1 bg-orange-50">
      <ScrollView className="flex-1 px-4" showsVerticalScrollIndicator={false}>
        <Text className="text-xl font-bold text-gray-800 mt-6 mb-4">活动库</Text>
        <Text className="text-sm text-gray-500 mb-6 leading-relaxed">
          从你在乎的事出发，找到有意义的活动
        </Text>

        {domains.map(domain => {
          const domainValues = values.filter(v => v.life_domain_id === domain.id);
          const isOpen = expanded === domain.id;
          return (
            <View key={domain.id} className="bg-white rounded-2xl mb-3 overflow-hidden shadow-sm">
              <TouchableOpacity
                onPress={() => setExpanded(isOpen ? null : domain.id)}
                className="flex-row items-center justify-between px-4 py-4"
              >
                <View className="flex-1">
                  <Text className="font-semibold text-gray-800">{domain.name}</Text>
                  {domain.description && (
                    <Text className="text-xs text-gray-400 mt-0.5">{domain.description}</Text>
                  )}
                </View>
                <Text className="text-gray-400 text-lg">{isOpen ? '▾' : '▸'}</Text>
              </TouchableOpacity>

              {isOpen && (
                <View className="px-4 pb-4 border-t border-gray-50">
                  {/* Activities not linked to any value */}
                  {activities.filter(a => a.life_domain_id === domain.id && !a.value_id).map(act => (
                    <View key={act.id} className="flex-row items-center mt-2">
                      <Text className="text-orange-400 mr-2">•</Text>
                      <Text className="text-sm text-gray-700 flex-1">{act.name}</Text>
                      <TouchableOpacity onPress={() => api.deleteActivity(act.id).then(load)}>
                        <Text className="text-gray-300 text-xs">✕</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                  <TouchableOpacity
                    onPress={() => setAddActivityFor({ domainId: domain.id, valueId: null })}
                    className="flex-row items-center mt-3 mb-1"
                  >
                    <Text className="text-xs text-orange-500">+ 添加活动</Text>
                  </TouchableOpacity>
                  {domainValues.map(value => {
                    const valueActs = activities.filter(a => a.value_id === value.id);
                    return (
                      <View key={value.id} className="mt-3">
                        <View className="flex-row items-start justify-between">
                          <View className="flex-1 mr-2">
                            <Text className="text-sm font-medium text-indigo-700">💡 {value.content}</Text>
                          </View>
                          <TouchableOpacity onPress={() => Alert.alert('确认删除', '删除这个价值观？', [
                            { text: '取消', style: 'cancel' },
                            { text: '删除', style: 'destructive', onPress: () => api.deleteValue(value.id).then(load) },
                          ])}>
                            <Text className="text-gray-300 text-sm">✕</Text>
                          </TouchableOpacity>
                        </View>
                        {valueActs.map(act => (
                          <View key={act.id} className="flex-row items-center mt-1.5 ml-3">
                            <Text className="text-orange-400 mr-2">•</Text>
                            <Text className="text-sm text-gray-700 flex-1">{act.name}</Text>
                            <TouchableOpacity onPress={() => api.deleteActivity(act.id).then(load)}>
                              <Text className="text-gray-300 text-xs">✕</Text>
                            </TouchableOpacity>
                          </View>
                        ))}
                        <TouchableOpacity
                          onPress={() => setAddActivityFor({ domainId: domain.id, valueId: value.id })}
                          className="flex-row items-center mt-2 ml-3"
                        >
                          <Text className="text-xs text-orange-500">+ 添加活动</Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                  <TouchableOpacity
                    onPress={() => setAddValueFor(domain.id)}
                    className="mt-4 py-2 border border-dashed border-indigo-300 rounded-xl items-center"
                  >
                    <Text className="text-xs text-indigo-500">+ 添加价值观</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        })}
        {/* Supporters card */}
        <TouchableOpacity
          onPress={() => router.push('/supporters')}
          className="bg-white rounded-2xl px-4 py-4 mt-2 mb-3 shadow-sm"
        >
          <View className="flex-row items-center justify-between mb-1">
            <Text className="font-semibold text-gray-800">我的支持者</Text>
            <Text className="text-gray-400 text-sm">管理 ›</Text>
          </View>
          {supporters.length === 0 ? (
            <Text className="text-xs text-gray-400">添加家人或朋友，在规划活动时邀请他们支持你</Text>
          ) : (
            <View className="flex-row flex-wrap gap-2 mt-1">
              {supporters.map(s => (
                <View key={s.id} className="bg-orange-50 border border-orange-200 px-3 py-1 rounded-full flex-row items-center gap-1">
                  <Text className="text-xs text-orange-700 font-medium">{s.name}</Text>
                  {s.relationship && <Text className="text-xs text-orange-400">{s.relationship}</Text>}
                </View>
              ))}
            </View>
          )}
        </TouchableOpacity>

        <View className="h-8" />
      </ScrollView>

      {addValueFor && (
        <AddValueModal
          visible={!!addValueFor}
          domainId={addValueFor}
          onClose={() => setAddValueFor(null)}
          onAdded={load}
        />
      )}
      {addActivityFor && (
        <AddActivityModal
          visible={!!addActivityFor}
          domainId={addActivityFor.domainId}
          valueId={addActivityFor.valueId}
          onClose={() => setAddActivityFor(null)}
          onAdded={load}
        />
      )}
    </SafeAreaView>
  );
}
