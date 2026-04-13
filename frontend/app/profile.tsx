import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { api } from '../src/api';
import { useUserId, getIsUnlocked, setUnlocked, getParticipantCode } from '../src/userStore';

export default function ProfileScreen() {
  const router = useRouter();
  const userId = useUserId();

  const [isUnlocked, setIsUnlockedState] = useState(false);
  const [participantCode, setParticipantCodeState] = useState<string | null>(null);
  const [inputCode, setInputCode] = useState('');
  const [inputInvite, setInputInvite] = useState('');
  const [unlocking, setUnlocking] = useState(false);

  const [companionName, setCompanionNameInput] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);

  useEffect(() => {
    (async () => {
      const unlocked = await getIsUnlocked();
      setIsUnlockedState(unlocked);
      const code = await getParticipantCode();
      setParticipantCodeState(code);
      try {
        const state = await api.getChatbotState(userId);
        setCompanionNameInput(state.companion_name ?? '小暖');
      } catch { /* ignore */ }
    })();
  }, [userId]);

  const handleUnlock = async () => {
    if (!inputCode.trim() || !inputInvite.trim() || unlocking) return;
    setUnlocking(true);
    try {
      const res = await api.unlock(userId, inputCode.trim(), inputInvite.trim());
      if (res.ok) {
        await setUnlocked(inputCode.trim());
        setIsUnlockedState(true);
        setParticipantCodeState(inputCode.trim());
        Alert.alert('解锁成功', '你现在可以使用完整功能了 🎉');
      }
    } catch (e: any) {
      const msg = e?.message?.includes('400') ? '邀请码无效，请检查后重试' : '解锁失败，请检查网络后重试';
      Alert.alert('解锁失败', msg);
    } finally {
      setUnlocking(false);
    }
  };

  const handleSaveName = async () => {
    if (!companionName.trim() || savingName) return;
    setSavingName(true);
    try {
      await api.setCompanionName(companionName.trim(), userId);
      setNameSaved(true);
      setTimeout(() => setNameSaved(false), 2000);
    } catch {
      Alert.alert('保存失败', '请检查网络后重试');
    } finally {
      setSavingName(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-orange-50">
      {/* Header */}
      <View className="flex-row items-center gap-3 px-4 py-3 bg-white border-b border-gray-100">
        <TouchableOpacity onPress={() => router.back()} className="p-2 -ml-1">
          <Text className="text-gray-500 text-lg">←</Text>
        </TouchableOpacity>
        <Text className="font-semibold text-gray-800 text-base flex-1">我的</Text>
      </View>

      <ScrollView className="flex-1 px-4 pt-5" showsVerticalScrollIndicator={false}>

        {/* Device ID card */}
        <View className="bg-white rounded-2xl p-5 mb-3 shadow-sm">
          <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">设备标识</Text>
          <View className="flex-row items-center justify-between">
            <Text className="text-sm text-gray-500">匿名 ID</Text>
            <Text className="text-sm font-mono text-gray-700 bg-gray-100 px-3 py-1 rounded-lg">
              {userId.slice(0, 8).toUpperCase()}
            </Text>
          </View>
          <Text className="text-xs text-gray-400 mt-2 leading-relaxed">
            此 ID 用于区分不同设备，不含个人信息。如需关联参与者信息，请在下方解锁。
          </Text>
        </View>

        {/* Unlock card */}
        <View className="bg-white rounded-2xl p-5 mb-3 shadow-sm">
          <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">研究参与</Text>
          {isUnlocked ? (
            <View className="flex-row items-center gap-3 py-2">
              <Text className="text-2xl">✅</Text>
              <View>
                <Text className="text-sm font-semibold text-gray-800">已解锁完整功能</Text>
                {participantCode && (
                  <Text className="text-xs text-gray-500 mt-0.5">参与者编号：{participantCode}</Text>
                )}
              </View>
            </View>
          ) : (
            <>
              <Text className="text-sm text-gray-500 mb-4 leading-relaxed">
                输入研究员提供的参与者编号和邀请码，解锁 AI 功能。
              </Text>
              <TextInput
                value={inputCode}
                onChangeText={setInputCode}
                placeholder="参与者编号（如 P001）"
                placeholderTextColor="#9ca3af"
                autoCapitalize="none"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-800 mb-3"
              />
              <TextInput
                value={inputInvite}
                onChangeText={setInputInvite}
                placeholder="邀请码（如 STUDY2024）"
                placeholderTextColor="#9ca3af"
                autoCapitalize="characters"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-800 mb-4"
              />
              <TouchableOpacity
                onPress={handleUnlock}
                disabled={!inputCode.trim() || !inputInvite.trim() || unlocking}
                className="w-full py-4 bg-indigo-500 rounded-2xl items-center"
                style={{ opacity: (!inputCode.trim() || !inputInvite.trim()) ? 0.4 : 1 }}
              >
                {unlocking
                  ? <ActivityIndicator color="white" />
                  : <Text className="text-white font-semibold">解锁</Text>
                }
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Companion name card */}
        <View className="bg-white rounded-2xl p-5 mb-3 shadow-sm">
          <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">伙伴设置</Text>
          <Text className="text-sm text-gray-500 mb-3">给你的 AI 伙伴起一个名字</Text>
          <View className="flex-row gap-2">
            <TextInput
              value={companionName}
              onChangeText={setCompanionNameInput}
              placeholder="例如：小暖、小橙……"
              placeholderTextColor="#9ca3af"
              className="flex-1 px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-800"
            />
            <TouchableOpacity
              onPress={handleSaveName}
              disabled={!companionName.trim() || savingName}
              className="px-5 py-3 bg-orange-500 rounded-xl items-center justify-center"
              style={{ opacity: !companionName.trim() ? 0.4 : 1 }}
            >
              {savingName
                ? <ActivityIndicator color="white" size="small" />
                : <Text className="text-white font-semibold text-sm">{nameSaved ? '✓' : '保存'}</Text>
              }
            </TouchableOpacity>
          </View>
        </View>

        <View className="h-8" />
      </ScrollView>
    </SafeAreaView>
  );
}
