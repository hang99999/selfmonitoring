import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, TextInput,
  Modal, Pressable, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { api } from '../src/api';
import { useUserId } from '../src/userStore';
import type { Supporter } from '../src/types';

const RELATIONSHIP_PRESETS = ['伴侣', '死党', '父母', '兄弟姐妹', '朋友', '同事'];

function SupporterFormModal({
  visible,
  initial,
  onClose,
  onSaved,
}: {
  visible: boolean;
  initial?: Supporter;
  onClose: () => void;
  onSaved: () => void;
}) {
  const userId = useUserId();
  const [name, setName] = useState(initial?.name ?? '');
  const [relationship, setRelationship] = useState(initial?.relationship ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setName(initial?.name ?? '');
      setRelationship(initial?.relationship ?? '');
      setNotes(initial?.notes ?? '');
    }
  }, [visible, initial]);

  const submit = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      if (initial) {
        await api.updateSupporter(initial.id, { name: name.trim(), relationship: relationship.trim() || undefined, notes: notes.trim() || undefined });
      } else {
        await api.createSupporter({ name: name.trim(), relationship: relationship.trim() || undefined, notes: notes.trim() || undefined }, userId);
      }
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1" onPress={onClose} />
      <View className="bg-white rounded-t-3xl px-6 pt-6 pb-10">
        <Text className="text-base font-bold text-gray-800 mb-5">
          {initial ? '编辑支持者' : '添加支持者'}
        </Text>

        <Text className="text-sm font-medium text-gray-600 mb-2">姓名 / 昵称</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="例如：小明、妈妈"
          placeholderTextColor="#9ca3af"
          autoFocus
          className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-800 mb-4"
        />

        <Text className="text-sm font-medium text-gray-600 mb-2">关系</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-2">
          <View className="flex-row gap-2">
            {RELATIONSHIP_PRESETS.map(r => (
              <TouchableOpacity
                key={r}
                onPress={() => setRelationship(r)}
                className="px-3 py-1.5 rounded-full border"
                style={{
                  backgroundColor: relationship === r ? '#f97316' : '#fff',
                  borderColor: relationship === r ? '#f97316' : '#e5e7eb',
                }}
              >
                <Text style={{ color: relationship === r ? '#fff' : '#6b7280' }} className="text-sm">
                  {r}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
        <TextInput
          value={relationship}
          onChangeText={setRelationship}
          placeholder="或自定义关系"
          placeholderTextColor="#9ca3af"
          className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-800 mb-4"
        />

        <Text className="text-sm font-medium text-gray-600 mb-2">擅长提供的帮助（可选）</Text>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder="例如：可以陪我出门，或者打电话聊天"
          placeholderTextColor="#9ca3af"
          multiline
          numberOfLines={2}
          className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-800 mb-5"
        />

        <TouchableOpacity
          onPress={submit}
          disabled={!name.trim() || saving}
          style={{ opacity: !name.trim() ? 0.4 : 1 }}
          className="w-full py-4 bg-orange-500 rounded-2xl items-center"
        >
          {saving ? <ActivityIndicator color="white" /> : <Text className="text-white font-semibold">保存</Text>}
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

export default function SupportersScreen() {
  const router = useRouter();
  const userId = useUserId();
  const [supporters, setSupporters] = useState<Supporter[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Supporter | undefined>(undefined);

  const load = useCallback(async () => {
    try {
      const data = await api.getSupporters(userId);
      setSupporters(data);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = (s: Supporter) => {
    Alert.alert('删除支持者', `删除「${s.name}」？删除后与该支持者的活动关联也会一起移除。`, [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: () => api.deleteSupporter(s.id).then(load) },
    ]);
  };

  const openAdd = () => { setEditing(undefined); setShowForm(true); };
  const openEdit = (s: Supporter) => { setEditing(s); setShowForm(true); };

  return (
    <SafeAreaView className="flex-1 bg-orange-50">
      <View className="flex-row items-center px-4 pt-4 pb-2">
        <TouchableOpacity onPress={() => router.back()} className="mr-3 w-9 h-9 items-center justify-center">
          <Text className="text-gray-500 text-lg">‹</Text>
        </TouchableOpacity>
        <Text className="text-xl font-bold text-gray-800 flex-1">我的支持者</Text>
        <TouchableOpacity
          onPress={openAdd}
          className="bg-orange-500 px-4 py-2 rounded-xl"
        >
          <Text className="text-white text-sm font-semibold">+ 添加</Text>
        </TouchableOpacity>
      </View>

      <ScrollView className="flex-1 px-4 pt-2" showsVerticalScrollIndicator={false}>
        <Text className="text-sm text-gray-400 leading-relaxed mb-5">
          记录你身边可以提供帮助的人。在规划活动时，你可以选择邀请他们一起参与或寻求支持。
        </Text>

        {loading && (
          <View className="items-center py-10">
            <ActivityIndicator color="#f97316" />
          </View>
        )}

        {!loading && supporters.length === 0 && (
          <View className="items-center py-16">
            <Text className="text-4xl mb-3">👥</Text>
            <Text className="text-gray-500 text-sm text-center">还没有添加支持者</Text>
            <Text className="text-gray-400 text-xs text-center mt-1">
              家人、朋友都可以成为你的支持力量
            </Text>
            <TouchableOpacity
              onPress={openAdd}
              className="mt-5 bg-orange-500 px-6 py-3 rounded-2xl"
            >
              <Text className="text-white font-semibold">添加第一位支持者</Text>
            </TouchableOpacity>
          </View>
        )}

        {supporters.map(s => (
          <TouchableOpacity
            key={s.id}
            onPress={() => openEdit(s)}
            className="bg-white rounded-2xl px-4 py-4 mb-3 shadow-sm"
          >
            <View className="flex-row items-center justify-between">
              <View className="flex-1">
                <View className="flex-row items-center gap-2 mb-1">
                  <Text className="font-semibold text-gray-800">{s.name}</Text>
                  {s.relationship && (
                    <View className="bg-orange-100 px-2 py-0.5 rounded-full">
                      <Text className="text-xs text-orange-600">{s.relationship}</Text>
                    </View>
                  )}
                </View>
                {s.notes && (
                  <Text className="text-xs text-gray-400 leading-relaxed">{s.notes}</Text>
                )}
              </View>
              <View className="flex-row gap-3 ml-3">
                <TouchableOpacity onPress={() => handleDelete(s)} className="p-1">
                  <Text className="text-gray-300">✕</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        ))}

        <View className="h-8" />
      </ScrollView>

      <SupporterFormModal
        visible={showForm}
        initial={editing}
        onClose={() => setShowForm(false)}
        onSaved={load}
      />
    </SafeAreaView>
  );
}
