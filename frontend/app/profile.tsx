import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  ScrollView, ActivityIndicator, Alert, DevSettings,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { api } from '../src/api';
import { useUserId, getIsUnlocked, setUnlocked, getParticipantCode } from '../src/userStore';
import { AppLanguage, useLanguage } from '../src/i18n';

export default function ProfileScreen() {
  const userId = useUserId();
  const { language, setLanguage, t } = useLanguage();

  const [selectedLanguage, setSelectedLanguage] = useState<AppLanguage>(language);
  const [isUnlocked, setIsUnlockedState] = useState(false);
  const [participantCode, setParticipantCodeState] = useState<string | null>(null);
  const [inputCode, setInputCode] = useState('');
  const [inputInvite, setInputInvite] = useState('');
  const [unlocking, setUnlocking] = useState(false);

  useEffect(() => {
    setSelectedLanguage(language);
  }, [language]);

  useEffect(() => {
    (async () => {
      const unlocked = await getIsUnlocked();
      setIsUnlockedState(unlocked);
      const code = await getParticipantCode();
      setParticipantCodeState(code);
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
        Alert.alert(t('unlockSuccessTitle'), t('unlockSuccessMessage'));
      }
    } catch (e: any) {
      const msg = e?.message?.includes('400') ? t('inviteInvalid') : t('unlockNetworkFail');
      Alert.alert(t('unlockFailTitle'), msg);
    } finally {
      setUnlocking(false);
    }
  };

  const handleLanguageChange = async (nextLanguage: AppLanguage) => {
    if (nextLanguage === selectedLanguage) return;
    await setLanguage(nextLanguage);
    await api.setLanguage(userId, nextLanguage).catch(() => {});

    const copy = nextLanguage === 'en'
      ? {
          title: 'Language changed',
          restartMessage: 'Please close and reopen the app to apply English.',
        }
      : {
          title: '语言已切换',
          restartMessage: '请关闭并重新打开 App，以应用中文。',
        };

    if (__DEV__) {
      DevSettings.reload();
    } else {
      setSelectedLanguage(nextLanguage);
      Alert.alert(copy.title, copy.restartMessage);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-orange-50">
      {/* Header */}
      <View className="flex-row items-center gap-3 px-4 py-3 bg-white border-b border-gray-100">
        <TouchableOpacity onPress={() => router.back()} className="p-2 -ml-1">
          <Text className="text-gray-500 text-lg">←</Text>
        </TouchableOpacity>
        <Text className="font-semibold text-gray-800 text-base flex-1">{t('profileTitle')}</Text>
      </View>

      <ScrollView className="flex-1 px-4 pt-5" showsVerticalScrollIndicator={false}>

        <View className="bg-white rounded-2xl p-5 mb-3 shadow-sm">
          <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{t('languageSection')}</Text>
          <View className="flex-row bg-gray-100 rounded-2xl p-1 mb-3">
            {([
              ['zh', t('chinese')],
              ['en', t('english')],
            ] as [AppLanguage, string][]).map(([value, label]) => {
              const active = selectedLanguage === value;
              return (
                <TouchableOpacity
                  key={value}
                  onPress={() => handleLanguageChange(value)}
                  className={`flex-1 py-3 rounded-xl items-center ${active ? 'bg-white shadow-sm' : ''}`}
                >
                  <Text className={`text-sm font-semibold ${active ? 'text-orange-500' : 'text-gray-500'}`}>
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text className="text-xs text-gray-400 leading-relaxed">{t('languageHint')}</Text>
        </View>

        {/* Device ID card */}
        <View className="bg-white rounded-2xl p-5 mb-3 shadow-sm">
          <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{t('deviceSection')}</Text>
          <View className="flex-row items-center justify-between">
            <Text className="text-sm text-gray-500">{t('anonymousId')}</Text>
            <Text className="text-sm font-mono text-gray-700 bg-gray-100 px-3 py-1 rounded-lg">
              {userId.slice(0, 8).toUpperCase()}
            </Text>
          </View>
          <Text className="text-xs text-gray-400 mt-2 leading-relaxed">
            {t('deviceHelp')}
          </Text>
        </View>

        {/* Unlock card */}
        <View className="bg-white rounded-2xl p-5 mb-3 shadow-sm">
          <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{t('researchSection')}</Text>
          {isUnlocked ? (
            <View className="flex-row items-center gap-3 py-2">
              <Text className="text-2xl">✅</Text>
              <View>
                <Text className="text-sm font-semibold text-gray-800">{t('unlocked')}</Text>
                {participantCode && (
                  <Text className="text-xs text-gray-500 mt-0.5">{t('participantCode')}: {participantCode}</Text>
                )}
              </View>
            </View>
          ) : (
            <>
              <Text className="text-sm text-gray-500 mb-4 leading-relaxed">
                {t('unlockHelp')}
              </Text>
              <TextInput
                value={inputCode}
                onChangeText={setInputCode}
                placeholder={t('participantPlaceholder')}
                placeholderTextColor="#9ca3af"
                autoCapitalize="none"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-800 mb-3"
              />
              <TextInput
                value={inputInvite}
                onChangeText={setInputInvite}
                placeholder={t('invitePlaceholder')}
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
                  : <Text className="text-white font-semibold">{t('unlock')}</Text>
                }
              </TouchableOpacity>
            </>
          )}
        </View>

        <View className="h-8" />
      </ScrollView>
    </SafeAreaView>
  );
}
