import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, TextInput,
  Modal, Pressable, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { api } from '../src/api';
import { useLanguage } from '../src/i18n';
import { useUserId } from '../src/userStore';
import type { Supporter } from '../src/types';

const RELATIONSHIP_PRESETS = [
  { zh: '伴侣', en: 'Partner' },
  { zh: '死党', en: 'Close friend' },
  { zh: '父母', en: 'Parent' },
  { zh: '兄弟姐妹', en: 'Sibling' },
  { zh: '朋友', en: 'Friend' },
  { zh: '同事', en: 'Colleague' },
];

function displayRelationship(value: string | null | undefined, language: 'zh' | 'en') {
  if (!value) return '';
  const preset = RELATIONSHIP_PRESETS.find(item => item.zh === value || item.en === value);
  return preset ? preset[language] : value;
}

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
  const { language, t } = useLanguage();
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
          {initial ? t('editSupporter') : t('addSupporterTitle')}
        </Text>

        <Text className="text-sm font-medium text-gray-600 mb-2">{t('supporterName')}</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder={t('supporterNamePlaceholder')}
          placeholderTextColor="#9ca3af"
          autoFocus
          className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-800 mb-4"
        />

        <Text className="text-sm font-medium text-gray-600 mb-2">{t('relationship')}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-2">
          <View className="flex-row gap-2">
            {RELATIONSHIP_PRESETS.map(r => (
              <TouchableOpacity
                key={r.zh}
                onPress={() => setRelationship(r.zh)}
                className="px-3 py-1.5 rounded-full border"
                style={{
                  backgroundColor: relationship === r.zh ? '#f97316' : '#fff',
                  borderColor: relationship === r.zh ? '#f97316' : '#e5e7eb',
                }}
              >
                <Text style={{ color: relationship === r.zh ? '#fff' : '#6b7280' }} className="text-sm">
                  {r[language]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
        <TextInput
          value={relationship}
          onChangeText={setRelationship}
          placeholder={t('customRelationshipPlaceholder')}
          placeholderTextColor="#9ca3af"
          className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-800 mb-4"
        />

        <Text className="text-sm font-medium text-gray-600 mb-2">{t('supporterHelpLabel')}</Text>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder={t('supporterHelpPlaceholder')}
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
          {saving ? <ActivityIndicator color="white" /> : <Text className="text-white font-semibold">{t('save')}</Text>}
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

export default function SupportersScreen() {
  const router = useRouter();
  const userId = useUserId();
  const { language, t } = useLanguage();
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
    Alert.alert(t('deleteSupporter'), t('deleteSupporterQuestion').replace('{name}', s.name), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('delete'), style: 'destructive', onPress: () => api.deleteSupporter(s.id).then(load) },
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
        <Text className="text-xl font-bold text-gray-800 flex-1">{t('mySupporters')}</Text>
        <TouchableOpacity
          onPress={openAdd}
          className="bg-orange-500 px-4 py-2 rounded-xl"
        >
          <Text className="text-white text-sm font-semibold">{t('addSupporter')}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView className="flex-1 px-4 pt-2" showsVerticalScrollIndicator={false}>
        <Text className="text-sm text-gray-400 leading-relaxed mb-5">
          {t('supportersPageHint')}
        </Text>

        {loading && (
          <View className="items-center py-10">
            <ActivityIndicator color="#f97316" />
          </View>
        )}

        {!loading && supporters.length === 0 && (
          <View className="items-center py-16">
            <Text className="text-4xl mb-3">👥</Text>
            <Text className="text-gray-500 text-sm text-center">{t('noSupportersYet')}</Text>
            <Text className="text-gray-400 text-xs text-center mt-1">
              {t('supportersEmptyHint')}
            </Text>
            <TouchableOpacity
              onPress={openAdd}
              className="mt-5 bg-orange-500 px-6 py-3 rounded-2xl"
            >
              <Text className="text-white font-semibold">{t('addFirstSupporter')}</Text>
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
                      <Text className="text-xs text-orange-600">{displayRelationship(s.relationship, language)}</Text>
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
